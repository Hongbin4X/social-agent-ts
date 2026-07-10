# P0 本地独立开发与验证边界分析

- 日期：2026-07-10
- 对应需求：[super-social-agent-requirement-spec-p0.zh.md](./super-social-agent-requirement-spec-p0.zh.md)
- 结论一句话：**P0 主线（内容生成 + 日历排期 + 发布任务编排 + 数据看板）能在本项目里完整、独立地开发到"能点、能跑、能自证"；真正卡在外部、只能验到"桩边界"的只有三处——真扣费、真投递、真拉数据。**

## 1. 目的

回答一个规划性问题：**除了 GLBGPT 登录/身份、GLBGPT 计费扣费、以及真实第三方平台接口，P0 其余功能是否都能在本仓独立实做并验证？**

答案：**基本成立，且比直觉更彻底**——因为本项目的架构是刻意为"外部系统未接通也能跑通全链路"设计的（ports/adapters + 本地账本 + dev 假用户 + 本地存储 + 已接通的模型网关）。但原始判断漏了一个真实的外部依赖（Operations Data 的真实指标数据来自平台 **analytics API**，独立于"发帖 API"）。

## 2. 为什么"外部未接通也能全链路验证"

每个外部系统都有一个**本地替身**，让业务逻辑与交互在本地就能自证，只有"真正打到外部那一下"是桩：

| 外部系统 | 本地替身（现状） | 独立可验证的部分 | 真验证的边界（桩） |
|---|---|---|---|
| GLBGPT 登录 / 身份 | dev 假用户：`x-user-id` header + `DEV_FAKE_USER_ID`（后端 authMiddleware） | workspace / project / brand 全链路 CRUD、`userId/workspaceId/projectId` 关联 | 真实 SSO、套餐权益、真实 user 身份 |
| GLBGPT 计费扣费 | 本地账本 `LocalCreditBilling`（`apps/server/src/container.ts`，落 `ssa_billing_usage_record`，reserve→settle→refund 三段式） | "展示预计 credits → 确认 → 预扣 → 回写 actual → 失败退款"这套**规则与 UX 全部可验** | 真实扣 GLBGPT 余额、真实套餐限额 |
| 第三方发帖 API / OAuth | `@social/publisher`（port + adapter，见 [[social-publishing-layer]]） | 发布**状态机、批量确认、manual fallback 路由、retry、日历回写**全部可验 | 帖子真正落到 X/IG/FB；OAuth 连号握手 |
| 第三方 **analytics / insights** API | 模拟 / 种子指标 | Operations Data 的**看板布局、筛选、图表、`Not available` 缺失态** | 真实 impressions/engagement/clicks/followers/video views |
| **模型网关** | **已真接通**（`@social/agent` → `https://api.basi.monster/v1`，text=`gpt-5.3-chat`，image=`gemini-3.1-flash-image-preview`） | —— 生成类需求拿到的是**真验证**，不是模拟（2026-07-09 e2e 真出图） | 无（已解决；桩 `StubContentGenerator` 仅作离线兜底） |
| 媒体 / Logo 存储 | `@social/storage` 本地 FS（`.media`，经 `/media` 反代） | 图片/Logo 落盘、访问、随帖持久化 | S3（留桩，切换只改 env） |

**关键洞察**：连"登录、扣费、发帖"这三个外部依赖，它们的**业务逻辑与交互也都能在本地验**——ports/adapters 把"真正打到外部那一下"隔离成唯一的桩点。这是架构刻意换来的，不是巧合。

## 3. 三个真实外部依赖边界（含一个易被漏掉的）

原始判断列了两个（登录/扣费、发帖）。**实际是三个**，第三个独立且同样真实：

1. **真扣费**（GLBGPT 计费系统）——规则/UX 本地可验；真实余额扣减需接入。
2. **真投递 + 连号**（各平台发帖 API + OAuth）——编排/状态/确认本地可验；真实投递与 OAuth 需接入。
3. **真拉数据**（各平台 analytics / insights API）——⚠️ **原判断漏项**。Operations Data 的真实指标数来自平台数据接口，**独立于发帖接口**。UI/流程/AI 推荐本地可验；真实数字需接入。且 spec §13 明确"不得伪装为已接入真实视频数据"——此处天然就是"UI 可验、真数据需接入"。

