// 文案拼装 / 长度校验小工具，各 adapter 共用，避免每个平台各写一份。

import type { PublishContent } from "@social/shared"
import { PublisherError } from "./errors"

/**
 * 把一条 variant 拼成可发布纯文本：正文 +（空行）hashtags。
 * inlineLink=true 的平台（如 X 没有独立链接字段）把 CTA 链接内联进正文；
 * 其余平台（如 Facebook 有独立 link 参数）不内联，由 adapter 单独带上。
 * 超长/空 → 抛 content_invalid（铁律：直接报错，不静默截断）。
 */
export function composeText(
  content: PublishContent,
  maxLength: number,
  opts: { inlineLink?: boolean } = {},
): string {
  const parts: string[] = []
  if (content.text?.trim()) parts.push(content.text.trim())
  if (content.hashtags?.trim()) parts.push(content.hashtags.trim())
  if (opts.inlineLink && content.linkUrl?.trim()) parts.push(content.linkUrl.trim())

  const text = parts.join("\n\n")
  if (text.length === 0) throw new PublisherError("content_invalid", "发布内容为空")
  if (text.length > maxLength) {
    throw new PublisherError("content_invalid", `文案 ${text.length} 字超过平台上限 ${maxLength}`)
  }
  return text
}

/** 从内容里挑出第一张图片（P0 只处理图片；视频不自动发）。 */
export function firstImage(content: PublishContent) {
  return content.media?.find((m) => m.kind === "image")
}
