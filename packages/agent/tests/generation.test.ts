// 生成层确定性核心测试：
//   · 桩 generateVariants：平台数=输入平台数、每平台字段正确、确定性；plan/image/recommendations/profile。
//   · GenerationService：reserve→settle 顺序与次数；失败时 refund（不 settle）；错误收敛成 { ok:false }。
//   · LlmContentGenerator：注入 fetch 桩，断言请求命中 /chat/completions、解析 JSON 正确、usage 透传。
// 真实模型调用无 key 无法测，故用注入 fetch 验证「请求构造 + 结果映射 + 计费编排」。

import { describe, expect, it, vi } from "vitest"
import type {
  BrandContext,
  CreditBillingGateway,
  GenerateVariantsInput,
} from "@social/shared"
import {
  DefaultPromptTemplateProvider,
  GenerationService,
  GeneratorError,
  LlmContentGenerator,
  StubContentGenerator,
  type ContentGenerator,
} from "../src"

// —— 测试替身 ——
const BRAND: BrandContext = {
  brandName: "Northstar AI",
  description: "AI productivity assistant for small teams",
  targetMarket: "US",
  targetAudience: "startup founders",
  tone: "clear, helpful, slightly bold",
  defaultCta: "Start your free trial",
  hashtags: "#AIProductivity #StartupTools",
  websiteUrl: "https://northstar.ai",
  productUrl: "https://northstar.ai/product",
}

const CTX = { userId: "u1", workspaceId: "w1", projectId: "p1" }

