# 社交平台发布集成 —— 成本、架构与联调指南

> 面向问题：**"后期接入各社交平台 API 真实发帖，会收费吗？怎么集成？"**
> 状态：发布层脚手架已落地（`@social/publisher` + `apps/server` 路由），真实凭证/OAuth/计费待联调。
> 成本数据核实日期：**2026-07**（易变，联调前请按文末来源复核）。

---

## 1. 一句话结论

- **API 本身大多免费，唯独 X（Twitter）真金白银按次收费**——2026-02-06 起对新开发者默认"按次付费"：**$0.015/条，帖子带链接则 $0.20/条**。社媒运营的帖子基本都带 CTA 链接，所以按 **≈$0.20/条** 估最贴近真相。
- **Meta（Instagram / Facebook）Graph API 调用 $0**，成本在"审核 + 账号门槛 + 维护人力"，不按帖收费。
- **TikTok / YouTube / Reddit** 在 P0 走**手动兜底**，不自动发布，不产生自动发布成本（spec §3）。
- 这些"每次自动发布的第三方成本"正对应 spec §11/§16 的 **"provider cost applies per auto publish"**——由后端在发布时向 GLBGPT 计费系统预扣、按实结算。

---

## 2. 逐平台成本（2026-07 核实）

| 平台 | P0 发布方式 | API 调用是否收费 | 关键成本 / 门槛 |
|---|---|---|---|
| **X (Twitter)** | 自动 | **收费**：$0.015/条；**带链接 $0.20/条**；读取 $0.005/条 | 2026-02-06 起新开发者默认按次付费，无免费档；老用户遗留档 Basic $200/mo、Pro $5,000/mo；企业档 ~$42,000/mo |
| **Instagram** | 自动 | 免费（$0/调用） | 须 Business/Creator 账号 + 绑定 FB Page；需 Meta App Review（每次提审约 2–4 周）；发图必须公网图片 URL |
| **Facebook** | 自动 | 免费（$0/调用） | 须 Page + `pages_manage_posts` 权限；需 Meta App Review；限流按 Business Use Case 公式 |
| **TikTok** | 手动兜底 | —（P0 不自动发） | Content Posting API 免费但审核严；P0 仅生成封面/caption 导出 |
| **YouTube** | 手动兜底 | —（P0 不自动发） | Data API 免费但有配额（默认 10,000 单位/天，上传一条 ~1,600 单位）；P0 不上传视频 |
| **Reddit** | 手动兜底 | —（P0 不自动发） | API 免费档 + 高频付费；P0 仅导出标题/正文 |

> 换算口径：本项目 `@social/publisher` 的 `estimateProviderCostUsdCents()` 只输出**美分**，credits 换算率是 GLBGPT 侧的事，交给 `BillingGateway` 换算回写——不在代码里臆造汇率。

---

## 3. 两条集成路线：直连 vs 聚合服务

真实发帖有两种做法，本项目把它们藏在**同一个 `SocialPublisher` 接口**背后，可随时切换而不动上层：

| 维度 | 直连各平台 API（`mode: "direct"`） | 走聚合服务（`mode: "aggregator"`） |
|---|---|---|
| 工程量 | 大：每个平台各做 OAuth + 审核 + token 刷新 + 媒体上传 + 限流 | 小：一次接入覆盖 X/IG/FB，代管授权与审核 |
| 直接成本 | 仅 X 按次付费；Meta 免费 | 月订阅：如 Ayrshare Premium **$149/mo**（单 profile）、Business **$599/mo**（30 profile，+$8.99/额外 profile）；另有更便宜替代（Zernio 前 2 账号免费等） |
| 数据/合规 | 数据不过第三方，掌控力强 | 内容与 token 过第三方 |
| 维护 | 平台改 API 要自己跟（Meta 每季度有变更） | 服务商吸收变更 |
| 适合 | 长期、规模化、要掌控数据 | 快速上线、平台多、团队小 |

**本项目默认 `direct`**，但因为抽象了 port，"到底走哪条"不是一次性押注——切换只改 `@social/publisher` 的 adapter 装配（`createPublisherRegistry`），编排层 / 后端路由 / 前端零改动。

> 注意：不论哪种 mode，**TikTok/YouTube/Reddit 恒为手动兜底**（spec §3 是产品决策，与技术能力无关）。聚合服务技术上能发 TikTok，但 P0 不启用。

---

## 4. 本项目怎么落地（代码地图）

