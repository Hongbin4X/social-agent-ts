// LlmContentGenerator —— OpenAI 兼容真模型适配器（填 env 即从桩切真 AI）。
//
// 设计（用户 2026-07-09 需求 + 铁律：不引 SDK，直接 fetch OpenAI 兼容端点）：
//   · 文本：POST ${baseUrl}/chat/completions（Authorization: Bearer ${apiKey}），要求模型回结构化 JSON。
//   · 图片：POST ${baseUrl}/images/generations（配了 imageModel 才支持，否则 not_configured）。
//   · 不碰 DB / storage（解耦）；fetch 可注入（fetchImpl）便于测试。
//   · token 用量从 response.usage 累加，经 UsageReporting.drainUsage 透传给 service 回写计费。
//   · 遇问题直接报错、绝不假成功：429→rate_limited、400/422→content_invalid、其它 4xx→model_error、
//     5xx/解析失败→model_error、缺 key/baseUrl/imageModel→not_configured。

import type {
  BrandContext,
  ContentGoal,
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
  GenerationUsage,
  PlanItem,
  Platform,
  PostVariant,
  Recommendation,
} from "@social/shared"
import { platformPublishMode } from "@social/shared"
import type { ContentGenerator, PromptTemplateProvider, UsageReporting } from "../ports"
import { buildVariantPrompt, DefaultPromptTemplateProvider } from "../prompts"
import { GeneratorError, GeneratorNotConfiguredError } from "../errors"
import { PLATFORM_VARIANT_DEFAULTS } from "./stub"

export interface LlmContentGeneratorConfig {
  baseUrl: string
  apiKey: string
  textModel: string
  imageModel?: string
  fetchImpl?: typeof fetch
  prompts: PromptTemplateProvider
}

interface ChatMessage {
  role: "system" | "user" | "assistant"
  content: string
}
interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>
  usage?: { prompt_tokens?: number; completion_tokens?: number }
}

export class LlmContentGenerator implements ContentGenerator, UsageReporting {
  readonly kind = "llm" as const
  private readonly base: string
  private readonly fetchImpl: typeof fetch
  // 内置默认模板兜底：注入的 prompts 未命中某平台（返回 null）时用它。
  private readonly fallbackPrompts = new DefaultPromptTemplateProvider()
  // 累加最近一次 run 的 token 用量；drainUsage 取走并清空（service 在一次生成后立刻 drain）。
  private pendingUsage: GenerationUsage | undefined

  constructor(private readonly config: LlmContentGeneratorConfig) {
    this.base = config.baseUrl.replace(/\/+$/, "")
    this.fetchImpl = config.fetchImpl ?? fetch
  }

  drainUsage(): GenerationUsage | undefined {
    const u = this.pendingUsage
    this.pendingUsage = undefined
    return u
  }

  async generateVariants(input: GenerateVariantsInput): Promise<GenerateVariantsOutput> {
    this.ensureConfigured()
    if (!input.topic || input.topic.trim() === "") {
      throw new GeneratorError("content_invalid", "generateVariants 需要非空 topic")
    }
    if (!input.platforms || input.platforms.length === 0) {
      throw new GeneratorError("content_invalid", "generateVariants 需要至少一个平台")
    }
    this.pendingUsage = undefined
    // 逐平台并发：每平台各取模板、组 messages、独立调用一次 chat/completions。
    const variants = await Promise.all(
      input.platforms.map((platform) => this.generateOneVariant(platform, input)),
    )
    return { variants }
  }

