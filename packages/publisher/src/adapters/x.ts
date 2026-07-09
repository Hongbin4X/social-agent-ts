// X（Twitter）直连 adapter —— 自动发布平台。
//
// API：X API v2  POST /2/tweets（OAuth2 user context，Bearer 为账号 access token）。
// 成本（见 pricing.ts / 调研文档）：2026-02-06 起按次付费，$0.015/条，带链接 $0.20/条——由 service 走计费网关预扣。
// P0 只发「文本 + 内联链接」；图片走 v1.1 media/upload 拿 media_ids 的流程留待联调（下方 TODO）。

import type { PublishResult } from "@social/shared"
import { PLATFORM_CAPABILITIES } from "@social/shared"
import { PublisherError, PublisherNotConfiguredError } from "../errors"
import type { AdapterDeps, PublishContext, SocialPublisher } from "../ports"
import { composeText } from "../content"

export interface XConfig {
  /** X API 基址，默认 https://api.twitter.com。 */
  apiBaseUrl?: string
}

export class XPublisher implements SocialPublisher {
  readonly platform = "X" as const
  readonly capability = PLATFORM_CAPABILITIES.X
  private readonly base: string

  constructor(private readonly deps: AdapterDeps, config: XConfig = {}) {
    this.base = (config.apiBaseUrl ?? "https://api.twitter.com").replace(/\/+$/, "")
  }

  async publish(ctx: PublishContext): Promise<PublishResult> {
    const token = ctx.connection?.accessToken
    if (!token) {
      // 走到这一步说明 service 没解析到连接却仍调了本 adapter——按未接通处理，不假装成功。
      throw new PublisherNotConfiguredError("X 发布缺少 access token（账号未完成 OAuth 连接）")
    }

    // 联调 TODO：若 ctx.content.media 有图片，先 POST https://upload.twitter.com/1.1/media/upload.json
    // 拿 media_id_string，再放进 body.media.media_ids。P0 先只发文本+链接。
    const text = composeText(ctx.content, this.capability.maxTextLength, { inlineLink: true })

    const res = await this.deps.fetch(`${this.base}/2/tweets`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ text }),
    })

    if (res.status === 429) throw new PublisherError("rate_limited", "X 触发限流（429）")
    if (res.status === 401 || res.status === 403) {
      throw new PublisherError("permission_missing", `X 授权无效/权限不足（${res.status}）`)
    }
    if (!res.ok) {
      throw new PublisherError("provider_error", `X 发布失败 ${res.status}: ${await safeBody(res)}`)
    }

    const data = (await res.json()) as { data?: { id?: string } }
    const remoteId = data?.data?.id
    if (!remoteId) throw new PublisherError("provider_error", "X 返回缺少 tweet id")

    return {
      outcome: "published",
      platform: "X",
      accountId: ctx.target.accountId,
      remoteId,
      remoteUrl: `https://x.com/i/web/status/${remoteId}`,
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
