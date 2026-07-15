// ChatpalAuthClient —— 登录代理（后端替前端调平台邮箱验证码登录）。用注入的假 fetch，脱离真实网络。
//
// 钉死的核心事实（2026-07-15 实机血泪，详见 chatpal-auth.ts 文件头）：
//  · 必须用 platform-php-api 那套 /user-api/api/login/email*，【不是】 /user-api/user/*：
//    后者测试环境 SMTP 是坏的（chatpal 日志里每次都 535 认证失败）、且不把码打进日志 →
//    用户永远拿不到验证码；两套用的 Redis key 还不同，互不相认。
//  · token 在 data.token（不是顶层）。
//  · 判成功只认 body.code===1：平台 HTTP 常年 200，人机验证失败是 200 + code:403。
//  · code:1 + data:"hcaptcha" 是【没发出去】，不能当成功（否则用户干等一个永不到来的码）。
//  · channel 必须 glbgpt（产品名，不是服务名 chatpal）——填错平台会静默【新建空账号】。
import { describe, expect, it } from "vitest"
import { ChatpalAuthClient, ChatpalAuthError } from "../src/services/chatpal-auth"

function fakeFetch(handler: (url: string, init: RequestInit) => { status?: number; body: unknown }) {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    const { status = 200, body } = handler(url, init)
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
  }) as unknown as typeof fetch
  return { fn, calls }
}

const make = (fetchImpl: typeof fetch) =>
  new ChatpalAuthClient({ baseUrl: "http://chatpal.test", channel: "glbgpt", fetchImpl })
const bodyOf = (c: { init: RequestInit }) => JSON.parse(c.init.body as string)

describe("ChatpalAuthClient.sendEmailCode", () => {
  it("打到 platform-php-api 的发码端点，带 email/channel/device（平台把 verify 拼成了 verfiy，照抄）", async () => {
    const { fn, calls } = fakeFetch(() => ({ body: { code: 1, message: "success", data: "success" } }))
    await make(fn).sendEmailCode("a@b.com")
    expect(calls[0].url).toBe("http://chatpal.test/user-api/api/login/email/send-verfiy-mail")
    expect(bodyOf(calls[0])).toEqual({ email: "a@b.com", channel: "glbgpt", device: { deviceType: "mobile" } })
  })

  // deviceType=pc 会走平台的 Turnstile/hCaptcha 分支 → 实测必 403「Human verification failed」。
  // 服务端代理没有 Turnstile token，故走 mobile 分支（平台自己的设计：移动端不做 captcha）。
  it("默认 deviceType=mobile（否则平台要人机验证，服务端代理过不了）", async () => {
    const { fn, calls } = fakeFetch(() => ({ body: { code: 1, data: "success" } }))
    await make(fn).sendEmailCode("a@b.com")
    expect(bodyOf(calls[0]).device.deviceType).toBe("mobile")
  })

  it("code≠1 → 抛（HTTP 200 也一样：平台业务码在 body 里）", async () => {
    const { fn } = fakeFetch(() => ({ body: { code: 403, message: "Human verification failed" } }))
    await expect(make(fn).sendEmailCode("a@b.com")).rejects.toThrow(/Human verification failed/)
  })

  // 平台需要人机验证时返回的是 code:1 + data:"hcaptcha"（不是错误码！）。
  // 当成功 → 用户会盯着邮箱干等一个永远不会来的验证码。
  it('code:1 但 data="hcaptcha" → 抛（这表示码【没发出去】，绝不能当成功）', async () => {
    const { fn } = fakeFetch(() => ({ body: { code: 1, message: "success", data: "hcaptcha" } }))
    await expect(make(fn).sendEmailCode("a@b.com")).rejects.toThrow(/人机验证/)
  })
})

describe("ChatpalAuthClient.emailLogin", () => {
  it("打到 /user-api/api/login/email，带 email/code/channel/device，token 从【data.token】取", async () => {
    const { fn, calls } = fakeFetch(() => ({ body: { code: 1, message: "success", data: { token: "JWT-X", is_new_user: 0 } } }))
    const r = await make(fn).emailLogin("a@b.com", "123456")
    expect(calls[0].url).toBe("http://chatpal.test/user-api/api/login/email")
    expect(bodyOf(calls[0])).toEqual({ email: "a@b.com", code: "123456", channel: "glbgpt", device: { deviceType: "mobile" } })
    expect(r.token).toBe("JWT-X")
    expect(r.isNewUser).toBe(false)
  })

  // is_new_user=1 = 平台【新建了账号】。复用 GLB 老账号时不该发生，多半是 channel 配错
  // （平台按 (email+channel) 找用户，找不到就静默建个余额 0 的空号）——路由据此告警。
  it("is_new_user=1 → isNewUser=true（用于识别 channel 配错导致的静默建号）", async () => {
    const { fn } = fakeFetch(() => ({ body: { code: 1, data: { token: "T", is_new_user: 1 } } }))
    expect((await make(fn).emailLogin("a@b.com", "1")).isNewUser).toBe(true)
  })

  it("验证码错/过期（code=0）→ 抛 ChatpalAuthError 并透传平台原话", async () => {
    const { fn } = fakeFetch(() => ({ body: { code: 0, message: "code was error or expired" } }))
    await expect(make(fn).emailLogin("a@b.com", "000000")).rejects.toThrow(/code was error or expired/)
  })

  it("code=1 却没 token → 抛（绝不吞：吞了前端拿空 Bearer，之后每个请求都 401）", async () => {
    const { fn } = fakeFetch(() => ({ body: { code: 1, data: {} } }))
    await expect(make(fn).emailLogin("a@b.com", "1")).rejects.toThrow(ChatpalAuthError)
  })

  // token 曾经在顶层（那是 /user-api/user/emailLogin 的 LoginResponse 契约）——换接口时最容易踩的差异。
  it("顶层 token 不算数（那是【旧的错接口】的契约），只认 data.token", async () => {
    const { fn } = fakeFetch(() => ({ body: { code: 1, token: "顶层的不该被认", data: {} } }))
    await expect(make(fn).emailLogin("a@b.com", "1")).rejects.toThrow(/缺少 token/)
  })
})
