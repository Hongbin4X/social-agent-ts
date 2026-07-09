// 工作区路由：1 用户 1 工作区；首次创建时连带建第一个 project 并设为 active。
import { Hono } from "hono"
import type { ContentGoal, Platform } from "@social/shared"
import type { AppEnv } from "../auth"
import { currentWorkspace, projectInWorkspace } from "./helpers"
import { getContainer } from "../container"

export const workspaceRoutes = new Hono<AppEnv>()

// 当前用户的工作区（无则 data:null，不是错误）
workspaceRoutes.get("/", async (c) => {
  const { workspace } = await currentWorkspace(c)
  return c.json({ workspace: workspace ?? null })
})

// 创建工作区 + 第一个 project
workspaceRoutes.post("/", async (c) => {
  const userId = c.get("userId")
  const { repos } = getContainer()
  const body = await c.req.json<{
    name?: string
    brandName?: string
    description?: string
    targetMarket?: string
    platforms?: Platform[]
    primaryGoal?: ContentGoal
    websiteUrl?: string
    tone?: string
  }>().catch(() => null)
  if (!body || !body.name?.trim()) {
    return c.json({ error: "invalid_request", message: "workspace name 必填" }, 400)
  }
  const existing = await repos.workspaces.getByUserId(userId)
  if (existing) return c.json({ error: "conflict", message: "该用户已有工作区（1 用户 1 工作区）" }, 409)

  const workspace = await repos.workspaces.create({ userId, name: body.name.trim() })
  const project = await repos.projects.create(workspace.id, {
    brandName: body.brandName || body.name.trim(),
    description: body.description ?? "",
    targetMarket: body.targetMarket ?? "US",
    platforms: body.platforms ?? [],
    primaryGoal: body.primaryGoal ?? "Grow awareness",
    websiteUrl: body.websiteUrl ?? "",
    tone: body.tone ?? "",
    contentGoals: body.primaryGoal ? [body.primaryGoal] : [],
  })
  await repos.workspaces.setActiveProject(workspace.id, project.id)
  return c.json({ workspace: { ...workspace, activeProjectId: project.id }, project }, 201)
})

// 切换 active project
workspaceRoutes.post("/active-project", async (c) => {
  const { workspace } = await currentWorkspace(c)
  if (!workspace) return c.json({ error: "not_found", message: "工作区不存在" }, 404)
  const body = await c.req.json<{ projectId?: string }>().catch(() => null)
  if (!body?.projectId) return c.json({ error: "invalid_request", message: "projectId 必填" }, 400)
  const project = await projectInWorkspace(workspace.id, body.projectId)
  if (!project) return c.json({ error: "not_found", message: "project 不属于该工作区" }, 404)
  const { repos } = getContainer()
  await repos.workspaces.setActiveProject(workspace.id, project.id)
  return c.json({ ok: true, activeProjectId: project.id })
})
