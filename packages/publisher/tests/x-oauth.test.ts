// X OAuth2 + PKCE 授权核心的确定性测试（移植自 demo/x-poster 的冒烟测试，改用 vitest + 注入 fetch）。
//
// 覆盖：PKCE 形状、授权链接参数、回调 code 解析与 state 校验、换 token（confidential/public）、
// 续期 grant、getMe、以及 XApp 封装。真实网络无法在无凭证时测，用注入的 fetch 桩验证「请求构造 + 结果映射」。

import { describe, expect, it, vi } from "vitest"
import {
  buildAuthorizeUrl,
  exchangeCode,
  extractCode,
  generatePkce,
  getMe,
  refreshAccessToken,
  XApp,
  XOAuthError,
  X_AUTHORIZE_URL,
  X_DEFAULT_SCOPES,
  X_TOKEN_URL,
} from "../src"

// 注入式 fetch 桩：记录调用并返回给定 JSON。
function stubFetch(responder: (url: string, init?: RequestInit) => { status?: number; body: unknown }) {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString()
    const { status = 200, body } = responder(url, init)
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
  }) as unknown as typeof fetch
}

describe("generatePkce", () => {
  it("产出 URL-safe verifier(>=43) 和无 padding 的 S256 challenge", () => {
    const { verifier, challenge } = generatePkce()
    expect(verifier).toMatch(/^[A-Za-z0-9\-_]+$/)
    expect(verifier.length).toBeGreaterThanOrEqual(43)
    expect(challenge).toMatch(/^[A-Za-z0-9\-_]+$/)
    expect(challenge).not.toContain("=")
  })

  it("每次生成不同 verifier", () => {
    expect(generatePkce().verifier).not.toBe(generatePkce().verifier)
  })
})

describe("buildAuthorizeUrl", () => {
  it("带齐 PKCE 参数，默认 scope 含 offline.access（拿 refresh_token 的关键）", () => {
    const url = new URL(
      buildAuthorizeUrl({ clientId: "cid", redirectUri: "http://127.0.0.1:8765/callback", state: "st", codeChallenge: "chal" }),
    )
    expect(url.origin + url.pathname).toBe(X_AUTHORIZE_URL)
    expect(url.searchParams.get("response_type")).toBe("code")
    expect(url.searchParams.get("client_id")).toBe("cid")
    expect(url.searchParams.get("redirect_uri")).toBe("http://127.0.0.1:8765/callback")
    expect(url.searchParams.get("state")).toBe("st")
    expect(url.searchParams.get("code_challenge")).toBe("chal")
    expect(url.searchParams.get("code_challenge_method")).toBe("S256")
    expect(url.searchParams.get("scope")).toBe(X_DEFAULT_SCOPES)
    expect(X_DEFAULT_SCOPES).toContain("offline.access")
    expect(X_DEFAULT_SCOPES).toContain("tweet.write")
  })
})

describe("extractCode", () => {
  it("支持裸 code 与完整回调 URL", () => {
    expect(extractCode("BBB")).toBe("BBB")
    expect(extractCode("http://127.0.0.1:8765/callback?code=AAA&state=S")).toBe("AAA")
  })
  it("expectedState 匹配则通过，不匹配抛 XOAuthError", () => {
    expect(extractCode("http://cb?code=AAA&state=S", "S")).toBe("AAA")
    expect(() => extractCode("http://cb?code=AAA&state=WRONG", "RIGHT")).toThrow(XOAuthError)
  })
  it("回调带 error 参数（用户拒绝）抛 XOAuthError", () => {
    expect(() => extractCode("http://cb?error=access_denied")).toThrow(XOAuthError)
  })
  it("空串抛 XOAuthError", () => {
    expect(() => extractCode("")).toThrow(XOAuthError)
  })
})

