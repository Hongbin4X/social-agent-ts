// 领域常量：平台枚举、内容目标、自动发布能力、计费表。
// 抽到 @social/shared 是为了让前端展示、前端计费确认、后端预扣/回写都引用同一份，避免 P0 铁律（计费必须先确认）在多端各写各的漂移。

import type { BillingActionType, ContentGoal, Platform } from "./types"

export const ALL_PLATFORMS: Platform[] = [
  "TikTok",
  "Instagram",
  "YouTube",
  "X",
  "Reddit",
  "Facebook",
]

export const CONTENT_GOALS: ContentGoal[] = [
  "Grow awareness",
  "Get followers",
  "Generate leads",
  "Drive trial",
  "Drive purchase",
  "Launch campaign",
]

// spec §3：P0 只有 X / Instagram / Facebook 支持自动发布；其余进入 Manual fallback。
export const AUTO_PLATFORMS: Platform[] = ["X", "Instagram", "Facebook"]

export function platformPublishMode(platform: Platform): "auto" | "manual" {
  return AUTO_PLATFORMS.includes(platform) ? "auto" : "manual"
}

// spec §16 计费表：每个付费动作的预计 credits。前端在动作前展示、等用户确认；后端据此向 GLBGPT 计费系统预扣。
// 注意：publish 另计 provider cost per auto publish（见 spec §11），不含在这个 estimated 值里。
export const CREDIT_COSTS: Record<BillingActionType, number> = {
  generateProfileDraft: 12,
  generatePlan: 24,
  generateVariants: 16,
  regenerateImage: 30,
  modifyImage: 20,
  publish: 12,
  generateRecommendations: 18,
}
