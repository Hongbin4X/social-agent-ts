# 与 chatpal-api / ai-api 用户·计费联调方案

> 状态：**待确认**（本轮只出方案，联调代码待拍板后再动）
> 飞书同步：Social Agent 知识库 → 子文档《与 chatpal-api / ai-api 用户·计费联调方案》
> `https://legaldao.feishu.cn/wiki/V7fnwW2pdiFiGIkj2J5cfikQntd`

本方案由三路源码考古汇总（super-agent 联调实现 / chatpal-api+ai-api 用户与计费模型 / 本项目 seam 现状），结论均可回溯到 `文件:行号`。

---

## 一、三边角色

| 角色 | 定位 |
|---|---|
| **social-agent-ts**（本项目） | AI 辅助发帖产品。自有品牌/帖子/素材数据；用户登录校验 + 生成文字/图片扣费需联调。当前用 `DEV_FAKE_USER_ID` 旁路 + 本地账本占位。 |
| **yanfa-chatpal-api**（目标·身份） | Java／若依风格。端口 **8080**，前缀 `/user-api`。登录/注册发 JWT、钱包、订单/订阅、账单历史、一个直扣接口。 |
| **yanfa-ai-api**（目标·计费） | Java。端口 **8070**，前缀 `/ai-api/ai/bill`。对外「查余额 / 预扣冻结 / 结算扣款」标准计费生命周期。**扣费联调的正道入口。** |
| **super-agent**（参考样板） | TS（Fastify+Prisma）。已用「共享 JWT 验签 + 调 Java `/ai-api/ai/bill/*` 计费」接入同一套平台。 |

> **关键事实**：chatpal-api 与 ai-api **共用同一个库 `yanfa`（3306 活库）、同一个 `JWT_SECRET`**，只是两个服务。→ 「同密钥验平台 JWT」成立；钱都落在同一张 `user` 表。

数据流：`前端(Bearer JWT) → 后端 auth.ts(共享密钥验签→userId) → GenerationService(reserve/settle/refund) → Glbgpt 计费适配器 → ai-api:8070(checkPermission 预冻结 / recordBill 结算 / failed 解冻) → yanfa 库 user.balance/block_amount`。chatpal-api:8080 以「共享 JWT_SECRET」侧接入验签。

## 二、联调目标后端 · 硬事实速查

| 项 | 事实 |
|---|---|
| 鉴权机制 | JWT（jjwt，HS256）。非 sa-token、非 Spring Security。 |
| JWT 密钥 | = yaml `jwt.secret` 明文的**原始 UTF-8 字节**（**不 base64 解码**）。两服务同密钥。生产由 env `JWT_SECRET` 注入 → **联调前找运维要线上真实值**。 |
| JWT claims | `{ userId(数字, = user.id), channel }`。**登录 token 无 exp** → 验签**不要强制 exp**。 |
| 传 token | `Authorization: Bearer <jwt>`，兜底 `x-api-key: <jwt>`。 |
| userId 类型 | `user.id` = **bigint UNSIGNED 自增**（~138 万），**不是雪花**（⚠️ 本项目 schema 注释「GLBGPT 雪花」是错的，需订正；varchar 存仍兼容）。按 **string** 传。 |
| 余额本体 | `user.balance`(USD, decimal(12,6)) + `user.block_amount`(冻结)。⚠️ `platform_user.balance/freeze_balance` 是另一套、AI 计费不碰。 |
| 金额语义 | 余额单位 = **USD**；对外 **credits = USD × 1000**（1 credit = 0.001 USD）。 |
| 并发安全 | 预冻结靠 SQL 原子条件更新 `UPDATE user SET block_amount=block_amount+amt WHERE balance-block_amount>=amt`。无乐观锁/显式行锁。 |

### 补充：签发的 JWT 有效期怎么算 + 会不会落库

**有效期取决于「用哪个方法签发」**；jjwt 校验时**有 `exp` 才查过期、无 `exp` 就永不过期**。配置 `jwt.expiration: 2592000`（30 天/秒）**只对带 exp 的路径生效**。

> ⚠️ **测试环境 JWT 配置（非生产，仅参考）**：
> ```yaml
> jwt:
>   secret: ${JWT_SECRET:eyJqdGkiOiIzOWY1ZmExNi0xZjU3LTQzNGYtYTVhMy01N2E5ZjdlYzBmNzUiLCJpYXQiOjE2MDMyNTAwNTIsImV4cCI6MTYwMzI2NDQ1Miwic2V4IjoiRiIsIm5hbWUi}
>   expiration: 2592000 # 30天，单位秒
> ```
> 这是**测试环境**值；生产 `JWT_SECRET` 可能不同，联调生产前必须向平台运维确认实际注入值，**切勿拿默认串当生产密钥**（验签全 401）。chatpal-api 与 ai-api 所有 profile 一致、两服务无矛盾。「30天 expiration」与「主登录永不过期」不矛盾（前者只对 php 登录 generateToken 生效）。

| 签发路径 | 方法 | 有效期 | 触发点 |
|---|---|---|---|
| **chatpal platform-user 主登录**（本项目最可能拿到的） | `UserTokenUtil.createToken` → `generateTokenWithoutExpire` | **无 exp → 永不过期**（签名有效、密钥不变即可） | `/user-api/user/{email\|google\|apple\|device\|twitter\|telegram}Login` |
| platform-php 登录（另一套前台） | `generateAndCacheToken` → `generateToken` | **exp = 签发 + `jwt.expiration`（30 天）**，并存 Redis TTL 30 天 | php 平台登录 |

