import { AUTO_PLATFORMS } from "@/features/social/store"
import type { Platform, PostVariant, VariantState } from "@social/shared"
import { CircleCheck, TriangleAlert } from "lucide-react"

/* ---------- calendar day options ---------- */
export const DAYS = ["Mon Jul 6", "Tue Jul 7", "Wed Jul 8", "Thu Jul 9", "Fri Jul 10", "Sat Jul 11", "Sun Jul 12"]

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
  "Manual fallback": { label: "Manual fallback", cls: "bg-[oklch(0.96_0.04_70)] text-[oklch(0.48_0.13_55)]", icon: TriangleAlert },
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
  if (v.accountType === "connected" && (v.platform === "TikTok" || v.platform === "YouTube")) return "Unsupported"
  return "Manual fallback"
}

export function copyTypeLabel(v: Pick<PostVariant, "platform" | "format">): string {
  switch (v.platform) {
    case "TikTok":
      return "TikTok caption (on-screen text)"
    case "Instagram":
      return isReelsCover(v) ? "Instagram Reels caption" : "Instagram caption"
    case "YouTube":
      return /short/i.test(v.format) ? "YouTube Shorts caption" : "YouTube title + description"
    case "X":
      return "X post"
    case "Reddit":
      return "Reddit title + body"
    case "Facebook":
      return "Facebook post"
  }
}

export function validations(v: PostVariant): { text: string; ok: boolean }[] {
  const out: { text: string; ok: boolean }[] = []
  out.push(v.body.trim() ? { text: "Copy length OK", ok: true } : { text: "Copy needs content before publishing", ok: false })
  if (v.mediaAsset === "No media") out.push({ text: "Text-only post — no media attached", ok: true })
  else out.push({ text: `Media ratio set to ${ratioOf(v.format)} (${v.mediaAsset})`, ok: true })
  if (v.accountType === "manual") out.push({ text: "Manual account: automatic publishing unavailable", ok: false })
  if (v.platform === "YouTube") out.push({ text: "YouTube video upload is out of P0 scope", ok: false })
  if (v.platform === "TikTok") out.push({ text: "TikTok video generation is not supported in P0", ok: false })
  if (isReelsCover(v)) out.push({ text: "Reels video generation is not supported in P0", ok: false })
  if (v.platform === "Reddit") out.push({ text: "Subreddit rules apply — review before posting", ok: false })
  return out
}
