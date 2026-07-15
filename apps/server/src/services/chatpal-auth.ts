// ChatpalAuthClient —— 登录代理：后端替前端调平台的邮箱验证码登录两步接口。
// 为什么要后端代理：前端 /bff 只反代到本后端，够不着 chatpal(内网 8089)；且 chatpal 不应对前端直接暴露、
//   也躲开跨域。前端 → /bff/auth/* → 本方法 → chatpal。拿到的 JWT 回给前端存本地，
//   之后前端带 Bearer 调本后端，auth.ts 用同一把共享密钥验签（见飞书子文档① A0/③登录契约）。
//
// ── ⚠️ 平台有【两套】邮箱登录接口，必须用下面这套（2026-07-15 实机血泪）──
//
//  (A) /user-api/user/{sendEmailVerifyCode,emailLogin}   ← platform-user-api，【曾经用的，是错的】
//      · 验证码存在 redisUtil.getEmailVerifyCode(email, channel) 的 key 下
//      · 测试环境【发不出邮件】：chatpal 日志里每一次都是
//        「邮件发送结果发送失败：javax.mail.AuthenticationFailedException: 535-5.7.8
//         Username and Password not accepted」——SMTP 凭证坏的，从来没成功过
//      · 且它【不把验证码打进日志】→ 测试环境下用户永远拿不到码 = 这条路根本走不通
//      · 更坑：sendEmailVerifyCode 无论成败都 return new BaseResponse()(code=1)，
//        所以调用方看到的永远是「成功」——假象
//
//  (B) /user-api/api/{login/email/send-verfiy-mail, login/email}  ← platform-php-api，【真产品在用的】
//      · 就是 GlobalGPT 站点自己走的那条（实测：用户从 testtapi2.broly.ai/home 登录走的就是它）
//      · 验证码存在 login-email-<email> 这个 key 下，且【会打进日志】
//        （"登录邮箱验证码写入Redis: email=…, code=…, ttl=600"）→ 测试环境靠读日志取码
//      · 注意端点名里的 "verfiy" 是平台的拼写错误，不是笔误，照抄
//
//  ⇒ 两套用的 Redis key 不同，互不相认：(A) 发的码 (B) 验不了，反之亦然。必须整条链路统一用 (B)。
//
// ── 契约（references/.../platform-php-api UserController.java）──
//   · POST /user-api/api/login/email/send-verfiy-mail  body {email, channel, device:{deviceType}}
//   · POST /user-api/api/login/email                   body {email, code, channel, device:{deviceType}}
//   · 返回 Result{code,message,data}：code===1 成功（Result.SUCCESS=1 / FAIL=0）；
//     token 在 【data.token】（不是顶层——(A) 才是顶层，换接口时最容易踩的差异）
//
// ── deviceType 为什么传 mobile ──
//   UserController 的发码逻辑：`if (!"mobile".equals(deviceType) && ...)` 里做 Cloudflare Turnstile /
//   hCaptcha 人机验证，不过就 403「Human verification failed」（实测 deviceType=pc 必 403）。
//   移动端不做 captcha 是平台自己的设计，我们作为服务端代理没有 Turnstile token，故走 mobile 分支。
//   ⚠️ 上生产前应改为：前端集成 Cloudflare Turnstile → 把 turnstile_token 透传进来 → deviceType 传真实值。
//   现在这样等于绕过了平台的防刷人机验证，仅适用于联调期。见 routes/auth.ts 的限流 TODO。
import type { PlatformDeviceType } from "@social/shared"

export interface ChatpalAuthDeps {
  /** chatpal 根地址，如 http://127.0.0.1:8089（同机内网直连）。自拼 /user-api/api/*。 */
  baseUrl: string
  /**
   * 平台渠道 —— ⚠️ 是【产品】不是服务名：GLB 账号一律 glbgpt，不是 chatpal。
   * 平台按 (email + channel) 区分用户，填错不报错而是【新建一个空账号】，极难查。
   */
  channel: string
  /** 见文件头「deviceType 为什么传 mobile」。默认 mobile（联调期绕过人机验证）。 */
  deviceType?: PlatformDeviceType
  fetchImpl?: typeof fetch
}

/** 邮箱登录成功结果：token 给前端存本地；isNewUser 用于识别「channel 填错导致新建空账号」这类事故。 */
export interface EmailLoginResult {
  token: string
  /** 平台返回 is_new_user=1 表示这次登录【新建了账号】。正常复用 GLB 老账号时应为 false。 */
  isNewUser: boolean
}

/** 登录/发码失败（验证码错/过期、人机验证未过、反垃圾拦截等）。路由据 status 透传给前端提示。 */
export class ChatpalAuthError extends Error {
  constructor(message: string, readonly status: number, readonly data?: unknown) {
    super(message)
    this.name = "ChatpalAuthError"
  }
}

/**
 * 判平台调用成功：HTTP 2xx 且 body.code===1（Result.SUCCESS=1 / FAIL=0）。
 * ⚠️ 注意平台业务码在 body 里，HTTP 常年 200——人机验证失败也是 HTTP 200 + code:403。
 * 故【只认 code===1】，不能看 HTTP 状态，也不能把缺 code 当成功（那只可能来自非平台的响应）。
 */
function isOk(status: number, json: { code?: number } | null): boolean {
  return status >= 200 && status < 300 && json?.code === 1
}

export class ChatpalAuthClient {
  constructor(private readonly deps: ChatpalAuthDeps) {}

  private get device(): { deviceType: PlatformDeviceType } {
    return { deviceType: this.deps.deviceType ?? "mobile" }
  }

  async sendEmailCode(email: string): Promise<void> {
    const { status, json } = await this.post("/user-api/api/login/email/send-verfiy-mail", {
      email,
      channel: this.deps.channel,
      device: this.device,
    })
    if (!isOk(status, json)) {
      throw new ChatpalAuthError(this.msg(json, "发送验证码失败"), status, json)
    }
    // 平台在需要人机验证时会返回 code:1 + data:"hcaptcha"（不是错误码！）——此时【码并没有发出去】，
    // 当成功会让用户干等一个永远不会来的验证码。如实报错。
    if (json?.data === "hcaptcha") {
      throw new ChatpalAuthError("需要人机验证后才能发送验证码", 403, json)
    }
  }

  async emailLogin(email: string, code: string): Promise<EmailLoginResult> {
    const { status, json } = await this.post("/user-api/api/login/email", {
      email,
      code,
      channel: this.deps.channel,
      device: this.device,
    })
    if (!isOk(status, json)) {
      // 验证码错/过期 → 平台返 code=0 + message；透传给前端提示重发。
      throw new ChatpalAuthError(this.msg(json, "登录失败：验证码错误或已过期"), status, json)
    }
    const data = (json?.data ?? {}) as { token?: unknown; is_new_user?: unknown }
    const token = typeof data.token === "string" ? data.token : ""
    if (!token) {
      // code=1 却没 token = 契约异常，绝不吞（吞了前端会拿空 Bearer，之后每个请求都 401）。
      throw new ChatpalAuthError("登录返回缺少 token", status, json)
    }
    return { token, isNewUser: data.is_new_user === 1 }
  }

  private msg(json: { message?: unknown } | null, fallback: string): string {
    return typeof json?.message === "string" && json.message && json.message !== "OK" ? json.message : fallback
  }

  private async post(
    path: string,
    body: unknown,
  ): Promise<{ status: number; json: { code?: number; message?: string; data?: unknown } | null }> {
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
