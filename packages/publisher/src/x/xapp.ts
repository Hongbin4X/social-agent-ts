// XApp —— 给全栈后端用的便捷封装：把散的 OAuth 纯函数收成「一份 App 配置 + 三个动作」。
//
// 授权路由（apps/server connectionRoutes）这样接线：
//   const xapp = new XApp({ clientId, clientSecret, redirectUri })
//   // ① POST /x/authorize-url
//   const { url, state, codeVerifier } = xapp.startAuthorization()
//   // 把 { state → codeVerifier } 存进 PendingAuthStore（内存/缓存），返回 url + state
//   // ② POST /x/callback（paste-back：body 里是用户粘回的完整回调 URL）
//   const token = await xapp.finishAuthorization({ code: pastedUrl, codeVerifier, expectedState: state })
//   // token = { access_token, refresh_token, expires_in, scope }，落库（见 DbTokenStore）
//
// startAuthorization / finishAuthorization 不碰 session、不碰 DB —— state/verifier 存哪、token 存哪都由上层定。
// 移植自 demo/x-poster/src/xApp.ts，config 多一个可注入 fetchImpl（统一走它，便于测试）。

import {
  buildAuthorizeUrl,
  exchangeCode,
  extractCode,
  generatePkce,
  refreshAccessToken,
  X_DEFAULT_SCOPES,
  type XTokenResponse,
} from "./oauth"

export interface XAppConfig {
  clientId: string
  /** confidential client（Web/Automated App）才有；public client（Native App）留空。 */
  clientSecret?: string
  /** 送用户回来的回调地址，必须与 X 后台登记的**完全一致**。 */
  redirectUri: string
  scopes?: string
  /** 可注入 fetch；缺省用运行时全局 fetch。 */
  fetchImpl?: typeof fetch
}

export interface StartAuthorizationResult {
  /** 让用户浏览器打开的授权链接。 */
  url: string
  /** 存进 PendingAuthStore，回调时校验防 CSRF。 */
  state: string
  /** 存进 PendingAuthStore，回调换 token 时要用（PKCE）——绝不下发前端。 */
  codeVerifier: string
}

export interface FinishAuthorizationParams {
  /** 回调 query 里的 code，或用户粘回的完整回调 URL（会自动解析并校验 state）。 */
  code: string
  codeVerifier: string
  /** 回调里的 state；配合 expectedState 校验。 */
  returnedState?: string
  /** startAuthorization 时存进 PendingAuthStore 的 state。 */
  expectedState?: string
}

export class XApp {
  readonly config: XAppConfig

  constructor(config: XAppConfig) {
    if (!config.clientId) throw new Error("XApp 需要 clientId")
    if (!config.redirectUri) throw new Error("XApp 需要 redirectUri（须与 X 后台登记的回调完全一致）")
    this.config = config
  }

  /** 第 1 步：生成授权链接 + PKCE。state/codeVerifier 请存进 PendingAuthStore。 */
  startAuthorization(state?: string): StartAuthorizationResult {
    const pkce = generatePkce()
    // 没传 state 就用另一段随机串当 state（够随机、够短，只作对号票根）。
    const finalState = state ?? generatePkce().verifier.slice(0, 24)
    const url = buildAuthorizeUrl({
      clientId: this.config.clientId,
      redirectUri: this.config.redirectUri,
      scopes: this.config.scopes ?? X_DEFAULT_SCOPES,
      state: finalState,
      codeChallenge: pkce.challenge,
    })
    return { url, state: finalState, codeVerifier: pkce.verifier }
  }

  /** 第 2 步：拿回调 code + PendingAuthStore 里的 codeVerifier 换 token。 */
  finishAuthorization(params: FinishAuthorizationParams): Promise<XTokenResponse> {
    // code 允许是完整回调 URL；顺便校验 state（paste-back 流程用户粘的就是完整 URL）。
    const code = extractCode(params.code, params.expectedState ?? params.returnedState)
    return exchangeCode({
      code,
      codeVerifier: params.codeVerifier,
      clientId: this.config.clientId,
      redirectUri: this.config.redirectUri,
      clientSecret: this.config.clientSecret,
      fetchImpl: this.config.fetchImpl,
    })
  }

  /** token 过期时续期（需 offline.access scope）。 */
  refresh(refreshToken: string): Promise<XTokenResponse> {
    return refreshAccessToken({
      refreshToken,
      clientId: this.config.clientId,
      clientSecret: this.config.clientSecret,
      fetchImpl: this.config.fetchImpl,
    })
  }
}
