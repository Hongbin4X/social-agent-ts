# 正文内联配图占位符 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让「文本+图片」帖子生成时，正文内产出可编辑的内联配图占位符 `[[img:N]]` + 每张图的独立描述槽，用户可分别微调位置与描述、逐槽出图与二次修稿，并随帖持久化。

**Architecture:** 位置（正文 `[[img:N]]` token）与描述（`PostVariant.imageSlots[]` 结构化槽）解耦。生成层在 image 模式下让模型同时产出 body token 与 imageSlots；出图复用现有 `generateImage`（basi.monster gemini 图片模型），prompt 主来源改为槽描述；多图随 `ssa_post_variant.image_slots` JSON 列持久化。每平台变体各自独立配图（P0）。

**Tech Stack:** TypeScript monorepo（pnpm + turbo）；`@social/shared`（契约+纯工具）、`@social/agent`（生成层，vitest）、`@social/db`（Drizzle/MySQL）、`apps/server`（Hono）、`apps/web`（Next.js + React）。

## Global Constraints

- 用中文写注释与用户可见文案；注释写清决策原因（铁律8）。
- 遇问题直接报错，**绝不加降级/假图**（未配图片模型 → `not_configured`）。
- 生成层沙箱禁用 `Math.random`/`Date.now`：桩里唯一 id 用 `node:crypto` 的 `randomUUID()`，内容由输入派生。
- DB 迁移只在 3307 库执行，**严禁碰 3306 活库**；灌/验证用 utf8mb4。
- 计费三段式 reserve→exec→settle/refund，出图失败退款，绝不假扣；Regenerate 30cr / Modify 20cr（`instruction` 有值=Modify）。
- 占位符 token 语法固定 `[[img:N]]`（双方括号，避开单括号 grounding 占位符 `[product name]`）；正则 `/\[\[img:(\d+)\]\]/g`。
- 图片模型 env：`GENERATION_IMAGE_MODEL=gemini-3-pro-image-preview`（2026-07-09 实测 https://api.basi.monster 出图 HTTP200）。
- 前端 monorepo 无组件测试框架：前端任务的"验证"= `pnpm --filter web typecheck` + lint + 用 `verify`/`run` 技能驱动真实 App 跑通（非占位，是本项目现实）。
- 每个 Task 结束即 commit；提交只 `git add` 本 Task 明确列出的文件（共享 checkout 纪律，本功能在隔离 worktree 内亦保持）。

---

## 文件结构（改动地图）

- `packages/shared/src/types.ts` — 加 `ImageSlot` 接口 + `PostVariant.imageSlots?`。
- `packages/shared/src/image-slots.ts`（新）— 纯 token 工具：`parseImageRefs` / `stripImageTokens` / `nextImageRef` / `insertImageToken` / `splitBodyByImageTokens`。
- `packages/shared/src/generation.ts` — `GenerateImageInput.description?`。
- `packages/shared/src/index.ts` — 导出新文件。
- `packages/shared/package.json` + `packages/shared/tests/image-slots.test.ts`（新）— 给 shared 接 vitest 测纯工具。
- `packages/agent/src/prompts.ts` — image 模式下扩展输出契约 + 图片占位 grounding 规则。
- `packages/agent/src/adapters/llm.ts` — 解析模型 imageSlots；`generateImage` 用 description。
- `packages/agent/src/adapters/stub.ts` — image 模式产 slots+token；`generateImage` 用 description。
- `packages/agent/tests/generation.test.ts` — 新增用例。
- `packages/db/src/schema.ts` — `ssa_post_variant` 加 `image_slots` json 列。
- `packages/db/src/repositories/post.repo.ts` — 落库/回读 imageSlots。
- `packages/db/drizzle/` — 新迁移 SQL。
- `apps/server/src/routes/generate.ts` — `/generate/image` 收 description/instruction，媒体 prompt=描述。
- `apps/web/src/features/social/data/api.ts` — `generateImage` 传 description。
- `apps/web/src/features/social/store/index.tsx` — `genModes`→`generateVariants`；`generateImage` 按槽更新；save 依 slots 派生。
- `apps/web/src/features/social/views/content-create/image-slot-panel.tsx`（新）— 编辑区配图槽面板。
- `apps/web/src/features/social/views/content-create/create-content-wizard.tsx` — 接面板 + 透传 genModes + 按槽出图。
- `apps/web/src/features/social/views/content-create/preview-card.tsx` — 按 token 分段渲染占位/真图。

---

## Task 1: 共享契约 —— ImageSlot 类型 + 纯 token 工具

**Files:**
- Modify: `packages/shared/src/types.ts`（`PostVariant` 后追加字段，`ImageSlot` 新接口）
- Create: `packages/shared/src/image-slots.ts`
- Modify: `packages/shared/src/generation.ts:80-89`（`GenerateImageInput` 加 `description?`）
- Modify: `packages/shared/src/index.ts`（加 `export * from "./image-slots"`）
- Modify: `packages/shared/package.json`（加 `test` 脚本 + vitest devDep）
- Test: `packages/shared/tests/image-slots.test.ts`

**Interfaces:**
- Produces:
  ```ts
  interface ImageSlot {
    ref: number
    description: string
    ratio?: string
    status: "empty" | "generating" | "ready" | "failed"
    url?: string
    mimeType?: string
    failureReason?: string
  }
  interface PostVariant { /* 现有字段不变 */ imageSlots?: ImageSlot[] }
  interface GenerateImageInput { /* 现有 */ description?: string }
  function parseImageRefs(body: string): number[]
  function stripImageTokens(body: string): string
  function nextImageRef(slots: ImageSlot[]): number
  function insertImageToken(body: string, ref: number, at?: number): string
  type BodySegment = { type: "text"; text: string } | { type: "image"; ref: number }
  function splitBodyByImageTokens(body: string): BodySegment[]
  ```

- [ ] **Step 1: 给 shared 接 vitest（脚本 + 依赖）**

编辑 `packages/shared/package.json`，在 `scripts` 里加 `"test": "vitest run"`；在 `devDependencies` 里加 `"vitest": "^3.2.7"`（对齐 agent/publisher 版本）。然后在 worktree 根执行 `pnpm install` 让 vitest 就位。

Run: `pnpm install`
Expected: 安装完成，exit 0。

- [ ] **Step 2: 写失败测试**

