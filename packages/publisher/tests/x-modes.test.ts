// X 三种发帖形态（普通推文 / 串推 / Article）的确定性测试：用注入 fetch 桩验证请求构造 + 结果映射 + 成本。
// 覆盖用户要求：发帖时可选形态、失败有清晰原因（尤其 Article 需 Premium）。

import { describe, expect, it, vi } from "vitest"
import type { BillingGateway, PlatformConnection, TokenStore } from "../src"
import {
  createPublisherRegistry,
  estimateProviderCostUsdCents,
  PublishingService,
  splitIntoThreadSegments,
} from "../src"
import type { PublishItem, PublishRequest } from "@social/shared"

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

function svcWith(fetchImpl: typeof fetch, billing = makeBilling()) {
  return {
    svc: new PublishingService({
      registry: createPublisherRegistry({ mode: "direct", fetchImpl }),
      tokenStore: makeTokenStore(X_CONN),
      billing,
    }),
    billing,
  }
}

describe("X 串推（thread）", () => {
  it("按 reply 链逐条发，首条无 reply、后条 reply 前一条 id", async () => {
    let n = 0
    const fetchImpl = vi.fn(async (..._args: Parameters<typeof fetch>) => jsonResponse({ data: { id: String(++n) } }))
    const { svc } = svcWith(fetchImpl)

    const res = await svc.publishBatch(
      req([
        {
          target: { platform: "X", accountId: "acc-x" },
          content: { text: "seg1", x: { postType: "thread", threadSegments: ["第一条", "第二条", "第三条"] } },
        },
      ]),
    )

    expect(res.results[0].outcome).toBe("published")
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    const bodies = fetchImpl.mock.calls.map((c) => JSON.parse(String((c[1] as RequestInit).body)))
    expect(bodies[0].reply).toBeUndefined()
    expect(bodies[1].reply.in_reply_to_tweet_id).toBe("1")
    expect(bodies[2].reply.in_reply_to_tweet_id).toBe("2")
    if (res.results[0].outcome === "published") expect(res.results[0].remoteId).toBe("1") // 入口=首条
  })

  it("没给显式分段时，从正文自动按 ≤280 分段", async () => {
    let n = 0
    const fetchImpl = vi.fn(async () => jsonResponse({ data: { id: String(++n) } }))
    const { svc } = svcWith(fetchImpl)
    const long = Array.from({ length: 5 }, (_, i) => `段落${i} ` + "字".repeat(200)).join("\n\n")

    await svc.publishBatch(
      req([{ target: { platform: "X", accountId: "acc-x" }, content: { text: long, x: { postType: "thread" } } }]),
    )
    expect(fetchImpl.mock.calls.length).toBeGreaterThanOrEqual(5)
  })

  it("中途失败：带出「发到第几条」，前几条已发出不掩盖", async () => {
    let n = 0
    const fetchImpl = vi.fn(async () => {
      n++
      if (n === 2) return new Response(JSON.stringify({ title: "rate" }), { status: 429 })
      return jsonResponse({ data: { id: String(n) } })
    })
    const { svc } = svcWith(fetchImpl)
    const res = await svc.publishBatch(
      req([
        {
          target: { platform: "X", accountId: "acc-x" },
          content: { text: "x", x: { postType: "thread", threadSegments: ["a", "b", "c"] } },
        },
      ]),
    )
    const r = res.results[0]
    expect(r.outcome).toBe("failed")
    if (r.outcome === "failed") {
      expect(r.code).toBe("rate_limited")
      expect(r.message).toContain("第 2/3 条")
    }
  })
})