  private async generateOneVariant(
    platform: Platform,
    input: GenerateVariantsInput,
  ): Promise<PostVariant> {
    const template =
      (await this.config.prompts.getTemplate(platform, "generateVariants")) ??
      (await this.fallbackPrompts.getTemplate(platform, "generateVariants")) ??
      ""
    const { system, user } = buildVariantPrompt(platform, input, template)
    const parsed = await this.chatJson<{
      hook?: string
      body?: string
      hashtags?: string
      cta?: string
      format?: string
      mediaAsset?: string
    }>([
      { role: "system", content: system },
      { role: "user", content: user },
    ])

    const d = PLATFORM_VARIANT_DEFAULTS[platform]
    const mode = platformPublishMode(platform)
    const b = input.brand
    // 模型负责内容字段（hook/body/hashtags/cta/format/mediaAsset）；
    // 账号/发布模式/状态/建议时间等由平台规则派生（与桩、前端原型口径一致）。
    return {
      platform,
      account: d.account,
      accountType: d.accountType,
      hook: parsed.hook?.trim() || input.topic,
      body: parsed.body?.trim() || "",
      hashtags: (parsed.hashtags ?? b.hashtags ?? "").trim(),
      cta: parsed.cta?.trim() || b.defaultCta || "Start your free trial",
      ctaUrl: b.productUrl || b.websiteUrl || "",
      format: parsed.format?.trim() || d.format,
      mediaAsset: parsed.mediaAsset?.trim() || d.media,
      publishMode: mode,
      state: mode === "manual" ? "Manual fallback" : "Valid",
      suggestedTime: "10:00",
    }
  }

  async generatePlan(input: GeneratePlanInput): Promise<GeneratePlanOutput> {
    this.ensureConfigured()
    this.pendingUsage = undefined
    const platforms: Platform[] = input.platforms.length > 0 ? input.platforms : ["X"]
    const system =
      "You are a social media strategist. Produce a 7-day content plan as a JSON array of exactly 7 items."
    const user = [
      `Plan name: ${input.planName}`,
      `Primary goal: ${input.primaryGoal}`,
      input.topicTheme ? `Theme: ${input.topicTheme}` : "",
      `Available platforms: ${platforms.join(", ")}`,
      `Brand: ${input.brand.brandName} — ${input.brand.description}`,
      "",
      'Return ONLY a JSON array of 7 objects, each with string fields: "date", "time" (HH:MM),',
      '"topic", "pillar", "assetType", "cta", "goal" (one of the content goals), and',
      '"platforms" (array from the available platforms).',
    ]
      .filter((l) => l !== "")
      .join("\n")

    const arr = await this.chatJson<
      Array<{
        date?: string
        time?: string
        topic?: string
        pillar?: string
        assetType?: string
        cta?: string
        goal?: string
        platforms?: string[]
      }>
    >([
      { role: "system", content: system },
      { role: "user", content: user },
    ])
    if (!Array.isArray(arr)) throw new GeneratorError("model_error", "generatePlan 期望 JSON 数组")

    const items: PlanItem[] = arr.map((raw, i) => ({
      id: `plan_${i + 1}`,
      date: raw.date ?? "",
      time: raw.time ?? "09:00",
      topic: raw.topic ?? "",
      pillar: raw.pillar ?? "",
      goal: (raw.goal as ContentGoal) ?? input.primaryGoal,
      platforms: sanitizePlatforms(raw.platforms, platforms),
      assetType: raw.assetType ?? "Text",
      cta: raw.cta ?? "",
      status: "Planned",
    }))
    return { items }
  }