> 模型网关虽是外部系统，但**已接通**，故不构成阻塞——所有生成类需求（文案/图片/7天计划/URL 草稿/AI 推荐）拿到的是真验证。

## 4. 逐模块速查（对照 P0 spec）

| Spec 模块 | 独立开发 | 验证程度 | 备注 |
|---|---|---|---|
| §5 导航 / §6 Onboarding & Workspace | ✅ | 真验证 | 纯本地 DB |
| §7 Home 看板（switcher / 状态卡 / 7 指标 / needs-attention / 列表 / quick actions） | ✅ | 真验证 | 仅 "Published / 真实发布结果" 计数依赖发帖桩 |
| §8 Brand Profile（含 URL 生成草稿，12cr） | ✅ | **真验证** | URL 抽取走模型，已接通 |
| §9 Account Hub（账号记录 / 状态 / 能力提示 / manual account） | ✅ | 真验证 | 仅 OAuth 的 Connect/Reconnect 那一下属发帖依赖 |
| §10 Content Create（Copy / Image / Copy+Image、7天计划、多平台变体、编辑、预览、Content Library、筛选/多选/归档） | ✅ | **真验证** | 生成走真模型；配图真出（含内联占位符功能） |
| §11 发布 / Batch Publish（确认弹窗、计费提示、状态机、保存/日历回写） | ✅ | 真验证到"调用平台 API"之前 | 真投递是桩 |
| §12 Calendar（周/月视图、drawer、reschedule / publish-now / to-manual / cancel / retry） | ✅ | 真验证到桩边界 | 状态流转全本地；真发是桩 |
| §13 Operations Data | ⚠️ 部分 | UI/流程/AI 推荐可真验；**真实指标需 analytics API** | metrics 缺失显 `Not available` |
| §16 计费规则（预扣/确认/回写/退款） | ✅ | 规则 + UX 真验 | 真实 GLBGPT 扣费是桩 |

## 5. "验证程度"的定义

- **真验证**：本地就能端到端跑到真实结果（如生成——真模型真出内容/图；DB——真落库真回读）。
- **验证到桩边界**：逻辑、状态机、交互、计费口径全可自证，只有"最后一跳打到外部真实系统"用桩/模拟代替。业务正确性可验，外部真实副作用不可验。

## 6. 下一步建议（按边界分档）

**A. 现在就能全量实做 + 真验证（优先推进）**
- §6 Onboarding/Workspace、§7 Home、§8 Brand Profile、§9 Account Hub（除 OAuth 连号）、§10 Content Create 全部、§16 计费 UX/规则。
- 这些不需要任何新的外部接入，评估集/测试案例（铁律11）可直接建。

**B. 做到桩边界即可交付（逻辑完整、真副作用留联调）**
- §11 发布编排、§12 Calendar 任务管理——把状态机、确认、fallback、retry 做扎实并验证；真投递用 `@social/publisher` 桩，联调时替换 adapter。
- 计费三段式用 `LocalCreditBilling` 验全，接 GLBGPT 时只换计费网关实现。

**C. 依赖外部接口，先做 UI/流程 + 模拟数据**
- §13 Operations Data：看板、筛选、图表、AI 推荐（真模型）先做实；真实 metrics 待接平台 analytics API。
- OAuth 连号（§9 的 Connect）：manual account 全流程先做实；真实授权握手待接平台 OAuth。

## 7. 相关代码锚点

- 假用户：`apps/web/src/features/social/data/api.ts`（`DEV_USER_ID` / `x-user-id`）、后端 `authMiddleware`。
- 本地计费：`apps/server/src/container.ts` 的 `LocalCreditBilling`。
- 生成层：`packages/agent`（`createGeneratorFromEnv`、`LlmContentGenerator`）；env 见根 `.env`（`GENERATION_MODE=llm` 等）。
- 发布层：`packages/publisher`（port + adapter）。
- 存储层：`packages/storage`（本地 FS / S3 桩）。
- DB：`packages/db`（MySQL 3307，Drizzle，`ssa_` 前缀）。
