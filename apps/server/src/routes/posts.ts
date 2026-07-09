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

postRoutes.patch("/:id", async (c) => {
  const { repos } = getContainer()
  const patch = await c.req.json<Record<string, unknown>>().catch(() => ({}))
  await repos.posts.update(c.req.param("id"), patch)
  const post = await repos.posts.getById(c.req.param("id"))
  return c.json({ post })
})