- 签发算法（`JwtUtils`）：`generateToken` 写 `exp=iat+expiration×1000`；`generateTokenWithoutExpire` 不写 exp。都写 `jti`+`iat`，claims=`{userId,channel}`。
- 校验（`UserTokenInterceptor`+`parseClaimsJws`）：仅验签名 +（若带 exp）验过期；过期→`{code:401,"session expired"}`(HTTP 仍 200)；签名/格式错→`{code:401,"Invalid token"}`。**无 Redis 校验、无 token 直接放行**，jjwt 零时钟偏移、无宽限。

**会不会落库？——不落 MySQL**（DDL 无任何 token 列）：
- **主登录（platform-user）**：token **完全无状态**，不落库、不写 Redis（该处 Redis 只缓存用户资料/邮箱验证码），验证纯靠验签。
- **php 登录**：token 只写 **Redis 缓存**（key `token-<md5>`，TTL 30 天），仍不入 MySQL。
- → 对本项目 TS：**验 token 只需共享密钥验签，无需查库/查 Redis**。

**TS 联调正确姿势**：始终验签名；带 exp 就尊重并拒过期、不带 exp 就接受为不过期（两条路径都兼容）。主登录 token 永不过期 → 登出/失效不能靠 exp，需换密钥/黑名单/Redis 等额外机制（框架拦截器不提供主动失效）——请在决策 3 一并考虑。

## 三、计费接口契约（ai-api :8070，首选正道）

| 用途 | Path（POST） | 认证 | 语义 |
|---|---|---|---|
| 查价（不冻结） | `/ai-api/ai/bill/estimatePrice` | — | `{productNo,model,params}` → `{sellable,credits,platformRobotId}` |
| **预扣（冻结）** | `/ai-api/ai/bill/checkPermission` | 用户 token | 权限校验 + 冻结 `block_amount`；不足抛 **HTTP 402** |
| **结算（真扣）** | `/ai-api/ai/bill/recordBill` | 用户 token | 解冻 + 扣真实余额 + 写 `bill` 流水 |
| 系统直扣（无 token） | `/ai-api/ai/bill/system/recordBill` | `x-api-key` | 按 `amount`(USD) 对指定 userId 直扣；⚠️ 目前无余额拦截，会透支为负 |
| （遗留）直扣 | `/user-api/api/user/bill/deduction` | 用户 token | chatpal 读改写扣费，无锁，不推荐 |

- **三段式（`GlbgptLifeCycleService`）**：`before()` 冻结 → `after()` 解冻+真扣 → `failed()` 只解冻回滚。**与本项目现成 `CreditBillingGateway`（reserve/settle/refund）端口一一对应。**
- **登录发 token**（chatpal :8080）：`POST /user-api/user/{emailLogin|googleLogin|...}` → `LoginResponse.token`。

### 计费写法：完全照搬 super-agent（文本按 token、图片按张）

「帖子 token 花多少、一张图花多少」= super-agent 现成写法：文本按 token 计、图片按张定价，都走「成功交付后 `recordBill`」，**价格真源在平台 `robot` 表**。

| 类型 | `recordBill` 关键字段 | 价格怎么算 |
|---|---|---|
| 帖子文本 | `model`=文本计费模型、`promptTokens`=真实input、`completionTokens`=真实output | Java `robot.price`(type=tokens)：`input×单价/1000 + output×单价/1000`（可选缓存命中×0.1；input>1万部分5折） |
| 图片（每张一次） | `model`=图像模型、`agentId`=图像计费agent、tokens=0 | Java `robot.price`(type=once) 一张一口价（与 token 无关），多模型分别定价 |

- 请求体：`{ productNo, model, agentId?, promptTokens, completionTokens, batchId?, displayKey?, device }`。`model` 非空→Java `findByModel` 取价；`agentId` 仅归属。
- 铁律：成功交付后才扣；失败进待补偿不回滚不伪造；未配计费模型跳过；判成功看 `body.code===1`。
- **照搬这套 = 决策1 方案A（平台定价）** → 前置：平台须在 `robot`/`platform_ai_agent` 为我方「文本模型+图像模型」登记单价，否则扣不到钱。联调前需与平台对齐模型清单+单价。

## 四、super-agent 样板 · 可复用范式

- **单一平台边界接口** `PlatformIntegrations`（user/billing/creation）+ **env 工厂切 Local/真实**。Local 恒放行、no-op → 本地零门控、生产真扣，同一套代码。
- **鉴权三段回退 hook**：pinned → forward-auth → 自签 JWT，统一收敛到一处 `onRequest`。
- **码裁决门 checkPermission**：本地不判会员，靠平台返回码 + `data` 信封透传前端弹窗。
- **成功交付才扣 + `pending_compensation`**：失败不回滚已交付、绝不伪造成功。
- **三个必抄的坑**：① **HTTP200 且 code≠1 = 失败**（否则静默漏扣）；② 计费失败**绝不上抛**；③ 未配 `*_BILLING_MODEL` 就**跳过不扣**。
- **base URL 唯一根**：从 `GLOBAL_GPT_API_BASE_URL` 派生 `/ai-api/ai` 与 `/user-api/api`。

## 五、本项目当前 seam 现状

