# Super Social Agent P0 需求 Spec

版本：2026-07-02  
来源：`/Users/alonlin/Downloads/super-social-agent.zip`  
代码快照：`110d83368f9eac2c7fd2538e9cef5b313b097cce`

## 0. 产品定位

Super Social Agent 是 GLBGPT 内的独立社媒 Agent 工具，面向海外社媒运营、创业者、自媒体创作者和轻量营销团队，帮助用户完成从品牌上下文录入、内容计划、文案/图片素材生成、多平台适配、排期发布到运营数据复盘的闭环。

P0 不做趋势搜索、竞品监控、评论互动、私信获客、广告投放、音频生成或真实视频生成。P0 聚焦「内容生成 + 日历排期 + 发布任务 + 数据复盘」。

## 1. 产品铁律

- 必须复用 GLBGPT 的登录注册、用户身份、套餐权益、GLBGPT 计费系统、模型 API Key 接入和模型调用链路。
- 所有付费动作执行前必须展示预计 GLBGPT 计费系统消耗，并由用户确认。
- 所有自动发布、定时发布、批量发布、重试、转手动发布都必须由用户显式确认。
- 不得保存用户社媒账号密码；账号连接只能通过 OAuth、平台授权或手动账号记录完成。
- P0 不承诺所有平台自动发布。系统必须明确区分 Auto publishing 和 Manual fallback。
- 视频相关入口只用于生成封面、缩略图、caption、description 或手动发布提示；P0 不生成视频文件、不上传视频。

## 2. P0 范围

### 2.1 P0 做

- GLBGPT 侧边栏独立入口：`Super Social Agent`。
- GLBGPT 首页快捷入口：`Plan social posts`。
- Social Workspace 首次创建、进入和工作台展示。
- Workspace 内 Project / Brand 切换和新建。
- Brand Profile 二级页。
- Third-party Connections / Account Hub 二级页。
- Home dashboard。
- Content Create 工作台。
- 7-day content plan 生成。
- 社媒内容生成：Copy、Image、Copy + Image。
- 视频平台轻量适配：Video mode 可作为 UI 意图入口，但仅生成封面、缩略图、caption、description，并进入手动发布或 manual fallback。
- 多平台内容变体生成、编辑和预览。
- Content Library。
- 批量发布确认。
- Calendar 周视图、月视图、发布任务抽屉、重新排期、立即发布、转手动、取消、重试。
- Operations Data 数据看板和 AI recommendations。
- 发布状态、失败状态和手动发布状态回写。

### 2.2 P0 不做

- 一键查找海外社媒趋势。
- 指定关键词搜索社媒数据库。
- 竞品账号监控。
- 评论、点赞、关注、私信、社群互动。
- 自动规避平台风控。
- 视频文件生成、音频生成、真实视频上传。
- 广告投放和自动投放优化。
- 复杂 BI 分析。
- 多人协作权限。

## 3. 支持平台

P0 支持的平台枚举：

- TikTok
- Instagram
- YouTube
- X
- Reddit
- Facebook

自动发布能力：

- Auto publishing：X、Instagram、Facebook。
- Manual fallback：TikTok、YouTube、Reddit。

规则：

- TikTok、YouTube、Reddit 在 P0 中必须展示为手动发布或导出型工作流。
- Instagram Reels cover、TikTok video、YouTube video / Shorts 均不支持 P0 自动视频发布。
- 当账号为 manual account、授权过期、权限缺失或平台不支持自动发布时，发布任务必须进入 ManualFallback 或 UnsupportedPublishing。

## 4. GLBGPT 集成

Super Social Agent 不是独立产品，必须接入 GLBGPT 主产品。

要求：

- 未登录用户不可创建 workspace。
- 登录态、user id、套餐权益、GLBGPT 计费系统余额复用 GLBGPT。
- 模型能力复用 GLBGPT 现有模型 API Key 接入层。
- 文案、图片、推荐分析、URL 提取、发布服务成本均记录到 GLBGPT 计费系统。
- 所有系统任务必须关联 `userId`、`workspaceId`、`projectId`、`billingUsageRecordId`。
- GLBGPT 侧边栏保留既有 Home、Models & Tools、Multimodal、My Tools 结构，并增加 Super Social Agent 入口。

