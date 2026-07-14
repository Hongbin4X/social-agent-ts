// ChatpalAuthClient —— 登录代理单测：后端替前端调 chatpal 邮箱验证码两步登录。
// 用注入的假 fetch，完全脱离真实网络。判成功=HTTP2xx 且 code===1；登录额外要求 token 非空。
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

function makeClient(fetchImpl: typeof fetch) {
  return new ChatpalAuthClient({ baseUrl: "http://chatpal.test", channel: "chatpal", fetchImpl })
}

describe("ChatpalAuthClient.sendEmailCode", () => {
  it("code=1 成功：打到 /user-api/user/sendEmailVerifyCode，body 带 email+channel", async () => {
    const { fn, calls } = fakeFetch(() => ({ body: { code: 1, message: "OK" } }))
    await makeClient(fn).sendEmailCode("a@b.com")
    const call = calls.find((c) => c.url.includes("/user-api/user/sendEmailVerifyCode"))
    expect(call).toBeTruthy()
    expect(JSON.parse(call!.init.body as string)).toEqual({ email: "a@b.com", channel: "chatpal" })
  })

  it("code=0 失败：抛 ChatpalAuthError，带平台 message", async () => {
    const { fn } = fakeFetch(() => ({ body: { code: 0, message: "邮箱格式错误" } }))
    await expect(makeClient(fn).sendEmailCode("bad")).rejects.toThrow("邮箱格式错误")
  })
})

describe("ChatpalAuthClient.emailLogin", () => {
  it("成功：body 带 email+code+channel；返回顶层 token + user.id/balance", async () => {
    const { fn, calls } = fakeFetch(() => ({
      body: { code: 1, token: "JWT-xyz", isRegister: 0, user: { id: 2000208, balance: 12.5, nickName: "小赖", email: "a@b.com" } },
    }))
    const r = await makeClient(fn).emailLogin("a@b.com", "482913")
    const call = calls.find((c) => c.url.includes("/user-api/user/emailLogin"))
    expect(JSON.parse(call!.init.body as string)).toEqual({ email: "a@b.com", code: "482913", channel: "chatpal" })
    expect(r.token).toBe("JWT-xyz")
    expect(r.userId).toBe("2000208") // 自增 id 转字符串
    expect(r.balance).toBe(12.5)
    expect(r.nickName).toBe("小赖")
  })

  it("验证码错/过期 code=0：抛 ChatpalAuthError（透传给前端提示重发）", async () => {
    const { fn } = fakeFetch(() => ({ body: { code: 0, message: "code was error or expired" } }))
    await expect(makeClient(fn).emailLogin("a@b.com", "000000")).rejects.toBeInstanceOf(ChatpalAuthError)
  })

  it("code=1 却无 token：抛（绝不把空 token 交给前端，否则后续全 401）", async () => {
    const { fn } = fakeFetch(() => ({ body: { code: 1, user: { id: 1 } } }))
    await expect(makeClient(fn).emailLogin("a@b.com", "482913")).rejects.toThrow(/token/)
  })

  it("HTTP 500：抛（不吞网络/服务端错误）", async () => {
    const { fn } = fakeFetch(() => ({ status: 500, body: { code: 0, message: "server error" } }))
    await expect(makeClient(fn).emailLogin("a@b.com", "482913")).rejects.toBeInstanceOf(ChatpalAuthError)
  })
})