| 面 | 现状 |
|---|---|
| 鉴权 | `apps/server/src/auth.ts` 只认 `x-user-id` / 有 Authorization 就回 `devFakeUserId`，**不验签 JWT**（TODO，注释留口子）。前端 `api.ts:authHeaders()` 只发 `x-user-id`。 |
| 计费 | 两端口：① `CreditBillingGateway`(生成, reserve/settle/refund)→`LocalCreditBilling`；② `BillingGateway`(发布 provider-cost, 仅 X 按次)→`LocalProviderCostBilling`。**都只记本地账本 `ssa_billing_usage_record`，不真扣。** |
| 单价 | `CREDIT_COSTS`(`@social/shared/constants.ts`)：固定按动作计价。 |
| 死开关 | ⚠️ `BILLING_MODE=stub` 声明但**全代码从不读**；注释与实现不符，需订正。 |
| 预留字段 | `ssa_billing_usage_record.glbgptRef` 留给平台流水号回填；`ssa_generation_job` 对齐 chatpal `t_model_usage`。 |

## 六、联调改造清单

| # | 关注点 | 当前 | 联调后应改为 |
|---|---|---|---|
| 1 | 后端取 userId | 只认 `x-user-id`／有 Authorization 回 fake | `auth.ts:resolveUserId` 补：剥 Bearer→共享密钥验签→取 userId。中间件签名/路由不动 |
| 2 | 关旁路 | `DEV_FAKE_USER_ID` 常开 | 生产清空；**必须与 #1 同批**，否则全 401 |
| 3 | 前端传身份 | `authHeaders()` 只发 `x-user-id` | 改发 `Authorization: Bearer <Java JWT>`。单点改 |
| 4 | 生成计费端口 | `LocalCreditBilling` 只记账本 | 换 `GlbgptCreditBilling`：reserve→checkPermission、settle→recordBill、refund→failed。换 `container.ts` 一行 |
| 5 | 发布计费端口 | `LocalProviderCostBilling` 只记账本 | 换真扣适配器（可与 #4 同一对象实现双端口）。换 `publishing.ts` 一行 |
| 6 | `BILLING_MODE` | 声明但从不读 | 真正接上做工厂选择（stub→Local / real→Glbgpt），订正 `.env` 注释 |
| 7 | 流水回填 | `glbgptRef`/`billingRecordId` 留空 | settle 写平台流水号入 `glbgptRef`；`recordJob` 补 `billingRecordId` |

## 六之二、联调责任边界：联调目标要不要改？

**结论：绝大多数「调它现成对外 API」就能实现，平台侧基本不用改代码。** 鉴权/登录/计费四个接口都是现成对外开放。只有 3 处需平台配合（多为配置/数据）：

| 联调事项 | 调现成 API 够吗 | 平台侧需配合 |
|---|---|---|
| JWT 验签 | ✅ 够 | 零改动；仅交接线上 `JWT_SECRET`（配置，非改码） |
| 登录取 token | ✅ 够 | 零改动；用现有 `/user-api/user/*Login` |
| 计费接口本体 | ✅ 够 | 零改动；`/ai-api/ai/bill/*` 就是对外接口 |
| `productNo` | ⚠️ 半 | 强校验 `ProductNoEnum`，**无 social-agent**：复用 `glbgpt`=零改；独立身份=平台加枚举+LifeCycle=改码 |
| 模型定价（决策A） | ⚠️ 需数据 | 价来自 `robot` 表按 `model`；我方 model 未注册单价会扣不到钱→平台需建价目行（数据配置） |
| system 直扣 key（决策B） | ⚠️ 半 | x-api-key 硬编码 `website-hosting`：复用=零改（语义混/无隔离）；专用 key 或修透支=改码。好处：amount 直传、不需注册价目 |

**最省平台改动路线**：鉴权+登录调现有（零改，只要 JWT_SECRET）；计费复用 `productNo=glbgpt`，X 按次走 `system/recordBill` 复用 website-hosting key（零码改，需自查余额兜底透支）；唯一必须平台做的是——生成类若走平台定价才需平台建 robot 价目行；若生成类也用 system 直扣（我方控价），**平台可全程零改动**。要干净产品隔离（独立 productNo/api-key/修透支）才需平台改码，属产品决策非技术阻塞。

## 六之三、名词解释：productNo 与 system 直扣 key

**`productNo` = 「这笔账算在哪个产品名下」的产品编号。** 平台多产品共用一套计费（glbgpt/chatpal/divinoai…），每次扣费都要带 productNo 说明属于哪个产品，决定用哪套计费规则(LifeCycleService)、账单归属。它是 Java 固定枚举 `ProductNoEnum`，传枚举外的值会被拒，**目前没有 social-agent 值** → 复用 `glbgpt`(零改) 或平台加枚举(改码)。

**当前已注册 productNo（2026-07-13 实读，ai-api 与 chatpal-api 两仓一致，共 11 个，大小写不敏感匹配）**：`chatpal`、`glbgpt`（super-agent 挂此）、`divinoai`、`note`、`CandyChat`、`CrushChat`、`FantasyImage`、`Proof_Reading`、`Spell_Checker`、`Grammar_Checker`、`AI_Detector`。定义在 `com.yanfa.framework.ProductNoEnum`。**确无 social-agent，需向平台方新增专属值（加枚举 + 配套 LifeCycleService）。**

**system 直扣 key = 一把服务端密钥，让可信后端在「无用户登录态」时也能替指定用户扣钱。** 普通扣费(checkPermission/recordBill)要带用户登录 token（平台据此知道扣谁）；但后台任务/按量结算/S2S 场景没有用户 token，就用 `system/recordBill`——不带用户 token、改带约定密钥 `x-api-key` 证明「我是可信后端」，body 里直接写 `userId`+`amount`(USD)。当前 key 硬编码 `website-hosting`（复用=零改，专属 key=改码）。⚠️ 该接口不查余额会透支；amount 单位 USD（别传 credits，超扣 1000 倍）。

