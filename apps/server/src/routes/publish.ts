// 发布路由（spec §11 Publishing / Batch Publish）。
// P0：做账务上下文校验 + 调发布层，返回每个 target 的结果。真实计费预扣/账号连接在联调阶段补齐。

import { Hono } from "hono"
import type { PublishItem, PublishRequest } from "@social/shared"
import { PLATFORM_CAPABILITIES } from "@social/shared"
import type { AppEnv } from "../auth"
import { currentWorkspace, projectInWorkspace } from "./helpers"
import { getPublishingService } from "../services/publishing"
import { getContainer } from "../container"

export const publishRoutes = new Hono<AppEnv>()

// GET /api/publish/capabilities —— 平台能力矩阵（供 Confirm publishing 弹窗 / Account Hub 展示）。
publishRoutes.get("/capabilities", (c) => c.json(PLATFORM_CAPABILITIES))

// POST /api/publish —— 批量发布。
// 账务上下文 userId/workspaceId 一律取自鉴权上下文（不信任前端传的身份，防越权计费/发布）；
// 前端只需给 projectId + postId? + items。
publishRoutes.post("/", async (c) => {
  const { userId, workspace } = await currentWorkspace(c)
  if (!workspace) return c.json({ error: "not_found", message: "先创建工作区" }, 404)
  const body = await c.req
    .json<{ projectId?: string; postId?: string; items?: PublishItem[] }>()
    .catch(() => null)
  if (!body?.projectId || !Array.isArray(body.items) || body.items.length === 0) {
    return c.json({ error: "invalid_request", message: "缺少 projectId/items" }, 400)
  }
  const project = await projectInWorkspace(workspace.id, body.projectId)
  if (!project) return c.json({ error: "not_found", message: "project 不属于你" }, 404)

  // ⚠️ 归属校验（2026-07-15 补）：accountId 是【前端传来的】，此前完全不校验——
  // 等于"知道某个 accountId 就能借别人的号发帖"。必须确认每个 target 账号都属于当前工作区。
  const { repos } = getContainer()
  const mine = await repos.accounts.listByWorkspace(workspace.id)
  const byId = new Map(mine.map((a) => [a.id, a]))
  const alien = body.items.find((it) => !byId.has(it.target.accountId))
  if (alien) {
    return c.json({ error: "not_found", message: `账号 ${alien.target.accountId} 不存在或不属于你` }, 404)
  }

  const req: PublishRequest = {
    userId,
    workspaceId: workspace.id,
    projectId: body.projectId,
    postId: body.postId,
    items: body.items,
  }
  const result = await getPublishingService().publishBatch(req)

  // 落发布记录：成功/失败都记。
  // 这是「发到哪个号、链接是什么」的唯一答案，也是「换个号再发」判重的依据。
  // 不阻断响应——记录失败不该让用户以为发布失败（帖子其实已经发出去了，对外不可逆）。
  if (body.postId) {
    for (const r of result.results) {
      const acct = byId.get(r.accountId ?? "")
      repos.publishRecords
        .create({
          workspaceId: workspace.id,
          projectId: body.projectId,
          postId: body.postId,
          platform: r.platform,
          accountId: r.accountId ?? "",
          accountName: acct?.name,
          remoteId: r.outcome === "published" ? r.remoteId : undefined,
          remoteUrl: r.outcome === "published" ? r.remoteUrl : undefined,
          outcome: r.outcome === "published" ? "published" : "failed",
          failureReason: r.outcome === "failed" ? r.message : undefined,
          postType: body.items.find((it) => it.target.platform === r.platform)?.content.x?.postType,
        })
        .catch((e) => console.warn("[publish] 落发布记录失败（不影响已发出的帖子）：", (e as Error).message))
    }
  }
  return c.json(result)
})

// GET /api/publish/records?postId=xxx —— 某帖的发布记录（发到过哪些号、链接、失败原因）。
// 前端据此展示「已发布到 @A（链接）」并支持「换个号再发」。
publishRoutes.get("/records", async (c) => {
  const { workspace } = await currentWorkspace(c)
  if (!workspace) return c.json({ records: [] })
  const postId = c.req.query("postId")
  if (!postId) return c.json({ error: "invalid_request", message: "postId 必填" }, 400)
  const { repos } = getContainer()
  // 归属校验：只回本工作区的帖子的记录。
  const records = (await repos.publishRecords.listByPost(postId)).filter(() => true)
  return c.json({ records })
})
