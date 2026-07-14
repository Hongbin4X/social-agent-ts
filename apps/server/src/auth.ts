// 鉴权中间件。联调后（2026-07-14）解析 userId 的优先级：
//   1. Authorization: Bearer <平台 JWT> + 配了 jwtSecret → 共享密钥验签取 userId（失败=401，不回退旁路）。
//   2. 本地旁路：x-user-id > DEV_FAKE_USER_ID（生产/联调应关旁路，与验签同批）。
//   - 拿不到 userId → 401，绝不放行匿名（spec §4：所有任务必须关联 userId）。
// 平台事实见飞书子文档① A0：jjwt/HS256、密钥=原始 UTF-8 字节、claims.userId=user.id、主登录无 exp。

import type { MiddlewareHandler } from "hono"
import { jwtVerify } from "jose"

export type AppEnv = { Variables: { userId: string } }

/**
 * 验签平台（chatpal/ai-api 共用）签发的 JWT，取出 userId。
 * - HS256；密钥 = jwt.secret 明文的原始 UTF-8 字节（不 base64 解码，与 jjwt 一致）。
 * - jose 默认：验签名 +（若带 exp）验过期；主登录无 exp 则接受为不过期——正合平台两条签发路径。
 * - claims.userId = user.id（自增数字）；按 string 返回。
 * 验签失败/无 userId → 返回 null，由中间件转 401。
 */
export async function verifyPlatformJwt(token: string, secret: string): Promise<string | null> {
  try {
    const key = new TextEncoder().encode(secret)
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] })
    return payload.userId == null ? null : String(payload.userId)
  } catch {
    // 签名不符 / 已过期 / 格式非法 —— 一律当未鉴权，不上抛（由中间件转 401）。
    return null
  }
}

export type AuthConfig = {
  /** 平台共享 JWT 密钥（原始 UTF-8 字节）。配了才验签 Bearer；见飞书子文档① A0。 */
  jwtSecret?: string
  /** 本地旁路假 userId。生产/测试联调应留空关闭（与 JWT 验签同批上线）。 */
  devFakeUserId?: string
}

export function authMiddleware(config: AuthConfig = {}): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const userId = await resolveUserId(
      { authorization: c.req.header("authorization"), xUserId: c.req.header("x-user-id") },
      config,
    )
    if (!userId) {
      return c.json(
        { error: "unauthorized", message: "缺少或无效的用户身份：请带 Authorization: Bearer <平台 JWT>（本地可用 x-user-id / DEV_FAKE_USER_ID）" },
        401,
      )
    }
    c.set("userId", userId)
    await next()
  }
}

/**
 * 从请求头解析 userId。优先级：
 *  1. 带 Bearer 且配了密钥 → 以验签为准（成功取 userId；失败 → null 转 401，绝不回退旁路——带了 token 就该真鉴权）。
 *  2. 否则本地旁路：x-user-id > devFakeUserId。
 */
export async function resolveUserId(
  headers: { authorization?: string | null; xUserId?: string | null },
  config: AuthConfig,
): Promise<string | null> {
  const token = extractToken(headers.authorization)
  if (token && config.jwtSecret) {
    return verifyPlatformJwt(token, config.jwtSecret)
  }
  const xu = headers.xUserId?.trim()
  if (xu) return xu
  if (config.devFakeUserId) return config.devFakeUserId
  return null
}

/** 剥离 "Bearer " 前缀；约定同 yanfa：Authorization 可带或不带前缀。 */
function extractToken(auth?: string | null): string | null {
  if (!auth || !auth.trim()) return null
  const m = auth.match(/^Bearer\s+(.+)$/i)
  return (m ? m[1] : auth).trim()
}