用哪个：用户在线生成帖子/图片→带用户 token 的 `recordBill`（照搬 super-agent）；X 按次/无实时会话→可用 `system/recordBill` 直扣。

**system 直扣典型例子（本项目）——排期自动发帖**：用户排好「周三 10:00 自动发一条 X 推文」后关页面离开；周三到点后台定时任务发帖并按次收费，但用户不在线、后台没有他的登录 token → 用普通 `recordBill` 扣不了。改调 `system/recordBill`，带 `x-api-key` + body 直写 `{userId, amount(USD), model, productNo}`，平台照 userId 扣款、无需用户在场。对照：用户在线点「立即发布/生成」时带着 token → 走普通 `recordBill`；只有「用户不在场的后台自动动作」才用 system 直扣。（super-agent 里这把 key 原生用途正是"网站托管按量计费"，同属用户不在场的扣费。）

## 六之四、数据与存储：自有多媒体放哪 + 除关系库还需什么

**super-agent 自己另起独立库存自有数据，绝不改 yanfa 库**；只有用户/计费走 HTTP 调 Java。本项目已同构，联调此项基本零改动。

1. **关系库（自有独立，不碰 yanfa）**：super-agent 用独立 **PostgreSQL**（`persona_agent`，5433，Prisma），存 `users`（平台用户本地镜像：UUID+`glbgpt_<id>`）/Session/Document/PptProject/WebsiteProject… 全自己的表；用户/余额/计费全走 HTTP 调 Java、不加表。→ 本项目已同构：自有 `social_agent`(MySQL 3307,Drizzle) 存品牌/帖子/素材，userId varchar 逻辑引用平台 user.id。**联调零改动、继续用自己的库。**（选 Postgres/MySQL 只是各自选型。）
2. **多媒体 blob（两类，各有归属）**：① AI 生成图/视/音走平台 media 服务，blob **平台持久化**，Java `/task/get` 返 `outputFileUrl`，本地只存 URL；② 自产资产（PPT 导出/website 快照/代理图）进**自己的 S3**（`asset-store.ts`，env `AWS_S3_BUCKET`/`AWS_S3_ENDPOINT_URL`/`AWS_S3_PRIVATE_BUCKET`，dev 可切本地 FS）。**DB 只存引用**。→ 本项目已同构：`@social/storage`(MediaStorage 端口 + 本地 FS/S3) + `ssa_media_asset` 只存引用。
   - **对象存储是什么（科普）**：一个"按 key 存取文件的 HTTP 服务"（PUT 传/GET 取），**不是数据库**（不能 SQL 查、不能改文件片段），就是"近乎无限大的文件桶"。代表：AWS S3/Cloudflare R2/阿里云 OSS/自建 MinIO。**放哪**：托管云服务（生产推荐，不在你服务器上、无限扩容高可用，视频尤其别自己扛）或 自建 MinIO/本地磁盘目录（dev/小规模，即"你服务器上的网盘"）。**URL**：公开读（永久公网 URL）或 私有+预签名 URL（限时有效）。**分工**：DB(MySQL) 只存 url/key+元数据；文件字节在对象存储里；前端 `<img src>` 直指对象存储/CDN，应用服务器不经手字节。生产链路通常对象存储前挂 CDN 加速。这套无论 MySQL/PG 都一样。
3. **除关系库外还需什么**：**对象存储 S3/兼容(MinIO)/dev 本地 FS** 存 blob（唯一额外必需）；**不需要 Redis**——super-agent 刻意"去 Redis"，防重复提交靠 Java 幂等键（media.ts 注释「去 FSM/去 Redis」）；平台 Java 自己用 Redis 与我方无关。e2b 沙箱/无头浏览器是它特有功能，发帖场景用不到。

**结论**：联调不动 yanfa 库、自有数据放自己库、多媒体走对象存储(DB 只存引用)、不需额外 Redis。本项目现有架构已符合，真正要接的只有"用户/计费的 HTTP 调用"。

4. **那扣费、登录授权走不走别的库？——不走，全程只连自己那一个库。** super-agent 代码里只有 1 个 DB 连接(Postgres)，从不直连 yanfa MySQL；扣费/登录"碰 yanfa"的动作全在 Java 侧、由它的 HTTP 调用触发。

| 能力 | 真相/钱落哪 | super-agent 自己库存什么 | 怎么打通 |
|---|---|---|---|
| 登录授权 | 用户表在平台 yanfa（Java 读） | 一张 `users` 镜像表（平台id→本地UUID） | 验签(无需查库) 或 HTTP `/user-api/api/user/info` |
| 余额/扣费 | 钱在 `yanfa.user.balance`、bill 流水在 yanfa（Java 写） | ①逐次扣(帖/图)：不存本地账本，交付后直接 recordBill；②按量结算(website)：本地账本 `website_billing_cycles`(应扣gross/已扣settled/欠owed) 驱动 system/recordBill | HTTP checkPermission/recordBill/system/recordBill |

**关键区分：本地账本 ≠ 钱。** 本地账单表只是计量/水位线（应扣/已扣/欠，防漏扣重复扣），真钱一律在平台由 Java 扣。→ **对本项目同一模式**：`ssa_billing_usage_record` 是本地审计账本(reserve/settle/refund + `glbgptRef` 回填平台流水号)，真钱走 ai-api HTTP 打到 `yanfa.user.balance`；本项目也只连自己 `social_agent` 库、不直连 yanfa；登录靠验签、用户表在平台只 varchar 逻辑引用 user.id。**扣费和登录都不直接读写别人的库，全走 HTTP。**

