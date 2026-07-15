// 账号路由：工作区级社媒账号（连接/手动账号）。
import { Hono } from "hono"
import type { AccountStatus, Platform } from "@social/shared"
import type { AppEnv } from "../auth"
import { currentWorkspace } from "./helpers"
import { getContainer } from "../container"

export const accountRoutes = new Hono<AppEnv>()

accountRoutes.get("/", async (c) => {
  const { workspace, repos } = await currentWorkspace(c)
  if (!workspace) return c.json({ accounts: [] })
  return c.json({ accounts: await repos.accounts.listByWorkspace(workspace.id) })
})

// 添加手动账号（export-only）
accountRoutes.post("/", async (c) => {
  const { workspace, repos } = await currentWorkspace(c)
  if (!workspace) return c.json({ error: "not_found", message: "先创建工作区" }, 404)
  const body = await c.req.json<{ platform?: Platform; name?: string; url?: string }>().catch(() => null)
  if (!body?.platform || !body.name?.trim()) return c.json({ error: "invalid_request", message: "platform 与 name 必填" }, 400)
  const account = await repos.accounts.create(workspace.id, {
    platform: body.platform,
    type: "manual",
    name: body.name.trim(),
    url: body.url ?? "",
    status: "UnsupportedPublishing" as AccountStatus,
    capabilities: "Manual export only",
  })
  return c.json({ account }, 201)
})

accountRoutes.patch("/:id", async (c) => {
  const { repos } = getContainer()
  const patch = await c.req.json<Record<string, unknown>>().catch(() => ({}))
  await repos.accounts.update(c.req.param("id"), patch)
  return c.json({ ok: true })
})

// 删除账号（彻底移除该行；不同于「断开连接」——那只清 token、行还留在列表里）。
// ⚠️ 必须校验归属：accountId 是前端传的，不校验就等于「知道 id 就能删别人工作区的账号」。
accountRoutes.delete("/:id", async (c) => {
  const { workspace, repos } = await currentWorkspace(c)
  if (!workspace) return c.json({ error: "not_found", message: "先创建工作区" }, 404)
  const id = c.req.param("id")
  const account = (await repos.accounts.listByWorkspace(workspace.id)).find((a) => a.id === id)
  // 不属于当前工作区 → 一律 404（不回 403：别告诉调用方"这个 id 存在但不是你的"）。
  if (!account) return c.json({ error: "not_found", message: "账号不存在或不属于你" }, 404)
  await repos.accounts.remove(id)
  return c.json({ ok: true })
})
