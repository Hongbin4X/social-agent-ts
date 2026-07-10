// X (Twitter) OAuth 2.0 Authorization Code + PKCE —— 授权流程核心，框架无关纯函数。
//
// 决策记录（给未来的另一个分身，铁律5/8）：
// - 目标是「授权某账号，之后长期替他发帖」。X 主推 v2 写接口，官方推荐的用户授权方式就是
//   OAuth 2.0 Authorization Code with PKCE，拿「用户上下文」的 access_token，带 tweet.write 即可替该账号发推。
//   相比 OAuth 1.0a，用户只在浏览器点一次授权，不必去开发者后台手工生成 token/secret。
// - 端点与 scope 于 2026-07-10 核实自 docs.x.com（demo/x-poster 已实测跑通一个账号的授权+发帖）：
//     authorize: https://x.com/i/oauth2/authorize
//     token:     https://api.x.com/2/oauth2/token
// - 移植自 demo/x-poster/src/xOAuth2.ts，但把「直接用全局 fetch」改成「可注入 fetchImpl」，
//   与本包 AdapterDeps.fetch 的 DI 风格一致、也便于用 vi.fn 桩测试请求构造（见 tests/x-oauth.test.ts）。
// - 错误不复用 PublisherError：那套 code 全是「发布管线」语义（not_connected/token_expired/…），
//   OAuth **授权**失败塞进去是语义错配。这里用自带 status 的 XOAuthError，由授权路由映射成 HTTP。

import { createHash, randomBytes } from "node:crypto"

export const X_AUTHORIZE_URL = "https://x.com/i/oauth2/authorize"
export const X_TOKEN_URL = "https://api.x.com/2/oauth2/token"
export const X_ME_URL = "https://api.x.com/2/users/me"

/**
 * 默认申请的 scope：
 * - tweet.read / users.read：发推接口与 /2/users/me 需要
 * - tweet.write：替账号发推（核心）
 * - media.write：v2 传图（付费档才稳；纯文本发帖用不到，但一并申请，省得回头重授权）
 * - offline.access：换回 refresh_token —— 少了它 access_token ~2h 过期后彻底失效、只能重走浏览器授权。
 *   这是 demo 授权流程文档标注的**头号翻车点**，务必带上。
 */
export const X_DEFAULT_SCOPES = "tweet.read tweet.write users.read media.write offline.access"

/** X token 端点（/2/oauth2/token）返回体。 */
export interface XTokenResponse {
  token_type: string
  expires_in?: number
  access_token: string
  refresh_token?: string
  scope?: string
}

/** /2/users/me 返回的账号信息。 */
export interface XUser {
  id: string
  name?: string
  username?: string
}

/** X 授权流程专用错误：带上游 HTTP status，便于授权路由映射（用户拒绝/串号→400，上游失败→502）。 */
export class XOAuthError extends Error {
  readonly status?: number
  readonly detail?: unknown
  constructor(message: string, status?: number, detail?: unknown) {
    super(message)
    this.name = "XOAuthError"
    this.status = status
    this.detail = detail
  }
}

export interface Pkce {
  verifier: string
  challenge: string
}

/**
 * 生成 PKCE 的 (code_verifier, code_challenge)。
 * verifier: 43~128 位 URL-safe 随机串；challenge = base64url(sha256(verifier))，method=S256。
 */
export function generatePkce(): Pkce {
  const verifier = randomBytes(32).toString("base64url")
  const challenge = createHash("sha256").update(verifier).digest("base64url")
  return { verifier, challenge }
}

export interface AuthorizeUrlParams {
  clientId: string
  redirectUri: string
  state: string
  codeChallenge: string
  scopes?: string
}

/** 拼出让用户在浏览器打开的授权链接。 */
export function buildAuthorizeUrl(params: AuthorizeUrlParams): string {
  const query = new URLSearchParams({
    response_type: "code",
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    scope: params.scopes ?? X_DEFAULT_SCOPES,
    state: params.state,
    code_challenge: params.codeChallenge,
    code_challenge_method: "S256",
  })
  return `${X_AUTHORIZE_URL}?${query.toString()}`
}

