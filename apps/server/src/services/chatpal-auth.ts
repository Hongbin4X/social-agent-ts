// ChatpalAuthClient —— 登录代理：后端替前端调 chatpal 的邮箱验证码登录两步接口。
// 为什么要后端代理：前端 /bff 只反代到本后端(8091)，够不着 chatpal(内网 8089)；且 chatpal 不应对前端直接暴露、
//   也躲开跨域。前端 → /bff/auth/* → 本方法 → chatpal /user-api/user/*。拿到的 JWT 回给前端存本地，
//   之后前端带 Bearer 调本后端，auth.ts 用同一把共享密钥验签（见飞书子文档① A0/③登录契约）。
//
// chatpal 契约（references/yanfa-chatpal-api UserAPI.java）：
//   · POST /user-api/user/sendEmailVerifyCode  body {email, channel}          → BaseResponse(code:0失败/1成功)
//   · POST /user-api/user/emailLogin           body {email, code, channel}     → LoginResponse{token 顶层, user, account}
//   两接口免鉴权（UserTokenInterceptor 无 token 直接放行）。判成功：HTTP 2xx 且 code===1（BaseResponse 默认 1）。
export interface ChatpalAuthDeps {
  /** chatpal 根地址，如 http://<测试服内网>:8089。自拼 /user-api/user/*。 */
  baseUrl: string
  /** 平台渠道（emailLogin/sendEmailVerifyCode 的 channel 字段），如 chatpal。 */
  channel: string
  fetchImpl?: typeof fetch
}

/** 邮箱登录成功结果：token 给前端存本地；userId/balance 供后端后续用（余额显示等）。 */
export interface EmailLoginResult {
  token: string
  userId: string
  balance?: number
  nickName?: string
  email?: string
}

/** chatpal 登录/发码失败（验证码错/过期、渠道错、余额接口异常等）。路由据 status 透传给前端提示。 */
export class ChatpalAuthError extends Error {
  constructor(message: string, readonly status: number, readonly data?: unknown) {
    super(message)
    this.name = "ChatpalAuthError"
  }
}

/** 判平台调用成功：HTTP 2xx 且 body.code===1（BaseResponse 语义 0失败/1成功，默认 1）。 */
function isOk(status: number, json: { code?: number } | null): boolean {
  return status >= 200 && status < 300 && (json?.code === 1 || json?.code == null)
}

export class ChatpalAuthClient {
  constructor(private readonly deps: ChatpalAuthDeps) {}

  async sendEmailCode(email: string): Promise<void> {
    const { status, json } = await this.post("/user-api/user/sendEmailVerifyCode", { email, channel: this.deps.channel })
    if (!isOk(status, json)) {
      throw new ChatpalAuthError(this.msg(json, "发送验证码失败"), status, json)
    }
  }

  async emailLogin(email: string, code: string): Promise<EmailLoginResult> {
    const { status, json } = await this.post("/user-api/user/emailLogin", { email, code, channel: this.deps.channel })
    if (!isOk(status, json)) {
      // 验证码错/过期时后端抛 ServiceException("code was error or expired") → code=0；透传给前端提示重发。
      throw new ChatpalAuthError(this.msg(json, "登录失败：验证码错误或已过期"), status, json)
    }
    const token = typeof json?.token === "string" ? json.token : ""
    if (!token) {
      // code=1 却没拿到 token = 契约异常，绝不吞（吞了前端会拿空 Bearer，后续全 401）。
      throw new ChatpalAuthError("登录返回缺少 token", status, json)
    }
    const user = (json?.user ?? {}) as { id?: unknown; balance?: unknown; nickName?: unknown; email?: unknown }
    return {
      token,
      userId: user.id == null ? "" : String(user.id),
      balance: typeof user.balance === "number" ? user.balance : undefined,
      nickName: typeof user.nickName === "string" ? user.nickName : undefined,
      email: typeof user.email === "string" ? user.email : undefined,
    }
  }

  private msg(json: { message?: unknown } | null, fallback: string): string {
    return typeof json?.message === "string" && json.message && json.message !== "OK" ? json.message : fallback
  }

  private async post(
    path: string,
    body: unknown,
  ): Promise<{ status: number; json: { code?: number; message?: string; token?: string; user?: unknown } | null }> {
    const f = this.deps.fetchImpl ?? fetch
    const res = await f(`${this.deps.baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const text = await res.text()
    return { status: res.status, json: text ? JSON.parse(text) : null }
  }
}
