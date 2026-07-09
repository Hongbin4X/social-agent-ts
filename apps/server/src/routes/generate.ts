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

// 落一条生成审计，返回 job id
async function recordJob(
  repos: ReturnType<typeof getContainer>["repos"],
  ctx: GenerationContext,
  actionType: keyof typeof CREDIT_COSTS,
  input: unknown,
  result:
    | { ok: true; data: unknown; actualCredits: number; usage?: { model?: string; requestTokens?: number; responseTokens?: number } }
    | { ok: false; code: GenerationErrorCode; message: string },
) {
  const base = {
    workspaceId: ctx.workspaceId,
    projectId: ctx.projectId,
    userId: ctx.userId,
    actionType,
    estimatedCredits: CREDIT_COSTS[actionType],
    inputJson: input,
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
  const body = await c.req.json<{ projectId?: string; platform?: Platform; format?: string; hook?: string; body?: string; mediaAsset?: string; instruction?: string }>().catch(() => null)
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
  }
  const result = await getContainer().generation.runGenerateImage(p.ctx, input)
  const jobId = await recordJob(p.repos, p.ctx, body.instruction ? "modifyImage" : "regenerateImage", input, result)
  if (!result.ok) return c.json({ error: result.code, message: result.message, generationJobId: jobId }, generationHttpStatus(result.code))
  // 持久化媒体资源引用（字节落盘留待真实图片模型接入时在此 put 到 MediaStorage）
  const asset = await p.repos.media.create(p.ctx.projectId, p.ctx.workspaceId, {
    kind: "image",
    url: result.data.assetUrl,
    mimeType: result.data.mimeType,
    ratio: result.data.ratio,
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
