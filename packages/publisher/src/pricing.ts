// Provider cost 估算表——对应 spec §11/§16 的 "provider cost applies per auto publish"。
//
// 这里返回的是「第三方真实成本（美分）」，不是 GLBGPT credits。
// credits 换算率是 GLBGPT 侧的事，由 BillingGateway 负责，本层不臆造换算率（铁律：不猜、直接暴露事实）。
//
// 数据核实日期：2026-07（详见 docs/social-platform-publishing-integration.zh.md 的成本调研）：
//   · X：2026-02-06 起对新开发者默认「按次付费」——$0.015/条（1.5 美分）；帖子含链接则 $0.20/条（20 美分）。
//     ⇒ 社媒运营的帖子基本都带 CTA 链接，实际成本按 20 美分/条估更贴近真相。
//   · Meta（Instagram / Facebook）：Graph API 调用 $0，成本在 app review + 维护人力，不按帖计 ⇒ 0。
//   · TikTok / YouTube / Reddit：P0 手动兜底、不走自动发布 ⇒ 0（不产生自动发布 provider cost）。
//   · 聚合服务模式：按 profile/月订阅、非按帖，单帖边际成本≈0 ⇒ 这里记 0，月费在订阅层另算。

import type { Platform, PublishContent } from "@social/shared"
import { splitIntoThreadSegments, X_TWEET_MAX } from "./x/client"

/** 估算某平台发一条内容的第三方成本（美分）。带链接会显著抬高 X 的成本；串推按实际条数累加。 */
export function estimateProviderCostUsdCents(platform: Platform, content: PublishContent): number {
  switch (platform) {
    case "X": {
      // 单条成本：含链接（linkUrl 或正文里带 http）走 $0.20 档，否则 $0.015 档。
      const perTweet = hasLink(content) ? 20 : 1.5
      // 串推是 N 条推文，X 按条收费——成本 ×条数；article 是一次发布，按单条计。
      const count = xTweetCount(content)
      return perTweet * count
    }
    default:
      return 0
  }
}

/** X 本次发布实际会产生几条推文（thread=分段数，其余=1），用于按条估算成本。 */
function xTweetCount(content: PublishContent): number {
  if (content.x?.postType !== "thread") return 1
  const explicit = content.x.threadSegments?.map((s) => s.trim()).filter(Boolean)
  if (explicit && explicit.length > 0) return explicit.length
  const parts: string[] = []
  if (content.text?.trim()) parts.push(content.text.trim())
  if (content.hashtags?.trim()) parts.push(content.hashtags.trim())
  if (content.linkUrl?.trim()) parts.push(content.linkUrl.trim())
  return Math.max(1, splitIntoThreadSegments(parts.join("\n\n"), X_TWEET_MAX).length)
}

function hasLink(content: PublishContent): boolean {
  if (content.linkUrl && content.linkUrl.trim().length > 0) return true
  return /https?:\/\//i.test(content.text ?? "")
}
