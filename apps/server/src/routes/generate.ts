// 生成路由（本次要跑通的主链路）：品牌上下文 + 主题 + 平台 → 每平台定制变体 → 落生成审计。
// 计费三段式由 GenerationService 内部走（本地账本）；这里负责组装上下文 + 持久化审计 + 媒体落盘。
import { type Context, Hono } from "hono"
import { CREDIT_COSTS, type ContentGoal, type GenerationErrorCode, type Platform } from "@social/shared"
import type { GenerationContext } from "@social/agent"
import type { AppEnv } from "../auth"
import { currentWorkspace, generationHttpStatus, projectInWorkspace, toBrandContext } from "./helpers"
import { getContainer } from "../container"

export const generateRoutes = new Hono<AppEnv>()

// 组装 { ctx, brand }，失败返回 error response
async function prepare(c: Context<AppEnv>, projectId?: string) {
  const { userId, workspace, repos } = await currentWorkspace(c)
  if (!workspace) return { error: c.json({ error: "not_found", message: "先创建工作区" }, 404) } as const
  if (!projectId) return { error: c.json({ error: "invalid_request", message: "projectId 必填" }, 400) } as const
  const project = await projectInWorkspace(workspace.id, projectId)
  if (!project) return { error: c.json({ error: "not_found", message: "project 不存在或不属于你" }, 404) } as const
  const bp = await repos.projects.getBrandProfile(projectId)
  if (!bp) return { error: c.json({ error: "not_found", message: "品牌档案不存在" }, 404) } as const
  const ctx: GenerationContext = { userId, workspaceId: workspace.id, projectId }
  return { ctx, brand: toBrandContext(bp), repos } as const
}

// 落一条生成审计，返回 job id。
// 导出仅为单测可达（record-job.test.ts 直接喂假 repos 校验 billingRecordId 血缘）；路由内部使用不变。
export async function recordJob(
  repos: ReturnType<typeof getContainer>["repos"],
  ctx: GenerationContext,
  actionType: keyof typeof CREDIT_COSTS,
  input: unknown,
  result:
    | { ok: true; data: unknown; reservationId?: string; actualCredits: number; usage?: { model?: string; requestTokens?: number; responseTokens?: number } }
    | { ok: false; code: GenerationErrorCode; message: string; reservationId?: string },
) {
  const base = {
    workspaceId: ctx.workspaceId,
    projectId: ctx.projectId,
    userId: ctx.userId,
    actionType,
    estimatedCredits: CREDIT_COSTS[actionType],
    inputJson: input,
    // 计费血缘：把本次生成的计费流水 id（GenerationResult.reservationId = ssa_billing_usage_record.id）
    // 回填到 job.billingRecordId。成功/失败都写——失败已退款，但仍要留「哪次生成对应哪条计费」的审计链。
    billingRecordId: result.reservationId,
  }
  if (result.ok) {
    const { id } = await repos.generationJobs.create({
      ...base,
      status: "succeeded",
      outputJson: result.data,
      actualCredits: result.actualCredits,
      model: result.usage?.model,
      requestTokens: result.usage?.requestTokens,
      responseTokens: result.usage?.responseTokens,
    })
    return id
  }
  const { id } = await repos.generationJobs.create({
    ...base,
    status: "failed",
    errorCode: result.code,
    errorMessage: result.message,
  })
  return id
}

// ── 生成平台变体（核心）──
generateRoutes.post("/variants", async (c) => {
  const body = await c.req.json<{ projectId?: string; topic?: string; platforms?: Platform[]; modes?: Array<"copy" | "image" | "video"> }>().catch(() => null)
  const p = await prepare(c, body?.projectId)
  if ("error" in p) return p.error
  if (!body?.topic?.trim() || !Array.isArray(body.platforms) || body.platforms.length === 0) {
    return c.json({ error: "invalid_request", message: "topic 与 platforms 必填（platforms 非空）" }, 400)
  }
  const input = { topic: body.topic.trim(), platforms: body.platforms, brand: p.brand, modes: body.modes }
  const result = await getContainer().generation.runGenerateVariants(p.ctx, input)
  const jobId = await recordJob(p.repos, p.ctx, "generateVariants", input, result)
  if (!result.ok) return c.json({ error: result.code, message: result.message, generationJobId: jobId }, generationHttpStatus(result.code))
  return c.json({ variants: result.data.variants, credits: result.actualCredits, generationJobId: jobId })
})

