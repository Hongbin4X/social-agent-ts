#!/usr/bin/env bash
# redeploy.sh —— 停掉本项目旧实例 → 同步最新 master → 起新实例(detached)。
#
# 背景/决策(供另一个分身看懂）:
#   - 这是多人共用的检出(见记忆 social-agent-shared-checkout)。同机上还跑着别的项目:
#     dispatch 前端占 3457、/tmp 里可能有无关 next dev。所以杀进程必须"精确圈定本项目",
#     严禁 `pkill -f next` 之类全局关键字——那会误杀别人的服务。
#   - 圈定方式:进程的 cwd 或命令行路径落在本项目 ROOT 下(pnpm dev / turbo / next / tsx),
#     外加占用本项目两个端口(3001 web / 8091 server)的监听者兜底。
#   - 同步代码用 `git merge --ff-only origin/master`:共享仓绝不 `reset --hard`(会抹掉他人未提交改动);
#     分叉时宁可失败报错,也不强推。
set -uo pipefail

ROOT="/home/ec2-user/laihongbin/social-agent-ts"
WEB_PORT=3001
SERVER_PORT=8091
LOG_DIR="$ROOT/.deploy-logs"
LOG="$LOG_DIR/dev.log"

cd "$ROOT" || { echo "找不到项目根 $ROOT"; exit 1; }

# 端口工具:实测本机 lsof -ti tcp:PORT 探不到 next-server 的监听 socket(返回空),ss 可靠,统一用 ss。
pids_on_port() { ss -ltnp "sport = :$1" 2>/dev/null | grep -oE 'pid=[0-9]+' | cut -d= -f2; }
port_listening() { ss -ltn "sport = :$1" 2>/dev/null | grep -q LISTEN; }

echo "==> [1/4] 停掉本项目旧实例(精确圈定,不误杀他人服务)"
collect_pids() {
  local pids=""
  # a) 命令行/cwd 归属本项目的 dev 进程
  local pid cwd cmd
  for pid in $(pgrep -f "pnpm.*dev|turbo run dev|next dev|tsx.*src/index.ts" 2>/dev/null); do
    cwd="$(readlink -f "/proc/$pid/cwd" 2>/dev/null)"
    cmd="$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null)"
    if [[ "$cwd" == "$ROOT"* || "$cmd" == *"$ROOT"* ]]; then
      pids="$pids $pid"
    fi
  done
  # b) 占用本项目端口的监听者(兜底,防止有孤儿进程仍抱着端口)
  local p
  for p in "$WEB_PORT" "$SERVER_PORT"; do
    pids="$pids $(pids_on_port "$p")"
  done
  echo "$pids" | tr ' ' '\n' | grep -E '^[0-9]+$' | sort -u
}

PIDS="$(collect_pids)"
if [[ -n "$PIDS" ]]; then
  echo "    杀掉: $(echo "$PIDS" | tr '\n' ' ')"
  # shellcheck disable=SC2086
  kill $PIDS 2>/dev/null
  sleep 2
  # 仍存活的强杀
  STILL="$(collect_pids)"
  if [[ -n "$STILL" ]]; then
    # shellcheck disable=SC2086
    kill -9 $STILL 2>/dev/null
    sleep 1
  fi
  echo "    旧实例已停"
else
  echo "    没有发现本项目在跑的实例,跳过"
fi

echo "==> [2/4] 同步最新 master(ff-only,不破坏未提交改动)"
git checkout master
git fetch origin
if ! git merge --ff-only origin/master; then
  echo "!! 本地 master 与 origin/master 分叉,fast-forward 失败。"
  echo "!! 为避免破坏共享仓改动,脚本不做强制同步。请手工 git status / rebase 后重跑。"
  exit 1
fi
echo "    已同步到 $(git rev-parse --short HEAD)"

echo "==> [3/4] 安装依赖"
pnpm install

echo "==> [4/4] 启动新实例(detached)"
mkdir -p "$LOG_DIR"
# setsid + nohup:脱离当前终端/进程组,关掉终端也不停;日志落 $LOG。
setsid nohup pnpm dev > "$LOG" 2>&1 &
echo "    已后台启动 pnpm dev,日志: $LOG"

# 等端口起来(最多 90s),让用户当场知道成没成,而不是盲等(铁律2.5:等待要有反馈)
echo -n "    等待 web:$WEB_PORT / server:$SERVER_PORT 就绪"
for _ in $(seq 1 45); do
  if port_listening "$WEB_PORT" && port_listening "$SERVER_PORT"; then
    echo ""
    echo "==> 部署完成 ✅  web http://localhost:$WEB_PORT  |  server http://localhost:$SERVER_PORT"
    echo "    实时日志: tail -f $LOG"
    exit 0
  fi
  echo -n "."
  sleep 2
done
echo ""
port_listening "$WEB_PORT" && web_state=起 || web_state=未起
port_listening "$SERVER_PORT" && srv_state=起 || srv_state=未起
echo "!! 90s 内端口未全部就绪(web:$web_state server:$srv_state)。"
echo "!! 看日志排查: tail -n 100 $LOG"
exit 1
