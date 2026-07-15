// StubContentGenerator —— 默认生成器（免 key，本地即可跑通「AI 辅助生成」全流程）。
//
// 设计（用户 2026-07-09 需求 + 铁律11 评估先行）：
//   桩必须复刻前端原型 apps/web 的 store `buildVariant` / `COPY_BODY` / `VARIANT_DEFAULTS` 与
//   data/mock 的 `planTemplate` / `opsRecommendations` / `generateProfileDraft` 逻辑，让本地产出与前端
//   原型一致、可直接驱动 UI。填 env 换成 LlmContentGenerator 即真 AI，形状不变。
//
//   确定性铁律（沙箱可能禁用 Math.random / Date.now）：
//     一律不用随机/时钟。内容全部由输入派生；需要唯一 id 的地方（PlanItem / Recommendation）用
//     crypto.randomUUID()（node:crypto，非 Math.random）。同样输入 → 同样内容，便于评估集稳定断言。

import { randomUUID } from "node:crypto"
import type {
  BrandContext,
  GenerateImageInput,
  GenerateImageOutput,
  GeneratePlanInput,
  GeneratePlanOutput,
  GenerateProfileDraftInput,
  GenerateProfileDraftOutput,
  GenerateRecommendationsInput,
  GenerateRecommendationsOutput,
  GenerateVariantsInput,
  GenerateVariantsOutput,
  PlanItem,
  Platform,
  PostVariant,
  Recommendation,
} from "@social/shared"
import { insertImageToken, platformPublishMode } from "@social/shared"
import type { ContentGenerator } from "../ports"
import { GeneratorError } from "../errors"

// ── 平台展示默认（格式/媒体类型）。llm.ts 也复用它填模型没给的字段。 ──
//
// ⚠️ 这里【不再有 account 账号名】（2026-07-15 移除）：生成层是纯内容生成器，它不知道、也不该知道
// 当前用户连了哪些账号。曾经这里写死 `X: "@northstar_ai"`、`Instagram: "@northstar.ai"` 这类示例名，
// 后果是【用户看到的是编造的假账号】——即便他真实授权的是 @ChenR292518。
// 现在 account 由前端 store 从真实已连接账号解析（见 store 的 resolveVariantAccount），
// 生成层一律留空，绝不编造身份。
export interface PlatformVariantDefaults {
  format: string
  media: string
}
export const PLATFORM_VARIANT_DEFAULTS: Record<Platform, PlatformVariantDefaults> = {
  TikTok: { format: "Cover 9:16", media: "Cover image" },
  Instagram: { format: "Feed 1:1", media: "Generated image" },
  YouTube: { format: "Thumbnail 16:9", media: "Thumbnail" },
  X: { format: "Landscape 16:9", media: "Generated image" },
  Reddit: { format: "Text post · No media", media: "No media" },
  Facebook: { format: "Landscape 1.91:1", media: "Generated image" },
}

// 每平台正文模板（复刻前端 store 的 COPY_BODY，用 BrandContext 取代 BrandProfile）。
const COPY_BODY: Record<Platform, (topic: string, b: BrandContext, cta: string) => string> = {
  X: (t, b, cta) => `${t} — ${b.description}. Keep it punchy. ${cta}.`,
  Instagram: (t, b) => `${t}\n\n${b.description}. Save this for later and tap to learn more.`,
  TikTok: (t) => `Hook: ${t}. On-screen caption only — script + voiceover are added by your editor.`,
  YouTube: (t, b) => `${t}\n\nDescription: ${b.description}. Chapters + links go here. Upload the video manually.`,
  Reddit: (t, b) => `${t}\n\nBody: honest, no-hype writeup for the community. ${b.description}.`,
  Facebook: (t, b) => `${t} — ${b.description}. Friendly, conversational tone for the Page audience.`,
}

