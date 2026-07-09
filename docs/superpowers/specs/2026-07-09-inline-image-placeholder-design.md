# 设计：正文内联配图占位符 + 图片描述 + 出图 + 二次修稿

- 日期：2026-07-09
- 分支/worktree：`worktree-feat+text-image-placeholder`（基于 origin/main@44b0c52）
- 相关记忆：[[social-agent-backend]] [[social-agent-shared-checkout]] [[social-agent-i18n]]

## 1. 背景与目标

这是一个**帮用户产出自媒体作品**的项目。用户在创作帖子时选择「文本 + 图片」方式后，希望：

1. 文本模型先生成正文，并在正文**合适位置插入配图占位符** + 每张图的**详细描述**。
2. 用户在编辑窗对**占位符位置**和**图片描述**分别做自定义微调；右侧预览窗同步显示**占位组件**。
3. 用户确认后在预览窗点按钮，用这些描述**调用模型生成配图**。
4. 可提供微调信息对图片做**二次修稿**（Modify）。
5. 最终确认后**存档**，进入**第三阶段排期**（现有 calendar 流程）。

**核心产品判断**：自媒体成品讲究图文表达力与所见即所得，因此支持「一条正文内多个内联占位符 → 多张配图」（用户 2026-07-09 拍板），而非每帖单图。

### 目标（P0）
- 生成层能在文案里产出内联占位符 + 结构化图片描述槽。
- 编辑器可独立微调「占位符位置」与「图片描述」。
- 预览按占位符顺序渲染占位/真图组件。
- 逐槽/批量出图，支持带自然语言的二次修稿。
- 多图配图**随帖持久化**（修复现存"存库即丢"缺口）。

### 非目标（P0 明确不做，YAGNI）
- **跨平台共享配图**：各平台变体正文不同、占位符数量/位置天然不同，P0 **每个平台变体各自独立出图**（用户 2026-07-09 拍板）。日后如需省钱再加"复制某平台图到其他平台对应槽"。
- 视频文件生成（沿用现状：video 模式只做封面/caption）。
- 富文本 contenteditable 编辑器（正文保留 textarea，占位符当纯文本处理，最稳）。
- 真实发布到平台（沿用 `@social/publisher` 联调 seam，不在本需求内）。

## 2. 核心数据模型：位置与描述解耦

**第一性原理**：`[[img:N]]` 标记发布时要从正文剥掉——真正发出去的 caption 不含标记，图片作为附件/轮播呈现。描述又长又细，绝不能塞进正文。所以「正文挪标记」与「改描述」是两个独立编辑动作。

### 2.1 正文内的位置标记
- 语法：`[[img:1]]`、`[[img:2]]`……双方括号。
- 刻意避开现有单括号 grounding 占位符（`[product name]`，prompts.ts:58），正则可精确区分：`/\[\[img:(\d+)\]\]/g`。
- 用户在正文 textarea 里当普通文本挪动/删除/新增，即"占位符位置微调"。

### 2.2 图片槽（挂在 PostVariant 上）
```ts
// packages/shared/src/types.ts
export interface ImageSlot {
  ref: number            // 对应正文里的 [[img:N]]（同一变体内唯一、稳定）
  description: string    // 详细图片描述（可编辑）——出图 prompt 的主来源
  ratio?: string         // 比例，默认从平台 format 推（ratioFromFormat）
  status: "empty" | "generating" | "ready" | "failed"
  url?: string           // 出图后的可访问 URL（本地 /media 反代，将来 S3）
  mimeType?: string
  failureReason?: string // 出图失败原因（status=failed 时）
}

export interface PostVariant {
  // ...现有字段不变（hook/body/hashtags/...；mediaUrl 保留兼容单图旧数据）
  imageSlots?: ImageSlot[]
}
```

**ref 与 body token 的一致性约束**：
- body 中每个 `[[img:N]]` 应有一个 `imageSlots[ref=N]`；反之槽存在但 body 无对应 token = "游离槽"（允许，UI 提示可插入）。
- 用户删除 body 里的 token → 该槽变游离（不自动删，避免误删已出图）；用户删槽 → 一并移除 body 里对应 token。
- 渲染/发布时，body 里找不到对应槽的 token 按无图文本处理。

## 3. 契约变更（`packages/shared`）

