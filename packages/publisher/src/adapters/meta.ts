// Meta 直连 adapter —— 同一实现服务 Instagram 与 Facebook（都走 Graph API，只是端点/步骤不同）。
//
// Instagram（Business/Creator 账号，需绑定 FB Page）：两步——
//   1. POST /{ig-user-id}/media        { image_url, caption }        → 拿 creation_id
//   2. POST /{ig-user-id}/media_publish { creation_id }               → 拿 media_id
//   注意：IG 发图必须传「公网可访问的 image_url」，故依赖注入的 MediaResolver 把素材转公网 URL。
// Facebook（Page）：
//   POST /{page-id}/feed { message, link? }
//
// 成本：Graph API 调用 $0（成本在 app review + 维护），故 provider cost 记 0。

import type { Platform, PublishResult } from "@social/shared"
import { PLATFORM_CAPABILITIES } from "@social/shared"
import { PublisherError, PublisherNotConfiguredError } from "../errors"
import type { AdapterDeps, MediaResolver, PublishContext, SocialPublisher } from "../ports"
import { composeText, firstImage } from "../content"

export interface MetaConfig {
  /** Graph API 基址，默认 https://graph.facebook.com。 */
  apiBaseUrl?: string
  /** Graph API 版本，默认 v21.0。 */
  graphVersion?: string
}

export class MetaPublisher implements SocialPublisher {
  readonly platform: "Instagram" | "Facebook"
  readonly capability
  private readonly base: string

  constructor(
    platform: "Instagram" | "Facebook",
    private readonly deps: AdapterDeps,
    config: MetaConfig = {},
    private readonly media?: MediaResolver,
  ) {
    this.platform = platform
    this.capability = PLATFORM_CAPABILITIES[platform as Platform]
    const host = (config.apiBaseUrl ?? "https://graph.facebook.com").replace(/\/+$/, "")
    this.base = `${host}/${config.graphVersion ?? "v21.0"}`
  }

  async publish(ctx: PublishContext): Promise<PublishResult> {
    const token = ctx.connection?.accessToken
    const nodeId = ctx.connection?.externalAccountId // IG user id 或 FB page id
    if (!token || !nodeId) {
      throw new PublisherNotConfiguredError(
        `${this.platform} 发布缺少 access token / 目标节点 id（账号未完成 OAuth 连接）`,
      )
    }

    return this.platform === "Instagram"
      ? this.publishInstagram(ctx, token, nodeId)
      : this.publishFacebook(ctx, token, nodeId)
  }

  private async publishInstagram(
    ctx: PublishContext,
    token: string,
    igUserId: string,
  ): Promise<PublishResult> {
    const image = firstImage(ctx.content)
    if (!image) {
      // IG 不支持纯文本贴，必须有图 → 直接报错（铁律：不掩盖）。
      throw new PublisherError("unsupported_media", "Instagram 发布需要至少一张图片")
    }
    const imageUrl = image.url ?? (this.media ? await this.media.toPublicUrl(image) : undefined)
    if (!imageUrl) {
      throw new PublisherNotConfiguredError("Instagram 发图需要公网 image_url（未配置 MediaResolver）")
    }
    const caption = composeText(ctx.content, this.capability.maxTextLength)

    // step1：创建 media container
    const create = await this.deps.fetch(`${this.base}/${igUserId}/media`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form({ image_url: imageUrl, caption, access_token: token }),
    })
    if (!create.ok) {
      throw new PublisherError("provider_error", `IG 创建容器失败 ${create.status}: ${await safeBody(create)}`)
    }
    const creationId = ((await create.json()) as { id?: string }).id
    if (!creationId) throw new PublisherError("provider_error", "IG 未返回 creation_id")

    // step2：发布
    const publish = await this.deps.fetch(`${this.base}/${igUserId}/media_publish`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form({ creation_id: creationId, access_token: token }),
    })
    if (!publish.ok) {
      throw new PublisherError("provider_error", `IG 发布失败 ${publish.status}: ${await safeBody(publish)}`)
    }
    const remoteId = ((await publish.json()) as { id?: string }).id
    if (!remoteId) throw new PublisherError("provider_error", "IG 未返回 media id")

    return { outcome: "published", platform: "Instagram", accountId: ctx.target.accountId, remoteId }
  }

  private async publishFacebook(
    ctx: PublishContext,
    token: string,
    pageId: string,
  ): Promise<PublishResult> {
    const message = composeText(ctx.content, this.capability.maxTextLength)
    const params: Record<string, string> = { message, access_token: token }
    if (ctx.content.linkUrl?.trim()) params.link = ctx.content.linkUrl.trim()

    const res = await this.deps.fetch(`${this.base}/${pageId}/feed`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form(params),
    })
    if (res.status === 401 || res.status === 403) {
      throw new PublisherError("permission_missing", `Facebook 权限不足（${res.status}）`)
    }
    if (!res.ok) {
      throw new PublisherError("provider_error", `Facebook 发布失败 ${res.status}: ${await safeBody(res)}`)
    }
    const remoteId = ((await res.json()) as { id?: string }).id
    if (!remoteId) throw new PublisherError("provider_error", "Facebook 未返回 post id")

    return {
      outcome: "published",
      platform: "Facebook",
      accountId: ctx.target.accountId,
      remoteId,
      remoteUrl: `https://www.facebook.com/${remoteId}`,
    }
  }
}

function form(params: Record<string, string>): string {
  return new URLSearchParams(params).toString()
}

async function safeBody(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 300)
  } catch {
    return "<no body>"
  }
}