describe("X Article（长文）", () => {
  it("两步：先 /2/articles/draft 再 /2/articles/{id}/publish", async () => {
    const fetchImpl = vi.fn(async (url: Parameters<typeof fetch>[0]) => {
      const u = String(url)
      if (u.endsWith("/articles/draft")) return jsonResponse({ data: { id: "draft-1" } })
      if (u.includes("/articles/draft-1/publish")) return jsonResponse({ data: { post_id: "post-9" } })
      return new Response("unexpected", { status: 500 })
    })
    const { svc } = svcWith(fetchImpl)
    const res = await svc.publishBatch(
      req([
        {
          target: { platform: "X", accountId: "acc-x" },
          content: { text: "标题行\n\n正文一段\n\n正文二段", x: { postType: "article" } },
        },
      ]),
    )
    const r = res.results[0]
    expect(r.outcome).toBe("published")
    if (r.outcome === "published") expect(r.remoteId).toBe("post-9")
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(String(fetchImpl.mock.calls[0][0])).toContain("/2/articles/draft")
    expect(String(fetchImpl.mock.calls[1][0])).toContain("/publish")
  })

  it("账号非 Premium → 403 映射成 permission_missing + 清晰可行动文案", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ detail: "A Premium subscription is required." }), { status: 403 }),
    )
    const { svc, billing } = svcWith(fetchImpl)
    const res = await svc.publishBatch(
      req([{ target: { platform: "X", accountId: "acc-x" }, content: { text: "标题\n\n正文", x: { postType: "article" } } }]),
    )
    const r = res.results[0]
    expect(r.outcome).toBe("failed")
    if (r.outcome === "failed") {
      expect(r.code).toBe("permission_missing")
      expect(r.message).toContain("Premium")
    }
    // 没真发出去 → 退款
    expect(billing.refundProviderCost).toHaveBeenCalledOnce()
  })
})

describe("X 图文推文", () => {
  it("有图片 → 先 /2/media/upload 取 media_id，再发带 media 的推文", async () => {
    const fetchImpl = vi.fn(async (...args: Parameters<typeof fetch>) => {
      const u = String(args[0])
      if (u.startsWith("http://img/")) {
        return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "image/jpeg" } })
      }
      if (u.includes("/2/media/upload")) return jsonResponse({ data: { id: "media-1" } })
      if (u.includes("/2/tweets")) return jsonResponse({ data: { id: "t1" } })
      return new Response("unexpected", { status: 500 })
    })
    const { svc } = svcWith(fetchImpl)
    const res = await svc.publishBatch(
      req([
        {
          target: { platform: "X", accountId: "acc-x" },
          content: { text: "图文推", media: [{ kind: "image", url: "http://img/a.jpg" }] },
        },
      ]),
    )
    expect(res.results[0].outcome).toBe("published")
    // 取图 → 传图 → 发推 三个请求都打到了
    const urls = fetchImpl.mock.calls.map((c) => String(c[0]))
    expect(urls.some((u) => u.includes("/2/media/upload"))).toBe(true)
    const tweetCall = fetchImpl.mock.calls.find((c) => String(c[0]).includes("/2/tweets"))!
    const tweetBody = JSON.parse(String((tweetCall[1] as RequestInit).body))
    expect(tweetBody.media.media_ids).toEqual(["media-1"])
  })
})

describe("X 普通推文超限", () => {
  it("超过 280 字 → content_invalid 且提示改用串推", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ data: { id: "1" } }))
    const { svc } = svcWith(fetchImpl)
    const res = await svc.publishBatch(
      req([{ target: { platform: "X", accountId: "acc-x" }, content: { text: "字".repeat(300) } }]),
    )
    const r = res.results[0]
    expect(r.outcome).toBe("failed")
    if (r.outcome === "failed") {
      expect(r.code).toBe("content_invalid")
      expect(r.message).toContain("串推")
    }
    expect(fetchImpl).not.toHaveBeenCalled() // 超限在本地就拦下，不打网络
  })
})

describe("成本：串推按条数累加", () => {
  it("3 条不带链接的串推 = 1.5 × 3", () => {
    const cost = estimateProviderCostUsdCents("X", {
      text: "x",
      x: { postType: "thread", threadSegments: ["a", "b", "c"] },
    })
    expect(cost).toBe(4.5)
  })
  it("单条 article 仍按单条计（带链接 20）", () => {
    expect(estimateProviderCostUsdCents("X", { text: "a", linkUrl: "https://x.co", x: { postType: "article" } })).toBe(20)
  })
})

describe("splitIntoThreadSegments", () => {
  it("短文不切；每段都 ≤280", () => {
    expect(splitIntoThreadSegments("hello")).toEqual(["hello"])
    const segs = splitIntoThreadSegments("字".repeat(650))
    expect(segs.length).toBe(3)
    for (const s of segs) expect(s.length).toBeLessThanOrEqual(280)
  })
  it("空文本 → 空数组", () => {
    expect(splitIntoThreadSegments("   ")).toEqual([])
  })
})