### 3.1 变体生成
- `GenerateVariantsInput.modes` 已含 `"image"`，但**向导勾选后未传下去（现存 bug）**。修复：`genModes` → `generateVariants` 调用。
- `GenerateVariantsOutput.variants[].imageSlots` 随模型输出带回（modes 含 image 时）。

### 3.2 图片生成（`GenerateImageInput` 扩展）
```ts
export interface GenerateImageInput {
  platform: Platform
  format: string
  mediaAsset?: string
  hook: string
  body: string
  brand: BrandContext
  instruction?: string     // 二次修稿（Modify）；缺省 = 全新生成
  description?: string      // 【新增】图片槽描述：有值时作为 prompt 主来源（取代 hook+body 拼接）
}
```
`GenerateImageOutput` 不变（`assetUrl/mimeType/ratio`）。

## 4. 生成层变更（`packages/agent`）

### 4.1 Prompt（prompts.ts）
- `buildVariantPrompt` 的输出契约（prompts.ts:118）在 modes 含 image 时追加可选字段：
  ```
  "imageSlots": array of { "ref": <int>, "description": "<detailed image description>" }
  ```
  并指示：在 body 合适位置插入对应的 `[[img:<ref>]]` 标记；描述要具体到可直接出图（主体/构图/风格/色调），但**不得编造品牌未提供的事实**（复用 GROUNDING_RULES 精神，新增一条图片占位规则）。
- 不含 image 模式时不产 imageSlots，行为与现状一致。

### 4.2 适配器（adapters/llm.ts）
- `generateImage`（llm.ts:194）：`input.description` 有值时用它作为 prompt 主体（拼平台/比例/品牌视觉风格），否则回退现有 hook+body 逻辑。`instruction` 存在则前缀 "Modify the image: ..."。
- 图片模型：`GENERATION_IMAGE_MODEL` 默认 `gemini-3-pro-image-preview`（2026-07-09 实测网关 https://api.basi.monster 走 /chat/completions 出图 HTTP200、返回内联 data URI，794KB 高质量；`gemini-3.1-flash-image-preview` 更快 636KB 可选；`gemini-2.5-flash-image` 无渠道弃用）。走现有 /chat/completions + data URI 抽取路径，**无需引入 flux 或新适配器**。

### 4.3 桩（adapters/stub.ts）
- `generateVariants` 在 image 模式下产出 1~2 个占位槽 + body 插 `[[img:N]]`，供离线开发。
- `generateImage` 用 description 生成占位 SVG（含描述文字），返回 data URI。

### 4.4 服务层（service.ts）
- `runGenerateImage` 计费口径不变：`instruction` 有=Modify(20cr)，无=Regenerate(30cr)（service.ts:88）。逐槽出图各自计费。

## 5. 持久化（`packages/db`）

**现存缺口**：`variant.mediaUrl` 存库即丢（`post.repo` 的 `insertVariants`/`rowToVariant` 不处理 mediaUrl/mediaAssetId）。现在要存多图。

**方案 P1（采用）**：
- `ssa_post_variant` 新增列 `image_slots json`，作为可编辑槽列表的**真源**（含"有描述未出图"的空槽）。
- 每次成功出图**另写一行 `ssa_media_asset`**（现成字段 postId/variantId/prompt/url/mimeType/ratio/model）做血缘与计费审计。
- `post.repo`：`insertVariants` 写入 `image_slots`（JSON.stringify），`rowToVariant` 解析回 `imageSlots`；顺带修 mediaUrl 兼容。
- 迁移：drizzle 生成新迁移，`ALTER TABLE ssa_post_variant ADD COLUMN image_slots json`。灌库/验证注意 utf8mb4（[[social-agent-mysql-charset]]）。

**否决 P2**（只用 ssa_media_asset 行）：其 `url` 非空，装不下空槽，需改表更乱。

## 6. 后端路由（`apps/server`）

- `POST /generate/variants`：透传 `modes`；把模型返回的 imageSlots 归一化进 `variant.imageSlots`（校验 ref 与 body token 一致，缺失补 token 或标记游离）。
- `POST /generate/image`：入参加 `variantId` / `slotRef` / `description` / `instruction`。流程：调 `runGenerateImage(description...)` → data URI 落 `container.media.put` → 写 `ssa_media_asset`（带 postId/variantId/prompt=description/model）→ 更新目标变体 `image_slots[ref]` 的 `url/status=ready/mimeType`。返回更新后的槽。
  - 出图失败：`status=failed` + `failureReason`，退款（现有三段式），返回错误码经 `generationHttpStatus` 映射。
