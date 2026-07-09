// 领域类型：Super Social Agent 全站共享。
// 来源于原型 lib/social/types.ts，抽到 @social/shared 让前端 apps/web 与未来后端 apps/server 复用同一份契约。
// 铁律5/8：这里是前后端唯一的数据契约来源，改字段先改这里，别在各端各写一份。

export type Platform =
  | "TikTok"
  | "Instagram"
  | "YouTube"
  | "X"
  | "Reddit"
  | "Facebook"

export type PostStatus =
  | "Draft"
  | "Ready"
  | "Planned"
  | "Scheduled"
  | "Publishing"
  | "Published"
  | "Failed"
  | "Cancelled"
  | "ManualFallback"
  | "ManuallyPublished"
  | "Archived"

export type AccountStatus =
  | "NotConnected"
  | "Connected"
  | "Expired"
  | "PermissionMissing"
  | "UnsupportedPublishing"
  | "Error"

export type AccountType = "manual" | "connected"

export type PublishMode = "auto" | "manual"

export type VariantState = "Valid" | "Needs edits" | "Manual fallback" | "Unsupported"

export type ContentGoal =
  | "Grow awareness"
  | "Get followers"
  | "Generate leads"
  | "Drive trial"
  | "Drive purchase"
  | "Launch campaign"

export interface Account {
  id: string
  platform: Platform
  type: AccountType
  name: string
  url: string
  status: AccountStatus
  expiresAt?: string
  capabilities: string
  notes?: string
}

export interface BrandProfile {
  brandName: string
  websiteUrl: string
  productUrl: string
  description: string
  targetMarket: string
  targetAudience: string
  contentGoals: ContentGoal[]
  platforms: Platform[]
  weeklyFrequency: number
  tone: string
  defaultCta: string
  hashtags: string
  forbiddenTopics: string
  brandColors: string
  visualStyle: string
}

export interface Workspace {
  id: string
  name: string
  brandName: string
  description: string
  targetMarket: string
  platforms: Platform[]
  primaryGoal: ContentGoal
  timezone: string
  websiteUrl?: string
  tone?: string
}

export interface PlanItem {
  id: string
  date: string
  time: string
  topic: string
  pillar: string
  goal: ContentGoal
  platforms: Platform[]
  assetType: string
  cta: string
  status: "Planned" | "In studio" | "Scheduled"
}

export interface PostVariant {
  platform: Platform
  account: string
  accountType?: AccountType
  hook: string
  body: string
  hashtags: string
  cta: string
  ctaUrl?: string
  format: string
  mediaAsset?: string
  publishMode: PublishMode
  state: VariantState
  suggestedTime: string
}

export interface SocialPost {
  id: string
  title: string
  platforms: Platform[]
  assetType: string
  status: PostStatus
  tags: string[]
  updatedAt: string
  owner: string
  variants: PostVariant[]
  hasImage: boolean
  failureReason?: string
}

export interface CalendarItem {
  id: string
  postId: string
  topic: string
  date: string
  time: string
  status: PostStatus
  variants: {
    platform: Platform
    account: string
    time: string
    publishMode: PublishMode
    status: PostStatus
    reason?: string
  }[]
}

export interface Toast {
  id: string
  message: string
  tone: "default" | "success" | "warn"
}

export interface OpsMetric {
  key: string
  label: string
  value: string
  delta?: string
  trend: "up" | "down" | "flat"
  available: boolean
}

export interface OpsSeriesPoint {
  label: string
  published: number
  impressions: number
}

export interface OpsPlatformRow {
  platform: Platform
  posts: number
  impressions: string
  engagementRate: string
  available: boolean
}

export interface OpsTopPost {
  id: string
  title: string
  platform: Platform
  metric: string
  value: string
}

export interface Recommendation {
  id: string
  title: string
  detail: string
  impact: "High" | "Medium" | "Low"
}

// GLBGPT 计费记录（spec §14.8）。P0 前端只做展示与确认，实际预扣/回写由后端接 GLBGPT 计费系统。
export interface BillingUsageRecord {
  id: string
  userId: string
  workspaceId: string
  projectId: string
  actionType: BillingActionType
  estimatedCredits: number
  actualCredits?: number
  providerCost?: number
  model?: string
  status: "estimated" | "reserved" | "settled" | "refunded" | "failed"
  createdAt: string
}

// 需要计费确认的动作类型（与 CREDIT_COSTS 一一对应）。
export type BillingActionType =
  | "generateProfileDraft"
  | "generatePlan"
  | "generateVariants"
  | "regenerateImage"
  | "modifyImage"
  | "publish"
  | "generateRecommendations"
