// 聚合服务 adapter —— 「直连各平台」的替代方案，同一个 port 背后换一套实现。
//
// 商业动机（见调研文档）：直连每个平台都要单独做 OAuth + app review + token 刷新 + 媒体上传 + 限流处理，
// 6 个平台 = 6 套大工程且持续维护。聚合服务（Ayrshare / Postiz / Mixpost 等）一次接入覆盖多平台、代管授权与审核，
// 代价是按 profile/月订阅 + 数据过第三方。到底选哪条路是产品/成本决策——但因为都藏在 SocialPublisher 后面，
// 之后切换只换这一层，编排/路由/前端不动（这正是抽象出 port 的意义）。
//
// 下面按「统一 API」的通用形态实现（以 Ayrshare 风格为模板：POST /post + Profile-Key 头选账号）。
// 具体字段以选定服务商文档为准，联调时对齐。缺 apiKey → 抛 not_configured（联调前的正常状态）。

import type { Platform, PublishResult } from "@social/shared"
import { PLATFORM_CAPABILITIES } from "@social/shared"
import { PublisherError, PublisherNotConfiguredError } from "../errors"
import type { AdapterDeps, PublishContext, SocialPublisher } from "../ports"

export interface AggregatorConfig {
  /** 聚合服务 API 基址（如 https://api.ayrshare.com/api）。 */
  apiBaseUrl?: string
  /** 服务商 API Key。缺失即视为未接通。 */
  apiKey?: string
}

// 平台名 → 聚合服务约定的小写标识。
const PLATFORM_SLUG: Partial<Record<Platform, string>> = {
  X: "twitter",
  Instagram: "instagram",
  Facebook: "facebook",
}

export class AggregatorPublisher implements SocialPublisher {
  readonly platform: Platform
  readonly capability
  private readonly base: string

  constructor(
    platform: Platform,
    private readonly deps: AdapterDeps,
    private readonly config: AggregatorConfig = {},
  ) {
    this.platform = platform
    this.capability = PLATFORM_CAPABILITIES[platform]
    this.base = (config.apiBaseUrl ?? "https://api.ayrshare.com/api").replace(/\/+$/, "")
  }

  async publish(ctx: PublishContext): Promise<PublishResult> {
    if (!this.config.apiKey) {
      throw new PublisherNotConfiguredError(`聚合服务未配置 apiKey，${this.platform} 自动发布未接通`)
    }
    const slug = PLATFORM_SLUG[this.platform]
    if (!slug) throw new PublisherError("unsupported_platform", `聚合服务未映射平台 ${this.platform}`)

    const body: Record<string, unknown> = {
      post: [ctx.content.text?.trim(), ctx.content.hashtags?.trim()].filter(Boolean).join("\n\n"),
      platforms: [slug],
    }
    const mediaUrls = (ctx.content.media ?? []).map((m) => m.url).filter(Boolean)
    if (mediaUrls.length) body.mediaUrls = mediaUrls
    // profileKey 选中「这个账号」对应的聚合服务 profile（连接时建立映射，存在 externalAccountId）。
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.config.apiKey}`,
      "content-type": "application/json",
    }
    if (ctx.connection?.externalAccountId) headers["Profile-Key"] = ctx.connection.externalAccountId

    const res = await this.deps.fetch(`${this.base}/post`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    })
    if (res.status === 429) throw new PublisherError("rate_limited", "聚合服务限流（429）")
    if (!res.ok) {
      throw new PublisherError("provider_error", `聚合服务发布失败 ${res.status}: ${await safeBody(res)}`)
    }

    const data = (await res.json()) as { id?: string; postIds?: Array<{ id?: string; postUrl?: string }> }
    const first = data.postIds?.[0]
    const remoteId = first?.id ?? data.id
    if (!remoteId) throw new PublisherError("provider_error", "聚合服务返回缺少 post id")

    return {
      outcome: "published",
      platform: this.platform,
      accountId: ctx.target.accountId,
      remoteId,
      remoteUrl: first?.postUrl,
    }
  }
}

async function safeBody(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 300)
  } catch {
    return "<no body>"
  }
}
