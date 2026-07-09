// 发布层的确定性核心测试：路由（自动 vs 手动兜底）、连接解析、计费预扣/结算/退款、未配置守卫、成本估算。
// 真实网络调用（X/Meta/聚合服务）无法在无凭证时测，故用注入的 fetch 桩验证「请求构造 + 结果映射」。

import { describe, expect, it, vi } from "vitest"
import type { BillingGateway, PlatformConnection, TokenStore } from "../src"
import {
  createPublisherRegistry,
  estimateProviderCostUsdCents,
  PublishingService,
} from "../src"
import type { PublishItem, PublishRequest } from "@social/shared"

// —— 测试替身 ——
function makeTokenStore(conn: PlatformConnection | null): TokenStore {
  return { getConnection: vi.fn(async () => conn) }
}

function makeBilling(): BillingGateway {
  return {
    reserveProviderCost: vi.fn(async () => ({ reservationId: "res-1", estimatedCredits: 5 })),
    settleProviderCost: vi.fn(async () => {}),
    refundProviderCost: vi.fn(async () => {}),
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

function req(items: PublishItem[]): PublishRequest {
  return { userId: "u1", workspaceId: "w1", projectId: "p1", items }
}

const X_CONN: PlatformConnection = { accountId: "acc-x", accessToken: "tok-x", externalAccountId: "x-user" }

describe("createPublisherRegistry", () => {
  it("direct 模式：X 是自动发布 adapter，TikTok 是手动兜底", () => {
    const reg = createPublisherRegistry({ mode: "direct" })
    expect(reg.get("X")?.capability.autoPublish).toBe(true)
    expect(reg.get("TikTok")?.capability.autoPublish).toBe(false)
    expect(reg.get("YouTube")?.capability.autoPublish).toBe(false)
    expect(reg.platforms().sort()).toEqual(
      ["Facebook", "Instagram", "Reddit", "TikTok", "X", "YouTube"],
    )
  })

  it("aggregator 模式下，TikTok/YouTube/Reddit 仍是手动兜底（spec §3 不变式）", () => {
    const reg = createPublisherRegistry({ mode: "aggregator", aggregator: { apiKey: "k" } })
    expect(reg.get("X")?.capability.autoPublish).toBe(true)
    expect(reg.get("Reddit")?.capability.autoPublish).toBe(false)
  })
})

describe("PublishingService 路由", () => {
  it("手动平台 → manual_fallback，且不碰 tokenStore / billing", async () => {
    const tokenStore = makeTokenStore(null)
    const billing = makeBilling()
    const svc = new PublishingService({ registry: createPublisherRegistry({ mode: "direct" }), tokenStore, billing })

    const res = await svc.publishBatch(req([{ target: { platform: "TikTok", accountId: "a" }, content: { text: "hi" } }]))

    expect(res.results[0].outcome).toBe("manual_fallback")
    expect(tokenStore.getConnection).not.toHaveBeenCalled()
    expect(billing.reserveProviderCost).not.toHaveBeenCalled()
  })

  it("manual 类型账号 → manual_fallback(manual_account)", async () => {
    const svc = new PublishingService({
      registry: createPublisherRegistry({ mode: "direct" }),
      tokenStore: makeTokenStore(null),
      billing: makeBilling(),
    })
    const res = await svc.publishBatch(
      req([{ target: { platform: "X", accountId: "a", accountType: "manual" }, content: { text: "hi" } }]),
    )
    const r = res.results[0]
    expect(r.outcome).toBe("manual_fallback")
    if (r.outcome === "manual_fallback") expect(r.reason).toBe("manual_account")
  })

  it("自动平台但账号未连接 → failed(not_connected)，如实暴露不假装", async () => {
    const svc = new PublishingService({
      registry: createPublisherRegistry({ mode: "direct" }),
      tokenStore: makeTokenStore(null),
      billing: makeBilling(),
    })
    const res = await svc.publishBatch(req([{ target: { platform: "X", accountId: "a" }, content: { text: "hi" } }]))
    const r = res.results[0]
    expect(r.outcome).toBe("failed")
    if (r.outcome === "failed") expect(r.code).toBe("not_connected")
  })

  it("连接已过期 → manual_fallback(token_expired)", async () => {
    const expired: PlatformConnection = { accountId: "a", accessToken: "t", expiresAt: "2000-01-01T00:00:00Z" }
    const svc = new PublishingService({
      registry: createPublisherRegistry({ mode: "direct" }),
      tokenStore: makeTokenStore(expired),
      billing: makeBilling(),
    })
    const res = await svc.publishBatch(req([{ target: { platform: "X", accountId: "a" }, content: { text: "hi" } }]))
    const r = res.results[0]
    expect(r.outcome).toBe("manual_fallback")
    if (r.outcome === "manual_fallback") expect(r.reason).toBe("token_expired")
  })
})

describe("PublishingService X 直连（注入 fetch 桩）", () => {
  it("成功发布 → published，命中 /2/tweets，且 provider cost 预扣→结算→回写", async () => {
    const fetchImpl = vi.fn(async (..._args: Parameters<typeof fetch>) =>
      jsonResponse({ data: { id: "999" } }),
    )
    const billing = makeBilling()
    const svc = new PublishingService({
      registry: createPublisherRegistry({ mode: "direct", fetchImpl }),
      tokenStore: makeTokenStore(X_CONN),
      billing,
    })

    const res = await svc.publishBatch(
      req([{ target: { platform: "X", accountId: "acc-x" }, content: { text: "hello", linkUrl: "https://a.co" } }]),
    )
    const r = res.results[0]
    expect(r.outcome).toBe("published")
    if (r.outcome === "published") {
      expect(r.remoteId).toBe("999")
      expect(r.providerCostCredits).toBe(5)
    }
    // 请求确实打到 X 的发推端点
    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(String(fetchImpl.mock.calls[0][0])).toContain("/2/tweets")
    // 带链接 → 走了预扣（20 美分）→ 结算，未退款
    expect(billing.reserveProviderCost).toHaveBeenCalledOnce()
    expect(billing.settleProviderCost).toHaveBeenCalledOnce()
    expect(billing.refundProviderCost).not.toHaveBeenCalled()
    expect(res.totalProviderCostCredits).toBe(5)
  })

  it("平台返回错误 → failed(provider_error)，并退款", async () => {
    const fetchImpl = vi.fn(async () => new Response("boom", { status: 500 }))
    const billing = makeBilling()
    const svc = new PublishingService({
      registry: createPublisherRegistry({ mode: "direct", fetchImpl }),
      tokenStore: makeTokenStore(X_CONN),
      billing,
    })
    const res = await svc.publishBatch(
      req([{ target: { platform: "X", accountId: "acc-x" }, content: { text: "hi", linkUrl: "https://a.co" } }]),
    )
    const r = res.results[0]
    expect(r.outcome).toBe("failed")
    if (r.outcome === "failed") expect(r.code).toBe("provider_error")
    expect(billing.refundProviderCost).toHaveBeenCalledOnce()
    expect(billing.settleProviderCost).not.toHaveBeenCalled()
  })
})

describe("aggregator 未配置 apiKey → failed(not_configured)", () => {
  it("联调前的正常状态：明确报未接通，而非假成功", async () => {
    const svc = new PublishingService({
      registry: createPublisherRegistry({ mode: "aggregator", aggregator: {} }),
      tokenStore: makeTokenStore(X_CONN),
      billing: makeBilling(),
    })
    const res = await svc.publishBatch(req([{ target: { platform: "X", accountId: "acc-x" }, content: { text: "hi" } }]))
    const r = res.results[0]
    expect(r.outcome).toBe("failed")
    if (r.outcome === "failed") expect(r.code).toBe("not_configured")
  })
})

describe("estimateProviderCostUsdCents", () => {
  it("X 带链接 20 美分、不带 1.5 美分；其它平台 0", () => {
    expect(estimateProviderCostUsdCents("X", { text: "a", linkUrl: "https://x.co" })).toBe(20)
    expect(estimateProviderCostUsdCents("X", { text: "正文里有 http://x.co 也算" })).toBe(20)
    expect(estimateProviderCostUsdCents("X", { text: "no link" })).toBe(1.5)
    expect(estimateProviderCostUsdCents("Facebook", { text: "a", linkUrl: "https://x.co" })).toBe(0)
    expect(estimateProviderCostUsdCents("Instagram", { text: "a" })).toBe(0)
  })
})
