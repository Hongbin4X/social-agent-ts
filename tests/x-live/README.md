# tests/x-live —— X 真机端到端验证 CLI

驱动**真实** stack（`@social/publisher` 的 XApp/OAuth + `@social/db` 仓储 + `PublishingService` +
`DbTokenStore` + `LocalProviderCostBilling`），不 mock 任何东西，用来在服务器上手动验证整条链路：
**真实授权 → token 落库 → 发帖前自动续期 → 真实发帖拿到 tweet 链接**（铁律11）。

用的正是 `apps/server` 生产路径上的同一套件，所以这里跑通 == 后端路由跑通。

## 前置

`.env`（worktree 根，不入库）需有：
- `X_CLIENT_ID` / `X_CLIENT_SECRET` / `X_REDIRECT_URI`（复用 demo 应用时已配好）
- `DB_*`（指向本地 dev MySQL 3307）、`DEV_FAKE_USER_ID`（定位工作区）

tsx 二进制：`node_modules/.pnpm/node_modules/.bin/tsx`（下方用 `$TSX` 代指）。

```bash
cd <worktree 根>
TSX=node_modules/.pnpm/node_modules/.bin/tsx
```

## 命令

### 1) 查看已连接的 X 账号
```bash
$TSX tests/x-live/cli.mts status
```

### 2) 真实授权（paste-back，两步）
```bash
# ① 打印授权链接（并把 state→codeVerifier 暂存到 tests/x-live/.pending.json）
$TSX tests/x-live/cli.mts authorize
# 在你自己的浏览器打开链接 → 用要授权的 X 账号登录并点 Authorize
# → 浏览器跳到 http://127.0.0.1:8765/callback?code=...&state=...（页面打不开是正常的）
# ② 复制地址栏里跳转后的完整 URL，粘进来换 token 落库：
$TSX tests/x-live/cli.mts authorize --redirect "http://127.0.0.1:8765/callback?code=XXX&state=YYY"
```
成功后账号 + token 写进 `ssa_social_account`（status=Connected），并打印是否拿到 refresh_token。

### 3) 真发一条推（**对外不可逆 + 真实按次计费**）
```bash
$TSX tests/x-live/cli.mts post --text "hello from social-agent-ts"
# 可选：--account <accountId|username> 指定账号
```
经真实 `PublishingService`：DbTokenStore 读 token（必要时自动续期+轮换写回）→ provider-cost 预扣 →
`POST /2/tweets` 真发 → 结算 → 打印结果（含 tweet 链接）。

### 4) 导入 demo 已授权账号（免重新授权即可验发帖路径）
```bash
$TSX tests/x-live/cli.mts seed-from-demo /home/ec2-user/laihongbin/demo/x-poster/config/accounts.json
```
用 demo 里 `main.X` 的现成 token（不改 demo 文件），拉 `/2/users/me` 确认账号后 upsert 进项目库。
> 注意：若该 token 已过期，`post` 时会用其 refresh_token 续期（X 会轮换，项目库里存新的；demo 文件不动）。

## 说明
- `.pending.json` 只存几分钟的临时 state/verifier，已 gitignore。
- 只发纯文本+链接（Free 档可发）；发图依赖付费档，本版不做，失败直接抛 X 原始错误、不降级。
