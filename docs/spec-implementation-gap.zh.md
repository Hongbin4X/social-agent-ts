# Spec ↔ 实现 Gap 分析（SDD gap register）

- 日期：2026-07-13
- 对应基线：master `6ba4368`
- 参照 spec：[super-social-agent-requirement-spec-p0.zh.md](./super-social-agent-requirement-spec-p0.zh.md)（2026-07-02）、[social-platform-publishing-integration.zh.md](./social-platform-publishing-integration.zh.md)、[p0-dev-verification-boundary.zh.md](./p0-dev-verification-boundary.zh.md)、[superpowers/specs/2026-07-10-x-real-auth-posting-design.md](./superpowers/specs/2026-07-10-x-real-auth-posting-design.md)

## 0. 一句话结论

P0 产品主线（生成 / 排期 / 发布编排 / 看板）与 spec 基本对齐；**最大的 gap 在 X（Twitter）发布**——这块的实现已经**远超各设计文档冻结时的状态**（文档停在 2026-07-10 的「paste-back 授权 / 只发纯文本 / 单条推 / 无前端 UI」，实际已做到「真回调重定向 + 前端连接 UI + 三种发帖形态 + 图文 + 反垃圾实测规律」）。其余标准 gap 是三个真实外部依赖仍为本地替身（真扣费 / 真连号真投递除 X 外 / 真拉数据）。

Gap 分三类：**A 实现已超出/偏离 spec（文档待更新）**、**B spec 有但实现未达（接通缺口）**、**C 任何文档都没记的新事实（需补进 spec）**。

---

## A. 实现已超出 / 偏离 spec —— 文档待更新

| # | 主题 | 文档现在怎么写 | 实际实现（`6ba4368`） | 待更新处 |
|---|---|---|---|---|
| A1 | X 授权方式 | 设计 doc §1：**paste-back**（粘贴回调 URL）；「前端连接 UI 留到下一版」 | **真回调重定向**：免鉴权 `GET /api/connections/x/callback`，X 授权后浏览器直接跳回、自动换 token 落库；前端「添加授权账号」弹窗授权 + 轮询/postMessage 感知；paste-back 仅作兜底保留 | x-real-auth-posting-design.md §1/§3.4 |
| A2 | X 回调地址 | 设计 doc §3.6 / .env：`http://127.0.0.1:8765/callback` | `https://52.54.122.204/api/connections/x/callback`（同时支持 `x.broly.ai`）；走 nginx（`deploy/nginx/social-agent.conf`），env `X_REDIRECT_URI` / `APP_PUBLIC_URL` | x-real-auth-posting-design.md §3.6、.env.example |
| A3 | X 发帖形态 | publishing-integration §4：`adapters/x.ts` = 「X 直连（POST /2/tweets）」单条 | **三种形态**：普通推 / 串推（reply 链自动分段）/ Article（草稿→发布，需 Premium）；前端可选并持久化 | publishing-integration §4、主 spec §10.2、§14.6 |
| A4 | X 图文 | 设计 doc §1「非目标」/ §5：只发纯文本+链接；发图留待付费档 | **图文已实现**：`/2/media/upload` 拿 media_id 再发（≤4 张，需 media.write），普通推与串推首条支持；已真机发出图文推验证 | 设计 doc §1/§5、publishing-integration §6 X checklist |
| A5 | 发布计费实现 | publishing-integration §5：`BillingGateway` 是**桩，一调即抛** | 实为 `LocalProviderCostBilling`：预扣/结算/退款如实记 `ssa_billing_usage_record`（本地账本，非抛错桩；仍不接真实 GLBGPT 扣费——见 B2） | publishing-integration §5、verification-boundary 表 |
| A6 | connectionRoutes | publishing-integration §4：「OAuth 脚手架」、authorize-url 返回 501 | 完整路由：`authorize-url` / GET 回调（重定向）/ POST 回调（paste-back 兜底）/ `:id/disconnect`，均真落库 | publishing-integration §4 |
| A7 | PostVariant 字段 | 主 spec §14.6：无 `xPostType`、无 `imageSlots` | 已加 `xPostType`（X 发帖形态，迁移 0003）与 `imageSlots`（内联配图槽，迁移 0001/0002）并持久化 | 主 spec §14.6 |
| A8 | Content Create 编辑器 | 主 spec §10.2：无「X 发帖形态」选择 | wizard 选账号处新增「X 发帖形态（普通推/串推/Article）」选择器 + 「授权/管理账号」直达链接 | 主 spec §10.2 |