5. **为什么 super-agent 选 PostgreSQL 而非 MySQL？** PostgreSQL = 对象-关系型数据库(ORDBMS)，在标准关系型之上把 JSONB/数组/原生UUID/自定义类型/扩展(pgvector/全文) 当一等公民；MySQL 更传统、偏简单快、运维普及。两者都成熟，只看"贴不贴数据形态"。super-agent 真正吃到两点（有 schema 依据）：① **14+ 处 JSONB 列**（agent 状态、PPT brief/outline/phases/files、website codeVersions、权限 dataPermissions 等半结构化数据）；② **26 处原生 UUID 主键**（`@db.Uuid`+`gen_random_uuid()`，MySQL 无原生 uuid 类型）。它数据高度半结构化+UUID 主键，正是 PG 主场。**但本项目不必跟着换**：我们数据规整（品牌/帖子/素材/日历），MySQL(3307) 够用且与 yanfa 同栈、运维统一，换 PG 是净负债——除非将来大量半结构化/需 JSONB 高级查询/上 pgvector 才重估。**当前结论：本项目继续用 MySQL。**

6. **本项目要不要也换 PostgreSQL（含图片/视频考量）？——不换，继续 MySQL。** 关键纠偏：**"要存多媒体(图片/视频)"几乎不构成换库理由**——无论 MySQL/PG，blob 都进对象存储、库里只存 URL 引用+元数据。实读本项目 schema：① `ssa_media_asset` 已是 `url varchar(1000)` 存引用 + `kind`(已支持 image/video)，加视频=多一条引用行+大文件进 S3，与 DB 选型无关；② 全表仅 8 个 json 列且全是简单数组(platforms/tags/contentGoals/imageSlots)，其余规整列 → MySQL 的 JSON 足够、用不上 JSONB；③ 无向量/全文需求；④ 已有 MySQL+13表+Drizzle 跑通，换 PG 纯成本；⑤ 与平台 yanfa 同栈。**唯二该重估 PG 的信号（现无）**：要做语义搜索/推荐(pgvector，且更宜加独立向量库而非迁主库)、或大量深嵌套可查询 JSON 文档。**视频落地要补的是对象存储/CDN(4.2/4.4)，不是换库。** 决断：保持 MySQL，精力放对象存储/CDN 为视频铺路。

7. **super-agent 存储实现 & 能否照搬**：**架构不用搬（已同构）；S3 实现代码可作模板填桩**。super-agent `src/services/asset-store.ts`：`@aws-sdk/client-s3`+`s3-request-presigner`；PutObject **必须设对 ContentType**（octet-stream 被下游拒的坑）；取 URL 用私有+**预签名 GET(TTL 24h)**；**关键模式=DB 存稳定 key/代理路由、不存会过期的预签名 URL，读时现签**；公开读路由严格校验 key 防越权。我们现状 `packages/storage/`：`MediaStorage` 端口 + `LocalFsMediaStorage`(dev 已实现) + `S3MediaStorage`(**桩 throw TODO**)，`@aws-sdk` 未装。照搬清单：架构✅无需搬；S3 实现逻辑✅填进 `S3MediaStorage.put/getUrl`(先装 aws-sdk)；稳定key存库读时现签✅强烈建议(注意 `ssa_media_asset.url` 当前存 URL，要么改存 key+现签路由、要么 public-read 存永久 URL)；key 校验✅；**视频上传/大文件⚠️无现成可搬**(super-agent 视频是平台生成只存 URL，其 asset-store 只做图片上传 png/jpeg/webp≤40MB；自传视频需自补放开 mime/提上限/分片上传+CDN)。**照搬前先定：图片/视频是我方自己生成(走我方 S3、照搬有意义) 还是走平台生成(只存平台 URL、不需自建存储)——与计费决策 A/B 联动。**

8. **AI 生成 vs 用户上传 · 现状与要写什么**：① **AI 生成图**——dev 已通(`generate.ts` 把图模型 base64 解码→`media.put()` 落 LocalFs→DB 存 url→`app.ts` `/media` 静态路由服务)，生产填 S3 桩即可；② **AI 生成视频**——目前无视频生成路径(现在只出图)，将来同一 `MediaStorage` 端口；③ **用户上传图**——❌ server 无任何上传路由，需写，但可**照搬 super-agent `/api/assets/upload`**(`@fastify/multipart`+`ingestImageAsset`→PutObject 设 ContentType→预签名 URL→记 ssa_media_asset)，工作量小；④ **用户上传视频**——❌ 两边都没有(super-agent asset-store 只做图片 png/jpeg/webp≤40MB)，需**自己设计**：**浏览器直传 S3(预签名 PUT/分片上传)绕过应用服务器 + 断点续传 + CDN**，别走"传到应用服务器再转存"。都在存储层解决，与 MySQL/PG 无关。

## 七、关键设计决策（待拍板）

1. **计费价格真源在哪？**
   - 方案 A（推荐·生成类）：`checkPermission → recordBill` 三段式，价格由平台 `robot` 表（按 model+token）。与现有端口对齐、有余额拦截、有冻结防并发。代价：`CREDIT_COSTS` 不再是真源。
   - 方案 B（推荐·X 按次）：`system/recordBill` 直传 `amount`，我方控价、最省事。代价：需 `x-api-key`、平台该接口目前会透支，需扣前自查余额。
   - 倾向：生成→A，X 按次→B。**请确认计费主源认平台还是认本项目。**
