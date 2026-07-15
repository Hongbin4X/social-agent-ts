// X（Twitter）直连 adapter —— 自动发布平台，支持三种发帖形态。
//
// 形态由 ctx.content.x.postType 决定（前端让用户选「普通推文 / 串推 / Article」）：
//   · tweet  （缺省）：单条推文 POST /2/tweets。文案含正文+hashtags+内联链接，超 280 字报错并提示改串推。
//   · thread ：串推——把长内容拆多条、后条 reply 前条串成 thread（X 上做长内容的原生方式）。
//   · article：X Articles 长文——建草稿→发布。⚠️ 账号须开通 X Premium，否则 403（映射成清晰可行动的报错）。
//
// 成本（见 pricing.ts）：X 2026-02-06 起按次付费，$0.015/条、带链接 $0.20/条——由 service 走计费网关预扣。
// 串推按「实际条数」抬高成本（见 pricing.estimateProviderCostUsdCents 对 thread 的处理）。
// 图片：三种形态 P0 均只发文本（v2 media/upload 需 media.write 付费档，常 403，留待联调补，绝不静默降级）。

import type { MediaRef, PublishResult } from "@social/shared"
import { PLATFORM_CAPABILITIES } from "@social/shared"
import { PublisherError, PublisherNotConfiguredError } from "../errors"
import type { AdapterDeps, PublishContext, SocialPublisher } from "../ports"
import { composeText } from "../content"
import { postArticle, postThread, postTweet, splitIntoThreadSegments, uploadMedia, X_TWEET_MAX } from "../x/client"
import { composeCtaLine } from "@social/shared"

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
    const username = ctx.connection?.externalAccountId // 仅当能拿到 @username 时拼更友好链接；否则 client 回退 i/web/status
    const postType = ctx.content.x?.postType ?? "tweet"
    const fetchImpl = this.deps.fetch

    if (postType === "thread") return this.publishThread(ctx, token, fetchImpl)
    if (postType === "article") return this.publishArticle(ctx, token, fetchImpl)
    return this.publishTweet(ctx, token, fetchImpl)
  }

  /** 普通单条推文（含图文：有图片就先上传拿 media_ids）。 */
  private async publishTweet(ctx: PublishContext, token: string, fetchImpl: typeof fetch): Promise<PublishResult> {
    let text: string
    try {
      text = composeText(ctx.content, this.capability.maxTextLength, { inlineLink: true })
    } catch (err) {
      // 超 280 字时，给出「改用串推」的可行动提示，而不是干巴巴的超限报错。
      if (err instanceof PublisherError && err.code === "content_invalid" && /超过平台上限/.test(err.message)) {
        throw new PublisherError("content_invalid", `${err.message}。单条推文上限 ${X_TWEET_MAX} 字，长内容请改用「串推」发布。`)
      }
      throw err
    }
    const mediaIds = await this.uploadImages(ctx.content.media, token, fetchImpl)
    const tweet = await postTweet({ accessToken: token, text, mediaIds, apiBaseUrl: this.base, fetchImpl })
    return { outcome: "published", platform: "X", accountId: ctx.target.accountId, remoteId: tweet.id, remoteUrl: tweet.url }
  }

  /** 串推：显式分段优先，否则从「正文+hashtags+链接」自动按 ≤280 分段。图片挂到首条。 */
  private async publishThread(ctx: PublishContext, token: string, fetchImpl: typeof fetch): Promise<PublishResult> {
    const explicit = ctx.content.x?.threadSegments?.map((s) => s.trim()).filter(Boolean)
    const segments = explicit && explicit.length > 0 ? explicit : splitIntoThreadSegments(fullText(ctx.content), X_TWEET_MAX)
    if (segments.length === 0) throw new PublisherError("content_invalid", "串推内容为空")
    const firstMediaIds = await this.uploadImages(ctx.content.media, token, fetchImpl)
    const thread = await postThread({ accessToken: token, segments, firstMediaIds, apiBaseUrl: this.base, fetchImpl })
    return { outcome: "published", platform: "X", accountId: ctx.target.accountId, remoteId: thread.id, remoteUrl: thread.url }
  }

  /** 把 content.media 里的图片（最多 4 张）取字节 → 上传 X → 返回 media_ids。无图返回 undefined。 */
  private async uploadImages(
    media: readonly MediaRef[] | undefined,
    token: string,
    fetchImpl: typeof fetch,
  ): Promise<string[] | undefined> {
    const images = (media ?? []).filter((m) => m.kind === "image" && m.url).slice(0, 4)
    if (images.length === 0) return undefined
    const ids: string[] = []
    for (const img of images) {
      const res = await fetchImpl(img.url!)
      if (!res.ok) throw new PublisherError("unsupported_media", `取图失败 ${res.status}：${img.url}`)
      const bytes = new Uint8Array(await res.arrayBuffer())
      const mimeType = res.headers.get("content-type")?.split(";")[0]?.trim() || guessMime(img.url!)
      ids.push(await uploadMedia({ accessToken: token, bytes, mimeType, fetchImpl }))
    }
    return ids
  }

  /** X Article 长文：标题 + 正文段落（+ hashtags/链接各成一段）。账号非 Premium 会 403。 */
  private async publishArticle(ctx: PublishContext, token: string, fetchImpl: typeof fetch): Promise<PublishResult> {
    const opts = ctx.content.x
    const bodySource = (opts?.articleBody ?? ctx.content.text ?? "").trim()
    // 标题：显式优先，否则取正文首行。
    const firstLine = bodySource.split(/\n/)[0]?.trim() ?? ""
    const title = (opts?.articleTitle?.trim() || firstLine || "Untitled").slice(0, 200)
    // 正文段落：若标题取自首行，正文就从第二段起，避免标题重复。
    const paragraphs = bodySource.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
    if (!opts?.articleBody && !opts?.articleTitle && paragraphs[0] === title && paragraphs.length > 1) {
      paragraphs.shift()
    }
    if (ctx.content.hashtags?.trim()) paragraphs.push(ctx.content.hashtags.trim())
    if (ctx.content.linkUrl?.trim()) paragraphs.push(ctx.content.linkUrl.trim())
    if (paragraphs.length === 0) throw new PublisherError("content_invalid", "Article 正文为空")

    const article = await postArticle({ accessToken: token, title, paragraphs, fetchImpl })
    return { outcome: "published", platform: "X", accountId: ctx.target.accountId, remoteId: article.postId, remoteUrl: article.url }
  }
}

/** 从 URL 扩展名猜图片 MIME（fetch 响应无 content-type 时兜底）。X v2 传图不认 octet-stream。 */
function guessMime(url: string): string {
  const ext = url.toLowerCase().split("?")[0]?.split(".").pop() ?? ""
  const map: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp" }
  return map[ext] ?? "image/jpeg"
}

/** 串推/长文用的「完整文本」：正文 +（空行）hashtags +（空行）链接，不做 280 上限校验（本就要拆分/长文）。 */
function fullText(content: PublishContext["content"]): string {
  const parts: string[] = []
  if (content.text?.trim()) parts.push(content.text.trim())
  if (content.hashtags?.trim()) parts.push(content.hashtags.trim())
  // CTA 拼成「文案: 链接」一行（composeCtaLine 是前后端共用的唯一真源——
  // 预览按它算长度/分段，这里按它拼实际发出去的文本，两边不会漂移）。
  const cta = composeCtaLine(content.ctaText, content.linkUrl)
  if (cta) parts.push(cta)
  return parts.join("\n\n")
}