/**
 * 从用户粘回来的东西里取出授权码（paste-back 流程核心）。
 * 兼容完整回调地址（http://127.0.0.1:8765/callback?code=...&state=...）与只粘 code。
 * 粘完整 URL 时顺便校验 state 防串号/CSRF。
 */
export function extractCode(redirectResponse: string, expectedState?: string): string {
  const value = (redirectResponse ?? "").trim()
  if (!value) {
    throw new XOAuthError("授权码为空：请粘贴浏览器跳转后的完整回调地址或 code", 400)
  }
  if (value.startsWith("http://") || value.startsWith("https://")) {
    const url = new URL(value)
    const err = url.searchParams.get("error")
    if (err) {
      const detail = url.searchParams.get("error_description") ?? err
      throw new XOAuthError(`授权被拒绝或失败: ${detail}`, 400)
    }
    const code = url.searchParams.get("code")
    const state = url.searchParams.get("state")
    if (!code) {
      throw new XOAuthError("回调地址里没有找到 code 参数，请确认粘贴的是跳转后的完整 URL", 400)
    }
    if (expectedState && state && state !== expectedState) {
      throw new XOAuthError("state 不匹配（可能串号/CSRF），请重新发起授权", 400)
    }
    return code
  }
  return value
}

export interface ExchangeCodeParams {
  code: string
  codeVerifier: string
  clientId: string
  redirectUri: string
  clientSecret?: string
  /** 可注入 fetch（测试/统一出口）；缺省用运行时全局 fetch（Node 20+）。 */
  fetchImpl?: typeof fetch
}

/** 用授权码换取 access_token / refresh_token。 */
export function exchangeCode(params: ExchangeCodeParams): Promise<XTokenResponse> {
  return tokenRequest(
    {
      grant_type: "authorization_code",
      code: params.code,
      redirect_uri: params.redirectUri,
      code_verifier: params.codeVerifier,
      client_id: params.clientId,
    },
    params.clientId,
    params.clientSecret,
    params.fetchImpl,
  )
}

export interface RefreshParams {
  refreshToken: string
  clientId: string
  clientSecret?: string
  fetchImpl?: typeof fetch
}

/** 用 refresh_token 续一个新的 access_token（需 offline.access scope）。 */
export function refreshAccessToken(params: RefreshParams): Promise<XTokenResponse> {
  return tokenRequest(
    {
      grant_type: "refresh_token",
      refresh_token: params.refreshToken,
      client_id: params.clientId,
    },
    params.clientId,
    params.clientSecret,
    params.fetchImpl,
  )
}

/** 授权后确认到底授权到了哪个账号（拿 x_user_id + @username）。失败返回 null，不抛。 */
export async function getMe(accessToken: string, fetchImpl: typeof fetch = fetch): Promise<XUser | null> {
  const response = await fetchImpl(X_ME_URL, { headers: { Authorization: `Bearer ${accessToken}` } })
  const json = await safeJson(response)
  if (!response.ok) return null
  return (json?.data as XUser) ?? null
}

async function tokenRequest(
  body: Record<string, string>,
  clientId: string,
  clientSecret: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<XTokenResponse> {
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" }
  // confidential client（Web/Automated App）用 HTTP Basic 带 secret；public client 不带（PKCE 已足够）。
  if (clientSecret) {
    headers["Authorization"] = "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64")
  }
  const response = await fetchImpl(X_TOKEN_URL, {
    method: "POST",
    headers,
    body: new URLSearchParams(body).toString(),
  })
  const json = await safeJson(response)
  if (!response.ok || !json?.access_token) {
    throw new XOAuthError(
      `token 接口调用失败 (HTTP ${response.status}): ${JSON.stringify(json)}`,
      response.status,
      json,
    )
  }
  return json as XTokenResponse
}

/** 容错解析 JSON：X 偶尔返回非 JSON（如 502 HTML），不让 JSON.parse 把真错误盖掉。 */
async function safeJson(response: Response): Promise<any> {
  try {
    return await response.json()
  } catch {
    return null
  }
}
