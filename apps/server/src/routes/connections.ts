// 账号连接（OAuth）路由。
// 铁律：不保存用户社媒账号密码；连接只经 OAuth 授权（spec §1）。
//
// X 走「授权码 + PKCE」，**真回调重定向流**（用户零复制粘贴）：
//   ① POST /x/authorize-url            → 生成授权链接 + state，暂存 state→{codeVerifier, workspaceId}，返回 { authorizeUrl, state }
//   ② 前端新开窗打开 authorizeUrl → 用户用要授权的账号点 Authorize app
//   ③ X 把浏览器**直接重定向**到 GET /x/callback?code=&state=（公网 https 回调，见 nginx x.broly.ai）
//      → 本服务按 state 找回 codeVerifier+workspaceId → 换 token → getMe → upsert 落库 → 回成功页（postMessage 通知前端刷新）
//   ④ POST /x/:accountId/disconnect    → 清 token、状态置 NotConnected（用户随时收回授权）
// 另保留 POST /x/callback { redirectUrl } 作为 paste-back 兜底（回调地址暂不可达时可手动粘回）。
// 换 token / 续期 / 发帖等最难的逻辑全在 @social/publisher，这里只做「HTTP ↔ 领域」的编排。
//
// 关键：GET /x/callback 是 X 直接重定向【用户浏览器】过来的，不带我方 JWT → 必须**免鉴权**，
//   身份靠 state 对号（pending 里存了 workspaceId）。它在 app.ts 里注册在鉴权中间件【之前】（见 handleXCallbackRedirect）。

import { Hono } from "hono"
import type { Context } from "hono"
import type { Platform } from "@social/shared"
import { PLATFORM_CAPABILITIES } from "@social/shared"
import { XOAuthError, getMe } from "@social/publisher"
import type { AppEnv } from "../auth"
import { currentWorkspace } from "./helpers"
import { getContainer } from "../container"
import { serverConfigFromEnv } from "../config"
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

// ── 真回调重定向入口（免鉴权，在 app.ts 注册于鉴权中间件之前）─────────────────────────────
// GET /api/connections/x/callback?code=&state=
// X 授权后把用户浏览器直接重定向到这里。用 state 找回本次授权会话（含 workspaceId），换 token 落库，回成功页。
export async function handleXCallbackRedirect(c: Context<AppEnv>): Promise<Response> {
  const url = new URL(c.req.url)

  // 用户在 X 点了「拒绝」或授权异常，X 会带 error 回来。
  const providerErr = url.searchParams.get("error")
  if (providerErr) {
    const detail = url.searchParams.get("error_description") ?? providerErr
    return c.html(resultPage({ ok: false, title: "授权未完成", detail }), 400)
  }
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  if (!code || !state) {
    return c.html(resultPage({ ok: false, title: "回调参数缺失", detail: "没有拿到 code / state。" }), 400)
  }

  const xapp = getXApp()
  if (!xapp) {
    return c.html(resultPage({ ok: false, title: "X 未接通", detail: "后端未配置 X OAuth（X_CLIENT_ID）。" }), 501)
  }

  // state → {codeVerifier, workspaceId}，一次性取出。
  const pending = pendingAuthStore.take(state)
  if (!pending) {
    return c.html(
      resultPage({ ok: false, title: "授权会话已失效", detail: "请回到应用重新发起连接（会话 10 分钟内有效）。" }),
      400,
    )
  }

  try {
    const token = await xapp.finishAuthorization({ code, codeVerifier: pending.codeVerifier, expectedState: state })
    const me = await getMe(token.access_token, xapp.config.fetchImpl)
    if (!me?.id) {
      return c.html(resultPage({ ok: false, title: "换到 token 但拉不到账号", detail: "/2/users/me 调用失败。" }), 502)
    }
    const tokenExpiresAt = Math.floor(Date.now() / 1000) + (token.expires_in ?? 7200)
    const { repos } = getContainer()
    await repos.accounts.upsertConnectedAccount(pending.workspaceId, {
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
    const handle = me.username ? `@${me.username}` : me.id
    return c.html(resultPage({ ok: true, title: "已成功连接", detail: `X 账号 ${handle} 已授权，后端已自动保存 token。` }))
  } catch (err) {
    const message = err instanceof XOAuthError ? err.message : err instanceof Error ? err.message : String(err)
    return c.html(resultPage({ ok: false, title: "换 token 失败", detail: message }), 502)
  }
}

// 回调结果页：X 深色卡片风。成功时向 window.opener postMessage 通知前端刷新账号，并 3 秒后自动关闭弹窗。
function resultPage(opts: { ok: boolean; title: string; detail: string }): string {
  const appOrigin = serverConfigFromEnv().appPublicUrl || "*"
  const icon = opts.ok ? `<div class="ok">✓</div>` : `<div class="err">✕</div>`
  // 成功才通知 opener；detail 已是后端可控文案，转义尖括号即可。
  const notify = opts.ok
    ? `<script>
        try { if (window.opener) window.opener.postMessage({ type: "x-oauth", ok: true }, ${JSON.stringify(appOrigin)}); } catch (e) {}
        setTimeout(function(){ try { window.close(); } catch(e){} }, 3000);
      </script>`
    : ""
  const esc = (s: string) => s.replace(/</g, "&lt;").replace(/>/g, "&gt;")
  return `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(opts.title)}</title>
<style>
  :root{color-scheme:dark light}
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0f1419;color:#e7e9ea;
    font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif}
  .card{max-width:440px;padding:40px 36px;background:#16202a;border:1px solid #273340;border-radius:20px;
    box-shadow:0 12px 40px rgba(0,0,0,.35);text-align:center}
  h1{margin:12px 0 8px;font-size:22px}
  p{margin:8px 0;color:#8b98a5}
  .ok{color:#00ba7c;font-size:44px;line-height:1}
  .err{color:#f4212e;font-size:44px;line-height:1}
</style></head><body><div class="card">${icon}<h1>${esc(opts.title)}</h1><p>${esc(opts.detail)}</p>
<p>${opts.ok ? "可以关闭本页，返回应用即可看到已连接。" : "关闭本页后回到应用重试。"}</p></div>${notify}</body></html>`
}