---

## B. spec 有、实现未达 —— 三种缺口

### B-1. 前后端断线（后端能力就绪、前端却用 mock 没接线）—— 最该优先修，成本低

> 这类最反直觉、也最值得先修：**后端端点 + 落库 + 真模型都写好了，前端却走本地 mock、`api.ts` 里连方法都没有**。修法只是前端接线，无外部依赖。

| # | 主题 | 后端现状 | 前端现状（断线点） |
|---|---|---|---|
| B1 | **7-day plan 生成** | POST `/api/generate/plan` 已实现：走真模型、落 `ssa_plan` / `ssa_plan_item` | `store.generatePlan` 直接铺 `data/mock.ts` 的 `planTemplate` + 本地扣 credit；`api.ts` **无 plan 方法** → 计划是 mock、不落库、不走模型 |
| B2 | **AI 运营建议（Operations recommendations）** | POST `/api/generate/recommendations` 已实现：走真模型 | `store.generateSuggestions` 直接铺 `data/mock.ts` 的 `opsRecommendations` + 本地扣 credit；`api.ts` **无此方法** → 建议是 mock、不走模型 |

### B-2. 缺失能力（spec 隐含、实现完全没有）

| # | 主题 | spec 要求 | 实际现状 |
|---|---|---|---|
| B3 | **排期到点自动发（调度器）** | spec §10.2「Schedule for later」/ §12 Scheduled 任务 / §15 PostStatus=Scheduled | **无任何 cron / scheduler / worker / queue**（全仓 grep 无）。Calendar 的「立即发布」是手动真发，但**排期项到点不会自动触发**——`ssa_calendar_job` 有 `fires_at` 但没有东西去读它并发。定时发布目前=「记下时间，靠人到点手动点」 |

### B-3. 外部依赖桩（本地替身可验、真副作用待联调）

| # | 主题 | spec 要求 | 实际现状 | 边界性质 |
|---|---|---|---|---|
| B4 | Instagram / Facebook 自动发布 | 主 spec §3：X/IG/FB 均为 Auto publishing | 仅 **X 真接通**。IG/FB 只有 `adapters/meta.ts`（POST 骨架），**无 OAuth/token 落库、无前端连接**（前端标「需 Meta 审核·即将支持」）→ 实际返回 `not_connected`。需 Meta App Review（2–4 周/轮） | 真连号 + 真投递未接 |
| B5 | 真实计费扣款 | 主 spec §4/§16：接 GLBGPT 计费系统，真扣余额 | 本地账本 `LocalProviderCostBilling` / `LocalCreditBilling`（记 `ssa_billing_usage_record`，reserve→settle→refund 规则可验）；**不扣真实余额**。前端顶栏 credits 是本地乐观扣减、**不与后端账本同步** | 规则/UX 可验，真扣费是桩 |
| B6 | 真实登录 / 身份 | 主 spec §4：复用 GLBGPT 登录、userId、套餐权益 | dev 假用户：`x-user-id` header + `DEV_FAKE_USER_ID`；无真 JWT 校验、无套餐权益 | 业务链路可验，真 SSO 是桩 |
| B7 | Operations Data 真实指标 | 主 spec §13：真实 impressions/engagement/clicks/followers 等 | 看板/筛选/图表可验；**指标数纯前端 mock，后端零 analytics 路由**（真实数来自各平台 analytics API，独立于发帖 API，未接） | UI/流程可验，真数据是桩 |

> **B4 需产品决策**：spec 把 IG/FB 列为「自动发布」，但真接通成本高（Meta 审核 + Business 账号门槛）。若短期不做，建议在 spec §3 标注 IG/FB「自动发布」为**目标态**、当前「未接通」，避免与验收标准冲突。

---

## C. 任何 spec / 文档都没记的新事实 —— 应补进 spec / 运营须知