// ── 7 天计划 ──
generateRoutes.post("/plan", async (c) => {
  const body = await c.req.json<{ projectId?: string; planName?: string; primaryGoal?: ContentGoal; topicTheme?: string; platforms?: Platform[] }>().catch(() => null)
  const p = await prepare(c, body?.projectId)
  if ("error" in p) return p.error
  const input = {
    planName: body?.planName?.trim() || "7-day plan",
    primaryGoal: body?.primaryGoal ?? ("Grow awareness" as ContentGoal),
    topicTheme: body?.topicTheme,
    platforms: body?.platforms ?? [],
    brand: p.brand,
  }
  const result = await getContainer().generation.runGeneratePlan(p.ctx, input)
  const jobId = await recordJob(p.repos, p.ctx, "generatePlan", input, result)
  if (!result.ok) return c.json({ error: result.code, message: result.message, generationJobId: jobId }, generationHttpStatus(result.code))
  // 持久化计划 + items
  const saved = await p.repos.plans.create(
    p.ctx.projectId,
    p.ctx.workspaceId,
    { planName: input.planName, primaryGoal: input.primaryGoal, topicTheme: input.topicTheme },
    result.data.items,
  )
  return c.json({ plan: saved.plan, items: saved.items, credits: result.actualCredits, generationJobId: jobId })
})

// ── 生成/修改图片 ──（instruction 存在=Modify）
generateRoutes.post("/image", async (c) => {
  const body = await c.req.json<{ projectId?: string; platform?: Platform; format?: string; hook?: string; body?: string; mediaAsset?: string; instruction?: string; description?: string }>().catch(() => null)
  const p = await prepare(c, body?.projectId)
  if ("error" in p) return p.error
  if (!body?.platform || !body.format) return c.json({ error: "invalid_request", message: "platform 与 format 必填" }, 400)
  const input = {
    platform: body.platform,
    format: body.format,
    mediaAsset: body.mediaAsset,
    hook: body.hook ?? "",
    body: body.body ?? "",
    brand: p.brand,
    instruction: body.instruction,
    // 图片槽描述：有值时生成层用它作为出图 prompt 主来源（取代 hook+body 拼接），见 GenerateImageInput.description。
    description: body.description,
  }
  const result = await getContainer().generation.runGenerateImage(p.ctx, input)
  const jobId = await recordJob(p.repos, p.ctx, body.instruction ? "modifyImage" : "regenerateImage", input, result)
  if (!result.ok) return c.json({ error: result.code, message: result.message, generationJobId: jobId }, generationHttpStatus(result.code))
  // 持久化媒体：真实图片模型返回 base64 data URI，解码后落到 MediaStorage（本地 FS），DB 只存 url（不存大 data URI）。
  const container = getContainer()
  let url = result.data.assetUrl
  const m = url.match(/^data:(image\/[^;]+);base64,(.+)$/s)
  if (m) {
    const bytes = Buffer.from(m[2], "base64")
    const ext = (m[1].split("/")[1] || "png").split("+")[0]
    const key = `${p.ctx.projectId}/${container.newId("img")}.${ext}`
    const stored = await container.media.put({ key, body: bytes, contentType: m[1] })
    url = stored.url
  }
  // studio 编辑阶段帖子尚未落库，此处媒体行不关联 variantId/postId（真正的图-变体绑定由 image_slots 在存档时持久化）；
  // 这里仅补 prompt=槽描述、model=实际调用模型，做审计与计费血缘留痕。
  const asset = await p.repos.media.create(p.ctx.projectId, p.ctx.workspaceId, {
    kind: "image",
    url,
    mimeType: result.data.mimeType,
    ratio: result.data.ratio,
    prompt: body.description,
    model: result.usage?.model,
  })
  return c.json({ asset, credits: result.actualCredits, generationJobId: jobId })
})

// ── 运营推荐 ──
generateRoutes.post("/recommendations", async (c) => {
  const body = await c.req.json<{ projectId?: string; metricsSummary?: string }>().catch(() => null)
  const p = await prepare(c, body?.projectId)
  if ("error" in p) return p.error
  const input = { brand: p.brand, metricsSummary: body?.metricsSummary }
  const result = await getContainer().generation.runGenerateRecommendations(p.ctx, input)
  const jobId = await recordJob(p.repos, p.ctx, "generateRecommendations", input, result)
  if (!result.ok) return c.json({ error: result.code, message: result.message, generationJobId: jobId }, generationHttpStatus(result.code))
  return c.json({ recommendations: result.data.recommendations, credits: result.actualCredits, generationJobId: jobId })
})

// ── 从 URL 生成品牌档案草稿（只补缺失字段）──
generateRoutes.post("/profile-draft", async (c) => {
  const body = await c.req.json<{ projectId?: string; websiteUrl?: string }>().catch(() => null)
  const p = await prepare(c, body?.projectId)
  if ("error" in p) return p.error
  if (!body?.websiteUrl?.trim()) return c.json({ error: "invalid_request", message: "websiteUrl 必填" }, 400)
  const input = { websiteUrl: body.websiteUrl.trim(), brand: p.brand }
  const result = await getContainer().generation.runGenerateProfileDraft(p.ctx, input)
  const jobId = await recordJob(p.repos, p.ctx, "generateProfileDraft", input, result)
  if (!result.ok) return c.json({ error: result.code, message: result.message, generationJobId: jobId }, generationHttpStatus(result.code))
  return c.json({ patch: result.data.patch, credits: result.actualCredits, generationJobId: jobId })
})
