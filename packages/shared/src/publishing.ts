// 发布层数据契约（前后端 + @social/publisher 共用的唯一真源）。
//
// 设计动机（铁律7 第一性原理 / 铁律2 别过度工程）：
//   "接入各社交平台 API 真实发帖" 的本质是——把「一段内容」投递到「某个平台的某个账号」，
//   拿回「远程帖子 id / url」或「一个明确的失败/转手动结果」。不管底层是直连平台 API 还是走聚合服务，
//   对上层（后端路由、前端确认弹窗、计费）暴露的应该是同一套「请求 / 结果」形状。
//   所以这里只定义"形状"，不定义"怎么发"（那是 @social/publisher 里 adapter 的事）。
//
// 与 spec 的对应：
//   §3   平台能力矩阵（X/IG/FB 自动；TikTok/YouTube/Reddit 手动）→ PLATFORM_CAPABILITIES
//   §11  Confirm publishing 弹窗要展示的每平台信息 + provider cost → PublishTarget / PublishResult
//   §16  发布计费（12 credits + provider cost per auto publish）→ providerCostCredits 字段
//   §4   所有任务关联 userId/workspaceId/projectId/billingUsageRecordId → PublishRequest 的账务上下文

import type { AccountType, Platform, PublishMode } from "./types"
import { AUTO_PLATFORMS } from "./constants"

/** 单个平台的发布能力事实（文案上限、媒体支持、是否支持自动发布）。 */
export interface PlatformCapability {
  platform: Platform
  /** 是否支持 P0 自动发布。派生自 AUTO_PLATFORMS，避免与 spec §3 漂移。 */
  autoPublish: boolean
  /** 默认发布模式：auto 平台走真实 API，manual 平台走导出型手动流程。 */
  defaultMode: PublishMode
  /** 文案硬上限（字符数）。前端可据此做 pre-publish check（spec §10.2 Step2）。 */
  maxTextLength: number
  /** 是否支持图片自动发布。 */
  supportsImage: boolean
  /** 是否支持视频自动发布。P0 一律 false（spec §3：不做自动视频发布）。 */
  supportsVideo: boolean
  /** 给 UI/联调看的说明。 */
  notes: string
}

// 平台能力矩阵。autoPublish 从 AUTO_PLATFORMS 派生，spec §3 改了那里这里自动跟着变。
// maxTextLength 等为各平台公开事实（2026-07 值，联调时以平台文档为准）。
export const PLATFORM_CAPABILITIES: Record<Platform, PlatformCapability> = {
  X: cap("X", 280, { image: true, notes: "X API v2 POST /2/tweets；OAuth2 user context。媒体走 v1.1 media/upload（联调补）。" }),
  Instagram: cap("Instagram", 2200, { image: true, notes: "Graph API 两步：创建 media container → media_publish。要求 Business/Creator 账号且绑定 FB Page。图片需公网 URL。" }),
  Facebook: cap("Facebook", 63206, { image: true, notes: "Graph API POST /{page-id}/feed（图文）或 /photos。需 Page + pages_manage_posts 权限。" }),
  TikTok: cap("TikTok", 2200, { image: false, manual: true, notes: "P0 手动兜底：仅生成封面/caption，导出让用户自己发（spec §3）。" }),
  YouTube: cap("YouTube", 5000, { image: false, manual: true, notes: "P0 手动兜底：仅生成缩略图/标题/描述，不上传视频（spec §3）。" }),
  Reddit: cap("Reddit", 300, { image: false, manual: true, notes: "P0 手动兜底：导出标题/正文，用户自行发到目标 subreddit（spec §3）。" }),
}

// PLATFORM_CAPABILITIES 的构造小工具，避免每行重复写 autoPublish/defaultMode 的派生逻辑。
function cap(
  platform: Platform,
  maxTextLength: number,
  opts: { image: boolean; video?: boolean; manual?: boolean; notes: string },
): PlatformCapability {
  const autoPublish = AUTO_PLATFORMS.includes(platform) && !opts.manual
  return {
    platform,
    autoPublish,
    defaultMode: autoPublish ? "auto" : "manual",
    maxTextLength,
    supportsImage: opts.image,
    supportsVideo: opts.video ?? false, // P0 恒为 false
    notes: opts.notes,
  }
}

