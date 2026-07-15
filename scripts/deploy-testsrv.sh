#!/usr/bin/env bash
# 部署到测试服（testtapi2.broly.ai/social）。用法：bash scripts/deploy-testsrv.sh
#
# ── 为什么必须用脚本，而不是手敲 ──
# 这条部署链上有三个「静默坏掉、且看不出来」的坑，全都栽过：
#  1. 【本机构建】而非测试服构建：那台机器 15G 内存已用 11G 且【无 swap】，在上面跑 next build
#     会把 15 分钟负载均值干到 15.5、拖到 chatpal 超时、SSH 都登不进（2026-07-15 实测）。
#  2. 构建期 env 必须与运行期一致：Next 把 rewrite 目标（routes-manifest.json）和
#     NEXT_PUBLIC_*【烘进产物】，不是运行期读的。本机构建若没 APP_ENV=testsrv，
#     会把默认 http://localhost:8091 烘死 → 传上去后 /social/bff/* 全部 500（实测踩过）。
#  3. 传产物必须带 --delete，否则旧 chunk 残留，next start 找不到新 BUILD_ID 的文件。
#
# 密钥分工：本机 .env.testsrv 只有构建期变量（全公开）；服务器那份额外含运行期密钥，
# 由服务器就地生成，绝不经过本机、绝不进 git。
set -euo pipefail

HOST=${DEPLOY_HOST:-root@13.229.50.42}
KEY=${DEPLOY_KEY:-$HOME/.ssh/id_rsa}
REMOTE=/opt/social-agent/app
SSH="ssh -i $KEY -o BatchMode=yes -o ConnectTimeout=25"
RSYNC_SSH="ssh -i $KEY -o BatchMode=yes"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

[ -f .env.testsrv ] || { echo "❌ 缺 .env.testsrv（构建期变量）。cp .env.testsrv.example .env.testsrv"; exit 1; }

echo "── 1/5 本机构建（绝不在测试服上构建，见文件头）──"
# APP_ENV=testsrv 让 scripts/load-env.mjs 加载 .env.testsrv → 正确的 SSA_BACKEND_URL / NEXT_PUBLIC_*
APP_ENV=testsrv pnpm --filter web exec next build >/tmp/ssa-build.log 2>&1 || { tail -20 /tmp/ssa-build.log; exit 1; }
echo "   ✅ BUILD_ID=$(cat apps/web/.next/BUILD_ID)"

echo "── 2/5 校验烘进产物的后端地址（这一步就是为了防坑 #2）──"
BAKED=$(grep -oE 'http://(localhost|127\.0\.0\.1):[0-9]+' apps/web/.next/routes-manifest.json | sort -u | head -1)
WANT=$(grep '^SSA_BACKEND_URL=' .env.testsrv | cut -d= -f2-)
[ "$BAKED" = "$WANT" ] || { echo "   ❌ 产物烘的是 $BAKED，应为 $WANT —— 构建 env 不对，中止"; exit 1; }
echo "   ✅ $BAKED"

echo "── 3/5 传源码 + 产物 ──"
rsync -az -e "$RSYNC_SSH" \
  --exclude node_modules --exclude .next --exclude .git --exclude .media \
  --exclude '.env' --exclude '.env.test' --exclude '.env.testsrv' \
  --exclude references --exclude demo --exclude .turbo \
  ./ "$HOST:$REMOTE/"
rsync -az --delete -e "$RSYNC_SSH" apps/web/.next/ "$HOST:$REMOTE/apps/web/.next/"
echo "   ✅ 已同步"

echo "── 4/5 重启服务 ──"
$SSH "$HOST" 'systemctl restart social-agent-api social-agent-web && sleep 10 &&
  for s in api web; do printf "   %s: %s\n" "$s" "$(systemctl is-active social-agent-$s)"; done'

echo "── 5/5 冒烟（含反代链路，坑 #2 会在这里现形）──"
$SSH "$HOST" '
  curl -sS -m 8 -o /dev/null -w "   后端 /health            → %{http_code}\n" http://127.0.0.1:18091/health
  curl -sS -m 8 -o /dev/null -w "   前端 /social            → %{http_code}\n" http://127.0.0.1:13001/social
  curl -sS -m 8 -o /dev/null -w "   反代 /social/bff/workspace(应401) → %{http_code}\n" http://127.0.0.1:13001/social/bff/workspace
  curl -sS -m 8 -o /dev/null -w "   旁路已关(冒充应401)     → %{http_code}\n" -H "x-user-id: 2000208" http://127.0.0.1:18091/api/workspace'
echo "✅ 部署完成 → https://testtapi2.broly.ai/social"