## 5. 信息架构

### 5.1 外层 Shell

外层由 GLBGPT 壳承载：

- Sidebar：GlobalGPT logo、Home、Models & Tools、Multimodal、Super Social Agent、My Tools。
- Topbar：Projects、Chat History、My Creations、Upgrade Plan、用户头像。
- 首页快捷入口：`Plan social posts`，点击进入 Super Social Agent。

### 5.2 Super Social Agent 一级导航

进入 Agent 后，顶部一级 tab 固定为：

- Home
- Content Create
- Calendar
- Operations Data

不得新增一级 tab：

- Brand Profile
- Connections
- Content Plan
- Content Studio
- Composer
- Content Library
- Account Hub

这些模块必须合并或下沉到 Home / Content Create 内。

## 6. 首次进入和 Workspace

当用户第一次进入 Super Social Agent 且没有 workspace 时，展示 Onboarding。

创建 Workspace 表单字段：

- Workspace name，必填。
- Brand / project name。
- Product or brand description。
- Target market：US、Europe、Global English Market、Custom。
- Primary content goal：Grow awareness、Get followers、Generate leads、Drive trial、Drive purchase、Launch campaign。
- Target platforms，多选六个平台。
- Website URL，选填。
- Brand tone，选填。

创建后：

- 创建 workspace。
- 自动创建第一个 project。
- 将 project 信息写入 active profile。
- 进入 Agent Home。
- 展示 `Workspace created` toast。

## 7. Home

### 7.1 定位

Home 是当前 workspace / project 的运营总览页，负责：

- 当前项目上下文。
- 品牌档案完成度。
- 社媒账号连接状态。
- 内容和发布状态概览。
- 需要关注事项。
- 最近草稿、即将发布、最近发布结果。
- 常用快捷操作。

### 7.2 Workspace / Project 区域

Home 顶部展示 workspace overview：

- Project / brand switcher。
- 当前 active brand 名称。
- Primary content goal badge。
- New project 按钮。
- Target market。
- Workspace timezone。
- Target platforms badges。
- Create content 主按钮。

Project / brand switcher 要求：

- 展示当前 workspace 下的 projects / brands。
- 支持切换 active project。
- 支持新建 project。
- 切换 project 后，Brand Profile、目标市场、平台、内容目标和后续生成上下文必须切换到该 project。

New project 表单字段：

- Brand / project name，必填。
- Target market。
- Product or brand description。
- Primary content goal。
- Website URL，选填。
- Target platforms。
- Brand tone，选填。

### 7.3 Brand Profile / Connections 状态卡

Brand Profile 和 Connections 不作为一级 tab，也不作为工作台顶部 pill。它们必须作为 Home overview 下方的两张状态卡：

- `Brand profile xx%`
  - 展示完成度百分比。
  - 按钮为 `Complete` 或 `Open`。
  - 点击进入 Brand Profile 二级页。
- `Connections x/6`
  - 展示已连接账号数 / 账号总数。
  - 存在过期、权限缺失等问题时显示红点。
  - 按钮为 `Manage`。
  - 点击进入 Account Hub 二级页。

二级页必须提供 Back 返回 Home。

### 7.4 指标概览

Home 展示 7 个指标：

- Drafts
- Planned
- Scheduled
- Published
- Manual fallback
- Failed
- Est. credits

### 7.5 Needs Attention

Home 必须展示最多 5 条需要关注事项。

触发项：

- failed publish job。
- manual fallback awaiting action。
- token expired。
- permission missing。
- Brand profile 未完成。

动作路由：

- Failed publish：跳 Calendar。
- Manual fallback：跳 Calendar。
- Token expired / permission missing：跳 Connections 二级页。
- Brand profile incomplete：跳 Brand Profile 二级页。

### 7.6 Home 列表

Home 展示：

- Recent drafts：Draft、Ready 内容，点击进入 Content Create。
- Upcoming posts：Planned、Scheduled 日历任务，点击进入 Calendar。
- Recent publish results：Published、ManuallyPublished、Failed、ManualFallback。

### 7.7 Quick Actions

Home Quick actions 包含：