- `POST /posts` / `PATCH /posts/:id`：经 repo 持久化 `imageSlots`；`hasImage`/`assetType` 依据"是否存在 status=ready 的槽"派生（取代现在的 imageGenerated 单图口径）。

## 7. 前端（`apps/web/src/features/social`）

### 7.1 向导 Step2 编辑窗（create-content-wizard.tsx）
- 正文 `body` 保留 `TextArea`（占位符当纯文本，用户可挪/删/加），**不上 contenteditable**。
- 新增「配图槽」面板（在正文旁/下）：每槽卡片 = ref 徽标 + 描述 `TextArea` + 比例 + `生成配图`按钮 + 缩略图 + `修改配图`（弹窗输入 instruction 二次修稿）。
- `插入配图`按钮：在正文光标处插入 `[[img:N]]`（N 取当前最大 ref+1）+ 新增对应空槽卡。
- 删除槽：移除卡片 + 正文里对应 token。

### 7.2 预览（preview-card.tsx / platform-frames.tsx）
- 解析 body 的 `[[img:N]]`，按出现顺序把每个 token 替换为占位组件：`status=ready` 显真图，否则显"描述预览占位卡"（显示前若干字描述 + 生成按钮）。→ 满足"预览窗对应也有占位组件"「点预览窗按钮出图」。
- caption 文本渲染时剥掉 token（所见即发布效果）。

### 7.3 Store（store/index.tsx）
- 接通 `genModes` → `api.generateVariants({ modes })`。
- `generateImage` 改为按槽定位：入参 `{ variantId, slotRef, description, instruction }`；成功后更新 `studio.variants[].imageSlots[ref]`（内存 + 保存时落库）。
- `saveStudioToLibrary`：`assetType`/`hasImage` 依据 ready 槽派生。

### 7.4 i18n
- 新 UI 文案就地 `t("English","中文")`；无新增领域枚举，`labels.ts` 基本不动（[[social-agent-i18n]]）。

## 8. 计费
- 沿用 `CREDIT_COSTS`：Regenerate 30cr / Modify 20cr，**逐槽**计费；三段式 reserve→exec→settle/refund，出图失败退款，绝不假扣。

## 9. 边界与错误
- 模型未产 imageSlots 但选了 image 模式：正文照常，槽为空，UI 提示"可手动加配图槽"。
- ref 冲突/重复：归一化时重编号并同步 body token。
- 出图失败：槽 `failed` + 原因 + 退款，不阻塞其它槽。
- 未配 `GENERATION_IMAGE_MODEL`：`not_configured`，前端提示（不降级假图）。
- 旧数据（只有 mediaUrl 无 imageSlots）：读时兼容，视作单一 ready 槽或维持 mediaUrl 渲染。

## 10. 测试计划
- `@social/agent`（vitest）：
  - 变体生成 image 模式产出 imageSlots 且 body 含匹配 `[[img:N]]`；非 image 模式不产。
  - `generateImage` 优先用 description；instruction 走 Modify 前缀。
  - stub 离线路径产占位槽/占位图。
- `packages/db`：post.repo 往返（含 imageSlots）序列化/反序列化不丢。
- 端到端手测（pnpm dev，web:3001/server:8091）：选文本+图片→生成→改描述与位置→预览占位→出图→修稿→存档→排期。用 `verify` 技能驱动真实链路。

## 11. 落地与配置
- env：`GENERATION_MODE=llm`、`GENERATION_IMAGE_MODEL=gemini-3-pro-image-preview`、网关 baseUrl 带 `/v1`（[[social-agent-backend]]）。
- 迁移需在 3307 库执行（勿碰 3306 活库，[[social-agent-db-3306-trap]]）。
- 共享 checkout 提交纪律：本功能在隔离 worktree 做；若回主 checkout 只 `git add` 自己文件（[[social-agent-shared-checkout]]）。

## 12. 影响文件清单（预估）
- `packages/shared/src/types.ts`、`generation.ts`
- `packages/agent/src/prompts.ts`、`adapters/llm.ts`、`adapters/stub.ts`（+ tests）
- `packages/db/src/schema.ts`、`repositories/post.repo.ts`、新 drizzle 迁移
- `apps/server/src/routes/generate.ts`、`posts.ts`
- `apps/web/.../views/content-create/create-content-wizard.tsx`、`preview-card.tsx`、`platform-frames.tsx`、`store/index.tsx`、`data/api.ts`