/** 复刻前端 store 的 buildVariant：单平台一条定制 PostVariant。 */
export function buildStubVariant(platform: Platform, topic: string, brand: BrandContext): PostVariant {
  const mode = platformPublishMode(platform)
  const d = PLATFORM_VARIANT_DEFAULTS[platform]
  const safeTopic = topic || "New social topic"
  // 前端默认 profile 的 defaultCta 非空，实际渲染即回退值；这里对可选字段统一回退，保证输出与原型一致、无 "undefined"。
  const cta = brand.defaultCta || "Start your free trial"
  return {
    platform,
    // 账号身份留空：生成层不知道用户连了哪些账号，绝不编造（曾经这里填 "@northstar_ai" 这类假名）。
    // 前端 store 收到变体后用真实已连接账号回填（resolveVariantAccount）。
    account: "",
    accountType: undefined,
    hook: safeTopic,
    body: COPY_BODY[platform](safeTopic, brand, cta),
    hashtags: brand.hashtags ?? "",
    cta,
    ctaUrl: brand.productUrl || brand.websiteUrl || "",
    format: d.format,
    mediaAsset: d.media,
    publishMode: mode,
    // 非 auto 平台 = 该平台不支持自动发布（历史上的手动兜底状态已整套移除）。
    state: mode === "manual" ? "Unsupported" : "Valid",
    suggestedTime: "10:00",
  }
}

// 7 天计划模板（复刻 apps/web data/mock 的 planTemplate；确定性静态数据，id 运行期生成）。
const PLAN_TEMPLATE: Omit<PlanItem, "id" | "status">[] = [
  { date: "Mon Jul 6", time: "09:00", topic: "Why small teams waste 6 hours a week on busywork", pillar: "Product education", goal: "Grow awareness", platforms: ["X", "Reddit"], assetType: "Text + image", cta: "Start your free trial" },
  { date: "Tue Jul 7", time: "11:30", topic: "3 Northstar workflows that save founders a full day", pillar: "How-to", goal: "Drive trial", platforms: ["Instagram", "X"], assetType: "Carousel cover", cta: "Try it free" },
  { date: "Wed Jul 8", time: "14:00", topic: "Founder story: building Northstar with a 4-person team", pillar: "Founder story", goal: "Get followers", platforms: ["X", "YouTube"], assetType: "Thumbnail + copy", cta: "Follow the journey" },
  { date: "Thu Jul 9", time: "10:00", topic: "Customer spotlight: how Acme cut reporting time by 70%", pillar: "Social proof", goal: "Drive trial", platforms: ["Instagram", "Reddit"], assetType: "Quote image", cta: "Start your free trial" },
  { date: "Fri Jul 10", time: "16:00", topic: "Launch week: what's new in Northstar 2.0", pillar: "Launch", goal: "Launch campaign", platforms: ["X", "Instagram", "YouTube"], assetType: "Cover image + copy", cta: "See what's new" },
  { date: "Sat Jul 11", time: "12:00", topic: "AMA recap: your top 5 questions about AI productivity", pillar: "Community", goal: "Get followers", platforms: ["Reddit", "X"], assetType: "Text", cta: "Join the next AMA" },
  { date: "Sun Jul 12", time: "18:00", topic: "Behind the scenes: how we design Northstar features", pillar: "Behind the scenes", goal: "Grow awareness", platforms: ["Instagram", "YouTube"], assetType: "Cover image", cta: "Follow for more" },
]

// 运营推荐模板（复刻 apps/web data/mock 的 opsRecommendations，id 运行期生成）。
const RECOMMENDATIONS_TEMPLATE: Omit<Recommendation, "id">[] = [
  { title: "Shift X posts to 9–10am PT", detail: "Your top 3 X posts published before 10am drove 38% more impressions than afternoon posts.", impact: "High" },
  { title: "Double down on customer proof", detail: "Social-proof posts outperformed product-education posts by 1.9x on engagement this week.", impact: "High" },
  { title: "Reconnect Instagram", detail: "Instagram auto publishing is paused due to an expired token, forcing manual fallbacks.", impact: "Medium" },
  { title: "Add a second weekly Reddit post", detail: "Reddit has your highest engagement rate but the lowest posting frequency.", impact: "Low" },
]

// 从 format 里抽比例（"Landscape 16:9" → "16:9"，"Feed 1:1" → "1:1"，"Landscape 1.91:1" → "1.91:1"）。默认 1:1。
function ratioFromFormat(format: string): string {
  const m = format.match(/(\d+(?:\.\d+)?:\d+(?:\.\d+)?)/)
  return m ? m[1] : "1:1"
}