  async generateImage(input: GenerateImageInput): Promise<GenerateImageOutput> {
    if (!this.config.baseUrl || !this.config.apiKey) {
      throw new GeneratorNotConfiguredError("图片生成未接通：缺 baseUrl/apiKey")
    }
    if (!this.config.imageModel) {
      // 没配图片模型：明确报未接通，绝不假装生成（走 not_configured）。
      throw new GeneratorNotConfiguredError("图片生成未接通：未配置 GENERATION_IMAGE_MODEL")
    }
    const ratio = ratioFromFormat(input.format)
    const prompt = [
      input.instruction ? `Modify the image: ${input.instruction}.` : `Create a social media image.`,
      `Platform: ${input.platform}. Aspect ratio: ${ratio}.`,
      `Post hook: ${input.hook}. Context: ${input.body}.`,
      input.brand.visualStyle ? `Visual style: ${input.brand.visualStyle}.` : "",
      input.brand.brandColors ? `Brand colors: ${input.brand.brandColors}.` : "",
    ]
      .filter((l) => l !== "")
      .join(" ")

    // 网关的 Gemini 图像模型（*-image-preview）走 /chat/completions，图片以 data URI
    // （markdown `![](data:image/...;base64,...)` 或裸 data URI）内联在 message.content，
    // 不走 OpenAI 的 /images/generations（那个会 500 "not supported model for image generation"）。
    this.pendingUsage = undefined
    const res = await this.fetchImpl(`${this.base}/chat/completions`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        model: this.config.imageModel,
        messages: [{ role: "user", content: prompt }],
      }),
    })
    await this.assertOk(res, "generateImage")
    const data = (await res.json()) as ChatCompletionResponse
    if (data.usage) {
      this.pendingUsage = {
        model: this.config.imageModel,
        vendor: "glbgpt",
        requestTokens: data.usage.prompt_tokens ?? 0,
        responseTokens: data.usage.completion_tokens ?? 0,
      }
    }
    const content = data.choices?.[0]?.message?.content ?? ""
    const dataUri = extractImageDataUri(content)
    if (!dataUri) throw new GeneratorError("model_error", `图片模型未返回图片数据: ${content.slice(0, 120)}`)
    const mimeType = dataUri.slice(5, dataUri.indexOf(";")) || "image/png"
    return { assetUrl: dataUri, mimeType, ratio }
  }

  async generateRecommendations(
    input: GenerateRecommendationsInput,
  ): Promise<GenerateRecommendationsOutput> {
    this.ensureConfigured()
    this.pendingUsage = undefined
    const system =
      "You are a social media operations analyst. Suggest concrete, actionable recommendations. Do not change any content or schedule."
    const user = [
      `Brand: ${input.brand.brandName} — ${input.brand.description}`,
      input.metricsSummary ? `Recent metrics: ${input.metricsSummary}` : "",
      "",
      'Return ONLY a JSON array of objects with string fields: "title", "detail", and',
      '"impact" (one of "High", "Medium", "Low").',
    ]
      .filter((l) => l !== "")
      .join("\n")

    const arr = await this.chatJson<
      Array<{ title?: string; detail?: string; impact?: string }>
    >([
      { role: "system", content: system },
      { role: "user", content: user },
    ])
    if (!Array.isArray(arr)) throw new GeneratorError("model_error", "generateRecommendations 期望 JSON 数组")

    const recommendations: Recommendation[] = arr.map((raw, i) => ({
      id: `rec_${i + 1}`,
      title: raw.title ?? "",
      detail: raw.detail ?? "",
      impact: (raw.impact as Recommendation["impact"]) ?? "Medium",
    }))
    return { recommendations }
  }

  async generateProfileDraft(input: GenerateProfileDraftInput): Promise<GenerateProfileDraftOutput> {
    this.ensureConfigured()
    this.pendingUsage = undefined
    // 只补缺失字段（spec §8）：把已填字段告诉模型，要求只回缺的那些。
    const b = input.brand
    const filled = Object.entries(b)
      .filter(([, v]) => typeof v === "string" && v.trim() !== "")
      .map(([k, v]) => `${k}: ${v}`)
    const system =
      "You enrich a brand profile from its website. Only propose values for MISSING fields; never overwrite provided ones."
    const user = [
      `Website: ${input.websiteUrl}`,
      filled.length > 0 ? `Already provided:\n${filled.join("\n")}` : "Nothing provided yet.",
      "",
      "Return ONLY a JSON object containing ONLY the missing fields you can confidently infer, from:",
      "brandName, description, targetMarket, targetAudience, tone, defaultCta, hashtags,",
      "productUrl, forbiddenTopics, visualStyle, brandColors.",
    ]
      .filter((l) => l !== "")
      .join("\n")

    const raw = await this.chatJson<Record<string, unknown>>([
      { role: "system", content: system },
      { role: "user", content: user },
    ])

    // 兜底防覆盖：即使模型多嘴回了已填字段，也只保留真正缺失的（本层不信任模型的边界遵守）。
    const patch: Partial<BrandContext> = {}
    const allowed: (keyof BrandContext)[] = [
      "brandName", "description", "targetMarket", "targetAudience", "tone", "defaultCta",
      "hashtags", "websiteUrl", "productUrl", "forbiddenTopics", "visualStyle", "brandColors",
    ]
    for (const key of allowed) {
      const existing = b[key]
      const proposed = raw?.[key]
      if ((existing === undefined || existing === "") && typeof proposed === "string" && proposed.trim() !== "") {
        patch[key] = proposed
      }
    }
    return { patch }
  }

  // ── 内部：HTTP + 解析 ──

  private ensureConfigured(): void {
    if (!this.config.baseUrl || !this.config.apiKey) {
      throw new GeneratorNotConfiguredError("生成未接通：缺 GLBGPT 模型 baseUrl/apiKey")
    }
  }

  private headers(): Record<string, string> {
    return { authorization: `Bearer ${this.config.apiKey}`, "content-type": "application/json" }
  }

  /** 调 chat/completions，解析出 message.content 里的 JSON，并累加 usage。 */
  private async chatJson<T>(messages: ChatMessage[]): Promise<T> {
    const res = await this.fetchImpl(`${this.base}/chat/completions`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        model: this.config.textModel,
        messages,
        response_format: { type: "json_object" },
      }),
    })
    await this.assertOk(res, "chat/completions")
    const data = (await res.json()) as ChatCompletionResponse
    this.accumulateUsage(data.usage)
    const content = data.choices?.[0]?.message?.content
    if (!content) throw new GeneratorError("model_error", "模型返回缺少 message.content")
    return parseJsonContent<T>(content)
  }

  private accumulateUsage(usage: ChatCompletionResponse["usage"]): void {
    if (!usage) return
    const prev = this.pendingUsage ?? { model: this.config.textModel, vendor: "glbgpt", requestTokens: 0, responseTokens: 0 }
    this.pendingUsage = {
      model: this.config.textModel,
      vendor: "glbgpt",
      requestTokens: (prev.requestTokens ?? 0) + (usage.prompt_tokens ?? 0),
      responseTokens: (prev.responseTokens ?? 0) + (usage.completion_tokens ?? 0),
    }
  }

  /** 统一 HTTP 错误映射（绝不掩盖）。 */
  private async assertOk(res: Response, where: string): Promise<void> {
    if (res.ok) return
    const body = await safeBody(res)
    if (res.status === 429) throw new GeneratorError("rate_limited", `${where} 触发限流（429）: ${body}`)
    if (res.status === 400 || res.status === 422) {
      throw new GeneratorError("content_invalid", `${where} 请求不合法（${res.status}）: ${body}`)
    }
    if (res.status >= 400 && res.status < 500) {
      throw new GeneratorError("model_error", `${where} 上游拒绝（${res.status}）: ${body}`)
    }
    throw new GeneratorError("model_error", `${where} 上游错误（${res.status}）: ${body}`)
  }
}

