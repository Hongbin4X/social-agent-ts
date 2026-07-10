// 帖子路由：把生成的变体保存到库（落库）、读回、更新状态。
import { Hono } from "hono"
import type { Platform, PostStatus, PostVariant } from "@social/shared"
import type { AppEnv } from "../auth"
import { currentWorkspace, projectInWorkspace } from "./helpers"
import { getContainer } from "../container"

export const postRoutes = new Hono<AppEnv>()

// 保存一条帖子（含每平台变体）到库
postRoutes.post("/", async (c) => {
  const { workspace, repos } = await currentWorkspace(c)
  if (!workspace) return c.json({ error: "not_found", message: "先创建工作区" }, 404)
  const body = await c.req.json<{
    projectId?: string
    title?: string
    platforms?: Platform[]
    assetType?: string
    status?: PostStatus
    tags?: string[]
    hasImage?: boolean
    variants?: PostVariant[]
  }>().catch(() => null)
  if (!body?.projectId) return c.json({ error: "invalid_request", message: "projectId 必填" }, 400)
  const project = await projectInWorkspace(workspace.id, body.projectId)
  if (!project) return c.json({ error: "not_found", message: "project 不属于你" }, 404)
  const variants = body.variants ?? []
  const post = await repos.posts.create(body.projectId, workspace.id, {
    title: body.title?.trim() || "Untitled topic",
    platforms: body.platforms ?? variants.map((v) => v.platform),
    assetType: body.assetType ?? (body.hasImage ? "Copy + image" : "Copy"),
    status: body.status ?? "Ready",
    tags: body.tags ?? ["studio"],
    owner: "L",
    hasImage: body.hasImage ?? false,
    updatedAt: "Just now",
    variants,
  })
  return c.json({ post }, 201)
})

postRoutes.get("/:id", async (c) => {
  const { repos } = getContainer()
  const post = await repos.posts.getById(c.req.param("id"))
  if (!post) return c.json({ error: "not_found", message: "帖子不存在" }, 404)
  return c.json({ post })
})

// 更新帖子。两类调用:
//   1) 仅改状态(归档/排期/标记已发布等)—— body 只有 status,不带 projectId,保持向后兼容,不强制归属校验。
//   2) 二次修改草稿存回 —— body 带 projectId + variants,则在校验归属后既更新帖子字段、又整替变体。
postRoutes.patch("/:id", async (c) => {
  const { workspace, repos } = await currentWorkspace(c)
  if (!workspace) return c.json({ error: "not_found", message: "先创建工作区" }, 404)
  const id = c.req.param("id")
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({}))
  const { projectId, variants, ...patch } = body as {
    projectId?: string
    variants?: PostVariant[]
    [k: string]: unknown
  }
  // 带 projectId 时校验归属(二次修改必带);越权直接 404。
  if (projectId) {
    const project = await projectInWorkspace(workspace.id, projectId)
    if (!project) return c.json({ error: "not_found", message: "project 不属于你" }, 404)
  }
  await repos.posts.update(id, patch)
  // 只有在拿到 projectId(已校验归属)且显式传了 variants 时才整替，避免误清空变体。
  if (projectId && Array.isArray(variants)) {
    await repos.posts.replaceVariants(id, projectId, variants)
  }
  const post = await repos.posts.getById(id)
  return c.json({ post })
})

// 硬删除帖子(仅用于未发布草稿的删除;前端已限定作用面并二次确认)。
// body 带 projectId 做归属校验 + 项目级删除,双保险防越权删他人帖子。
postRoutes.delete("/:id", async (c) => {
  const { workspace, repos } = await currentWorkspace(c)
  if (!workspace) return c.json({ error: "not_found", message: "先创建工作区" }, 404)
  const id = c.req.param("id")
  const body = (await c.req.json<{ projectId?: string }>().catch(() => ({}))) as { projectId?: string }
  if (!body.projectId) return c.json({ error: "invalid_request", message: "projectId 必填" }, 400)
  const project = await projectInWorkspace(workspace.id, body.projectId)
  if (!project) return c.json({ error: "not_found", message: "project 不属于你" }, 404)
  await repos.posts.delete(id, body.projectId)
  // 级联清理排期：已排期帖子删掉后，它的日历项/子任务必须一并删，否则到点会空发一条不存在的帖子。
  await repos.calendar.deleteByPostId(body.projectId, id)
  return c.json({ ok: true })
})
