// 登录路由（免鉴权，用户此时还没 token）：前端 → /bff/auth/* → 这里 → chatpal 邮箱验证码两步登录。
// 必须【不】挂 auth 中间件（见 app.ts：不把 /api/auth 加进鉴权 base 列表）。拿到的 token 回前端存本地，
// 之后前端带 Bearer 调其余 /api/* 路由，由 auth.ts 用同一把共享密钥验签。
import { type Context, Hono } from "hono"
import type { ContentfulStatusCode } from "hono/utils/http-status"
import type { AppEnv } from "../auth"
import { getContainer } from "../container"
import { ChatpalAuthError } from "../services/chatpal-auth"

export const authRoutes = new Hono<AppEnv>()

/** 未配 CHATPAL_BASE_URL → 如实 501「未接通」，不假装成功（项目铁律：不掩盖）。 */
function requireClient(c: Context<AppEnv>) {
  const client = getContainer().chatpalAuth
  if (!client) {
    return { error: c.json({ error: "not_configured", message: "登录未接通（后端缺 CHATPAL_BASE_URL）" }, 501) } as const
  }
  return { client } as const
}

// 发验证码
authRoutes.post("/email/send-code", async (c) => {
  const r = requireClient(c)
  if ("error" in r) return r.error
  const body = await c.req.json<{ email?: string }>().catch(() => null)
  if (!body?.email?.trim()) return c.json({ error: "invalid_request", message: "email 必填" }, 400)
  try {
    await r.client.sendEmailCode(body.email.trim())
    return c.json({ ok: true })
  } catch (e) {
    if (e instanceof ChatpalAuthError) {
      const status = (e.status >= 400 && e.status < 600 ? e.status : 400) as ContentfulStatusCode
      return c.json({ error: "send_failed", message: e.message }, status)
    }
    throw e
  }
})

// 验证码登录 → 换 JWT
authRoutes.post("/email/login", async (c) => {
  const r = requireClient(c)
  if ("error" in r) return r.error
  const body = await c.req.json<{ email?: string; code?: string }>().catch(() => null)
  if (!body?.email?.trim() || !body?.code?.trim()) {
    return c.json({ error: "invalid_request", message: "email 与 code 必填" }, 400)
  }
  try {
    const result = await r.client.emailLogin(body.email.trim(), body.code.trim())
    // 只回前端需要的字段：token 存本地当 Bearer；user 摘要供欢迎语/余额显示。不回传 chatpal 原始大对象。
    return c.json({ token: result.token, user: { id: result.userId, balance: result.balance, nickName: result.nickName, email: result.email } })
  } catch (e) {
    if (e instanceof ChatpalAuthError) {
      // 验证码错/过期时 chatpal 返 HTTP200+code=0（status=200 非错误码），登录失败统一按 401 让前端提示重输。
      const status = (e.status >= 400 && e.status < 600 ? e.status : 401) as ContentfulStatusCode
      return c.json({ error: "login_failed", message: e.message }, status)
    }
    throw e
  }
})