```
packages/shared/src/publishing.ts     发布层数据契约（前后端 + publisher 共用的唯一真源）
                                        · PLATFORM_CAPABILITIES 平台能力矩阵（autoPublish 从 AUTO_PLATFORMS 派生）
                                        · PublishRequest / PublishResult（published|scheduled|manual_fallback|failed 可辨识联合）

packages/publisher/                    发布 / 分发层（@social/agent「生成」的姊妹包「分发」）
  src/ports.ts                         SocialPublisher 端口 + 注入端口 TokenStore / BillingGateway / MediaResolver
  src/adapters/x.ts                    X 直连（POST /2/tweets）
  src/adapters/meta.ts                 Instagram（两步）/ Facebook（/feed）直连
  src/adapters/manual-fallback.ts      TikTok/YouTube/Reddit → manual_fallback
  src/adapters/aggregator.ts           聚合服务实现（同一 port 的另一种后端）
  src/service.ts                       PublishingService 编排：路由 → 连接 → 预扣 → 发布 → 结算/退款
  src/config.ts                        createPublisherRegistry(config) 装配（direct / aggregator 切换）
  src/pricing.ts                       provider cost 估算（美分）
  tests/publishing.test.ts             路由/计费/未配置/成本的确定性测试（10 例全绿）

apps/server/src/
  services/publishing.ts               装配 PublishingService（现注入"联调桩"，如实暴露未接通）
  routes/publish.ts                    POST /api/publish（批量发布）+ GET /api/publish/capabilities
  routes/connections.ts                GET /api/connections/requirements + :platform/authorize-url（OAuth 脚手架）
```

### 发布一条内容的流水线（`PublishingService.publishOne`）

1. 找不到 adapter → `failed(unsupported_platform)`
2. 平台天然手动（TikTok/YT/Reddit）→ `manual_fallback`（**不碰 token / 计费**）
3. 账号是 manual 类型 → `manual_fallback(manual_account)`
4. 解析 OAuth 连接：无连接 → `failed(not_connected)`；已过期 → `manual_fallback(token_expired)`
5. provider cost 预扣（仅 X 这类有第三方成本的平台）
6. 调 adapter 真实发布：成功 → 结算 + 回写 `providerCostCredits`；失败/手动 → 退款 + 落 `failed`（**绝不掩盖**）

### 端到端实测（脚手架阶段，联调桩下）

```
POST /api/publish  [TikTok, X, Facebook]
→ TikTok    : manual_fallback / platform_manual_only     （产品要求的一等结果）
→ X         : failed / not_connected                     （诚实：账号还没连 OAuth）
→ Facebook  : failed / not_connected
totalProviderCostCredits: 0
```
即：**手动平台已经真跑通，自动平台如实报"未接通"而不是假成功**——这就是给联调留的、可信的接缝。

---

## 5. 计费如何接 GLBGPT（spec §16）

- 每次自动发布的 provider cost 走 `BillingGateway`：**预扣（reserve）→ 执行 → 按实结算（settle）/ 失败退款（refund）**。
- 发布动作本身的 12 credits（spec §16）在前端"确认发布"时先向计费系统预扣，凭证 `billingReservationId` 透传到 `POST /api/publish`。
- 现在 `apps/server/src/services/publishing.ts` 里的 `BillingGateway` 是**桩，一旦被调用即报错**，杜绝静默假扣；接 GLBGPT 计费系统后替换为真实现即可（其余代码不动）。

---

## 6. 联调 Checklist（每个自动发布平台要办的事）

**X**
- [ ] 建 X Developer App，拿 OAuth2（PKCE）client_id / secret，配 redirect_uri
- [ ] 申请 scopes：`tweet.read` `tweet.write` `users.read` `offline.access`
- [ ] 开通付费（按次付费或遗留档），确认预算（带链接 $0.20/条）
- [ ] 实现 `TokenStore`：连接时存 access/refresh token，发布时读取并按需刷新
- [ ] 媒体上传（v1.1 `media/upload`）——若要发图

**Instagram / Facebook**
- [ ] 建 Meta App，走 Facebook Login，配 redirect_uri
- [ ] scopes：IG `instagram_basic` `instagram_content_publish` `pages_show_list`；FB `pages_show_list` `pages_manage_posts` `pages_read_engagement`
- [ ] 提交 **Meta App Review**（录屏 + 用例说明，约 2–4 周/轮）
- [ ] IG：账号转 Business/Creator 并绑定 FB Page；实现 `MediaResolver` 把素材转公网图片 URL
- [ ] 实现 `TokenStore`：存 Page token / IG business account id（对应 `PlatformConnection.externalAccountId`）

**通用**
- [ ] 决定 `SOCIAL_PUBLISH_MODE`：`direct` 还是 `aggregator`
- [ ] 实现 `BillingGateway` 对接 GLBGPT 计费（预扣/结算/退款 + 美分→credits 换算）
- [ ] `references/yanfa-chatpal-api` 对齐扣费相关表结构后，再落 DB（见项目记忆约束）

---

## 7. 数据来源（2026-07 核实）

- X (Twitter) API 定价 2026：<https://postproxy.dev/blog/x-api-pricing-2026/> · <https://www.blotato.com/blog/twitter-api-pricing> · <https://api.sorsa.io/blog/twitter-api-pricing-2026>
- Instagram / Facebook Graph API 定价与门槛 2026：<https://www.blotato.com/blog/instagram-api-pricing> · <https://www.getphyllo.com/post/instagram-api-pricing-explained-iv> · <https://www.blotato.com/blog/facebook-api-pricing>
- 聚合服务（Ayrshare）定价 2026：<https://www.ayrshare.com/pricing/> · <https://zernio.com/alternatives/ayrshare>

> 这些价格会变（X 一年内已多次调整定价模型）。联调前务必按上述来源或平台官方文档复核，并更新 `packages/publisher/src/pricing.ts` 的注释与数值。