function makeBilling(): CreditBillingGateway {
  return {
    reserveCredits: vi.fn(async () => ({ reservationId: "res-1", estimatedCredits: 16 })),
    settleCredits: vi.fn(async () => {}),
    refundCredits: vi.fn(async () => {}),
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

/** 把模型 message.content 包成 chat/completions 响应（可带 usage）。 */
function chatResponse(contentObj: unknown, usage?: { prompt_tokens: number; completion_tokens: number }) {
  return jsonResponse({
    choices: [{ message: { content: JSON.stringify(contentObj) } }],
    usage,
  })
}

describe("StubContentGenerator.generateVariants", () => {
  it("N 平台 → N 条变体，每条平台字段正确", async () => {
    const gen = new StubContentGenerator()
    const input: GenerateVariantsInput = { topic: "Launch day", platforms: ["X", "Instagram", "Reddit"], brand: BRAND }
    const { variants } = await gen.generateVariants(input)

    expect(variants).toHaveLength(3)
    expect(variants.map((v) => v.platform)).toEqual(["X", "Instagram", "Reddit"])

    const x = variants.find((v) => v.platform === "X")!
    expect(x.account).toBe("@northstar_ai")
    expect(x.accountType).toBe("connected")
    expect(x.format).toBe("Landscape 16:9")
    expect(x.publishMode).toBe("auto")
    expect(x.state).toBe("Valid")
    expect(x.hook).toBe("Launch day")
    expect(x.hashtags).toBe("#AIProductivity #StartupTools")
    expect(x.cta).toBe("Start your free trial")
    expect(x.ctaUrl).toBe("https://northstar.ai/product")
    expect(x.body).toContain("AI productivity assistant for small teams")
    expect(x.body).toContain("Keep it punchy")

    // Reddit 是手动兜底平台：manual + Manual fallback。
    const reddit = variants.find((v) => v.platform === "Reddit")!
    expect(reddit.publishMode).toBe("manual")
    expect(reddit.state).toBe("Manual fallback")
  })

  it("确定性：同输入两次产出完全一致", async () => {
    const gen = new StubContentGenerator()
    const input: GenerateVariantsInput = { topic: "Same topic", platforms: ["X", "Facebook"], brand: BRAND }
    const a = await gen.generateVariants(input)
    const b = await gen.generateVariants(input)
    expect(a).toEqual(b)
  })

  it("空平台列表 → content_invalid", async () => {
    const gen = new StubContentGenerator()
    await expect(gen.generateVariants({ topic: "x", platforms: [], brand: BRAND })).rejects.toMatchObject({
      code: "content_invalid",
    })
  })
})

describe("StubContentGenerator 其它动作", () => {
  it("generatePlan → 7 条 Planned 计划项", async () => {
    const gen = new StubContentGenerator()
    const { items } = await gen.generatePlan({
      planName: "Launch week",
      primaryGoal: "Drive trial",
      platforms: ["X", "Instagram"],
      brand: BRAND,
    })
    expect(items).toHaveLength(7)
    expect(items.every((i) => i.status === "Planned")).toBe(true)
    expect(new Set(items.map((i) => i.id)).size).toBe(7) // id 唯一
  })

  it("generateImage → 占位图 data URI + 按 format 推比例", async () => {
    const gen = new StubContentGenerator()
    const out = await gen.generateImage({
      platform: "X",
      format: "Landscape 16:9",
      hook: "Big news",
      body: "body",
      brand: BRAND,
    })
    expect(out.ratio).toBe("16:9")
    expect(out.mimeType).toBe("image/svg+xml")
    expect(out.assetUrl.startsWith("data:image/svg+xml,")).toBe(true)
  })

  it("generateRecommendations → 若干条带 impact", async () => {
    const gen = new StubContentGenerator()
    const { recommendations } = await gen.generateRecommendations({ brand: BRAND })
    expect(recommendations.length).toBeGreaterThan(0)
    expect(recommendations[0]).toHaveProperty("impact")
  })

  it("generateProfileDraft → 只补缺失字段，不覆盖已填", async () => {
    const gen = new StubContentGenerator()
    const { patch } = await gen.generateProfileDraft({
      websiteUrl: "https://acme.co",
      brand: { tone: "bold and clear" }, // tone 已填 → 不应出现在 patch
    })
    expect(patch.tone).toBeUndefined()
    expect(patch.targetAudience).toBeTruthy()
    expect(patch.productUrl).toBe("https://acme.co/product") // 从 websiteUrl 派生
  })
})

describe("GenerationService 计费三段式", () => {
  it("成功：reserve → settle（各一次），不 refund；返回 ok + reservationId + actualCredits", async () => {
    const billing = makeBilling()
    const svc = new GenerationService({ generator: new StubContentGenerator(), billing })
    const res = await svc.runGenerateVariants(CTX, { topic: "hi", platforms: ["X"], brand: BRAND })

    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.data.variants).toHaveLength(1)
      expect(res.reservationId).toBe("res-1")
      expect(res.actualCredits).toBe(16) // CREDIT_COSTS.generateVariants
      expect(res.usage).toBeUndefined() // 桩无 token usage
    }
    expect(billing.reserveCredits).toHaveBeenCalledOnce()
    expect(billing.settleCredits).toHaveBeenCalledOnce()
    expect(billing.refundCredits).not.toHaveBeenCalled()
  })

  it("生成抛错：refund（不 settle），错误收敛成 { ok:false, code }", async () => {
    const billing = makeBilling()
    const failing: ContentGenerator = {
      kind: "stub",
      generateVariants: vi.fn(async () => {
        throw new GeneratorError("rate_limited", "boom")
      }),
      generatePlan: vi.fn(),
      generateImage: vi.fn(),
      generateRecommendations: vi.fn(),
      generateProfileDraft: vi.fn(),
    } as unknown as ContentGenerator
    const svc = new GenerationService({ generator: failing, billing })
    const res = await svc.runGenerateVariants(CTX, { topic: "hi", platforms: ["X"], brand: BRAND })

    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.code).toBe("rate_limited")
      expect(res.message).toBe("boom")
      expect(res.reservationId).toBe("res-1")
    }
    expect(billing.reserveCredits).toHaveBeenCalledOnce()
    expect(billing.refundCredits).toHaveBeenCalledOnce()
    expect(billing.settleCredits).not.toHaveBeenCalled()
  })

  it("runGenerateImage：有 instruction 走 modifyImage 计费口径", async () => {
    const billing = makeBilling()
    const svc = new GenerationService({ generator: new StubContentGenerator(), billing })
    await svc.runGenerateImage(CTX, {
      platform: "X",
      format: "16:9",
      hook: "h",
      body: "b",
      brand: BRAND,
      instruction: "make it brighter",
    })
    expect(billing.reserveCredits).toHaveBeenCalledWith(
      expect.objectContaining({ actionType: "modifyImage", estimatedCredits: 20 }),
    )
  })
})