- Create 7-day plan。
- Create social content。
- View calendar。
- Operations data。
- Complete brand profile。
- Connect account。

底部说明：

- `Credits are metered per generation. Estimated credits are shown before every paid action.`

## 8. Brand Profile 二级页

Brand Profile 是二级页，不是一级 tab。它用于生成计划、文案、图片和 CTA 上下文。

字段：

- Brand / project name。
- Website URL。
- Product URL。
- Target market。
- Product or brand description。
- Weekly posting frequency。
- Target audience。
- Content goals，多选。
- Target platforms，多选。
- Brand tone。
- Default CTA。
- Brand hashtags。
- Forbidden topics。
- Logo upload。
- Brand colors。
- Visual style。

能力：

- 展示完成度百分比和 missing fields。
- 支持 Collapse / Expand。
- 支持 Save profile。
- 如果有 Website URL，展示 `Generate profile draft from URL`。
- URL 生成草稿前必须弹确认框，展示 Source URL 和预计 credits：12。
- 生成草稿必须只补全缺失字段，不覆盖用户已填写字段。

验收：

- 用户能编辑并保存字段。
- URL 草稿生成必须走 GLBGPT 计费系统。
- 草稿生成后展示成功 toast。

## 9. Connections / Account Hub 二级页

Account Hub 是 Connections 的二级页，不是一级 tab。它管理社媒账号连接和手动账号记录。

页面内容：

- 标题：Account Hub。
- 说明：Connect platforms for auto publishing, or add manual accounts for export-only workflows.
- 支持 Add manual account。
- 展示平台能力提示：X、Instagram、Facebook 支持自动发布；TikTok、YouTube、Reddit 为 manual-only。

账号状态：

- NotConnected。
- Connected。
- Expired。
- PermissionMissing。
- UnsupportedPublishing。
- Error。

账号字段：

- Platform。
- Account name / handle。
- Profile URL。
- Account type：connected / manual。
- Status。
- Expires at。
- Capabilities。
- Notes。

账号行操作：

- Connected：Refresh、Disconnect。
- Expired / PermissionMissing：Reconnect。
- NotConnected 且平台支持 auto：Connect。
- Manual / UnsupportedPublishing：Export ready。

Add manual account 表单：

- Platform。
- Account name / handle，必填。
- Profile URL，选填。

规则：

- Manual account 永远是 export-only。
- 不展示或保存社媒账号密码。
- 授权失败、授权过期、权限缺失必须阻止自动发布。

## 10. Content Create

### 10.1 页面定位

Content Create 是 P0 核心生产工作台，合并：

- Content Plan。
- Social Content Studio。
- Multi-Platform Composer。
- Content Library。

页面顶部包含两个大 CTA：

- Create content：进入内容创作向导。
- Create 7-day plan：进入 7 天计划生成向导。

下方展示 Content Library。

### 10.2 Create Content Wizard

Wizard 步骤固定为：

1. Draft。
2. Customize per network。
3. Schedule。

#### Step 1: Draft

字段：

- Creation method：
  - Agent-assisted，默认选中。
  - Write manually。
- Generation mode，多选：
  - Copy。
  - Image。
  - Video。
- Topic。
- Platforms，多选六个平台。

规则：

- Agent-assisted 默认可输入 Topic。
- Write manually 被选中时，Topic 禁用并灰化，placeholder 提示下一步手写。
- Write manually 时 Generation mode 禁用。
- Write manually 下一步进入编辑器后，平台 copy 输入框必须自动聚焦。
- Video mode 在 P0 只代表短视频平台素材意图，不生成视频文件。系统只能生成/编辑封面、缩略图、caption、description，并在校验中提示对应视频能力不支持。

点击 `Generate & customize`：

- 如果还没有 variants，弹 `Generate platform variants?` 确认框。
- 确认框展示平台数量、平台 badges、预计 credits：16。
- 用户确认后生成每个平台的内容变体，并进入 Step 2。

#### Step 2: Customize per network

左侧编辑区：

