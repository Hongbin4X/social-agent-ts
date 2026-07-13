# X（Twitter）真实账号授权 + 发帖 —— 项目集成设计

> 日期：2026-07-10 ｜ 分支：`x-real-auth-posting`（基于 master f498b50 的 worktree）
> 参考实现：`/home/ec2-user/laihongbin/demo/x-poster`（TS，OAuth2+PKCE，已实测跑通一个账号的授权+发帖）

## 0. 现状更新（2026-07-13，实现已超出本设计；与下文冲突处以本节为准）

本设计（2026-07-10）当时定的三项务实决策——**paste-back 授权 / 纯文本 / 无前端 UI**——已在后续迭代中被更完整的实现取代。**当前 master `fe31cd3` 的真实现状：**

- **授权 = 真回调重定向**（不再是 paste-back）：免鉴权 `GET /api/connections/x/callback`（注册在鉴权中间件之前，靠 state 对号），X 授权后浏览器直接跳回、自动换 token 落库；前端账号中心有「**添加授权账号 / 断开授权**」UI（弹窗授权 + 轮询/postMessage 感知）；paste-back 的 `POST /x/callback` 仅保留作兜底。
- **回调地址** = `https://52.54.122.204/api/connections/x/callback`（同时支持 `x.broly.ai`），走 nginx（`deploy/nginx/social-agent.conf`），env `X_REDIRECT_URI` / `APP_PUBLIC_URL`。不再是 `http://127.0.0.1:8765/callback`。
- **发帖形态 = 三种**（前端可选、随帖持久化 `ssa_post_variant.x_post_type`）：**普通推**（单条，超 280 字提示改串推）、**串推**（reply 链自动/显式分段）、**Article**（`/2/articles/draft`→`/publish` 长文）。
- **图文 = 已实现**（本设计原列为「非目标」）：`/2/media/upload` 拿 media_id 再发（≤4 张，需 media.write）；普通推与串推首条支持。已真机发出图文推验证。
- 计费仍为 `LocalProviderCostBilling` 本地账本（本设计 §3.5 已述），未接真实 GLBGPT 扣费。

**实测已知约束 / 注意事项（2026-07-12/13 真机联调）：**

- **X 反垃圾 / 反硬广拦截**：一条推里【营销话术】+【多话题标签】+【推广链接】三样叠满 → X 返回 `403 not permitted` 拒发（任意两样一般放行）。「自动生成营销内容」天生易踩——建议发布层做「遇 403 自动降级重试」（去链接/减标签重发；**此项尚未实现**，见 gap 台账）。
- **Article 需 X Premium**：发帖账号非 Premium 时 `/2/articles/draft` 直接 403。
- **token 一次性轮换**：refresh_token 轮换，同一账号不可被两个系统（如 demo 与本项目）同时持有刷新，否则互踢下线。
- **改 X 后台 App 权限后需重新授权**：旧 token 冻结在原权限，自动 refresh 不解决。
- **裸 IP 回调有证书告警**（证书 `*.broly.ai` 不覆盖 IP）；固定域名 `x.broly.ai`（DNS 在 Cloudflare）可消除。

> 下面 §1–§5 为 2026-07-10 的原始设计记录，保留作历史与决策溯源；现状以本节为准。

## 1. 目标与范围（用户已拍板）

把 demo 里**已验证**的「X 账号授权 + 发帖」模块，集成进本项目真实链路，做到：**用户授权一次 → 平台长期、自动、无感地替他发帖**。

三项决策（用户 2026-07-10 选定，全取推荐/务实项）：

1. **授权完成方式 = 粘贴回调 URL（paste-back）**。后端跑在远程 AWS，用户浏览器打不开服务器的 `127.0.0.1`，标准「授权后自动跳回后端回调」走不通。改为：后端给授权链接 → 用户在**自己的浏览器**授权 → 把跳转后地址栏的**完整回调 URL** 粘回后端 → 后端换 token。与 demo CLI 完全一致。
2. **复用 demo 的 X 应用凭证**（Client ID/Secret + 已注册回调 `http://127.0.0.1:8765/callback` + 已授权账号 @KonoeKKK），零 X 后台操作。paste-back 流程下回调 URL 无需可达、只需已注册，故复用完全成立。
3. **本版交付范围 = 后端集成 + 验证脚本**。前端「连接 X」UI 留到下一版。

**非目标**：前端连接 UI；发图（Free 档常 403、依赖付费档，本版只发纯文本+链接）；真实 GLBGPT 计费扣款（本地只做审计记账，端口不变，联调再换）。