2. **userId 是否引入映射层？** 倾向：**直接用 `user.id`(字符串) 当锚点，不引入 UUID 映射层**（本项目非多租户 SaaS）。顺带订正 schema「雪花」注释。
3. **登录入口形态？** 独立站（前端调 chatpal `/user-api/user/emailLogin` 换 JWT）vs 嵌入 GlobalGPT（forward-auth 转发已登录 token）。**请确认产品形态。**
4. **直连 DB vs HTTP 接口？** —— 明确建议、非开放项（✅已定）：**一律走 ai-api HTTP 接口，绝不 TS 直连 `yanfa` 改 `balance`**（会绕过订阅优先/冻结/并发逻辑，且 3306 是活库，风险极高）。
5. **✅已定 · 出图/视频走谁 → 走平台 media 服务**（参照 super-agent 与平台联调方式，我方对接 `yanfa-ai-api` media 服务；social-agent 不与 super-agent 联调）。AI 图/视频=平台生成+托管(只存 outputFileUrl)+原生扣费(estimate/submit，非 recordBill)。→ 出图代码从"直连网关拿 base64"重构为"estimate→submit→poll 异步流"；文本仍走 recordBill。
6. **✅已定 · 本期范围 → 只做「AI 出图+发帖」最小闭环**；用户上传图/其他媒体(视频等)本期不做。
7. **✅已定(本期N/A) · 媒体 URL+存储选型**：AI 图平台托管(只存 URL)+不做用户上传 → 我方本期无需自建对象存储/S3。推迟到将来做上传/自建视频再定(届时照 4.7/4.8)。
   - 连带：3.1「图片按张 recordBill」不适用本项目(那是 super-agent PPT 特例)；本期计费只剩文本→recordBill、X 发帖→system 直扣；@social/storage 的 S3 桩本期可不填。
8. **productNo：复用还是专属？** 复用 glbgpt(零改、账单挂 glbgpt) / 专属 social-agent(平台加枚举+LifeCycleService、账单独立)。用户已倾向专属，需平台配合。
9. **登录 token 失效机制？**(依赖决策3) 主登录 token 永不过期、框架不提供主动失效；要登出/踢下线得自建(黑名单/短期 token+refresh)。看安全要求，可上线前再定。

> 决策讨论顺序（前置先定）：5 出图走谁 → 6 范围 → 3 登录形态 → 1 计费 → 8 productNo → 2 userId → 7 存储 → 9 token 失效。

### ✅ 决策记录（全部已拍板，2026-07-13）

