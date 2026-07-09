// 路由共享辅助。
import type { Context } from "hono"
import type { BrandContext, BrandProfile, GenerationErrorCode } from "@social/shared"
import type { AppEnv } from "../auth"
import { getContainer } from "../container"

/** 取当前登录用户的 workspace（无则 null）。userId 由 auth 中间件放进 context。 */
export async function currentWorkspace(c: Context<AppEnv>) {
  const userId = c.get("userId")
  const { repos } = getContainer()
  const workspace = await repos.workspaces.getByUserId(userId)
  return { userId, workspace, repos }
}

/** 校验 project 属于当前 workspace（隔离前置校验）。返回 project 或 null。 */
export async function projectInWorkspace(workspaceId: string, projectId: string) {
  const { repos } = getContainer()
  // Project 领域类型不含 workspaceId，用 workspace 下的列表判定归属（顺带保证隔离）。
  const projects = await repos.projects.listByWorkspace(workspaceId)
  return projects.find((p) => p.id === projectId) ?? null
}

/** BrandProfile → 喂模型的 BrandContext。 */
export function toBrandContext(p: BrandProfile): BrandContext {
  return {
    brandName: p.brandName,
    description: p.description,
    targetMarket: p.targetMarket,
    targetAudience: p.targetAudience || undefined,
    tone: p.tone || undefined,
    defaultCta: p.defaultCta || undefined,
    hashtags: p.hashtags || undefined,
    websiteUrl: p.websiteUrl || undefined,
    productUrl: p.productUrl || undefined,
    forbiddenTopics: p.forbiddenTopics || undefined,
    visualStyle: p.visualStyle || undefined,
    brandColors: p.brandColors || undefined,
  }
}

/** 生成错误码 → HTTP 状态。 */
export function generationHttpStatus(code: GenerationErrorCode): 400 | 422 | 429 | 501 | 502 {
  switch (code) {
    case "content_invalid":
      return 400
    case "unsupported":
      return 422
    case "rate_limited":
      return 429
    case "not_configured":
      return 501
    case "model_error":
    default:
      return 502
  }
}