## 2. 现状与集成缺口

已就位：
- `@social/publisher`：`XPublisher.publish(ctx)` 拿 `ctx.connection.accessToken` 即可发文本推（401/403/429 已处理）；`TokenStore` 端口 + `PublishingService` 编排（含 provider-cost 预扣/结算/退款）。
- `ssaSocialAccount` 表（工作区级账号），但**无任何 token 列**。
- `apps/server`：`connectionRoutes` 是桩（authorize-url 返回 501）；`services/publishing.ts` 的 `tokenStore` 恒返回 null、`billing` 一调即抛。

缺口（本设计补齐）：OAuth 核心（授权/换 token/续期）、token 落库、授权起始/回调路由、DB 版 TokenStore（读时自动续期+轮换）、本地 provider-cost 计费、端到端验证脚本。

## 3. 架构落点

```
浏览器(用户)                apps/server                         @social/publisher            @social/db(MySQL 3307)
   │  ①POST /x/authorize-url  │                                       │                           │
   │─────────────────────────>│ XApp.startAuthorization()────────────>│ buildAuthorizeUrl+PKCE    │
   │  { authorizeUrl, state } <│ 存 pending{state→verifier}(内存,TTL)  │                           │
   │  ②浏览器打开授权页,授权   │                                       │                           │
   │  ③把回调URL粘回          │                                       │                           │
   │  POST /x/callback        │ 查 pending→XApp.finishAuthorization()─>│ exchangeCode+getMe        │
   │                          │ upsert 账号+token+username, status────────────────────────────────>│
   │  { account }            <│                                       │                           │
   ────────────────────────── 之后长期发帖(后台,用户无感) ──────────────────────────────────────────
   POST /api/publish ────────>│ PublishingService.publishBatch        │                           │
                              │  DbTokenStore.getConnection()─读token─────────────────────────────>│
                              │   过期?→refresh→轮换写回──────────────>│ refreshAccessToken        │──>│
                              │  provider-cost 预扣(LocalBilling)────记 ssa_billing_usage_record───>│
                              │  XPublisher.publish(freshToken)───────>│ POST /2/tweets(真发)      │
                              │  结算 → { remoteUrl }                  │                           │
```

### 3.1 OAuth 核心 → 折叠进 `@social/publisher`（`src/x/`）
publisher 已拥有 X（adapter/连接类型/TokenStore 端口），OAuth 与它同源，放这里内聚最强、上层零耦合。从 demo 移植的**框架无关纯函数**（零运行时依赖，只用 `node:crypto`+`fetch`）：
- `src/x/oauth.ts`：`generatePkce` / `buildAuthorizeUrl` / `extractCode` / `exchangeCode` / `refreshAccessToken` / `getMe`；常量 `AUTHORIZE_URL`/`TOKEN_URL`/`DEFAULT_SCOPES`；类型 `XTokenResponse`/`XUser`。错误统一抛 `PublisherError`（复用现有错误体系）。
- `src/x/xapp.ts`：`XApp` 便捷封装（`startAuthorization`/`finishAuthorization`/`refresh`），给路由用。
- `index.ts` 导出上述。
- **scope**：`tweet.read tweet.write users.read media.write offline.access`（`offline.access` 必带，否则拿不到 refresh_token —— demo 文档标注的头号翻车点）。

### 3.2 Token 落库 → 扩 `ssaSocialAccount`（新增可空列，向后兼容）
一个 `platform=X, type=connected` 的账号行 ↔ 一次 X 授权，token 存在该行最自然。新增列：
`external_account_id`(x_user_id) / `username`(@handle) / `access_token`(text) / `refresh_token`(text) / `scope` / `token_expires_at`(bigint, epoch 秒)。
- 复用现有 `status`(AccountStatus) 表达连接态：`Connected` / `Expired` / `PermissionMissing`(需重连) / `NotConnected`。
- token **绝不出现在 `Account` 领域类型 / 前端**：仓储加**独立的低层方法**读写 token 列，返回体只在 server 内部流转。
- **安全**：本版本地 dev 库(3307)明文存，但读写集中在**单一 encrypt/decrypt 缝**（先直通），上线前只在这一处接 AES-256-GCM，不散落。（记录为上线前硬化项。）
- 迁移：`drizzle-kit generate` 产出 `0002_*`，`db:migrate` 只打 3307。