/** 要投递到的目标：某平台的某个账号。 */
export interface PublishTarget {
  platform: Platform
  /** SocialAccount.id（spec §14.4）。真实发布时由此换取该账号的 OAuth token。 */
  accountId: string
  /** manual 账号只能导出、不能自动发（spec §3）。缺省视为 connected。 */
  accountType?: AccountType
}

/** 一条媒体引用。P0 只用于图片；video 字段保留给未来，P0 不会自动上传。 */
export interface MediaRef {
  kind: "image" | "video"
  /** 素材库 id（后端解析成可投递的 URL/字节流）。与 url 二选一。 */
  assetId?: string
  /** 已是公网可访问的 URL（Instagram 发图必须公网 URL）。 */
  url?: string
  alt?: string
}

/** 要发布的内容（已按平台适配好的单条 variant，见 spec §14.6 PostVariant）。 */
export interface PublishContent {
  text: string
  hashtags?: string
  /** CTA 链接。注意：带链接会显著影响 X 的 provider cost（$0.20 vs $0.015/条）。 */
  linkUrl?: string
  media?: MediaRef[]
  /** 定时发布时间（ISO）。缺省=立即发布。 */
  scheduledAt?: string
}

/** 批量发布请求里的单项。 */
export interface PublishItem {
  target: PublishTarget
  content: PublishContent
}

/**
 * 一次发布请求（对应 spec §11 Confirm publishing / Batch publish）。
 * 账务上下文四件套是 spec §4 硬要求：所有任务必须关联 userId/workspaceId/projectId/billingUsageRecordId。
 */
export interface PublishRequest {
  userId: string
  workspaceId: string
  projectId: string
  /** 关联的 SocialPost.id（回写状态用）。 */
  postId?: string
  /** 前端"确认发布"后拿到的计费预扣凭证（spec §16：先预扣再执行）。 */
  billingReservationId?: string
  items: PublishItem[]
}

/** 发布失败的机器可读原因。 */
export type PublishErrorCode =
  | "not_connected" // 账号从未连接
  | "token_expired" // 授权过期
  | "permission_missing" // 权限缺失
  | "unsupported_platform" // 没有对应 adapter
  | "unsupported_media" // 媒体类型该平台 P0 不支持（如视频）
  | "content_invalid" // 文案超限/为空等
  | "rate_limited" // 触发平台限流
  | "provider_error" // 平台/聚合服务返回错误
  | "not_configured" // 本地缺少该平台的 API 配置（联调前的正常状态）

/** 进入手动兜底的原因（spec §3：这些是产品要求的一等结果，不是"降级掩盖错误"）。 */
export type ManualFallbackReason =
  | "platform_manual_only" // TikTok/YouTube/Reddit：平台天然只走手动
  | "manual_account" // 账号是 manual 类型
  | "token_expired" // 授权过期，退回手动
  | "permission_missing" // 权限缺失，退回手动
  | "unsupported_media" // 媒体不支持自动发，退回手动

/**
 * 单个 target 的发布结果。用 outcome 做可辨识联合，调用方 switch 处理，
 * 直接映射到 PostStatus（published→Published、scheduled→Scheduled、manual_fallback→ManualFallback、failed→Failed）。
 */
export type PublishResult =
  | PublishPublished
  | PublishScheduled
  | PublishManualFallback
  | PublishFailed

export interface PublishPublished {
  outcome: "published"
  platform: Platform
  accountId: string
  /** 平台侧帖子 id。 */
  remoteId: string
  remoteUrl?: string
  /** 本次自动发布产生的第三方成本（已换算成 GLBGPT credits，由计费网关回写）。 */
  providerCostCredits?: number
  /** ISO 时间。 */
  publishedAt?: string
}

export interface PublishScheduled {
  outcome: "scheduled"
  platform: Platform
  accountId: string
  scheduledAt: string
  providerCostCredits?: number
}

export interface PublishManualFallback {
  outcome: "manual_fallback"
  platform: Platform
  accountId?: string
  reason: ManualFallbackReason
  /** 给用户的手动发布指引/导出物提示（spec §10.4 Content Library 导出）。 */
  exportHint?: string
}

export interface PublishFailed {
  outcome: "failed"
  platform: Platform
  accountId?: string
  code: PublishErrorCode
  message: string
}

/** 批量发布的聚合结果。 */
export interface BatchPublishResult {
  results: PublishResult[]
  /** 本批次自动发布累计的 provider cost（credits）。 */
  totalProviderCostCredits: number
}