describe("LlmContentGenerator（注入 fetch 桩）", () => {
  function makeLlm(fetchImpl: typeof fetch) {
    return new LlmContentGenerator({
      baseUrl: "https://api.example.com/v1",
      apiKey: "test-key",
      textModel: "test-text-model",
      fetchImpl,
      prompts: new DefaultPromptTemplateProvider(),
    })
  }

  it("generateVariants：命中 /chat/completions、解析 JSON、逐平台并发、usage 累加", async () => {
    const fetchImpl = vi.fn(async () =>
      chatResponse(
        { hook: "AI hook", body: "AI body", hashtags: "#ai", cta: "Try now", format: "Landscape 16:9", mediaAsset: "Generated image" },
        { prompt_tokens: 100, completion_tokens: 40 },
      ),
    ) as unknown as typeof fetch

    const llm = makeLlm(fetchImpl)
    const { variants } = await llm.generateVariants({ topic: "t", platforms: ["X", "Instagram"], brand: BRAND })

    expect(variants).toHaveLength(2)
    const x = variants.find((v) => v.platform === "X")!
    expect(x.hook).toBe("AI hook")
    expect(x.body).toBe("AI body")
    expect(x.cta).toBe("Try now")
    expect(x.account).toBe("@northstar_ai") // 平台派生字段仍来自默认
    expect(x.publishMode).toBe("auto")

    // 两个平台 → 两次 POST，均打到 /chat/completions，带 Bearer 与正确 model。
    const calls = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls
    expect(calls).toHaveLength(2)
    expect(String(calls[0][0])).toContain("/chat/completions")
    const init = calls[0][1] as RequestInit
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer test-key")
    expect(JSON.parse(init.body as string).model).toBe("test-text-model")

    // usage 累加两次调用（100+100 / 40+40）并可 drain。
    const usage = llm.drainUsage()
    expect(usage?.requestTokens).toBe(200)
    expect(usage?.responseTokens).toBe(80)
    expect(llm.drainUsage()).toBeUndefined() // drain 后清空
  })

  it("剥离 ```json 代码围栏后仍能解析", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        choices: [{ message: { content: '```json\n{"hook":"H","body":"B","cta":"C","format":"1:1","hashtags":"","mediaAsset":"m"}\n```' } }],
      }),
    ) as unknown as typeof fetch
    const llm = makeLlm(fetchImpl)
    const { variants } = await llm.generateVariants({ topic: "t", platforms: ["X"], brand: BRAND })
    expect(variants[0].hook).toBe("H")
  })

  it("HTTP 429 → GeneratorError(rate_limited)；service 据此退款并 ok:false", async () => {
    const fetchImpl = vi.fn(async () => new Response("slow down", { status: 429 })) as unknown as typeof fetch
    const billing = makeBilling()
    const svc = new GenerationService({ generator: makeLlm(fetchImpl), billing })
    const res = await svc.runGenerateVariants(CTX, { topic: "t", platforms: ["X"], brand: BRAND })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe("rate_limited")
    expect(billing.refundCredits).toHaveBeenCalledOnce()
  })

  it("generateImage 未配 imageModel → GeneratorNotConfiguredError(not_configured)", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({})) as unknown as typeof fetch
    const llm = makeLlm(fetchImpl) // 无 imageModel
    await expect(
      llm.generateImage({ platform: "X", format: "16:9", hook: "h", body: "b", brand: BRAND }),
    ).rejects.toMatchObject({ code: "not_configured" })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it("缺 baseUrl/apiKey → not_configured（不发请求）", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({})) as unknown as typeof fetch
    const llm = new LlmContentGenerator({
      baseUrl: "",
      apiKey: "",
      textModel: "m",
      fetchImpl,
      prompts: new DefaultPromptTemplateProvider(),
    })
    await expect(
      llm.generateVariants({ topic: "t", platforms: ["X"], brand: BRAND }),
    ).rejects.toMatchObject({ code: "not_configured" })
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