- 平台切换按钮，展示每个平台状态点。
- Variant state：Valid、Needs edits、Manual fallback、Unsupported publishing。
- Account 下拉，包含 connected account 和 manual paste account。
- Format preset。
- Hook / title。
- 平台 copy 字段：
  - X post。
  - Instagram caption / Instagram Reels caption。
  - TikTok caption。
  - YouTube title + description / YouTube Shorts caption。
  - Reddit title + body。
  - Facebook post。
- Hashtags。
- CTA label。
- CTA destination URL。
- Media asset。
- Publish time。

平台格式：

- TikTok：Cover 9:16。
- Instagram：Feed 1:1、Portrait 4:5、Reels cover 9:16。
- YouTube：Thumbnail 16:9、Shorts cover 9:16。
- X：Landscape 16:9、Square 1:1。
- Reddit：Text post - No media、Link image 16:9。
- Facebook：Landscape 1.91:1、Square 1:1。

媒体选项：

- TikTok：Cover image、No media。
- Instagram：Generated image、Uploaded image、No media。
- YouTube：Thumbnail、No media。
- X：Generated image、Uploaded image、No media。
- Reddit：No media、Link image。
- Facebook：Generated image、Uploaded image、No media。

右侧 Preview：

- 展示账号、平台、格式、auto/manual 状态。
- 展示 hook、body、media preview、hashtags、CTA。
- CTA 按钮点击后只弹 destination preview，不进行真实跳转。
- Media preview 右下角提供：
  - Regenerate。
  - Modify。

Image 操作：

- Regenerate image 弹付费确认，预计 credits：30。
- Modify image 弹自然语言输入框，用户描述修改要求。
- Modify image 展示预计 credits：20。
- 所有图片操作必须经过用户确认。

Pre-publish checks：

- Copy length OK / Copy needs content before publishing。
- Media ratio。
- Manual account automatic publishing unavailable。
- YouTube video upload out of P0 scope。
- TikTok video generation not supported in P0。
- Reels video generation not supported in P0。
- Reddit subreddit rules apply。

#### Step 3: Schedule

字段：

- When：
  - Publish now。
  - Schedule for later。

Publish now：

- 自动发布平台立即发布。
- 手动平台进入 Manual fallback。
- 点击 Publish now 前弹 `Confirm publishing` 批量发布确认框。

Schedule for later：

- 用户选择 Day 和 Time。
- 点击 Add to calendar 后创建 Planned calendar item。

底部动作：

- Save as draft。
- Add to calendar。
- Publish now。

### 10.3 7-Day Plan Wizard

入口：

- Content Create 顶部 `Create 7-day plan`。
- Workbench top bar `Create 7-day plan`。
- Home quick action `Create 7-day plan`。

生成前字段：

- Plan name。
- Primary goal。
- Topic / theme。
- 预计生成：7 topics across selected platforms。
- 预计 credits：24。

确认后：

- 调用生成计划。
- 展示结果页。
- 结果页每条 plan item 展示：
  - Date。
  - Time。
  - Pillar。
  - Topic。
  - Goal。
  - Asset type。
  - Platforms。

每条 plan item 操作：

- Open in composer：带 topic 和 platforms 进入 Create Content Wizard。
- Calendar：加入 Calendar。
- Regenerate topic：P0 可展示 toast 或轻量占位，后续再做真实局部重生成。

结果页底部：

- Regenerate。
- Done。

### 10.4 Content Library

Content Library 位于 Content Create 内，不是一级 tab。

能力：

- 展示所有未归档内容。
- 支持状态筛选：
  - All。
  - Ready。
  - Scheduled。
  - Manual fallback。
  - Failed。
  - Published。
- 支持多选内容。
- 支持 Batch publish。
- 支持单条 Schedule。
- 支持 Failed 内容 Retry。
- 支持 ManualFallback / Scheduled 且含手动平台的 Mark published。
- 支持 Archive。

每条内容展示：

- Select checkbox。
- Title。
- Status。
- Platform badges。
- Asset type。
- Updated at。
- Failure reason。
- Manual fallback 说明。

## 11. Publishing / Batch Publish

发布确认弹窗标题：`Confirm publishing`。

弹窗必须展示：

- Topic 或 selected posts 数量。
- 平台数量。
- 每个平台：
  - Platform。
  - Account。
  - Suggested time。
  - Format。
  - Hook 摘要。
  - Auto publishing available / Manual fallback required。
