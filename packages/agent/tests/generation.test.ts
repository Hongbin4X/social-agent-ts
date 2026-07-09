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
  Platform,
} from "@social/shared"
import {
  buildVariantPrompt,
  DefaultPromptTemplateProvider,
  GenerationService,
  GeneratorError,
  GROUNDING_RULES,
  LlmContentGenerator,
  StubContentGenerator,
  VARIANT_SYSTEM_TEMPLATES,
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

describe("Stub image 模式", () => {
  // StubContentGenerator 已在顶层从 "../src" 导入，此处不再重复导入（避免重复声明报错）。
  it("image 模式产出 1 个 slot 且 body 含 [[img:1]]", async () => {
    const gen = new StubContentGenerator()
    const out = await gen.generateVariants({
      topic: "t",
      platforms: ["Instagram"],
      brand: { brandName: "B", description: "d", targetMarket: "US" },
      modes: ["image"],
    })
    const v = out.variants[0]
    expect(v.body).toContain("[[img:1]]")
    expect(v.imageSlots?.[0]).toMatchObject({ ref: 1, status: "empty" })
  })

  it("非 image 模式：无 slot、body 无 token", async () => {
    const gen = new StubContentGenerator()
    const out = await gen.generateVariants({
      topic: "t",
      platforms: ["Instagram"],
      brand: { brandName: "B", description: "d", targetMarket: "US" },
      modes: ["copy"],
    })
    expect(out.variants[0].imageSlots).toBeUndefined()
    expect(out.variants[0].body).not.toContain("[[img:")
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

  it("发出的 system 消息里带上防编造 grounding 约束", async () => {
    const fetchImpl = vi.fn(async () =>
      chatResponse({ hook: "h", body: "b", hashtags: "", cta: "c", format: "Landscape 16:9", mediaAsset: "No media" }),
    ) as unknown as typeof fetch
    const llm = makeLlm(fetchImpl)
    await llm.generateVariants({ topic: "推荐一款自律数码好物，主打无感佩戴", platforms: ["X"], brand: BRAND })
    const init = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit
    const sent = JSON.parse(init.body as string) as { messages: { role: string; content: string }[] }
    const sys = sent.messages.find((m) => m.role === "system")!.content
    expect(sys).toContain("do NOT fabricate")
    expect(sys).toMatch(/placeholder/i)
  })
})

describe("防编造 grounding 约束（buildVariantPrompt）", () => {
  it("system 末尾追加通用防编造约束，且平台人格仍在、主题进 user", () => {
    const input: GenerateVariantsInput = {
      topic: "推荐一款面向职场新人的自律数码好物，主打无感佩戴",
      platforms: ["X"],
      brand: BRAND,
    }
    const { system, user } = buildVariantPrompt("X", input, VARIANT_SYSTEM_TEMPLATES.X)
    expect(system).toContain("You write posts for X") // 平台人格保留
    expect(system).toContain(GROUNDING_RULES) // 防编造底线追加
    expect(system).toContain("do NOT fabricate")
    expect(user).toContain("自律数码好物") // 主题照常进 user
  })

  it("即使平台模板被后台覆盖，grounding 底线依然注入（不可绕过）", () => {
    const overridden = "You are a fully custom brand voice for {{brandName}}."
    const { system } = buildVariantPrompt("X", { topic: "x", platforms: ["X"], brand: BRAND }, overridden)
    expect(system).toContain("You are a fully custom brand voice for Northstar AI.")
    expect(system).toContain(GROUNDING_RULES)
  })
})

describe("LlmContentGenerator imageSlots（image 模式解析 + 出图用 description）", () => {
  // 复用顶层 chatResponse 桩（等价于 brief 里的 fakeFetch，避免重复造轮子）。
  function makeLlm(fetchImpl: typeof fetch) {
    return new LlmContentGenerator({
      baseUrl: "https://api.example.com/v1",
      apiKey: "test-key",
      textModel: "test-text-model",
      fetchImpl,
      prompts: new DefaultPromptTemplateProvider(),
    })
  }
  const brand: BrandContext = { brandName: "B", description: "d", targetMarket: "US" }

  it("image 模式解析 imageSlots，ref/描述保留、status=empty、ratio 从 format 推", async () => {
    const fetchImpl = vi.fn(async () =>
      chatResponse({ hook: "h", body: "b [[img:1]]", imageSlots: [{ ref: 1, description: "latte closeup" }] }),
    ) as unknown as typeof fetch
    const llm = makeLlm(fetchImpl)
    const { variants } = await llm.generateVariants({
      topic: "t",
      platforms: ["Instagram"] as Platform[],
      brand,
      modes: ["copy", "image"],
    })
    expect(variants[0].imageSlots).toEqual([
      { ref: 1, description: "latte closeup", ratio: "1:1", status: "empty" },
    ])
  })

  it("非 image 模式：imageSlots 为 undefined", async () => {
    const fetchImpl = vi.fn(async () => chatResponse({ hook: "h", body: "b" })) as unknown as typeof fetch
    const llm = makeLlm(fetchImpl)
    const { variants } = await llm.generateVariants({
      topic: "t",
      platforms: ["Instagram"] as Platform[],
      brand,
      modes: ["copy"],
    })
    expect(variants[0].imageSlots).toBeUndefined()
  })

  // 归一化的防御逻辑（去重 + 过滤非法 ref）是本任务核心，单独覆盖：
  // 重复 ref 只留首个；ref=0/负数/小数/非整数一律丢弃；存活 ref 沿用模型值不重编号。
  it("imageSlots 归一化：重复 ref 去重、非法 ref 过滤、保留模型 ref", async () => {
    const fetchImpl = vi.fn(async () =>
      chatResponse({
        hook: "h",
        body: "b [[img:2]] [[img:3]]",
        imageSlots: [
          { ref: 2, description: "keep2" },
          { ref: 2, description: "dup-dropped" },
          { ref: 0, description: "bad-zero" },
          { ref: -1, description: "bad-neg" },
          { ref: 1.5, description: "bad-frac" },
          { ref: 3, description: "keep3" },
        ],
      }),
    ) as unknown as typeof fetch
    const llm = makeLlm(fetchImpl)
    const { variants } = await llm.generateVariants({
      topic: "t",
      platforms: ["Instagram"] as Platform[],
      brand,
      modes: ["image"],
    })
    expect(variants[0].imageSlots).toEqual([
      { ref: 2, description: "keep2", ratio: "1:1", status: "empty" },
      { ref: 3, description: "keep3", ratio: "1:1", status: "empty" },
    ])
  })
})

describe("buildVariantPrompt image 模式", () => {
  const base = {
    topic: "morning coffee",
    // 注：brief 原稿写的是 `["Instagram"] as const`，但 GenerateVariantsInput.platforms 是可变的
    // Platform[]，readonly 元组类型不兼容会导致 tsc 报错；改成 `as Platform[]` 保持同样的字面量语义。
    platforms: ["Instagram"] as Platform[],
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
