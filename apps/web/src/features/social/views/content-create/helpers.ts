import { AUTO_PLATFORMS } from "@/features/social/store"
import { translate } from "@/features/social/i18n"
import type { Platform, PostVariant, VariantState } from "@social/shared"
import { CircleCheck, TriangleAlert } from "lucide-react"
import { currentWeekDays } from "@/features/social/lib/schedule-time"

/* ---------- calendar day options ---------- */
// 可选排期日 = 真实的本周（周一→周日）。曾经写死 2026-07-06~12，
// 导致用户只能选那一周、且与日历周视图的列头对不上（任务排了看不见）。
// 注：模块级求值 = 页面加载时算一次；这个原型不考虑跨零点长驻的场景。
export const DAYS = currentWeekDays()

/* ---------- per-platform option sets ---------- */
export const FORMAT_PRESETS: Record<Platform, string[]> = {
  TikTok: ["Cover 9:16"],
  Instagram: ["Feed 1:1", "Portrait 4:5", "Reels cover 9:16"],
  YouTube: ["Thumbnail 16:9", "Shorts cover 9:16"],
  X: ["Landscape 16:9", "Square 1:1"],
  Reddit: ["Text post · No media", "Link image 16:9"],
  Facebook: ["Landscape 1.91:1", "Square 1:1"],
}

export const MEDIA_OPTIONS: Record<Platform, string[]> = {
  TikTok: ["Cover image", "No media"],
  Instagram: ["Generated image", "Uploaded image", "No media"],
  YouTube: ["Thumbnail", "No media"],
  X: ["Generated image", "Uploaded image", "No media"],
  Reddit: ["No media", "Link image"],
  Facebook: ["Generated image", "Uploaded image", "No media"],
}

export const STATE_META: Record<VariantState, { label: string; cls: string; icon: typeof CircleCheck }> = {
  Valid: { label: "Valid", cls: "bg-[oklch(0.95_0.05_150)] text-status-published", icon: CircleCheck },
  "Needs edits": { label: "Needs edits", cls: "bg-[oklch(0.95_0.04_80)] text-[oklch(0.45_0.12_70)]", icon: TriangleAlert },
  Unsupported: { label: "Unsupported publishing", cls: "bg-[oklch(0.95_0.04_27)] text-status-failed", icon: TriangleAlert },
}

/* ---------- derivation helpers ---------- */
export const ratioOf = (format: string) => format.match(/(\d+(?:\.\d+)?:\d+)/)?.[1] ?? "1:1"
const isReelsCover = (v: Pick<PostVariant, "platform" | "format">) => v.platform === "Instagram" && /reel/i.test(v.format)

export function deriveMode(v: Pick<PostVariant, "platform" | "format" | "accountType">): "auto" | "manual" {
  if (v.accountType === "manual") return "manual"
  if (!AUTO_PLATFORMS.includes(v.platform)) return "manual"
  if (isReelsCover(v)) return "manual"
  return "auto"
}

export function deriveState(v: Pick<PostVariant, "platform" | "format" | "accountType" | "body">): VariantState {
  if (!v.body.trim()) return "Needs edits"
  const mode = deriveMode(v)
  if (mode === "auto") return "Valid"
  // 非 auto = 该平台不支持自动发布（TikTok/YouTube/Reddit）。原先这里返回 "Manual fallback"，
  // 但那套手动兜底已整套移除，事实就是"不支持"，不再假装有别的路可走。
  return "Unsupported"
}

export function copyTypeLabel(v: Pick<PostVariant, "platform" | "format">): string {
  // 平台名是专有名词、保持原样，只翻描述性词（caption/title/description/post 等）。
  switch (v.platform) {
    case "TikTok":
      return translate("TikTok caption (on-screen text)", "TikTok 文案（屏幕文字）")
    case "Instagram":
      return isReelsCover(v)
        ? translate("Instagram Reels caption", "Instagram Reels 文案")
        : translate("Instagram caption", "Instagram 文案")
    case "YouTube":
      return /short/i.test(v.format)
        ? translate("YouTube Shorts caption", "YouTube Shorts 文案")
        : translate("YouTube title + description", "YouTube 标题 + 描述")
    case "X":
      return translate("X post", "X 帖子")
    case "Reddit":
      return translate("Reddit title + body", "Reddit 标题 + 正文")
    case "Facebook":
      return translate("Facebook post", "Facebook 帖子")
  }
}

export function validations(v: PostVariant): { text: string; ok: boolean }[] {
  // 面向用户的检查项文案：用模块级 translate 就地双语（平台名/mediaAsset 数据值保持原样，P0 术语保留）。
  const out: { text: string; ok: boolean }[] = []
  out.push(
    v.body.trim()
      ? { text: translate("Copy length OK", "文案长度合适"), ok: true }
      : { text: translate("Copy needs content before publishing", "发布前文案需填写内容"), ok: false },
  )
  if (v.mediaAsset === "No media") out.push({ text: translate("Text-only post — no media attached", "纯文本帖子 — 未附带媒体"), ok: true })
  else
    out.push({
      text: translate(`Media ratio set to ${ratioOf(v.format)} (${v.mediaAsset})`, `媒体比例已设为 ${ratioOf(v.format)}（${v.mediaAsset}）`),
      ok: true,
    })
  if (v.accountType === "manual") out.push({ text: translate("Manual account: automatic publishing unavailable", "手动账号：无法自动发布"), ok: false })
  if (v.platform === "YouTube") out.push({ text: translate("YouTube video upload is out of P0 scope", "YouTube 视频上传不在 P0 范围内"), ok: false })
  if (v.platform === "TikTok") out.push({ text: translate("TikTok video generation is not supported in P0", "P0 暂不支持 TikTok 视频生成"), ok: false })
  if (isReelsCover(v)) out.push({ text: translate("Reels video generation is not supported in P0", "P0 暂不支持 Reels 视频生成"), ok: false })
  if (v.platform === "Reddit") out.push({ text: translate("Subreddit rules apply — review before posting", "需遵守子版块规则 — 发布前请先核对"), ok: false })
  return out
}
