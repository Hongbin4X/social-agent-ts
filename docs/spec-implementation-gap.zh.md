# Spec ↔ 实现 Gap 分析（SDD gap register）

- 日期：2026-07-13（本轮已把「实测现实」回灌设计/集成文档，本台账聚焦「代码里还没实现」的 gap）
- 对应基线：master（最新提交）
- 参照 spec：[super-social-agent-requirement-spec-p0.zh.md](./super-social-agent-requirement-spec-p0.zh.md)（🔒 冻结基线）、[social-platform-publishing-integration.zh.md](./social-platform-publishing-integration.zh.md)、[p0-dev-verification-boundary.zh.md](./p0-dev-verification-boundary.zh.md)、[superpowers/specs/2026-07-10-x-real-auth-posting-design.md](./superpowers/specs/2026-07-10-x-real-auth-posting-design.md)

## 0. 一句话结论

「**实现已超出 spec**」的部分（X 真回调授权 / 三形态 / 图文 / 本地账本计费等）已**回灌**进设计与集成文档；本台账现在只保留 **代码里还没实现的 gap**（前后端断线 / 缺调度器 / 外部依赖桩），供持续跟踪。主 P0 需求 spec 按用户决定冻结、不改。

---

## A. 实现已超出 spec —— ✅ 已回灌设计 / 集成文档（本轮 2026-07-13 处理）

下列「实现跑到 spec 前面」的点，已写入对应设计/实现文档，**不再作为待办 gap**：

| 实测现实 | 已回灌到 |
|---|---|
| X 授权 = 真回调重定向（替代 paste-back）+ 前端连接/断开 UI | x-real-auth-posting-design.md §0 现状更新 |
| X 回调地址 = `https://52.54.122.204`(+`x.broly.ai`) / nginx | 同上 |
| X 发帖三形态（普通推 / 串推 / Article） | 同上；publishing-integration §4 代码地图 |
| X 图文（`/2/media/upload`，≤4 张） | 同上；publishing-integration §4 / §6 checklist |
| 发布计费 = `LocalProviderCostBilling` 本地账本（非「抛错桩」） | publishing-integration §5 |
| connectionRoutes = 完整真路由（非「脚手架/501」） | publishing-integration §4 |
| 端到端实测：X 已 published（非 not_connected） | publishing-integration §4 |

**仍挂账的回灌（因主 spec 冻结）**：下列本应回灌**主 P0 需求 spec**、但因 spec 冻结暂缓，先记于此，待解冻再回灌——
§10.2「X 发帖形态选择器」、§14.6 补 `xPostType` / `imageSlots` 字段、§11 增补 X 反垃圾失败态与 Article/Premium 门槛。

---

## B. 代码里还没实现的 gap —— 【本台账重点保留】

### B-0. X 发布层「遇 403 反垃圾自动降级重试」（未实现）

X 对「营销文案 + 多标签 + 推广链接」叠满会 `403 not permitted`（见 §C1）。**目前只是如实报错，没有自愈**。建议发布层遇此 403 时自动降级重试一次（去链接 / 减标签），大幅降低自动发营销帖的失败率。

### B-1. 前后端断线（后端能力就绪、前端却用 mock 没接线）—— 成本最低，建议先修

| # | 主题 | 后端现状 | 前端现状（断线点） |
|---|---|---|---|
| B1 | **7-day plan 生成** | POST `/api/generate/plan` 已实现：走真模型、落 `ssa_plan` / `ssa_plan_item` | `store.generatePlan` 直接铺 `data/mock.ts` 的 `planTemplate` + 本地扣 credit；`api.ts` **无 plan 方法** → 计划是 mock、不落库、不走模型 |
| B2 | **AI 运营建议** | POST `/api/generate/recommendations` 已实现：走真模型 | `store.generateSuggestions` 直接铺 `data/mock.ts` 的 `opsRecommendations` + 本地扣 credit；`api.ts` **无此方法** → 建议是 mock、不走模型 |

### B-2. 缺失能力（spec 隐含、实现完全没有）

