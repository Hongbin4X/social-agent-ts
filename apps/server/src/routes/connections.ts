// 账号连接（OAuth）路由 —— 脚手架。
// 铁律：不保存用户社媒账号密码；连接只经 OAuth / 平台授权（spec §1）。
// 真正的 OAuth 握手需要各平台 client_id / redirect_uri，属联调阶段配置，这里先暴露「要什么」，把授权起始做成显式 501。

import { Hono } from "hono"
import type { Platform } from "@social/shared"
import { PLATFORM_CAPABILITIES } from "@social/shared"

export const connectionRoutes = new Hono()

// 各自动发布平台连接所需的 OAuth scope（真实事实、无需密钥即可给前端展示"连接需要哪些权限"）。
const OAUTH_REQUIREMENTS: Partial<Record<Platform, { flow: string; scopes: string[]; note: string }>> = {
  X: {
    flow: "OAuth2 PKCE",
    scopes: ["tweet.read", "tweet.write", "users.read", "offline.access"],
    note: "offline.access 换 refresh token；发帖按次计费（见成本文档）。",
  },
  Instagram: {
    flow: "Facebook Login (OAuth2)",
    scopes: ["instagram_basic", "instagram_content_publish", "pages_show_list"],
    note: "账号须为 Business/Creator 且绑定一个 FB Page；需 Meta App Review。",
  },
  Facebook: {
    flow: "Facebook Login (OAuth2)",
    scopes: ["pages_show_list", "pages_manage_posts", "pages_read_engagement"],
    note: "对 Page 发帖需 pages_manage_posts；需 Meta App Review。",
  },
}

// GET /api/connections/requirements —— 能力矩阵 + 每平台 OAuth 要求。
connectionRoutes.get("/requirements", (c) =>
  c.json({ capabilities: PLATFORM_CAPABILITIES, oauth: OAUTH_REQUIREMENTS }),
)

// GET /api/connections/:platform/authorize-url —— 生成平台授权跳转 URL。
// 联调 TODO：用 client_id / redirect_uri / PKCE challenge 拼真实 authorize URL，并存 state 防 CSRF。
connectionRoutes.get("/:platform/authorize-url", (c) => {
  const platform = c.req.param("platform")
  return c.json(
    {
      error: "not_configured",
      message: `${platform} 的 OAuth 尚未接通：需先配置 client_id / redirect_uri 再拼授权 URL（联调 TODO）`,
    },
    501,
  )
})
