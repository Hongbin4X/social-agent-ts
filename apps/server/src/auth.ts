// 鉴权中间件（AuthGateway 桩）。
//
// 定位：本地开发先跑通，不做 GLBGPT JWT 联调（用户 2026-07-09：暂不关心联调）。
//   - 解析 userId 的顺序：请求头 `x-user-id` > `Authorization` 里的 GLBGPT JWT（真实校验待联调）> DEV_FAKE_USER_ID。
//   - 拿不到 userId → 401，绝不放行匿名（spec §4：所有任务必须关联 userId）。
// 将来联调：把「真实 JWT 校验」实现补在这里（剥离 Bearer、验签、取 sub），中间件签名不变，路由零改动。

import type { Context, MiddlewareHandler } from "hono"

export type AppEnv = { Variables: { userId: string } }

export function authMiddleware(devFakeUserId?: string): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const userId = resolveUserId(c, devFakeUserId)
    if (!userId) {
      return c.json({ error: "unauthorized", message: "缺少用户身份：请带 x-user-id 头，或配置 DEV_FAKE_USER_ID（本地开发）" }, 401)
    }
    c.set("userId", userId)
    await next()
  }
}

function resolveUserId(c: Context, devFakeUserId?: string): string | null {
  const headerUser = c.req.header("x-user-id")
  if (headerUser && headerUser.trim()) return headerUser.trim()

  // TODO(联调): 真实 GLBGPT JWT 校验。约定同 yanfa：Authorization 可带或不带 "Bearer " 前缀。
  // 现在不解析未验签的 JWT（不假装鉴权），本地一律走 devFakeUserId。
  const auth = c.req.header("authorization")
  if (auth && devFakeUserId) return devFakeUserId

  if (devFakeUserId) return devFakeUserId
  return null
}