| # | 主题 | spec 要求 | 实际现状 |
|---|---|---|---|
| B3 | **排期到点自动发（调度器）** | spec §10.2「Schedule for later」/ §12 Scheduled 任务 / §15 PostStatus=Scheduled | **无任何 cron / scheduler / worker / queue**。Calendar「立即发布」是手动真发，但**排期项到点不会自动触发**——`ssa_calendar_job` 有 `fires_at` 但无东西读它并发。定时发布目前=「记下时间，靠人到点手动点」 |

### B-3. 外部依赖桩（本地替身可验、真副作用待联调）

| # | 主题 | spec 要求 | 实际现状 | 边界性质 |
|---|---|---|---|---|
| B4 | Instagram / Facebook 自动发布 | 主 spec §3：X/IG/FB 均为 Auto publishing | 仅 **X 真接通**。IG/FB 只有 `adapters/meta.ts`（POST 骨架），**无 OAuth/token 落库、无前端连接**（前端标「需 Meta 审核·即将支持」）→ 实际返回 `not_connected`。需 Meta App Review | 真连号 + 真投递未接 |
| B5 | 真实计费扣款 | 主 spec §4/§16：接 GLBGPT 计费系统真扣余额 | 本地账本（记 `ssa_billing_usage_record`，规则可验）；**不扣真实余额**。前端顶栏 credits 是本地乐观扣减、**不与后端账本同步** | 规则/UX 可验，真扣费是桩 |
| B6 | 真实登录 / 身份 | 主 spec §4：复用 GLBGPT 登录、userId、套餐权益 | dev 假用户：`x-user-id` + `DEV_FAKE_USER_ID`；无真 JWT、无套餐权益 | 业务链路可验，真 SSO 是桩 |
| B7 | Operations Data 真实指标 | 主 spec §13：真实 impressions/engagement/clicks/followers 等 | 看板/筛选/图表可验；**指标数纯前端 mock，后端零 analytics 路由** | UI/流程可验，真数据是桩 |

> **B4 需产品决策**：spec 把 IG/FB 列为「自动发布」，但真接通成本高（Meta 审核 + Business 账号门槛）。若短期不做，建议在 spec §3（解冻后）标注 IG/FB「自动发布」为目标态、当前「未接通」。

---

## C. 实测事实（已回灌，仅留指针）

X 真机联调得到的一手结论已写入 x-real-auth-posting-design.md §0 与 publishing-integration，并详见飞书文档《X 发推：实现程度与注意事项》。含：

- **C1｜X 反垃圾拦截**：营销话术 + 多标签 + 推广链接三叠 → `403 not permitted`（对策见 B-0）。
- **C2｜X Article 需 Premium**；**C3｜token 一次性轮换**；**C4｜改 App 权限需重新授权**；**C5｜回调证书 / DNS**。

---

## D. 建议（按性价比排序）

1. **先修「前后端断线」（B1/B2）**：后端 + 模型都现成，只差前端接线，零外部依赖。
   - 7-day plan：`api.ts` 加 plan 方法 → `store.generatePlan` 改调 `POST /api/generate/plan`。
   - 运营建议：`api.ts` 加 recommendations 方法 → `store.generateSuggestions` 改调 `POST /api/generate/recommendations`。
2. **发布层自愈（B0）**：遇 `403 not permitted` 自动降级重试（去链接/减标签）。
3. **补调度器（B3）**：加 cron / worker 读 `ssa_calendar_job.fires_at` 到点触发 `publishBatch`，让「定时发布」名副其实。属需产品/架构决策的能力缺口。
4. **接外部依赖（B4/B5/B6/B7）**：IG/FB OAuth、真 GLBGPT 计费、真 JWT、各平台 analytics——端口已抽象，联调时换适配器即可。
5. **主 spec 解冻后**：回灌 §A 末尾「仍挂账」的 §10.2 / §14.6 / §11 三点。

### 备注
- `ssa_platform_prompt` 表已建但**无任何读写路径**（后台管理各平台 prompt 的预留）——「有 schema 无功能」，记录备查。

---

> 维护约定：每跨越一个上表 gap，就把对应行标 ✅ 并把「已实现的现实」回灌到设计/集成文档；本台账只留「还没实现」的部分。主 P0 需求 spec 冻结期间不改，其回灌项挂 §A 末尾。