### 3.3 授权握手临时态 → 内存 PendingAuthStore（TTL 10min）
paste-back 下 `state→codeVerifier`+`workspaceId` 存后端内存、10 分钟过期（demo 文档明确「放会话或缓存、几分钟过期，别进账号表」）。**codeVerifier 绝不下发前端**（PKCE 防授权码被盗用）；单机本地够用，多实例时换 Redis（端口不变）。

### 3.4 路由（重写 `connectionRoutes`，挂上 auth 中间件拿 workspace）
- `POST /api/connections/x/authorize-url` → 建 PKCE+state，存 pending，返回 `{ authorizeUrl, state }`（不建账号行，成功回调时才建）。
- `POST /api/connections/x/callback` `{ redirectUrl }` → `extractCode`(校验 state) → 查 pending → `exchangeCode` → `getMe` → 按 (workspace, X, external_account_id) **upsert** 账号行（写 token/username/scope/expires/status=Connected）→ 删 pending → 返回 `{ account }`。
- `POST /api/connections/x/:accountId/disconnect` → 清 token、status=NotConnected（给用户「断开」，也便于测试）。
- 保留 `GET /requirements`。
- app.ts：把 `/api/connections` 纳入 auth 中间件覆盖。

### 3.5 DbTokenStore（真实 TokenStore）+ LocalProviderCostBilling
`apps/server/src/services/token-store.ts`：
- `DbTokenStore.getConnection(accountId, X)`：读 token；无 token→`null`（未连接）；将过期(留 30s skew)→`refreshAccessToken`→**轮换后的 refresh_token 覆盖写回**（demo 文档头号坑）→用新 token；**refresh 失败→标 status=PermissionMissing 并返回 null**（service 落 failed，绝不静默假装成功）。刷新成功后返回的连接 `expiresAt` 恒在未来 → service 的 `isExpired` 判定通过。
- `LocalProviderCostBilling`（实现 publisher 的 `BillingGateway`）：`reserve/settle/refund` 如实记进 `ssa_billing_usage_record`（有 `provider_cost` 十进制列 + `reservation_id` + status），`actionType="publish"`。**不假称对接 GLBGPT、不做真实余额扣减**（与现有 `LocalCreditBilling` 同哲学）。credits 换算是 GLBGPT 的事，本地占位（cents 直通），联调换真实适配器、端口不变。
- `services/publishing.ts`：用从 `getContainer().repos` 构造的 `DbTokenStore` + `LocalProviderCostBilling` 替换两个抛错/返 null 的桩。

### 3.6 配置（env）
`X_CLIENT_ID` / `X_CLIENT_SECRET` / `X_REDIRECT_URI`(=`http://127.0.0.1:8765/callback`) / `X_OAUTH_SCOPES`(可选,默认全量)。写入 `.env`+`.env.example`。Client Secret 只在后端、不进前端、不进 git。

## 4. 验证（铁律11：评估/测试 > 一切）

1. **单元测试(vitest, 进 CI)** `packages/publisher/tests/x-oauth.test.ts`：PKCE 形状、authorize URL 参数、`extractCode`（纯 code / 完整 URL / state 不匹配 / error 参数）、`exchangeCode`+`refresh`（mock fetch 成功+失败）。`token-store` 的续期/轮换/refresh 失败标 needs-reauth（mock fetch）。
2. **真实端到端脚本** `tests/x-live/`（TS CLI，驱动真实 DB+publisher，非 mock）：
   - `authorize`：打印授权链接 → 读取粘贴的回调 URL → 走真实路由逻辑换 token 落库。
   - `post`：经真实 `PublishingService` 发一条**真实**推，打印 tweet URL。
   - 附 `seed-from-demo`：把 demo 已授权的 @KonoeKKK token 导入项目库，便于不重新授权也能立即验证发帖路径。
   - 短 README 写清跑法。
3. 验收口径：单测全绿 + typecheck 干净 + **真机发出一条真实推、拿到可点开的 tweet 链接**。

## 5. 风险与已知边界（不掩盖）
- 发图：Free 档常 403，本版不做，失败直接抛原始错误。
- refresh_token 轮换不写回 = 用户掉线：DbTokenStore 强制覆盖写回（重点测试项）。
- 明文 token：本地 dev 库可接受，上线前必须在单一缝加密（已记为硬化项）。
- provider cost 真实扣款：本地只审计记账，属三大真实外部依赖之一，联调再接。
- 单机内存 PendingAuthStore：多实例部署需换共享缓存。