> 这些是 2026-07-12/13 真机联调得到的一手结论，对产品可用性影响大，目前散落在项目记忆与飞书文档，spec 里没有。

- **C1｜X 反垃圾 / 反硬广拦截（产品级风险）**：一条推里同时有【营销话术】+【多个话题标签】+【推广链接】三样叠满 → X 返回 `403 not permitted` 拒发；任意两样一般放行。本产品「自动生成营销内容」天生易踩。实测矩阵与规避建议见飞书文档《X 发推：实现程度与注意事项》。**建议在发布层做「遇 403 自动降级重试」**（去链接/减标签重发一次），并在 spec §11 增补该失败态与产品对策。
- **C2｜X Article 需 Premium**：发 Article 的账号必须开通 X Premium，否则 403。spec §10.2 若纳入 Article 形态，须写明此门槛。
- **C3｜X token 一次性轮换**：refresh_token 轮换，同一账号不可被两个系统同时持有刷新（demo 与本项目互踢）。属实现约束，宜记入 §14.4 / 集成文档。
- **C4｜改 X App 权限需重新授权**：X 后台改 App permissions 后旧 token 冻结在原权限，须重新授权拿新 token（自动 refresh 不解决）。属运营须知。
- **C5｜回调地址证书 / DNS**：裸 IP 回调有证书告警（证书为 `*.broly.ai` 不覆盖 IP）；固定域名 `x.broly.ai`（DNS 在 Cloudflare）可消除。属部署须知，宜记入部署文档。

---

## D. 建议（SDD 下如何收敛，按性价比排序）

1. **先修「前后端断线」（B-1，成本最低、收益最直接）**：后端 + 模型都现成，只差前端接线。
   - 7-day plan：`api.ts` 加 plan 方法 → `store.generatePlan` 改调 `POST /api/generate/plan`（现在是 mock）。
   - 运营建议：`api.ts` 加 recommendations 方法 → `store.generateSuggestions` 改调 `POST /api/generate/recommendations`（现在是 mock）。
2. **补「排期到点自动发」（B3）**：加一个调度器（cron / worker / 队列）读 `ssa_calendar_job.fires_at` 到点触发 `publishBatch`。否则「定时发布」名不副实。属需产品/架构决策的能力缺口（是否 P0 必须）。
3. **更新 spec 与设计文档（把 A 类 gap 回灌）**：
   - 主 spec：§10.2 增补「X 发帖形态选择」；§14.6 补 `xPostType` / `imageSlots`；§11 增补 X 反垃圾失败态（C1）与 Article/Premium（C2）。
   - `x-real-auth-posting-design.md`：§1/§3.4/§3.6 从「paste-back / 无前端 / 纯文本 / 127.0.0.1」更新为现状（真回调重定向 / 前端 UI / 图文 / IP·域名回调）。
   - `social-platform-publishing-integration.zh.md`：§4 X adapter 更新为三形态 + 图文；§5 计费从「抛错桩」更正为「本地账本」。
4. **明确 IG/FB 目标态 vs 现状（B4）**：spec §3 标注「自动发布」为目标、当前未接通，避免验收口径冲突。
5. **接外部依赖（B5/B6/B7）**：真 GLBGPT 计费、真 JWT、各平台 analytics——端口已抽象，联调时换适配器即可，非 P0 独立开发阻塞。
6. **维护本文件为 living gap register**：每跨越一个缺口就回本表勾掉并同步 spec。

### 备注
- `ssa_platform_prompt` 表已建但**无任何读写路径**（后台管理各平台 prompt 的预留，见项目记忆 `social-agent-admin-backend`）——属「有 schema 无功能」，非本次 gap 重点，记录备查。
- 前端顶栏 credits 是本地 `useState` 乐观扣减，与后端 `ssa_billing_usage_record` 账本不同步——接真实 GLBGPT 计费时一并对齐。

---

> 本文件由 spec-vs-实现比对生成（含一个只读代码勘察子任务的全域盘点）；X 部分基于 2026-07-12/13 真机联调，其余模块状态经代码核实并校订 `p0-dev-verification-boundary.zh.md`（2026-07-10）的旧结论。