describe("exchangeCode", () => {
  it("打到 token 端点，authorization_code grant，confidential client 带 Basic 头", async () => {
    const fetchImpl = stubFetch(() => ({
      body: { token_type: "bearer", access_token: "AT", refresh_token: "RT", expires_in: 7200, scope: "tweet.write" },
    }))
    const token = await exchangeCode({
      code: "C", codeVerifier: "V", clientId: "cid", redirectUri: "http://cb", clientSecret: "secret", fetchImpl,
    })
    expect(token.access_token).toBe("AT")
    expect(token.refresh_token).toBe("RT")
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(String(url)).toBe(X_TOKEN_URL)
    const body = String((init as RequestInit).body)
    expect(body).toMatch(/grant_type=authorization_code/)
    expect(body).toMatch(/code_verifier=V/)
    expect(body).toMatch(/client_id=cid/)
    const auth = ((init as RequestInit).headers as Record<string, string>)["Authorization"]
    expect(auth).toBe("Basic " + Buffer.from("cid:secret").toString("base64"))
  })

  it("public client（无 secret）不带 Basic 头", async () => {
    const fetchImpl = stubFetch(() => ({ body: { token_type: "bearer", access_token: "AT" } }))
    await exchangeCode({ code: "C", codeVerifier: "V", clientId: "cid", redirectUri: "http://cb", fetchImpl })
    const [, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(((init as RequestInit).headers as Record<string, string>)["Authorization"]).toBeUndefined()
  })

  it("token 端点 4xx 抛 XOAuthError 带 status", async () => {
    const fetchImpl = stubFetch(() => ({ status: 400, body: { error: "invalid_request" } }))
    await expect(
      exchangeCode({ code: "C", codeVerifier: "V", clientId: "cid", redirectUri: "http://cb", fetchImpl }),
    ).rejects.toMatchObject({ name: "XOAuthError", status: 400 })
  })
})

describe("refreshAccessToken", () => {
  it("用 refresh_token grant 续期", async () => {
    const fetchImpl = stubFetch(() => ({ body: { token_type: "bearer", access_token: "AT2", refresh_token: "RT2", expires_in: 7200 } }))
    const t = await refreshAccessToken({ refreshToken: "RT", clientId: "cid", fetchImpl })
    expect(t.access_token).toBe("AT2")
    const [, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(String((init as RequestInit).body)).toMatch(/grant_type=refresh_token/)
  })
})

describe("getMe", () => {
  it("成功返回账号信息", async () => {
    const fetchImpl = stubFetch(() => ({ body: { data: { id: "7", username: "acme", name: "Acme" } } }))
    expect(await getMe("AT", fetchImpl)).toEqual({ id: "7", username: "acme", name: "Acme" })
  })
  it("失败返回 null（不抛）", async () => {
    const fetchImpl = stubFetch(() => ({ status: 401, body: {} }))
    expect(await getMe("AT", fetchImpl)).toBeNull()
  })
})

describe("XApp", () => {
  it("startAuthorization 给出授权链接 + state + codeVerifier", () => {
    const app = new XApp({ clientId: "cid", clientSecret: "sec", redirectUri: "https://app/cb" })
    const start = app.startAuthorization()
    expect(start.url.startsWith(X_AUTHORIZE_URL + "?")).toBe(true)
    expect(start.state.length).toBeGreaterThan(0)
    expect(start.codeVerifier.length).toBeGreaterThanOrEqual(43)
  })

  it("finishAuthorization 用 code+verifier 换 token 并校验 state", async () => {
    const fetchImpl = stubFetch(() => ({ body: { token_type: "bearer", access_token: "AT", expires_in: 7200 } }))
    const app = new XApp({ clientId: "cid", clientSecret: "sec", redirectUri: "https://app/cb", fetchImpl })
    const start = app.startAuthorization()
    const token = await app.finishAuthorization({
      code: "C", codeVerifier: start.codeVerifier, returnedState: start.state, expectedState: start.state,
    })
    expect(token.access_token).toBe("AT")
  })

  it("缺 clientId 直接抛错（不给一个必然失败的 App）", () => {
    expect(() => new XApp({ clientId: "", redirectUri: "https://app/cb" })).toThrow()
  })
})