- 预计 credits：12。
- Provider cost applies per auto publish。
- Manual fallback 提示。

确认后：

- 自动平台进入 Scheduled 或 Published。
- 手动平台进入 ManualFallback。
- 保存到 Content Library。
- 创建或更新 Calendar item。

## 12. Calendar

Calendar 是发布计划和发布任务管理页。

页面能力：

- Week / Month 切换。
- Previous / Next 时间段按钮。
- Needs attention strip：Failed 或 ManualFallback。
- 周视图按日展示任务。
- 月视图按日期展示任务。
- 点击任务打开 Job detail drawer。

Job drawer 展示：

- Date。
- Time。
- Topic。
- Overall status。
- Per-platform jobs。
- Platform。
- Account。
- Variant status。
- Fires at。
- Auto publish / Manual fallback。
- Reason。

Job drawer 操作：

- Retry failed auto jobs。
- Reschedule。
- Publish now。
- To manual。
- Cancel job。
- Open in Content Create to export manual copy。

Reschedule：

- 弹确认 modal。
- 可选 Day 和 Time。
- 确认后更新主任务和各平台任务时间。

状态规则：

- Published / Cancelled 任务不可再次 Reschedule、Publish now、To manual、Cancel。
- 没有 auto 平台的任务不可 Publish now。
- To manual 会把所有平台任务转为 ManualFallback。

## 13. Operations Data

Operations Data 是已发布内容的数据回收和优化建议页。

页面能力：

- 时间范围筛选：
  - Last 7 days。
  - Last 30 days。
- 平台筛选：
  - All platforms。
  - X。
  - Instagram。
  - Facebook。
  - Reddit。
  - TikTok。
  - YouTube。
- Metrics cards。
- Impressions & posts published 图表。
- AI Recommendations。
- Platform performance table。
- Top performing posts。

Metrics：

- Posts published。
- Impressions。
- Engagement rate。
- Link clicks。
- Net new followers。
- Failed jobs。
- Manual fallbacks。
- Video views。

缺失数据：

- TikTok、YouTube 或 video metrics 在 P0 中可展示 `Not available`。
- 不得伪装为已接入真实视频数据。

AI Recommendations：

- 默认未生成。
- 点击 `Generate recommendations` 后弹确认 modal。
- 预计 credits：18。
- 用户确认后生成推荐。
- 推荐展示 title、detail、impact：High、Medium、Low。
- 推荐只给建议，不自动修改内容、不自动排期、不自动发布。

## 14. 数据对象

### 14.1 SocialWorkspace

- id。
- name。
- userId。
- timezone。
- activeProjectId。
- createdAt。
- updatedAt。

### 14.2 Project

- id。
- workspaceId。
- brandName。
- description。
- targetMarket。
- platforms。
- primaryGoal。
- websiteUrl。
- tone。

### 14.3 BrandProfile

- id。
- workspaceId。
- projectId。
- brandName。
- websiteUrl。
- productUrl。
- description。
- targetMarket。
- targetAudience。
- contentGoals。
- platforms。
- weeklyFrequency。
- tone。
- defaultCta。
- hashtags。
- forbiddenTopics。
- logoAssetId。
- brandColors。
- visualStyle。
- completionPct。

### 14.4 SocialAccount

- id。
- workspaceId。
- platform。
- type：manual / connected。
- name。
- url。
- status。
- expiresAt。
- capabilities。
- notes。

### 14.5 ContentPlan / PlanItem

- id。
- workspaceId。
- projectId。
- planName。
- primaryGoal。
- topicTheme。
- item.date。
- item.time。
- item.topic。
- item.pillar。
- item.goal。
- item.platforms。
- item.assetType。
- item.cta。
- item.status：Planned / In studio / Scheduled。

### 14.6 SocialPost / PostVariant

SocialPost：

- id。
- workspaceId。
- projectId。
- title。
- platforms。
- assetType。
- status。
- tags。
- updatedAt。
- owner。
- hasImage。
- failureReason。

PostVariant：

