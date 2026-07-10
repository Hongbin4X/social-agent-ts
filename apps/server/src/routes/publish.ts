// 发布路由（spec §11 Publishing / Batch Publish）。
// P0：做账务上下文校验 + 调发布层，返回每个 target 的结果。真实计费预扣/账号连接在联调阶段补齐。

import { Hono } from "hono"
import type { PublishItem, PublishRequest } from "@social/shared"
import { PLATFORM_CAPABILITIES } from "@social/shared"
import type { AppEnv } from "../auth"
import { currentWorkspace, projectInWorkspace } from "./helpers"
import { getPublishingService } from "../services/publishing"

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

  const req: PublishRequest = {
    userId,
    workspaceId: workspace.id,
    projectId: body.projectId,
    postId: body.postId,
    items: body.items,
  }
  const result = await getPublishingService().publishBatch(req)
  return c.json(result)
})
