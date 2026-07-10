// 账号连接（OAuth）路由。
// 铁律：不保存用户社媒账号密码；连接只经 OAuth 授权（spec §1）。
//
// X 走「授权码 + PKCE」，用 paste-back 完成（后端跑在远程，用户浏览器打不开服务器 127.0.0.1）：
//   ① POST /x/authorize-url  → 生成授权链接 + state，暂存 state→codeVerifier，返回 { authorizeUrl, state }
//   ② 用户在自己浏览器打开链接、授权 → X 跳到已注册回调（页面打不开是正常的）→ 复制地址栏完整 URL
//   ③ POST /x/callback { redirectUrl } → 解析 code、校验 state、换 token、拉账号信息、upsert 连接账号落库
//   ④ POST /x/:accountId/disconnect → 清 token、状态置 NotConnected（用户随时收回授权）
// 换 token / 续期 / 发帖等最难的逻辑全在 @social/publisher，这里只做「HTTP ↔ 领域」的编排。

import { Hono } from "hono"
import type { Platform } from "@social/shared"
import { PLATFORM_CAPABILITIES } from "@social/shared"
import { XOAuthError, getMe } from "@social/publisher"
import type { AppEnv } from "../auth"
import { currentWorkspace } from "./helpers"
import { getXApp, pendingAuthStore } from "../services/x-auth"

export const connectionRoutes = new Hono<AppEnv>()

// 各自动发布平台连接所需的 OAuth scope（真实事实、无需密钥即可给前端展示「连接需要哪些权限」）。
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

// POST /api/connections/x/authorize-url —— 第①步：生成授权链接。
connectionRoutes.post("/x/authorize-url", async (c) => {
  const { workspace } = await currentWorkspace(c)
  if (!workspace) return c.json({ error: "not_found", message: "先创建工作区" }, 404)

  const xapp = getXApp()
  if (!xapp) {
    return c.json(
      { error: "not_configured", message: "X OAuth 未接通：请在后端配置 X_CLIENT_ID / X_CLIENT_SECRET / X_REDIRECT_URI" },
      501,
    )
  }

  const { url, state, codeVerifier } = xapp.startAuthorization()
  // codeVerifier 只存后端，绝不下发前端。
  pendingAuthStore.put(state, codeVerifier, workspace.id)
  return c.json({ authorizeUrl: url, state })
})

// POST /api/connections/x/callback —— 第③步：paste-back 换 token 并落库。body: { redirectUrl }
connectionRoutes.post("/x/callback", async (c) => {
  const { workspace, repos } = await currentWorkspace(c)
  if (!workspace) return c.json({ error: "not_found", message: "先创建工作区" }, 404)

  const xapp = getXApp()
  if (!xapp) return c.json({ error: "not_configured", message: "X OAuth 未接通" }, 501)

  const body = await c.req.json<{ redirectUrl?: string }>().catch(() => null)
  const redirectUrl = body?.redirectUrl?.trim()
  if (!redirectUrl) {
    return c.json({ error: "invalid_request", message: "请粘贴授权后浏览器跳转的完整回调 URL（redirectUrl）" }, 400)
  }

  // 从粘回的 URL 取 state 定位本次授权会话（pending 里存着对应的 codeVerifier）。
  let returnedState: string | null = null
  try {
    returnedState = new URL(redirectUrl).searchParams.get("state")
  } catch {
    return c.json({ error: "invalid_request", message: "redirectUrl 不是合法 URL" }, 400)
  }
  if (!returnedState) {
    return c.json({ error: "invalid_request", message: "回调 URL 里缺少 state，请确认粘贴的是跳转后的完整地址" }, 400)
  }

  const pending = pendingAuthStore.take(returnedState)
  if (!pending) {
    return c.json({ error: "invalid_state", message: "授权会话已过期或无效（10 分钟内有效），请重新发起连接" }, 400)
  }
  if (pending.workspaceId !== workspace.id) {
    return c.json({ error: "forbidden", message: "授权会话与当前工作区不匹配" }, 403)
  }

  try {
    // finishAuthorization 内部会再核对 state（== returnedState）并换 token。
    const token = await xapp.finishAuthorization({
      code: redirectUrl,
      codeVerifier: pending.codeVerifier,
      expectedState: returnedState,
    })
    // 确认到底授权到了哪个账号（拿 x_user_id + @username）。
    const me = await getMe(token.access_token, xapp.config.fetchImpl)
    if (!me?.id) {
      return c.json({ error: "provider_error", message: "换到 token 但拉不到账号信息（/2/users/me 失败）" }, 502)
    }

    const tokenExpiresAt = Math.floor(Date.now() / 1000) + (token.expires_in ?? 7200)
    const account = await repos.accounts.upsertConnectedAccount(workspace.id, {
      platform: "X",
      externalAccountId: me.id,
      username: me.username ?? null,
      displayName: me.username ? `@${me.username}` : me.name ?? me.id,
      url: me.username ? `https://x.com/${me.username}` : null,
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? null,
      scope: token.scope ?? null,
      tokenExpiresAt,
    })
    return c.json({ account, username: me.username ?? null })
  } catch (err) {
    if (err instanceof XOAuthError) {
      // 用户拒绝 / state 不匹配 / 授权码失效 → 400；上游 token 端点失败 → 502。
      const status = err.status && err.status < 500 ? 400 : 502
      return c.json({ error: "oauth_failed", message: err.message }, status)
    }
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: "internal_error", message: `X 授权失败: ${message}` }, 500)
  }
})

// POST /api/connections/x/:accountId/disconnect —— 断开连接：清 token、状态置 NotConnected。
connectionRoutes.post("/x/:accountId/disconnect", async (c) => {
  const { workspace, repos } = await currentWorkspace(c)
  if (!workspace) return c.json({ error: "not_found", message: "先创建工作区" }, 404)
  const accountId = c.req.param("accountId")

  // 归属校验：token 快照里带 workspaceId，防跨工作区解绑他人账号。
  const snap = await repos.accounts.getTokens(accountId)
  if (!snap || snap.workspaceId !== workspace.id) {
    return c.json({ error: "not_found", message: "账号不存在或不属于当前工作区" }, 404)
  }
  await repos.accounts.clearTokens(accountId)
  return c.json({ ok: true })
})