// 确定性占位图：内联 SVG data URI（无随机、无网络、自包含），标出平台/比例/hook，供 UI 直接渲染占位。
function placeholderImage(platform: Platform, ratio: string, hook: string): string {
  const label = hook.slice(0, 40).replace(/[<>&]/g, " ")
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360">` +
    `<rect width="640" height="360" fill="#111111"/>` +
    `<text x="32" y="160" fill="#7C5CFC" font-family="sans-serif" font-size="28">${platform} · ${ratio}</text>` +
    `<text x="32" y="210" fill="#F5F5F5" font-family="sans-serif" font-size="20">${label}</text>` +
    `<text x="32" y="330" fill="#888888" font-family="sans-serif" font-size="16">placeholder — stub generator</text>` +
    `</svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

export class StubContentGenerator implements ContentGenerator {
  readonly kind = "stub" as const

  async generateVariants(input: GenerateVariantsInput): Promise<GenerateVariantsOutput> {
    if (!input.platforms || input.platforms.length === 0) {
      throw new GeneratorError("content_invalid", "generateVariants 需要至少一个平台")
    }
    // N 平台 → N 条定制变体（每条复刻前端 buildVariant 的逐平台定制）。
    const wantsImage = (input.modes ?? []).includes("image")
    const variants = input.platforms.map((p) => {
      const v = buildStubVariant(p, input.topic, input.brand)
      if (!wantsImage) return v
      // 桩：加 1 张配图槽，正文追加对应 [[img:1]] 标记（离线也能驱动占位 UI，形状与 llm.ts 解析结果一致）。
      const ratio = ratioFromFormat(v.format)
      return {
        ...v,
        body: insertImageToken(v.body, 1),
        imageSlots: [{ ref: 1, description: `${input.topic || "post"} — hero image`, ratio, status: "empty" as const }],
      }
    })
    return { variants }
  }

  async generatePlan(_input: GeneratePlanInput): Promise<GeneratePlanOutput> {
    // 复刻前端：7 条 Planned 计划项，id 运行期派生（确定性内容 + 唯一 id）。
    const items: PlanItem[] = PLAN_TEMPLATE.map((t) => ({ ...t, id: randomUUID(), status: "Planned" }))
    return { items }
  }

  async generateImage(input: GenerateImageInput): Promise<GenerateImageOutput> {
    const ratio = ratioFromFormat(input.format)
    // 有槽描述（description）优先作占位图标签——与 llm.ts 出图 prompt 的取值优先级保持一致。
    const label = input.description || input.hook || input.body || "post"
    return {
      assetUrl: placeholderImage(input.platform, ratio, label),
      mimeType: "image/svg+xml",
      ratio,
    }
  }

  async generateRecommendations(
    _input: GenerateRecommendationsInput,
  ): Promise<GenerateRecommendationsOutput> {
    const recommendations: Recommendation[] = RECOMMENDATIONS_TEMPLATE.map((r) => ({ ...r, id: randomUUID() }))
    return { recommendations }
  }

  async generateProfileDraft(input: GenerateProfileDraftInput): Promise<GenerateProfileDraftOutput> {
    // 复刻前端 generateProfileDraft：只补缺失字段，不覆盖已填（spec §8）。patch 仅含新补字段。
    const b = input.brand
    const patch: Partial<BrandContext> = {}
    const base = input.websiteUrl.replace(/\/+$/, "")
    if (!b.productUrl) patch.productUrl = base ? `${base}/product` : "https://northstar.ai/product"
    if (!b.targetAudience) patch.targetAudience = "startup founders, indie makers, marketing leads"
    if (!b.tone) patch.tone = "clear, helpful, slightly bold"
    if (!b.defaultCta) patch.defaultCta = "Start your free trial"
    if (!b.hashtags) patch.hashtags = "#AIProductivity #StartupTools"
    if (!b.visualStyle) patch.visualStyle = "Clean, modern, high-contrast product shots"
    if (!b.brandColors) patch.brandColors = "#7C5CFC, #111111, #F5F5F5"
    return { patch }
  }
}