// ── 纯工具函数 ──

function parseJsonContent<T>(content: string): T {
  // 模型有时会用 ```json ... ``` 包裹或加前后缀；剥掉代码围栏后再解析。
  let text = content.trim()
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) text = fence[1].trim()
  try {
    return JSON.parse(text) as T
  } catch {
    throw new GeneratorError("model_error", `模型返回不是合法 JSON: ${text.slice(0, 200)}`)
  }
}

/** 从 chat 返回的 content 里抽出图片 data URI：优先 markdown ![](data:...)，退化到裸 data URI。 */
function extractImageDataUri(content: string): string | null {
  const md = content.match(/!\[[^\]]*\]\((data:image\/[^)]+)\)/)
  if (md) return md[1]
  const bare = content.match(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/)
  return bare ? bare[0] : null
}

function sanitizePlatforms(raw: string[] | undefined, allowed: Platform[]): Platform[] {
  if (!Array.isArray(raw)) return allowed.slice(0, 1)
  const set = new Set(allowed as string[])
  const picked = raw.filter((p): p is Platform => set.has(p))
  return picked.length > 0 ? picked : allowed.slice(0, 1)
}

function ratioFromFormat(format: string): string {
  const m = format.match(/(\d+(?:\.\d+)?:\d+(?:\.\d+)?)/)
  return m ? m[1] : "1:1"
}

// 把比例粗映射到 OpenAI 图片端点支持的 size（仅粗分横/竖/方）。
function sizeFromRatio(ratio: string): string {
  const [w, h] = ratio.split(":").map(Number)
  if (!w || !h) return "1024x1024"
  if (w > h) return "1792x1024"
  if (h > w) return "1024x1792"
  return "1024x1024"
}

async function safeBody(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 300)
  } catch {
    return "<no body>"
  }
}