Create `packages/shared/tests/image-slots.test.ts`:
```ts
import { describe, it, expect } from "vitest"
import {
  parseImageRefs,
  stripImageTokens,
  nextImageRef,
  insertImageToken,
  splitBodyByImageTokens,
  type ImageSlot,
} from "../src/image-slots"

const slot = (ref: number): ImageSlot => ({ ref, description: `d${ref}`, status: "empty" })

describe("image-slots 纯工具", () => {
  it("parseImageRefs 按出现顺序去重取 ref", () => {
    expect(parseImageRefs("a [[img:2]] b [[img:1]] c [[img:2]]")).toEqual([2, 1])
    expect(parseImageRefs("no token")).toEqual([])
  })

  it("stripImageTokens 去掉 token 并收敛多余空行", () => {
    expect(stripImageTokens("hi\n\n[[img:1]]\n\nbye")).toBe("hi\n\nbye")
    expect(stripImageTokens("[[img:1]]")).toBe("")
  })

  it("nextImageRef = 最大 ref + 1（空槽从 1 起）", () => {
    expect(nextImageRef([])).toBe(1)
    expect(nextImageRef([slot(1), slot(3)])).toBe(4)
  })

  it("insertImageToken 末尾插入独占一行", () => {
    expect(insertImageToken("body", 2)).toBe("body\n\n[[img:2]]\n")
  })

  it("insertImageToken 指定位置插入", () => {
    expect(insertImageToken("abcd", 1, 2)).toBe("ab\n[[img:1]]\ncd")
  })

  it("splitBodyByImageTokens 切成有序文本/图片段", () => {
    expect(splitBodyByImageTokens("x[[img:1]]y[[img:2]]")).toEqual([
      { type: "text", text: "x" },
      { type: "image", ref: 1 },
      { type: "text", text: "y" },
      { type: "image", ref: 2 },
    ])
  })
})
```

- [ ] **Step 3: 运行测试确认失败**

Run: `pnpm --filter @social/shared test`
Expected: FAIL —— 找不到模块 `../src/image-slots`。

- [ ] **Step 4: 实现 token 工具**

Create `packages/shared/src/image-slots.ts`:
```ts
// 正文内联配图的「位置」工具（纯函数，前后端 + 生成层共用）。
//
// 设计（铁律7 第一性原理）：图片的「位置」和「描述」是两件事——
//   位置 = 正文里的轻量标记 [[img:N]]（发布时剥掉，caption 不含标记）；
//   描述 = 独立的 ImageSlot（详细、可编辑、出图 prompt 主来源）。
//   本文件只管「位置」；描述结构见 types.ts 的 ImageSlot。
// 语法固定 [[img:N]]（双方括号），刻意避开单括号 grounding 占位符 [product name]，正则可精确区分。

import type { ImageSlot } from "./types"

const TOKEN_RE = /\[\[img:(\d+)\]\]/g

/** 返回 body 中出现的所有图片 token 的 ref（按出现顺序，去重）。 */
export function parseImageRefs(body: string): number[] {
  const refs: number[] = []
  for (const m of body.matchAll(TOKEN_RE)) {
    const n = Number(m[1])
    if (!refs.includes(n)) refs.push(n)
  }
  return refs
}

/** 去掉全部图片 token（发布/纯文本预览用），收敛多余空行。 */
export function stripImageTokens(body: string): string {
  return body.replace(TOKEN_RE, "").replace(/\n{3,}/g, "\n\n").trim()
}

/** 下一个可用 ref = 现有槽最大 ref + 1（空槽从 1 起）。 */
export function nextImageRef(slots: ImageSlot[]): number {
  return slots.reduce((max, s) => Math.max(max, s.ref), 0) + 1
}

/** 把 token 插入 body 指定字符位置（默认末尾），token 独占一行。 */
export function insertImageToken(body: string, ref: number, at?: number): string {
  const token = `[[img:${ref}]]`
  if (at == null || at < 0 || at > body.length) {
    return `${body.trimEnd()}\n\n${token}\n`
  }
  return `${body.slice(0, at)}\n${token}\n${body.slice(at)}`
}

/** 把 body 切成有序的「文本段 / 图片段」，供预览按位置渲染占位/真图。 */
export type BodySegment = { type: "text"; text: string } | { type: "image"; ref: number }
export function splitBodyByImageTokens(body: string): BodySegment[] {
  const segs: BodySegment[] = []
  let last = 0
  for (const m of body.matchAll(TOKEN_RE)) {
    const idx = m.index ?? 0
    if (idx > last) segs.push({ type: "text", text: body.slice(last, idx) })
    segs.push({ type: "image", ref: Number(m[1]) })
    last = idx + m[0].length
  }
  if (last < body.length) segs.push({ type: "text", text: body.slice(last) })
  return segs
}
```

- [ ] **Step 5: 加 ImageSlot 类型 + PostVariant.imageSlots**

编辑 `packages/shared/src/types.ts`，在 `PostVariant` 接口（当前 106-122 行）**之前**插入 `ImageSlot`，并在 `PostVariant` 里 `suggestedTime` 后加字段：
```ts
/** 一张内联配图槽：位置由正文 [[img:ref]] 决定，这里存描述与出图结果。 */
export interface ImageSlot {
  ref: number
  /** 详细图片描述——出图 prompt 的主来源，可编辑。 */
  description: string
  /** 比例（默认从平台 format 推，如 "1:1" / "16:9"）。 */
  ratio?: string
  status: "empty" | "generating" | "ready" | "failed"
  /** 出图后的可访问 URL（本地 /media 反代 / 将来 S3）。 */
  url?: string
  mimeType?: string
  failureReason?: string
}
```
在 `PostVariant` 内 `suggestedTime: string` 后加：
```ts
  /** 内联配图槽（image 模式生成/编辑）；正文用 [[img:ref]] 标记位置。 */
  imageSlots?: ImageSlot[]
```

- [ ] **Step 6: GenerateImageInput 加 description**

编辑 `packages/shared/src/generation.ts`，在 `GenerateImageInput`（80-89 行）的 `instruction?` 后加：
```ts
  /** 图片槽描述：有值时作为出图 prompt 主来源（取代 hook+body 拼接）。 */
  description?: string
```

- [ ] **Step 7: index 导出新文件**

编辑 `packages/shared/src/index.ts`，在导出 `./types` 附近加一行：
```ts
export * from "./image-slots"
```

- [ ] **Step 8: 运行测试确认通过 + 全量 typecheck**

Run: `pnpm --filter @social/shared test && pnpm --filter @social/shared typecheck`
Expected: 6 tests PASS；typecheck 0 error。

- [ ] **Step 9: Commit**

```bash
git add packages/shared/src/types.ts packages/shared/src/image-slots.ts packages/shared/src/generation.ts packages/shared/src/index.ts packages/shared/package.json packages/shared/tests/image-slots.test.ts pnpm-lock.yaml
git commit -m "feat(shared): ImageSlot 类型 + 正文 [[img:N]] token 纯工具"
```

---

## Task 2: 生成层 prompt —— image 模式产出 token + 描述槽

**Files:**
- Modify: `packages/agent/src/prompts.ts`（`buildVariantPrompt` 88-127 行 + 新增 image grounding 常量）
- Test: `packages/agent/tests/generation.test.ts`

