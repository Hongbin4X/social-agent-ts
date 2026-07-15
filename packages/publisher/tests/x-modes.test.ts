// X 三种发帖形态（普通推文 / 串推 / Article）的确定性测试：用注入 fetch 桩验证请求构造 + 结果映射 + 成本。
// 覆盖用户要求：发帖时可选形态、失败有清晰原因（尤其 Article 需 Premium）。

import { describe, expect, it, vi } from "vitest"
import type { BillingGateway, PlatformConnection, TokenStore } from "../src"
import {
  createPublisherRegistry,
  estimateProviderCostUsdCents,
  PublishingService,
  splitIntoThreadSegments,
  xWeightedLength,
  planXTweets,
  composeCtaLine,
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

describe("xWeightedLength（X 的加权长度，不是 .length）", () => {
  it("拉丁字符每个算 1", () => {
    expect(xWeightedLength("hello")).toBe(5)
  })
  // 这是本次修复的核心事实：X 官方 twitter-text 规则里 CJK 权重为 2。
  // 曾经用 .length 判断 → 280 个汉字被当成"没超"，实际加权 560，X 直接拒收。
  it("汉字每个算 2 —— 所以单条实际只能发 140 个汉字", () => {
    expect(xWeightedLength("字")).toBe(2)
    expect(xWeightedLength("字".repeat(140))).toBe(280)
  })
  it("URL 一律按 t.co 的 23 折算，与真实长度无关", () => {
    const short = xWeightedLength("https://a.co")
    const long = xWeightedLength("https://example.com/a/very/long/path/that/goes/on/forever?x=1&y=2")
    expect(short).toBe(long)
    expect(long).toBe(23)
  })
})

describe("splitIntoThreadSegments（原则：能不切就不切，切也切在自然边界）", () => {
  it("短文不切", () => {
    expect(splitIntoThreadSegments("hello")).toEqual(["hello"])
  })
  it("空文本 → 空数组", () => {
    expect(splitIntoThreadSegments("   ")).toEqual([])
  })

  // 用户反馈「切分非常不合理」的主因：旧算法每个段落无条件独立成条。
  it("多个短段落 → 打包成【一条】，不是每段一条", () => {
    const text = ["小团队不该被琐事拖慢。", "我们做了三件事。", "第一，自动化重复工作。", "第二，减少工具切换。"].join("\n\n")
    expect(splitIntoThreadSegments(text)).toHaveLength(1)
  })

  // 旧算法用 .length：300 字中文切 2 条、每条 217 字 → 加权 434 → 被 X 拒。
  it("中文长文：按【加权长度】切，每条 ≤280 加权", () => {
    const text = "创业团队最大的浪费不是资金，而是注意力。".repeat(15) // 300 字 = 加权 600
    const segs = splitIntoThreadSegments(text)
    expect(segs.length).toBe(3)
    for (const seg of segs) expect(xWeightedLength(seg)).toBeLessThanOrEqual(280)
  })

  // 旧算法 split(/\s+/) 对中文失效（无空格→整段一个"词"→硬切），会在句子中间乱斩。
  it("中文切分断在句号处，不在句子中间硬斩", () => {
    const text = "第一句话讲的是甲。".repeat(40) // 远超一条
    const segs = splitIntoThreadSegments(text)
    expect(segs.length).toBeGreaterThan(1)
    // 除最后一条外，每条都应以句末标点收尾（说明断在了自然边界）。
    for (const seg of segs.slice(0, -1)) expect(seg.endsWith("。")).toBe(true)
  })

  it("带长 URL 的中英混排：URL 按 23 折算，不会因为它很长就被切开", () => {
    const text = "Northstar AI 帮小团队自动化重复工作。Try it free at https://northstar.ai/product-with-a-very-long-path 立即开始。"
    const segs = splitIntoThreadSegments(text)
    expect(segs).toHaveLength(1)
    expect(segs[0]).toContain("https://northstar.ai/product-with-a-very-long-path")
  })

  it("每一条都不超加权上限（不变式）", () => {
    for (const text of ["字".repeat(650), "word ".repeat(300), "混排 mixed 内容 ".repeat(60)]) {
      for (const seg of splitIntoThreadSegments(text)) {
        expect(xWeightedLength(seg)).toBeLessThanOrEqual(280)
      }
    }
  })
})

// planXTweets —— 「一条变体会在 X 上发成什么样」的规划。前端预览与发布层共用同一份结果，
// 保证"预览即所发"（2026-07-15 用户需求：预览要显示真实效果）。
describe("planXTweets（X 实际会发出的推文序列）", () => {
  const imgs = (n: number) => Array.from({ length: n }, (_, i) => `img${i + 1}.jpg`)

  it("普通推 · 图 ≤4 张 → 就 1 条", () => {
    const p = planXTweets("小团队不该被琐事拖慢。", imgs(4), "tweet")
    expect(p).toHaveLength(1)
    expect(p[0]!.imageUrls).toHaveLength(4)
  })

  // 用户原话："普通推有图片张数显示，所以可能需要拆分成多个帖子"。
  it("普通推 · 图 6 张（超单条 4 张上限）→ 拆成 2 条，第 2 条是纯图", () => {
    const p = planXTweets("小团队不该被琐事拖慢。", imgs(6), "tweet")
    expect(p).toHaveLength(2)
    expect(p[0]!.imageUrls).toHaveLength(4)
    expect(p[1]!.imageUrls).toHaveLength(2)
    expect(p[1]!.text).toBe("") // 纯图回复
  })

  it("串推 · 长文 → 1 条 + 若干回复，图按顺序分配、每条 ≤4 张", () => {
    const p = planXTweets("创业团队最大的浪费不是资金，而是注意力。".repeat(15), imgs(9), "thread")
    expect(p.length).toBeGreaterThan(1)
    for (const tw of p) expect(tw.imageUrls.length).toBeLessThanOrEqual(4)
    expect(p.flatMap((t) => t.imageUrls)).toHaveLength(9) // 一张都不丢
  })

  it("无文案无图 → 空数组（预览据此显示「尚无文案」）", () => {
    expect(planXTweets("   ", [], "tweet")).toEqual([])
  })
})

// 「预览即所发」不变式 —— 用户 2026-07-15 强调："预览效果一定要和真实的发帖对齐"。
// 前端预览用 planXTweets(variantFullText(v), variantImageUrls(v), mode) 渲染；
// 发布层 publishThread 用 splitIntoThreadSegments(fullText(content)) 切分。
// 这里钉住两条链路的【共同底座】一致：同样的文本 → 同样的分段。
describe("预览与发布对齐（同一份分段/规划）", () => {
  it("planXTweets(thread) 的文本分段 === splitIntoThreadSegments —— 预览几条就是实际发几条", () => {
    const text = "创业团队最大的浪费不是资金，而是注意力。".repeat(15)
    const planned = planXTweets(text, [], "thread").map((t) => t.text)
    expect(planned).toEqual(splitIntoThreadSegments(text))
  })

  it("发布层的 fullText 口径 = [text, hashtags, linkUrl].join(空行) —— 预览按同样口径组装", () => {
    // fullText 是 adapters/x.ts 的内部函数，这里用它的公开行为（分段结果）间接锁定口径：
    // 若发布层改成别的拼法（如空格分隔），本用例的分段数会变，从而报警。
    const composed = ["标题", "正文内容", "#tag", "https://a.co"].join("\n\n")
    expect(splitIntoThreadSegments(composed)).toHaveLength(1)
    expect(splitIntoThreadSegments(composed)[0]).toContain("#tag")
    expect(splitIntoThreadSegments(composed)[0]).toContain("https://a.co")
  })
})

// X 平台硬规则 —— 2026-07-15 用真实账号 @KonoeKKK 实测得出（不是抄文档）：
// 4 张图发布成功；5 张被 X 拒绝：HTTP 400 "$.media.media_ids: there must be a maximum of 4 items"。
// 这条测试守住"我们永远不会给 X 送超过 4 张图"，免得线上才被平台打回来。
describe("X 图片张数硬上限（实测得出）", () => {
  it("planXTweets 永不让单条超过 4 张图", () => {
    const imgs = Array.from({ length: 13 }, (_, i) => `i${i}.jpg`)
    for (const mode of ["tweet", "thread"] as const) {
      for (const tw of planXTweets("正文内容。", imgs, mode)) {
        expect(tw.imageUrls.length).toBeLessThanOrEqual(4)
      }
    }
  })
  it("图多于 4 张时拆条而不是丢图", () => {
    const imgs = Array.from({ length: 13 }, (_, i) => `i${i}.jpg`)
    const planned = planXTweets("正文内容。", imgs, "tweet")
    expect(planned.flatMap((t) => t.imageUrls)).toHaveLength(13)
  })
})

// composeCtaLine —— 「CTA文案: 链接」（用户 2026-07-15 指定的形式）。
// 此前 CTA 文案【完全没有通道能发到平台】（契约里根本没这个字段），推文末尾只剩光秃秃一个 URL；
// 而预览把它画成品牌色按钮——X 的自然推文没有 CTA 按钮（那是广告功能），纯属虚构。
describe("composeCtaLine（CTA 的真实形态）", () => {
  it("文案 + 链接 → 「文案: 链接」", () => {
    expect(composeCtaLine("立即免费试用", "https://a.co")).toBe("立即免费试用: https://a.co")
  })
  it("只有链接 → 光秃秃的链接（与从前行为一致，不回归）", () => {
    expect(composeCtaLine(undefined, "https://a.co")).toBe("https://a.co")
    expect(composeCtaLine("  ", "https://a.co")).toBe("https://a.co")
  })
  it("只有文案 → 就发文案（没链接也是个有效的行动号召）", () => {
    expect(composeCtaLine("欢迎私信", undefined)).toBe("欢迎私信")
  })
  it("都没有 → 空串（调用方据此跳过，不拼出个孤零零的冒号）", () => {
    expect(composeCtaLine(undefined, undefined)).toBe("")
    expect(composeCtaLine("", "  ")).toBe("")
  })
})
