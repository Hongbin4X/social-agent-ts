// 项目/品牌档案路由 + 项目级资源读取（隔离锚点）。
import { type Context, Hono } from "hono"
import type { ContentGoal, Platform, PostStatus } from "@social/shared"
import type { AppEnv } from "../auth"
import { currentWorkspace, projectInWorkspace } from "./helpers"
import { getContainer } from "../container"

export const projectRoutes = new Hono<AppEnv>()

// 当前工作区下的所有 project
projectRoutes.get("/", async (c) => {
  const { workspace, repos } = await currentWorkspace(c)
  if (!workspace) return c.json({ projects: [] })
  return c.json({ projects: await repos.projects.listByWorkspace(workspace.id) })
})

// 新建 project（多品牌档案）
projectRoutes.post("/", async (c) => {
  const { workspace, repos } = await currentWorkspace(c)
  if (!workspace) return c.json({ error: "not_found", message: "先创建工作区" }, 404)
  const body = await c.req.json<{
    brandName?: string
    description?: string
    targetMarket?: string
    platforms?: Platform[]
    primaryGoal?: ContentGoal
    websiteUrl?: string
    tone?: string
  }>().catch(() => null)
  if (!body?.brandName?.trim()) return c.json({ error: "invalid_request", message: "brandName 必填" }, 400)
  const project = await repos.projects.create(workspace.id, {
    brandName: body.brandName.trim(),
    description: body.description ?? "",
    targetMarket: body.targetMarket ?? "US",
    platforms: body.platforms ?? [],
    primaryGoal: body.primaryGoal ?? "Grow awareness",
    websiteUrl: body.websiteUrl ?? "",
    tone: body.tone ?? "",
    contentGoals: body.primaryGoal ? [body.primaryGoal] : [],
  })
  return c.json({ project }, 201)
})

// helper：校验并取 :id project
async function requireProject(c: Context<AppEnv>) {
  const { workspace } = await currentWorkspace(c)
  if (!workspace) return { error: c.json({ error: "not_found", message: "工作区不存在" }, 404) } as const
  const projectId = c.req.param("id")
  if (!projectId) return { error: c.json({ error: "invalid_request", message: "缺少 project id" }, 400) } as const
  const project = await projectInWorkspace(workspace.id, projectId)
  if (!project) return { error: c.json({ error: "not_found", message: "project 不存在或不属于你" }, 404) } as const
  return { workspace, project } as const
}

projectRoutes.get("/:id", async (c) => {
  const r = await requireProject(c)
  if ("error" in r) return r.error
  return c.json({ project: r.project })
})

projectRoutes.patch("/:id", async (c) => {
  const r = await requireProject(c)
  if ("error" in r) return r.error
  const patch = await c.req.json<Record<string, unknown>>().catch(() => ({}))
  const { repos } = getContainer()
  const project = await repos.projects.update(r.project.id, patch)
  return c.json({ project })
})

projectRoutes.get("/:id/brand-profile", async (c) => {
  const r = await requireProject(c)
  if ("error" in r) return r.error
  const { repos } = getContainer()
  return c.json({ brandProfile: await repos.projects.getBrandProfile(r.project.id) })
})

projectRoutes.patch("/:id/brand-profile", async (c) => {
  const r = await requireProject(c)
  if ("error" in r) return r.error
  const patch = await c.req.json<Record<string, unknown>>().catch(() => ({}))
  const { repos } = getContainer()
  await repos.projects.updateBrandProfile(r.project.id, patch)
  return c.json({ brandProfile: await repos.projects.getBrandProfile(r.project.id) })
})

// 项目级资源读取（隔离：只返回该 project 的）
projectRoutes.get("/:id/posts", async (c) => {
  const r = await requireProject(c)
  if ("error" in r) return r.error
  const status = c.req.query("status") as PostStatus | undefined
  const { repos } = getContainer()
  return c.json({ posts: await repos.posts.listByProject(r.project.id, status ? { status } : undefined) })
})

projectRoutes.get("/:id/plans", async (c) => {
  const r = await requireProject(c)
  if ("error" in r) return r.error
  const { repos } = getContainer()
  return c.json({ planItems: await repos.plans.listItemsByProject(r.project.id) })
})

projectRoutes.get("/:id/calendar", async (c) => {
  const r = await requireProject(c)
  if ("error" in r) return r.error
  const { repos } = getContainer()
  return c.json({ calendar: await repos.calendar.listByProject(r.project.id) })
})
