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

/**
 * X（Twitter）发布形态——用户发帖时选「怎么发」：
 * - tweet  ：普通单条推文（缺省，Free 档即可）。
 * - thread ：串推（长内容拆多条、后条 reply 前条串成 thread）。
 * - article：X Articles 长文。**硬门槛：发帖账号须是 X Premium 订阅者**，否则 X 直接 403。
 * 仅 X 生效；其它平台忽略。详见 publishing.ts 的 XPublishOptions。
 */
export type XPostType = "tweet" | "thread" | "article"

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
  // 当前激活的品牌档案 id（资源隔离锚点）。前端据此在挂载/切换时加载对应 project 的帖子/日历/档案。
  activeProjectId?: string | null
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

/** 一张内联配图槽：位置由正文 [[img:ref]] 决定，这里存描述与出图结果。 */
export interface ImageSlot {
  ref: number
  /** 详细图片描述——出图 prompt 的主来源，可编辑。 */
  description: string
  /** 比例（默认从平台 format 推，如 "1:1" / "16:9"）。 */
  ratio?: string
  status: "empty" | "generating" | "ready" | "failed"
  /** 出图后的可访问 URL（本地 /media 反代 / 将来 S3）。 */
  url?: string
  mimeType?: string
  failureReason?: string
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
  /** 真实生成图片的可访问 URL（本地 FS 经 /media 反代 / 将来 S3）。有值时预览展示真图而非占位。 */
  mediaUrl?: string
  publishMode: PublishMode
  state: VariantState
  suggestedTime: string
  /** 内联配图槽（image 模式生成/编辑）；正文用 [[img:ref]] 标记位置。 */
  imageSlots?: ImageSlot[]
  /** X 专用：本变体发帖形态（普通推/串推/长文）。仅 platform=X 有意义；缺省普通推文。 */
  xPostType?: XPostType
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