**Interfaces:**
- Consumes: `GenerateVariantsInput.modes`（已存在）。
- Produces: 当 `input.modes` 含 `"image"` 时，`buildVariantPrompt` 返回的 `user` 契约要求模型额外回 `"imageSlots": [{ "ref": <int>, "description": "<desc>" }]` 且在 `body` 里放对应 `[[img:ref]]`。

- [ ] **Step 1: 写失败测试**

在 `packages/agent/tests/generation.test.ts` 末尾追加：
```ts
import { buildVariantPrompt } from "../src/prompts"

describe("buildVariantPrompt image 模式", () => {
  const base = {
    topic: "morning coffee",
    platforms: ["Instagram"] as const,
    brand: { brandName: "Bean", description: "specialty coffee", targetMarket: "US" },
  }
  it("image 模式：契约含 imageSlots 与 [[img:N]] 指示", () => {
    const { user } = buildVariantPrompt("Instagram", { ...base, modes: ["copy", "image"] }, "TPL")
    expect(user).toContain("imageSlots")
    expect(user).toContain("[[img:")
  })
  it("非 image 模式：不出现 imageSlots 指示", () => {
    const { user } = buildVariantPrompt("Instagram", { ...base, modes: ["copy"] }, "TPL")
    expect(user).not.toContain("imageSlots")
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --filter @social/agent test`
Expected: FAIL（user 不含 "imageSlots"）。

- [ ] **Step 3: 实现 prompt 扩展**

编辑 `packages/agent/src/prompts.ts`。在 `GROUNDING_RULES` 常量后加图片占位规则常量：
```ts
// image 模式追加：要求模型在正文合适处插入 [[img:N]] 标记，并给出每张图的详细描述槽。
export const IMAGE_PLACEHOLDER_RULES = [
  "Image placeholders (only because image mode is ON):",
  "- Decide where 1-3 images genuinely help this specific post. Insert a marker [[img:1]], [[img:2]] ... on its own line at each spot in the body.",
  "- Also return an \"imageSlots\" array; each item = { \"ref\": <the number used in the body marker>, \"description\": \"<a concrete, shootable image description: subject, composition, style, mood, colors>\" }.",
  "- The description must stay grounded in the brand context — do NOT depict invented products, logos, prices, or specs. Describe the scene/benefit/feeling.",
  "- ref numbers in imageSlots must match the [[img:N]] markers in the body exactly. Use as few images as the content truly needs.",
].join("\n")
```
在 `buildVariantPrompt` 内，先判断模式（函数顶部）：
```ts
  const wantsImage = (input.modes ?? []).includes("image")
```
把输出契约那段（现 117-125 行的数组）改为在含 image 时追加两行字段说明 + 规则。将 `const user = [...]` 改为：
```ts
  const contractLines = [
    "Return ONLY a JSON object (no prose, no code fences) with exactly these string fields:",
    '  "hook": short attention-grabbing first line / title',
    '  "body": the main post copy for this platform',
    '  "hashtags": space-separated hashtags ("" if the platform should have none)',
    '  "cta": the call to action',
    '  "format": e.g. "Landscape 16:9", "Feed 1:1", "Text post · No media"',
    '  "mediaAsset": short label of the media, e.g. "Generated image" / "No media"',
  ]
  if (wantsImage) {
    contractLines.push(
      '  "imageSlots": array of { "ref": <int>, "description": "<detailed image description>" } (place matching [[img:<ref>]] markers inside "body")',
    )
  }

  const user = [
    context.join("\n"),
    `Write one ${platform} post about this topic: ${topic}`,
    contractLines.join("\n"),
    wantsImage ? IMAGE_PLACEHOLDER_RULES : "",
  ]
    .filter((l) => l !== "")
    .join("\n\n")
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm --filter @social/agent test`
Expected: 全部 PASS（含 2 条新用例）。

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/prompts.ts packages/agent/tests/generation.test.ts
git commit -m "feat(agent): image 模式 prompt 契约产出 [[img:N]] + imageSlots 描述"
```

---

## Task 3: LLM 适配器 —— 解析 imageSlots + 出图用 description

**Files:**
- Modify: `packages/agent/src/adapters/llm.ts`（`generateOneVariant` 99-131 行；`generateImage` 194-202 行；新增 `mapImageSlots` 辅助）
- Test: `packages/agent/tests/generation.test.ts`

**Interfaces:**
- Consumes: `buildVariantPrompt`（Task 2）、`ratioFromFormat`（llm.ts 已有）、`GenerateImageInput.description`（Task 1）。
- Produces: `generateOneVariant` 在 image 模式下给 `PostVariant.imageSlots` 赋值（`status:"empty"`, `ratio` 从 format 推）。`generateImage` 优先用 `input.description` 作 prompt。

- [ ] **Step 1: 写失败测试**

在 `packages/agent/tests/generation.test.ts` 追加（用现有测试里注入 `fetchImpl` 的模式；参考文件中已有的 Llm 测试写法构造 fake fetch 返回 JSON）：
```ts
import { LlmContentGenerator } from "../src/adapters/llm"

function fakeFetch(payload: unknown) {
  return async () =>
    new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })
}