- platform。
- account。
- accountType。
- hook。
- body。
- hashtags。
- cta。
- ctaUrl。
- format。
- mediaAsset。
- publishMode：auto / manual。
- state：Valid / Needs edits / Manual fallback / Unsupported。
- suggestedTime。

### 14.7 CalendarItem

- id。
- workspaceId。
- projectId。
- postId。
- topic。
- date。
- time。
- status。
- variants。

Calendar variant：

- platform。
- account。
- time。
- publishMode。
- status。
- reason。

### 14.8 BillingUsageRecord

- id。
- userId。
- workspaceId。
- projectId。
- actionType。
- estimatedCredits。
- actualCredits。
- providerCost。
- model。
- status。
- createdAt。

### 14.9 Operations Data

OpsMetric：

- key。
- label。
- value。
- delta。
- trend。
- available。

OpsPlatformRow：

- platform。
- posts。
- impressions。
- engagementRate。
- available。

Recommendation：

- id。
- workspaceId。
- projectId。
- title。
- detail。
- impact。
- createdAt。

## 15. 状态机

### 15.1 PostStatus

- Draft。
- Ready。
- Planned。
- Scheduled。
- Publishing。
- Published。
- Failed。
- Cancelled。
- ManualFallback。
- ManuallyPublished。
- Archived。

### 15.2 AccountStatus

- NotConnected。
- Connected。
- Expired。
- PermissionMissing。
- UnsupportedPublishing。
- Error。

### 15.3 VariantState

- Valid。
- Needs edits。
- Manual fallback。
- Unsupported。

### 15.4 PublishMode

- auto。
- manual。

## 16. 计费规则

所有付费动作必须：

- 展示预计 credits。
- 等待用户确认。
- 调用 GLBGPT 计费系统预扣或确认。
- 执行后回写 actual credits。
- 失败时按 GLBGPT 计费系统规则退款、撤销或标记失败。

P0 需要覆盖的计费动作：

- Generate profile draft from URL：预计 12 credits。
- Generate 7-day plan：预计 24 credits。
- Generate platform variants：预计 16 credits。
- Regenerate image：预计 30 credits。
- Modify image：预计 20 credits。
- Confirm publishing / Batch publish：预计 12 credits，另计 provider cost per auto publish。
- Generate recommendations：预计 18 credits。

## 17. 验收标准

### 17.1 导航

- 用户可从 GLBGPT 侧边栏进入 Super Social Agent。
- 用户可从 GLBGPT 首页 `Plan social posts` 进入 Agent。
- 未创建 workspace 时展示 onboarding。
- 创建 workspace 后进入 Home。
- Agent 一级 tab 只有 Home、Content Create、Calendar、Operations Data。

### 17.2 Home

- Home 有 project/brand switcher。
- Home 可新建 project。
- Brand Profile 和 Connections 以 Home overview 状态卡展示。
- Quick actions 包含 6 个入口。
- Needs Attention 的动作按问题类型路由到 Calendar、Connections 或 Brand Profile。

### 17.3 Content Create

- Create content 有三步向导。
- Agent-assisted 默认选中。
- Write manually 禁用 Topic，并在下一步聚焦文案输入。
- Generate platform variants 有确认和计费提示。
- 每个平台可编辑账号、格式、文案、CTA、媒体、发布时间。
- 图片支持 Regenerate 和 Modify。
- Publish now 必须弹发布确认。
- Schedule for later 可加入 Calendar。
- Content Library 可筛选、多选、批量发布、重试、归档、标记手动发布。

### 17.4 Calendar

- 支持 Week / Month。
- 点击任务打开 drawer。
- Drawer 支持 Reschedule、Publish now、To manual、Cancel、Retry。
- Manual fallback 任务可进入 Content Create 导出手动发布素材。

### 17.5 Operations Data

- 支持 7d / 30d。
- 支持按平台过滤。
- 展示 metrics、图表、平台表、Top posts。
- TikTok、YouTube、Video metrics 缺失时展示 Not available。
- AI recommendations 必须先确认计费。

### 17.6 合规

- 不保存社媒密码。
- 不自动发评论、私信、点赞、关注。
- 不自动规避风控。
- 不生成或上传视频文件。
- 不自动执行 AI recommendations。
