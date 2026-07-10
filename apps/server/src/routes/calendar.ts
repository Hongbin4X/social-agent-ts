// 日历路由：项目级日历任务（calendar_item）+ 每平台子任务（calendar_job）落库。
// repo 层已有 create/update/updateJobs 能力，这里把写操作暴露成端点，让前端排期/改期/取消/立即发布/转手动都持久化。
import { Hono } from "hono"
import type { CalendarItem, PostStatus } from "@social/shared"
import type { AppEnv } from "../auth"
import { currentWorkspace, projectInWorkspace } from "./helpers"

export const calendarRoutes = new Hono<AppEnv>()

// 单个子任务（= 日历项下每平台的发布任务）形状。
type CalendarJob = CalendarItem["variants"][number]

// 建日历任务（含各平台子任务）——排期 / 加入日历
calendarRoutes.post("/", async (c) => {
  const { workspace, repos } = await currentWorkspace(c)
  if (!workspace) return c.json({ error: "not_found", message: "先创建工作区" }, 404)
  const body = await c.req
    .json<{
      projectId?: string
      postId?: string
      topic?: string
      date?: string
      time?: string
      status?: PostStatus
      variants?: CalendarJob[]
    }>()
    .catch(() => null)
  if (!body?.projectId) return c.json({ error: "invalid_request", message: "projectId 必填" }, 400)
  const project = await projectInWorkspace(workspace.id, body.projectId)
  if (!project) return c.json({ error: "not_found", message: "project 不属于你" }, 404)
  const item = await repos.calendar.create(
    body.projectId,
    workspace.id,
    {
      postId: body.postId || undefined,
      topic: body.topic?.trim() || "Untitled topic",
      date: body.date,
      time: body.time,
      status: body.status ?? "Planned",
    },
    body.variants ?? [],
  )
  return c.json({ item }, 201)
})

// 按 postId 删除该帖子的排期（二次修改已排期帖子时「撤回草稿」用：只清日历，帖子保留）。
calendarRoutes.delete("/by-post/:postId", async (c) => {
  const { workspace, repos } = await currentWorkspace(c)
  if (!workspace) return c.json({ error: "not_found", message: "工作区不存在" }, 404)
  const body = (await c.req.json<{ projectId?: string }>().catch(() => ({}))) as { projectId?: string }
  if (!body.projectId) return c.json({ error: "invalid_request", message: "projectId 必填" }, 400)
  const project = await projectInWorkspace(workspace.id, body.projectId)
  if (!project) return c.json({ error: "not_found", message: "project 不属于你" }, 404)
  await repos.calendar.deleteByPostId(body.projectId, c.req.param("postId"))
  return c.json({ ok: true })
})

// 改日历任务本身（改期 / 取消 / 状态流转）
calendarRoutes.patch("/:id", async (c) => {
  const { workspace, repos } = await currentWorkspace(c)
  if (!workspace) return c.json({ error: "not_found", message: "工作区不存在" }, 404)
  const patch = await c.req.json<Record<string, unknown>>().catch(() => ({}))
  await repos.calendar.update(c.req.param("id"), patch)
  const item = await repos.calendar.getById(c.req.param("id"))
  if (!item) return c.json({ error: "not_found", message: "日历任务不存在" }, 404)
  return c.json({ item })
})

// 改子任务（立即发布自动平台 / 转手动 / 标记手动已发）——按 (calendarItemId, projectId, platform) 定位，带项目级隔离
calendarRoutes.patch("/:id/jobs", async (c) => {
  const { workspace, repos } = await currentWorkspace(c)
  if (!workspace) return c.json({ error: "not_found", message: "工作区不存在" }, 404)
  const body = await c.req
    .json<{ projectId?: string; itemStatus?: PostStatus; jobs?: CalendarJob[] }>()
    .catch(() => null)
  if (!body?.projectId || !Array.isArray(body.jobs)) {
    return c.json({ error: "invalid_request", message: "projectId 与 jobs 必填" }, 400)
  }
  const project = await projectInWorkspace(workspace.id, body.projectId)
  if (!project) return c.json({ error: "not_found", message: "project 不属于你" }, 404)
  await repos.calendar.updateJobs(
    c.req.param("id"),
    body.projectId,
    body.jobs.map((j) => ({
      platform: j.platform,
      account: j.account,
      time: j.time,
      publishMode: j.publishMode,
      status: j.status,
      reason: j.reason,
    })),
  )
  // 顺带更新日历项整体状态（如整条 Published / ManualFallback）
  if (body.itemStatus) await repos.calendar.update(c.req.param("id"), { status: body.itemStatus })
  const item = await repos.calendar.getById(c.req.param("id"))
  if (!item) return c.json({ error: "not_found", message: "日历任务不存在" }, 404)
  return c.json({ item })
})