describe("LlmContentGenerator imageSlots", () => {
  const cfg = (fetchImpl: typeof fetch) => ({
    baseUrl: "https://x/v1",
    apiKey: "k",
    textModel: "m",
    imageModel: "img",
    fetchImpl,
    prompts: { getTemplate: async () => "TPL" },
  })

  it("image 模式解析 imageSlots，ref/描述保留、status=empty", async () => {
    const gen = new LlmContentGenerator(
      cfg(fakeFetch({ hook: "h", body: "b [[img:1]]", imageSlots: [{ ref: 1, description: "latte closeup" }] }) as unknown as typeof fetch),
    )
    const out = await gen.generateVariants({ topic: "t", platforms: ["Instagram"], brand: { brandName: "B", description: "d", targetMarket: "US" }, modes: ["copy", "image"] })
    expect(out.variants[0].imageSlots).toEqual([
      { ref: 1, description: "latte closeup", ratio: "1:1", status: "empty" },
    ])
  })

  it("非 image 模式：imageSlots 为 undefined", async () => {
    const gen = new LlmContentGenerator(
      cfg(fakeFetch({ hook: "h", body: "b" }) as unknown as typeof fetch),
    )
    const out = await gen.generateVariants({ topic: "t", platforms: ["Instagram"], brand: { brandName: "B", description: "d", targetMarket: "US" }, modes: ["copy"] })
    expect(out.variants[0].imageSlots).toBeUndefined()
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --filter @social/agent test`
Expected: FAIL（imageSlots undefined / 结构不符）。

- [ ] **Step 3: 实现 —— 解析 imageSlots**

编辑 `packages/agent/src/adapters/llm.ts`。在文件底部工具区（`ratioFromFormat` 附近）加：
```ts
// 把模型返回的 imageSlots 归一化：过滤非法 ref、去重、补 status/ratio。ref 沿用模型值（与 body token 对齐）。
function mapImageSlots(
  raw: Array<{ ref?: number; description?: string }> | undefined,
  format: string,
): import("@social/shared").ImageSlot[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined
  const ratio = ratioFromFormat(format)
  const seen = new Set<number>()
  const slots = raw
    .filter((s) => Number.isInteger(s.ref) && (s.ref as number) > 0)
    .filter((s) => (seen.has(s.ref as number) ? false : (seen.add(s.ref as number), true)))
    .map((s) => ({ ref: s.ref as number, description: (s.description ?? "").trim(), ratio, status: "empty" as const }))
  return slots.length > 0 ? slots : undefined
}
```
在 `generateOneVariant` 里，把 `chatJson` 的泛型加上 `imageSlots`：
```ts
    const parsed = await this.chatJson<{
      hook?: string
      body?: string
      hashtags?: string
      cta?: string
      format?: string
      mediaAsset?: string
      imageSlots?: Array<{ ref?: number; description?: string }>
    }>([
```
并在 `return { ... }` 对象里 `suggestedTime: "10:00",` 后加：
```ts
      imageSlots: (input.modes ?? []).includes("image")
        ? mapImageSlots(parsed.imageSlots, parsed.format?.trim() || d.format)
        : undefined,
```

- [ ] **Step 4: 实现 —— generateImage 用 description**

在 `generateImage`（194-202 行）把 `prompt` 数组的第三行由固定 hook+body 改为优先 description：
```ts
    const prompt = [
      input.instruction ? `Modify the image: ${input.instruction}.` : `Create a social media image.`,
      `Platform: ${input.platform}. Aspect ratio: ${ratio}.`,
      input.description?.trim()
        ? `Image: ${input.description.trim()}.`
        : `Post hook: ${input.hook}. Context: ${input.body}.`,
      input.brand.visualStyle ? `Visual style: ${input.brand.visualStyle}.` : "",
      input.brand.brandColors ? `Brand colors: ${input.brand.brandColors}.` : "",
    ]
      .filter((l) => l !== "")
      .join(" ")
```

- [ ] **Step 5: 运行确认通过**

Run: `pnpm --filter @social/agent test`
Expected: 全部 PASS。

- [ ] **Step 6: Commit**

```bash
git add packages/agent/src/adapters/llm.ts packages/agent/tests/generation.test.ts
git commit -m "feat(agent): LLM 解析 imageSlots + 出图 prompt 优先用槽描述"
```

---

## Task 4: 桩适配器 —— 离线也产 slots + token

**Files:**
- Modify: `packages/agent/src/adapters/stub.ts`（`buildStubVariant` 61-82、`generateVariants` 125-132、`generateImage` 140-147、`placeholderImage` 110-120）
- Test: `packages/agent/tests/generation.test.ts`

**Interfaces:**
- Consumes: `insertImageToken`（Task 1）。
- Produces: 桩在 image 模式下给变体 1 个 slot + body 追加 `[[img:1]]`；`generateImage` 用 description 作占位图标签。

- [ ] **Step 1: 写失败测试**

追加：
```ts
import { StubContentGenerator } from "../src/adapters/stub"

describe("Stub image 模式", () => {
  it("image 模式产出 1 个 slot 且 body 含 [[img:1]]", async () => {
    const gen = new StubContentGenerator()
    const out = await gen.generateVariants({ topic: "t", platforms: ["Instagram"], brand: { brandName: "B", description: "d", targetMarket: "US" }, modes: ["image"] })
    const v = out.variants[0]
    expect(v.body).toContain("[[img:1]]")
    expect(v.imageSlots?.[0]).toMatchObject({ ref: 1, status: "empty" })
  })
  it("非 image 模式：无 slot、body 无 token", async () => {
    const gen = new StubContentGenerator()
    const out = await gen.generateVariants({ topic: "t", platforms: ["Instagram"], brand: { brandName: "B", description: "d", targetMarket: "US" }, modes: ["copy"] })
    expect(out.variants[0].imageSlots).toBeUndefined()
    expect(out.variants[0].body).not.toContain("[[img:")
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --filter @social/agent test`
Expected: FAIL。

- [ ] **Step 3: 实现**

编辑 `packages/agent/src/adapters/stub.ts`。顶部 import 加：
```ts
import { insertImageToken } from "@social/shared"
```
把 `generateVariants`（125-132 行）改为在 image 模式下加 slot + token：
```ts
  async generateVariants(input: GenerateVariantsInput): Promise<GenerateVariantsOutput> {
    if (!input.platforms || input.platforms.length === 0) {
      throw new GeneratorError("content_invalid", "generateVariants 需要至少一个平台")
    }
    const wantsImage = (input.modes ?? []).includes("image")
    const variants = input.platforms.map((p) => {
      const v = buildStubVariant(p, input.topic, input.brand)
      if (!wantsImage) return v
      // 桩：加 1 张配图槽，正文追加对应 [[img:1]] 标记（离线也能驱动占位 UI）。
      const ratio = ratioFromFormat(v.format)
      return {
        ...v,
        body: insertImageToken(v.body, 1),
        imageSlots: [{ ref: 1, description: `${input.topic || "post"} — hero image`, ratio, status: "empty" as const }],
      }
    })
    return { variants }
  }
```
把 `generateImage`（140-147 行）的占位图标签改用 description：
```ts
  async generateImage(input: GenerateImageInput): Promise<GenerateImageOutput> {
    const ratio = ratioFromFormat(input.format)
    const label = input.description || input.hook || input.body || "post"
    return {
      assetUrl: placeholderImage(input.platform, ratio, label),
      mimeType: "image/svg+xml",
      ratio,
    }
  }
```

- [ ] **Step 4: 运行确认通过 + agent 全量**

Run: `pnpm --filter @social/agent test && pnpm --filter @social/agent typecheck`
Expected: 全 PASS，typecheck 0 error。

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/adapters/stub.ts packages/agent/tests/generation.test.ts
git commit -m "feat(agent): 桩在 image 模式产出 slot + [[img:1]] token"
```

---

## Task 5: DB —— image_slots 列持久化

**Files:**
- Modify: `packages/db/src/schema.ts`（`ssaPostVariant` 136-160，加列）
- Modify: `packages/db/src/repositories/post.repo.ts`（`insertVariants` 121-140、`rowToVariant` 166-182）
- Create: 迁移 SQL（drizzle-kit 生成）

**Interfaces:**
- Consumes: `ImageSlot`（Task 1）。
- Produces: 帖子往返（create→getById）不丢 `variant.imageSlots`。

- [ ] **Step 1: schema 加列**

编辑 `packages/db/src/schema.ts`。顶部类型 import 里加 `ImageSlot`（与 `Platform` 等同处 import from `@social/shared`）。在 `ssaPostVariant` 的 `mediaAssetId` 列后加：
```ts
    imageSlots: json("image_slots").$type<ImageSlot[]>(),
```
（确认文件顶部已 import `json`；schema 里 `platforms`/`tags` 已用 `json`，直接复用。）

- [ ] **Step 2: repo 落库/回读**

编辑 `packages/db/src/repositories/post.repo.ts`。`insertVariants`（121-140）的 map 对象里 `suggestedTime` 后加：
```ts
        imageSlots: v.imageSlots ?? null,
```
`rowToVariant`（166-182）返回对象里 `suggestedTime` 后加：
```ts
    imageSlots: (row.imageSlots as import("@social/shared").ImageSlot[] | null) ?? undefined,
```
顶部 import 的类型清单加 `ImageSlot`（与现有 `PostVariant` 等并列）。

- [ ] **Step 3: 生成迁移**

Run: `pnpm --filter @social/db exec drizzle-kit generate`
Expected: `packages/db/drizzle/` 下新增迁移文件，内容含 `ALTER TABLE \`ssa_post_variant\` ADD \`image_slots\` json;`
（若脚本名不同，先看 `packages/db/package.json` 的 drizzle 生成脚本，用它。）

- [ ] **Step 4: typecheck + 应用迁移到 3307**

Run: `pnpm --filter @social/db typecheck`
Expected: 0 error。
应用迁移（对 3307 开发库；**勿碰 3306**）：`pnpm --filter @social/db exec drizzle-kit migrate`（或项目既定的迁移执行脚本，见 db package.json）。
Expected: 迁移成功，`ssa_post_variant` 出现 `image_slots` 列。

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/schema.ts packages/db/src/repositories/post.repo.ts packages/db/drizzle
git commit -m "feat(db): ssa_post_variant.image_slots 列 + repo 往返持久化"
```

---

## Task 6: 后端 /generate/image —— 收 description/instruction

**Files:**
- Modify: `apps/server/src/routes/generate.ts`（`/image` 路由 105-140 行）

**Interfaces:**
- Consumes: `GenerateImageInput.description`（Task 1）。
- Produces: `/generate/image` 接受 `description`，透传给生成；媒体审计行 `prompt` 记录描述。返回形状不变 `{ asset, credits, generationJobId }`。

**说明（诚实记录）：** studio 编辑阶段帖子尚未落库，故此处媒体行不关联 `variantId/postId`（真正的图-变体绑定由 Task 5 的 `image_slots` 在存档时持久化）。此处仅补 `prompt=description` 做审计/计费血缘。

- [ ] **Step 1: 扩展入参与 input**

编辑 `apps/server/src/routes/generate.ts` 的 `/image` 路由。`c.req.json<...>()` 的类型加 `description?: string`：
```ts
  const body = await c.req.json<{ projectId?: string; platform?: Platform; format?: string; hook?: string; body?: string; mediaAsset?: string; instruction?: string; description?: string }>().catch(() => null)
```
`const input = {...}` 里 `instruction: body.instruction,` 后加：
```ts
    description: body.description,
```

- [ ] **Step 2: 媒体审计带上描述**

把 `p.repos.media.create(...)`（133-138 行）的对象加 `prompt`：
```ts
  const asset = await p.repos.media.create(p.ctx.projectId, p.ctx.workspaceId, {
    kind: "image",
    url,
    mimeType: result.data.mimeType,
    ratio: result.data.ratio,
    prompt: body.description,
    model: result.usage?.model,
  })
```
（若 `result` 无 `usage` 字段：用现有 `recordJob` 已取到的 usage 口径；如类型不含 model 则去掉 `model` 这行，保留 `prompt`。以 `pnpm --filter server typecheck` 为准。）

- [ ] **Step 3: typecheck**

Run: `pnpm --filter server typecheck`
Expected: 0 error。

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/routes/generate.ts
git commit -m "feat(server): /generate/image 接受槽描述并记入媒体审计"
```

---

## Task 7: 前端数据层 —— api.generateImage 传 description

**Files:**
- Modify: `apps/web/src/features/social/data/api.ts`（`generateImage` 115-127 行）

**Interfaces:**
- Produces: `api.generateImage` 入参加可选 `description?: string`。（`generateVariants` 的类型已含 `modes`，无需改。）

- [ ] **Step 1: 加字段**

编辑 `apps/web/src/features/social/data/api.ts`，`generateImage` 入参对象类型里 `instruction?: string` 后加：
```ts
    description?: string
```

- [ ] **Step 2: typecheck**

Run: `pnpm --filter web typecheck`
Expected: 0 error。

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/social/data/api.ts
git commit -m "feat(web): api.generateImage 支持传槽描述"
```

---

## Task 8: 前端 store —— 接通 genModes、按槽出图、按槽派生 hasImage

**Files:**
- Modify: `apps/web/src/features/social/store/index.tsx`（`generateImage` 560-587、`generateVariants` 590-608、`saveStudioToLibrary` 641-666；`SocialContext` 类型里 `generateVariants` 签名）

**Interfaces:**
- Consumes: `api.generateImage`（Task 7）、`ImageSlot`（Task 1）。
- Produces:
  - `generateVariants(modes?: Array<"copy"|"image"|"video">): Promise<void>` — 透传 modes。
  - `generateImage(params: { platform; format; slotRef?: number; description?: string; instruction?: string; hook: string; body: string; mediaAsset?: string }): Promise<void>` — 有 `slotRef` 时更新该变体 `imageSlots[ref]` 的 `url/status`，否则回退旧 `mediaUrl`。
  - `saveStudioToLibrary` 的 `hasImage`/`assetType` 依据"任一变体有 ready 槽或 imageGenerated"。

- [ ] **Step 1: generateVariants 透传 modes**

编辑 `store/index.tsx` 的 `generateVariants`（590 行）签名与调用：
```ts
  const generateVariants = useCallback(async (modes?: Array<"copy" | "image" | "video">) => {
    if (!activeProjectId) {
      pushToast(translate("Select a project first", "请先选择项目"), "warn")
      return
    }
    try {
      const res = await api.generateVariants({
        projectId: activeProjectId,
        topic: studio.topic || "New social topic",
        platforms: studio.platforms,
        modes,
      })
      setStudio((s) => ({ ...s, copyGenerated: true, imageGenerated: false, variants: res.variants }))
      setCredits((c) => c - res.credits)
      pushToast(translate(`Variants generated (AI) · credits: ${res.credits}`, `已生成内容变体（AI）· credits：${res.credits}`), "success")
    } catch (e) {
      pushToast(translate(`Generation failed: ${(e as Error).message}`, `生成失败：${(e as Error).message}`), "warn")
      throw e
    }
  }, [activeProjectId, studio.topic, studio.platforms, pushToast])
```

- [ ] **Step 2: generateImage 按槽更新**

把 `generateImage`（560-587 行）改为支持 slotRef：
```ts
  const generateImage = useCallback(
    async (params: {
      platform: Platform
      format: string
      hook: string
      body: string
      mediaAsset?: string
      instruction?: string
      slotRef?: number
      description?: string
    }) => {
      if (!activeProjectId) {
        pushToast(translate("Select a project first", "请先选择项目"), "warn")
        return
      }
      // 出图前把目标槽标记 generating（即时反馈；铁律2.5 加载态）。
      if (params.slotRef != null) {
        setStudio((s) => ({
          ...s,
          variants: s.variants.map((v) =>
            v.platform === params.platform
              ? { ...v, imageSlots: (v.imageSlots ?? []).map((sl) => (sl.ref === params.slotRef ? { ...sl, status: "generating" } : sl)) }
              : v,
          ),
        }))
      }
      try {
        const res = await api.generateImage({
          projectId: activeProjectId,
          platform: params.platform,
          format: params.format,
          hook: params.hook,
          body: params.body,
          mediaAsset: params.mediaAsset,
          instruction: params.instruction,
          description: params.description,
        })
        setCredits((c) => c - res.credits)
        setStudio((s) => ({
          ...s,
          imageGenerated: true,
          variants: s.variants.map((v) => {
            if (v.platform !== params.platform) return v
            if (params.slotRef == null) return { ...v, mediaUrl: res.asset.url }
            return {
              ...v,
              imageSlots: (v.imageSlots ?? []).map((sl) =>
                sl.ref === params.slotRef ? { ...sl, url: res.asset.url, mimeType: res.asset.mimeType, status: "ready" } : sl,
              ),
            }
          }),
        }))
        pushToast(translate("Image generated (AI)", "已生成图片（AI）"), "success")
      } catch (e) {
        if (params.slotRef != null) {
          setStudio((s) => ({
            ...s,
            variants: s.variants.map((v) =>
              v.platform === params.platform
                ? { ...v, imageSlots: (v.imageSlots ?? []).map((sl) => (sl.ref === params.slotRef ? { ...sl, status: "failed", failureReason: (e as Error).message } : sl)) }
                : v,
            ),
          }))
        }
        pushToast(translate("Image generation failed", "图片生成失败") + `: ${(e as Error).message}`, "warn")
      }
    },
    [activeProjectId, pushToast],
  )
```

- [ ] **Step 3: save 依 slots 派生 hasImage**

`saveStudioToLibrary`（647-658 行附近）计算 hasImage：
```ts
    const hasReadyImage =
      studio.imageGenerated || variants.some((v) => (v.imageSlots ?? []).some((sl) => sl.status === "ready"))
```
并把 `savePost` 里 `assetType`/`hasImage` 两处改用 `hasReadyImage`：
```ts
        assetType: hasReadyImage ? "Copy + image" : "Copy",
        status: "Ready",
        hasImage: hasReadyImage,
```

- [ ] **Step 4: 更新 context 类型签名**

在本文件 `SocialContext`/`SocialContextValue` 接口里，把 `generateVariants` 与 `generateImage` 的类型同步为 Step 1/2 的新签名（搜索接口定义处，改 `generateVariants: (modes?: Array<"copy" | "image" | "video">) => Promise<void>` 与 `generateImage` 的参数增加 `slotRef?`/`description?`）。

- [ ] **Step 5: typecheck**

Run: `pnpm --filter web typecheck`
Expected: 0 error（若报 `generateImage`/`generateVariants` 调用点类型不符，是 Task 9 要改的调用点，先记下，Task 9 修复后再整体 typecheck）。

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/social/store/index.tsx
git commit -m "feat(web/store): 接通 genModes、按槽出图与失败态、按槽派生 hasImage"
```

---

## Task 9: 前端编辑区 —— 配图槽面板

**Files:**
- Create: `apps/web/src/features/social/views/content-create/image-slot-panel.tsx`
- Modify: `apps/web/src/features/social/views/content-create/create-content-wizard.tsx`（Step2 body Field 后接面板 352-353 行附近；`runGenerateVariants` 116-126 传 genModes）

**Interfaces:**
- Consumes: store `generateImage`（Task 8，带 slotRef/description）、`insertImageToken`/`nextImageRef`（Task 1）、`applyEdit`（wizard 内，patch `imageSlots`/`body`）。
- Produces: `<ImageSlotPanel current onApplyEdit onGenerate onModify />` 组件。

- [ ] **Step 1: 新建面板组件**

Create `apps/web/src/features/social/views/content-create/image-slot-panel.tsx`:
```tsx
"use client"

import type { ImageSlot, PostVariant } from "@social/shared"
import { insertImageToken, nextImageRef } from "@social/shared"
import { TextArea } from "@/features/social/components/ui"
import { useLang } from "@/features/social/i18n"
import { ImagePlus, RefreshCw, Pencil, Loader2 } from "lucide-react"

// 编辑区「配图槽」面板：位置在正文里挪 [[img:N]]，描述/出图在这里。
// 铁律2.5：出图是 AI 等待，用 status=generating 的转圈 + 文案给反馈。
export function ImageSlotPanel({
  current,
  onApplyEdit,
  onGenerate,
  onModify,
}: {
  current: PostVariant
  onApplyEdit: (patch: Partial<PostVariant>) => void
  onGenerate: (ref: number, description: string) => void
  onModify: (ref: number, description: string) => void
}) {
  const { t } = useLang()
  const slots = current.imageSlots ?? []

  const updateSlot = (ref: number, patch: Partial<ImageSlot>) =>
    onApplyEdit({ imageSlots: slots.map((s) => (s.ref === ref ? { ...s, ...patch } : s)) })

  const addSlot = () => {
    const ref = nextImageRef(slots)
    onApplyEdit({
      body: insertImageToken(current.body, ref),
      imageSlots: [...slots, { ref, description: "", status: "empty" }],
    })
  }

  const removeSlot = (ref: number) =>
    onApplyEdit({
      // 删槽同时从正文剥掉对应 token。
      body: current.body.replace(new RegExp(`\\n?\\[\\[img:${ref}\\]\\]\\n?`, "g"), "\n"),
      imageSlots: slots.filter((s) => s.ref !== ref),
    })

  return (
    <div className="mt-3 rounded-lg border border-border bg-card p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-foreground">{t("Images", "配图")}</p>
        <button
          type="button"
          onClick={addSlot}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground hover:bg-muted"
        >
          <ImagePlus className="size-3.5" /> {t("Add image slot", "插入配图")}
        </button>
      </div>

      {slots.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {t("No image placeholders. Add one to insert [[img:N]] in the body.", "暂无配图占位。点上方按钮在正文插入 [[img:N]]。")}
        </p>
      ) : (
        <ul className="mt-2 space-y-3">
          {slots.map((s) => (
            <li key={s.ref} className="rounded-md border border-border p-2">
              <div className="flex items-center justify-between">
                <span className="rounded bg-brand-muted px-1.5 py-0.5 text-[11px] font-semibold text-brand">[[img:{s.ref}]]</span>
                <button type="button" onClick={() => removeSlot(s.ref)} className="text-[11px] text-muted-foreground hover:text-foreground">
                  {t("Remove", "删除")}
                </button>
              </div>
              <TextArea
                className="mt-2 min-h-16 text-xs"
                value={s.description}
                onChange={(e) => updateSlot(s.ref, { description: e.target.value })}
                placeholder={t("Describe this image: subject, composition, style, colors…", "描述这张图：主体、构图、风格、色调…")}
              />
              {s.url ? (
                // 用户内容动态 URL，用原生 img。 eslint-disable-next-line @next/next/no-img-element
                <img src={s.url} alt={`img ${s.ref}`} className="mt-2 max-h-40 w-full rounded object-cover" />
              ) : null}
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  disabled={s.status === "generating" || !s.description.trim()}
                  onClick={() => onGenerate(s.ref, s.description)}
                  className="inline-flex items-center gap-1 rounded-md bg-brand px-2 py-1 text-xs font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
                >
                  {s.status === "generating" ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
                  {s.status === "generating"
                    ? t("Generating…", "生成中…")
                    : s.url
                      ? t("Regenerate", "重新生成")
                      : t("Generate", "生成配图")}
                </button>
                {s.url ? (
                  <button
                    type="button"
                    onClick={() => onModify(s.ref, s.description)}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground hover:bg-muted"
                  >
                    <Pencil className="size-3" /> {t("Modify", "修改")}
                  </button>
                ) : null}
                {s.status === "failed" ? <span className="text-[11px] text-status-failed">{t("Failed", "失败")}</span> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```
（`TextArea` 是否接受 `className` 以现有 `components/ui` 为准；若不接受，去掉 className 属性即可——先看该组件签名。）

- [ ] **Step 2: 向导接面板 + 透传 genModes**

编辑 `create-content-wizard.tsx`：
1. 顶部 import 加：`import { ImageSlotPanel } from "./image-slot-panel"`。
2. `runGenerateVariants`（116-126 行）把 `await generateVariants()` 改为 `await generateVariants(genModes)`。
3. 在 body 的 `</Field>`（353 行）之后、`<div className="grid grid-cols-2 gap-3">`（355 行）之前，插入面板（仅在 genModes 含 image 时显示）：
```tsx
                    {genModes.includes("image") && current ? (
                      <ImageSlotPanel
                        current={current}
                        onApplyEdit={applyEdit}
                        onGenerate={(ref, description) =>
                          setPaid({
                            label: t("Generate image", "生成配图"),
                            credits: 30,
                            run: () =>
                              generateImage({
                                platform: current.platform,
                                format: current.format,
                                hook: current.hook,
                                body: current.body,
                                mediaAsset: current.mediaAsset,
                                slotRef: ref,
                                description,
                              }),
                          })
                        }
                        onModify={(ref, description) => {
                          setActiveVariant(current.platform)
                          setImageEditPrompt("")
                          // 复用现有 Modify 弹窗：把目标槽 ref/描述暂存，弹窗确认时带 instruction + slotRef 出图。
                          setModifySlot({ ref, description })
                          setImageEditOpen(true)
                        }}
                      />
                    ) : null}
```
4. 新增本地 state（与其它 `useState` 并列，67 行附近）：
```tsx
  const [modifySlot, setModifySlot] = useState<{ ref: number; description: string } | null>(null)
```
5. 找到现有 Modify 弹窗（`imageEditOpen` 的确认按钮，约 639-687 行）里调用 `generateImage(...)` 的地方，改为带上 slotRef/description/instruction：
```tsx
                    generateImage({
                      platform: current.platform,
                      format: current.format,
                      hook: current.hook,
                      body: current.body,
                      mediaAsset: current.mediaAsset,
                      instruction: imageEditPrompt,
                      slotRef: modifySlot?.ref,
                      description: modifySlot?.description,
                    })
```

- [ ] **Step 3: typecheck + lint**

Run: `pnpm --filter web typecheck && pnpm --filter web lint`
Expected: 0 error。修掉 Task 8 遗留的调用点类型问题（此处应已一致）。

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/social/views/content-create/image-slot-panel.tsx apps/web/src/features/social/views/content-create/create-content-wizard.tsx
git commit -m "feat(web): 编辑区配图槽面板 + 透传 genModes + 按槽出图/修稿"
```

---

## Task 10: 前端预览 —— 按 token 分段渲染占位/真图

**Files:**
- Modify: `apps/web/src/features/social/views/content-create/preview-card.tsx`（body 渲染 54-55、media 块 57-103）

**Interfaces:**
- Consumes: `splitBodyByImageTokens`/`stripImageTokens`（Task 1）；新增可选 props `onGenerateSlot?(ref)`。
- Produces: 有 `imageSlots` 时，正文按 `[[img:N]]` 位置内联渲染每个槽（ready→真图，否则→描述占位卡）；caption 文本剥掉 token。无 slots 时维持现有单媒体块（向后兼容）。

- [ ] **Step 1: 引入工具 + 新 prop**

编辑 `preview-card.tsx`：
1. import 加：`import { splitBodyByImageTokens, stripImageTokens } from "@social/shared"`。
2. `PreviewCard` props 加可选：`onGenerateSlot?: (ref: number) => void`。
3. 顶部计算：`const slots = variant.imageSlots ?? []`。

- [ ] **Step 2: 正文分段渲染**

把正文那行（55 行 `<p ...>{variant.body ...}</p>`）替换为：有 slots 时按段渲染，否则原样。
```tsx
        {slots.length > 0 ? (
          <div className="mt-1 space-y-2">
            {splitBodyByImageTokens(variant.body).map((seg, i) =>
              seg.type === "text" ? (
                seg.text.trim() ? (
                  <p key={i} className="whitespace-pre-line text-sm text-muted-foreground">
                    {seg.text.trim()}
                  </p>
                ) : null
              ) : (
                <SlotPreview
                  key={i}
                  slot={slots.find((s) => s.ref === seg.ref)}
                  ratio={ratio}
                  onGenerate={onGenerateSlot}
                />
              ),
            )}
          </div>
        ) : (
          <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{variant.body || t("No copy yet.", "尚无文案。")}</p>
        )}
```

- [ ] **Step 3: 保留旧单媒体块（仅无 slots 时）**

把现有 media 块（57-103 行的 `{showMedia ? (...) : (...)}`）外面包一层：`{slots.length === 0 && showMedia ? (...原块...) : slots.length === 0 ? (...原纯文本占位...) : null}`。即：有 slots 时不再渲染旧单媒体块（图已内联在正文段里）。

- [ ] **Step 4: SlotPreview 子组件**

在文件底部加：
```tsx
function SlotPreview({
  slot,
  ratio,
  onGenerate,
}: {
  slot?: import("@social/shared").ImageSlot
  ratio: string
  onGenerate?: (ref: number) => void
}) {
  const { t } = useLang()
  if (!slot) return null
  return (
    <div
      className="relative flex items-center justify-center overflow-hidden rounded-md border border-border bg-muted text-xs text-muted-foreground"
      style={{ aspectRatio: ratio.replace(":", "/") }}
    >
      {slot.url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={slot.url} alt={`img ${slot.ref}`} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="flex flex-col items-center gap-1 p-2 text-center">
          <span className="font-medium">[[img:{slot.ref}]] · {ratio}</span>
          <span className="line-clamp-2 opacity-80">{slot.description || t("No description yet", "尚无描述")}</span>
          {onGenerate ? (
            <button
              type="button"
              disabled={slot.status === "generating" || !slot.description.trim()}
              onClick={() => onGenerate(slot.ref)}
              className="mt-1 rounded-md bg-brand px-2 py-0.5 text-[11px] font-medium text-brand-foreground disabled:opacity-50"
            >
              {slot.status === "generating" ? t("Generating…", "生成中…") : t("Generate", "生成配图")}
            </button>
          ) : null}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5: 向导把 onGenerateSlot 接给预览**

编辑 `create-content-wizard.tsx` 的 `<PreviewCard .../>`（385-407 行），加一个 prop：
```tsx
                      onGenerateSlot={(ref) => {
                        const slot = current.imageSlots?.find((s) => s.ref === ref)
                        if (!slot) return
                        setPaid({
                          label: t("Generate image", "生成配图"),
                          credits: 30,
                          run: () =>
                            generateImage({
                              platform: current.platform,
                              format: current.format,
                              hook: current.hook,
                              body: current.body,
                              mediaAsset: current.mediaAsset,
                              slotRef: ref,
                              description: slot.description,
                            }),
                        })
                      }}
```

- [ ] **Step 6: typecheck + lint**

Run: `pnpm --filter web typecheck && pnpm --filter web lint`
Expected: 0 error。

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/features/social/views/content-create/preview-card.tsx apps/web/src/features/social/views/content-create/create-content-wizard.tsx
git commit -m "feat(web): 预览按 [[img:N]] 分段内联渲染占位/真图 + 点按钮出图"
```

---

## Task 11: 端到端联调验证

**Files:** 无（验证任务）

- [ ] **Step 1: 全量测试 + typecheck**

Run: `pnpm --filter @social/shared test && pnpm --filter @social/agent test && pnpm turbo run typecheck`
Expected: 全 PASS，typecheck 0 error。

- [ ] **Step 2: 启动 App（真实模型）**

确认 env：`GENERATION_MODE=llm`、`GENERATION_IMAGE_MODEL=gemini-3-pro-image-preview`、网关 baseUrl 带 `/v1`、apiKey 有效。
Run: `pnpm dev`（web:3001 / server:8091；参考 [[social-agent-shared-checkout]]）。

- [ ] **Step 3: 用 verify 技能驱动真实链路**

用 `verify`/`run` 技能（Playwright）跑：新建内容 → 勾选「文本 + 图片」→ 生成 → Step2 看正文含 `[[img:N]]` + 配图槽面板有描述 → 改一处描述、挪一个 token 位置 → 点「生成配图」→ 预览对应位置出真图 → 点「修改」带指令二次修稿 → 存档 → 刷新/重进内容库确认图仍在（持久化）→ 排期正常。
Expected: 每步与预期一致；出图为真实 gemini 图片；存档后回读不丢图。

- [ ] **Step 4: 记忆 + 收尾**

把关键决策写入记忆（新建 `social-agent-inline-image-slots.md`：位置/描述解耦、`[[img:N]]` 语法、image_slots json 列、出图复用 basi.monster gemini 模型、每平台独立），并更新 `MEMORY.md` 索引。
用 `finishing-a-development-branch` 技能决定合并/PR。

---

## Self-Review（对照 spec）

- **§1-2 位置/描述解耦、多图**：Task 1（类型+工具）、Task 9（面板挪位置/改描述）、Task 10（预览分段）✅
- **§2.1 token 语法/正则/避冲突**：Task 1 `TOKEN_RE`、Global Constraints ✅
- **§2.2 ImageSlot 字段（status/url/ratio/failureReason）**：Task 1 ✅
- **§2 ref↔token 一致性（游离/删除行为）**：Task 9 addSlot/removeSlot、Task 3 mapImageSlots dedupe ✅
- **§3.1 genModes 未接通 bug**：Task 8 Step1、Task 9 Step2.2 ✅
- **§3.2 GenerateImageInput.description**：Task 1 Step6、Task 3 Step4、Task 6/7/8 ✅
- **§4.1 prompt 契约 + 图片 grounding**：Task 2 ✅
- **§4.2 出图用 description / gemini 模型 / 不引 flux**：Task 3 Step4、Global Constraints ✅
- **§4.3 桩离线**：Task 4 ✅
- **§5 持久化 image_slots + 媒体审计 + 修 mediaUrl 缺口**：Task 5、Task 6 ✅
- **§6 路由**：Task 6（/image）；/variants 已支持 modes（无需改，已在 Self-Review 记录）✅
- **§7 前端编辑/预览/store/i18n**：Task 8/9/10（文案就地 t()）✅
- **§8 计费 30/20cr 逐槽**：Task 9 setPaid credits + service 现有口径 ✅
- **§9 边界（失败态/未配模型/旧数据兼容）**：Task 8 failed 态、Task 10 无 slots 兼容旧单图块 ✅
- **§10 测试**：Task 1/2/3/4 vitest、Task 11 e2e ✅

**Placeholder scan**：无 TBD/TODO；每个改代码步骤都给了完整代码。前端无单测是本项目现实（已在 Global Constraints 声明，非占位）。

**Type consistency**：`ImageSlot`/`imageSlots`/`slotRef`/`description` 全链路命名一致；`generateVariants(modes?)`、`generateImage({...slotRef, description})` 签名 Task 8 定义、Task 9/10 调用一致；`splitBodyByImageTokens` 返回 `BodySegment` 与 Task 10 消费一致。
