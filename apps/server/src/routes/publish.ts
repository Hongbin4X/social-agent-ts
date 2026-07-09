// 发布路由（spec §11 Publishing / Batch Publish）。
// P0：做账务上下文校验 + 调发布层，返回每个 target 的结果。真实计费预扣/账号连接在联调阶段补齐。

import { Hono } from "hono"
import type { PublishRequest } from "@social/shared"
import { PLATFORM_CAPABILITIES } from "@social/shared"
import { getPublishingService } from "../services/publishing"

export const publishRoutes = new Hono()

// GET /api/publish/capabilities —— 平台能力矩阵（供 Confirm publishing 弹窗 / Account Hub 展示）。
publishRoutes.get("/capabilities", (c) => c.json(PLATFORM_CAPABILITIES))

// POST /api/publish —— 批量发布。
publishRoutes.post("/", async (c) => {
  const body = await c.req.json<Partial<PublishRequest>>().catch(() => null)
  // spec §4：所有任务必须关联 userId/workspaceId/projectId。缺一律 400，不给默认值蒙混。
  if (
    !body ||
    !body.userId ||
    !body.workspaceId ||
    !body.projectId ||
    !Array.isArray(body.items) ||
    body.items.length === 0
  ) {
    return c.json(
      { error: "invalid_request", message: "缺少 userId/workspaceId/projectId/items（spec §4 账务上下文必填）" },
      400,
    )
  }

  const result = await getPublishingService().publishBatch(body as PublishRequest)
  return c.json(result)
})