- **决策 5** 出图/视频走谁 = **走平台 media 服务**（参照 super-agent 对接 `yanfa-ai-api` media；不与 super-agent 联调）。AI 图/视频平台生成+托管(只存 URL)+原生扣费；出图代码重构为 estimate/submit/poll；文本仍 recordBill。
- **决策 6** 本期范围 = **只做 AI 出图 + 手动发帖最小闭环**；用户上传/视频/**排期自动发帖**等不做（列二期待办）。
- **决策 7** 存储 = **本期 N/A**（平台托管 AI 图+不做上传 → 我方无需自建 S3；将来做上传/视频再定）。
- **决策 3** 登录形态 = **独立站（自建登录页）**。前端调 chatpal `/user-api/user/*Login` 拿主登录 JWT(永不过期)→后端共享密钥验签→前端带 Bearer。
- **决策 1** 计费价格真源 = **平台定价 recordBill 为主**（参考 super-agent）。两笔费用分开：**AI 生成费**（文本/图片）在**生成时**扣（recordBill / 平台 media 原生，改/取消不退因算力已耗）；**X 发帖费**（按次）在**发布那一刻**扣（改/取消不扣）。本期只做手动发帖→发布时用户在线→走 recordBill(平台注册 publish 价)，**本期不需要 system 直扣/x-api-key**；排期自动发帖(需 system 直扣)列二期。前置：平台注册文本模型+publish 价目。
- **决策 8** productNo = **复用 glbgpt，不另注册专属 `social-agent`**（用户 2026-07-14 改定）。平台侧 productNo 相关零改动（不改 ProductNoEnum/AbstractLifeCycleService/GenerationAPI、不重部署）；账单挂 glbgpt 名下、无产品级隔离（本期可接受，将来要独立账单再申请专属）。
- **决策 2** userId 锚点 = **直接用 user.id(varchar)，不引映射层/本地镜像表**（super-agent 的 UUID 镜像是其多形态会话所需，我方本期不要）。订正 schema「雪花」注释。
- **决策 9** token 失效 = **本期不自建、依赖平台**（参考 super-agent）。登出=前端丢 token；主登录永不过期本期接受；将来强安全需求再加黑名单/短期 token。
- **决策 4** 直连 DB vs HTTP = **走 HTTP**（明确、非开放）。

**前置准备（你/平台侧并行）**：① 运维给线上 `JWT_SECRET`（测试环境值已确认，见 2.2）；② 平台在 `robot` 表注册我方文本模型/publish 价目（**productNo 复用 glbgpt，无需平台改码**）。（x-api-key 本期不需要——只手动发帖。）

**二期待办**：排期自动发帖 + 其发帖计费（后台无 token→system 直扣，需确认 x-api-key + 处理透支缺陷）；用户上传图（照搬 super-agent /api/assets/upload）；视频（生成/上传，直传 S3+分片+CDN）；自建对象存储 S3（决策 7）。

### 前置准备操作手册（怎么加 productNo / 注册价目）

- **① 加 `social-agent` productNo（决策8）= 平台改代码+重部署**。精确文件清单：
  - **必改(2 文件×2 仓)**，相对仓根路径（两仓一致）：
    - `ProductNoEnum.java`：`yanfa-framework/framework-base/src/main/java/com/yanfa/framework/ProductNoEnum.java` → 加 `SOCIAL_AGENT("social-agent")`
    - `AbstractLifeCycleService.java`：`yanfa-platform/yanfa-platform-ai/platform-ai-service/src/main/java/com/yanfa/platform/ai/spi/AbstractLifeCycleService.java` → `getInstance()` 加 `else if("social-agent"…)` 复用现成 `GlbgptLifeCycleService`(同目录 `spi/glbgpt/GlbgptLifeCycleService.java`)。两仓(chatpal-api+ai-api)各一份。
  - **⚠️ 图生成走 media 才需(+1，仅 ai-api)**：`GenerationAPI.java` 第147行硬编码白名单 `productNoList={chatpal,glbgpt,divinoai}` 加 `"social-agent"`。路径 `yanfa-platform/yanfa-platform-ai/platform-ai-api/src/main/java/com/yanfa/platform/ai/api/GenerationAPI.java`。只 gate media 的 flux 类 submit、不影响 recordBill，仅当图生成走 flux 类接口时才需要。
  - **不用改**：VoicesAPI/WorldcupAPI/AgentAPI 等各自产品的同类白名单。
- **② 注册 robot 价目（决策1）= DB 插数据(非改代码)**：`robot` 表按 `findByModel(model)` 取价，`price` JSON、`type=tokens/once`，在共享 `yanfa` 库(插一次两服务通用)，单位 USD、credits=USD×1000。格式：文本 `{"type":"tokens","input":X,"output":Y}`(cost=input×promptTokens/1000+output×completionTokens/1000，promptTokens>1万部分5折)；发帖 `{"type":"once","price":Z}`。要插：文本模型行(复用平台已定价文本模型则免)、`social-x-publish` once 行(必须新加，平台无"发帖"模型)。
- **③ 图生成定价（决策5，走 media 服务）= 大概率免注册**：media 定价 = `MediaModelCatalog` 解析 modelId→platformModelKey→查 robot(once)。**复用平台已有图像/视频模型就什么都不用注册**，直接用其 modelId 调 estimate/submit；只有上自定义图像模型才需平台加 catalog 映射(代码)+robot(once)行。
- **结论**：模型还是原来那套（都已在 robot 有价）→ **robot 表不用加任何"模型调用"费用行，唯一要补的就是 publish 动作的 once 价目行**；加上加 `social-agent` productNo(改代码)。唯一需核实：我方文本 recordBill 上报的 `model` id 已是 robot 里有价的行（否则 no_robot_row 扣不到钱）；图像走 media 服务用平台现成模型天然有价。

### X 发帖精细化计价方案（含利润加价）

基准=X 官方成本(2026-07 核实)：不含链接 $0.015/条、含链接 $0.20/条、串推×条数、Article 按单条($0.20,需 Premium)。**售价=官方成本×(1+加价率)**，存 robot 表(调价改一行数据)。推荐起始售价：不含链接推 $0.025(25 credits)、含链接推 $0.30(300 credits)、Article $0.50(500 credits)、串推=Σ每条。1 credit=$0.001。robot(once)行：`x-publish-plain`=0.025、`x-publish-link`=0.30、`x-publish-article`=0.50。计费规则：单条 recordBill 1 次(按链接选 plain/link)；**串推逐条 recordBill**(每条按自己链接选 model)同 batchId 分组(对齐 super-agent 逐张图 recordBill)；Article 1 次；tokens 传 0；发布成功那一刻扣、失败不扣。衔接：`publisher/pricing.ts` 已有官方成本+hasLink+xTweetCount，方案=成本换售价+按条选 model 上报 recordBill。**待用户拍加价率/售价数。**

**publish 计价要不要新建表（多平台扩展）**：**不新建表**。分两层——价格数值只存平台 `robot` 表(唯一真源，recordBill findByModel 取价，别在我方复制)；计价逻辑(选哪档)在我方 `pricing.ts`。publish 用 robot(once) 行按"平台+形态"命名(`x-publish-plain/link/article`、将来 `ig-publish-*`/`yt-publish-*`)，加平台=加数据行+加 pricing.ts 规则，不改表结构；多数平台发帖免费($0)压根不加行。**只有要做"管理员不改代码增删平台/调价"的计价后台时**，才在我方建轻量映射表 `ssa_publish_pricing`(平台/形态/robot_model_key/启用/展示名，只存映射不存价)——二期/后台范畴，本期不做。

## 八、分阶段落地计划（确认后执行）

- [ ] **阶段 0 · 环境对齐**：向运维要线上 `JWT_SECRET`、ai-api/chatpal-api base URL、（若用 system 扣）`x-api-key`；本地连打三次确认接口稳定。
- [ ] **阶段 1 · 鉴权打通**：`auth.ts` 补 JWT 验签；前端 `authHeaders()` 带 Bearer；关 `DEV_FAKE_USER_ID`（与验签同批）。
- [ ] **阶段 2 · 计费适配器**：实现 `GlbgptCreditBilling`（checkPermission/recordBill/failed）换生成侧装配；发布侧同理；`BILLING_MODE` 接上做工厂。
- [ ] **阶段 3 · 流水与审计**：settle 回填 `glbgptRef`、补 `billingRecordId`；对齐 `t_model_usage`。
- [ ] **阶段 4 · 评估与测试**（评估大于一切）：余额不足(402)、并发扣减、失败退款/解冻、system 透支边界、HTTP200+code≠1 漏扣 —— 建可回归测试集。

## 九、风险与坑

- **判据坑**：平台失败也返 HTTP200，须以 `body.code===1`（或 null）判成功。
- **金额单位坑**：余额=USD，credits=USD×1000。别把 credits 当 amount 传（超扣 1000 倍）。
- **透支坑**：`system/recordBill` 无余额拦截，会扣成负数——扣前自查。
- **exp 坑**：主登录 token 无 exp、php 登录 token 带 30 天 exp；验签要「带 exp 就尊重、无 exp 就接受」两条兼容（详见第二节补充）。JWT 不落 MySQL；主登录无状态、php 登录仅存 Redis。
- **密钥坑**：密钥用明文原始字节，不 base64。
- **上线次序坑**：JWT 验签 + 关旁路必须同批。
- **活库坑**：3306 `yanfa` 是活库，计费走接口不直连。

---

## 附录 · 项目进展记录

### 2026-07-13（下午）· 联调方案设计与决策

**✅ 已完成**
- 通读参考项目 super-agent + 平台 Java 源码（chatpal-api / ai-api），吃透鉴权、计费、数据与存储三块联调方式，产出本联调方案文档。
- 敲定全部 9 个关键设计决策（登录=独立站、AI 出图走平台 media 服务、文本计费 recordBill、userId 直接用 user.id、专属 productNo、本期范围=AI 出图+手动发帖 等）。
- 理清联调前置（平台加 productNo 改代码 + 注册 publish 价目插数据）及操作手册。
- 设计 X 发帖精细化计价方案（X 官方成本 + 利润加价）。

**🔜 明日计划**
- [ ] 跟 mentor / 平台对接人确认前置：① 线上 JWT_SECRET 实际值；② 平台加 social-agent productNo + 注册 publish 价目。
- [ ] 拍板 X 发帖计价加价率/售价（推荐起始 25/300/500 credits）→ 整理给平台的 robot INSERT 需求单。
- [ ] 核实我方文本 recordBill 上报的 model id 已在平台 robot 表有价。
- [ ] 前置到位后进入阶段 0（环境对齐）→ 阶段 1（鉴权打通：auth.ts 补 JWT 验签 + 前端带 Bearer + 关旁路）。

### 2026-07-14（下午）· 计费接口源码考古 + X 发帖 robot 设计（→ 飞书子文档）

**详见飞书子文档**《计费联调实现细节 · 平台接口逻辑 + X 发帖 robot 条目》：`https://legaldao.feishu.cn/wiki/G3ylw8wJEirg0ukBPvCchAmjnuf`（挂在主方案文档下，为可读性把实现细节解耦出去）。

**关键订正 / 新结论（一手源码，可回溯 file:line）**：
- **BillAPI 对外只有 4 端点**：estimatePrice / checkPermission / recordBill / system/recordBill。**没有对外 failed 端点**（failed 是三段式内部方法，只有平台自己的生成流程失败才调；我方走 HTTP 拿不到）。
- **是否预冻结 = `type≠tokens && type≠cost`**（`PriceTypeEnum.needPreBlock`）→ **文本(tokens) 不冻结、发帖(once) 要冻结**。
- **本期文本链路无坑**：checkPermission 只校验权限/余额（subCode 体系 4002 需充值/4003·4004 订阅余额不足/4009 需 PRO/4010 需 UNLIMITED/5001-5003 终身会员/5010 繁忙），成功 recordBill 按实 token 扣（订阅→充值 user.balance→免费额度依次扣、写 bill），失败无需操作。
- **X 发帖(once) 坑与解法**：once 走完整三段、失败需 failed 解冻但无对外接口 → 冻结泄漏。**解法=发布成功那刻直接 recordBill(once)、不调 checkPermission 预冻结**（成功才扣、失败不扣，天然规避）。残留：once 的 after→doUnblock 仍会尝试从 user.block_amount 解冻 min(block_amount, price)，仅当用户此刻 block_amount>0 才误解冻（发帖瞬时、金额小、风险低，观察即可）。
- **X 发帖 robot 条目**：once 行 model=`x-publish-plain/link/article`，price=`{"type":"once","price":<USD>}`（数值待加价率）；recordBill 传 tokens=0，串推逐条同 batchId 走批次计费。
- **计价**：tokens = input×prompt/1000 + output×completion/1000（prompt>1万 input 部分×0.5）；once = 固定 `price.price`。
- **未配 robot 行**：recordBill 直接取 `robotPO.getPrice()`，未配→异常/扣不到 → 我方文本 model 必须在 robot 表有价。

### 2026-07-14（傍晚）· productNo 决策变更 + 飞书文档整理

- **决策 8 变更**：productNo 改为**复用 glbgpt、不另注册专属 social-agent**（用户拍板）。→ 平台侧 productNo 相关零改动（不改 ProductNoEnum/AbstractLifeCycleService/GenerationAPI、不重部署）；平台侧本期唯一实事 = robot 表配价目（数据）。原「加 social-agent productNo」前置整块取消。
- **飞书文档整理**：主文档瘦成导航中枢，内容按主题解耦为 4 个子文档（① 平台接口与计费实现 / ② 改造与设计决策 / ③ 数据与存储 / ④ 落地手册）；代码类内容改用代码块组件。飞书主/子文档均已同步 productNo 变更。
