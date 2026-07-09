// 内容生成层的数据契约（前后端 + @social/agent 共用的唯一真源）。
//
// 设计动机（铁律7 第一性原理 / 铁律2 别过度工程 / 用户 2026-07-09 需求 §3）：
//   生成一条帖子的本质 = 「品牌上下文 + 用户主题 + 目标平台」→「按平台定制的内容」。
//   N 个平台 → N 条变体，每条按该平台的语气/格式/媒体规则定制。
//   底层可能是「一次 LLM 调用」也可能是「一个 Agent workflow」，但对上层（服务/路由/前端/计费）
//   暴露的应是同一套「请求 / 结果 / 计费口径」形状。所以这里只定义"形状"，不定义"怎么生成"
//   —— 那是 @social/agent 里 adapter 的事（现在给 deterministic 桩，联调时换真实模型/workflow）。
//
// 与 spec 的对应：
//   §10.2 Generate platform variants（N 平台 N 变体，定制化）→ GenerateVariantsInput/Output
//   §10.3 7-day plan                                        → GeneratePlanInput/Output
//   §8    Generate profile draft from URL                   → GenerateProfileDraftInput/Output
//   §10.2 Regenerate / Modify image                         → GenerateImageInput/Output
//   §13   AI recommendations                                → GenerateRecommendationsInput/Output
//   §16   每个付费动作先按 CREDIT_COSTS[actionType] 预扣     → CreditBillingGateway

import type {
  BillingActionType,
  ContentGoal,
  PlanItem,
  Platform,
  PostVariant,
  Recommendation,
} from "./types"

// ── 品牌上下文：喂给模型的"当前品牌档案"精简投影（生成的第一要素）──
export interface BrandContext {
  brandName: string
  description: string
  targetMarket: string
  targetAudience?: string
  tone?: string
  defaultCta?: string
  hashtags?: string
  websiteUrl?: string
  productUrl?: string
  forbiddenTopics?: string
  visualStyle?: string
  brandColors?: string
}

// ── 生成动作的输入/输出（按动作分型）──

/** 生成平台变体：topic + platforms + brand → 每平台 1 条 PostVariant（定制化）。 */
export interface GenerateVariantsInput {
  topic: string
  platforms: Platform[]
  brand: BrandContext
  /** 生成模式（P0：video 只做封面/caption，不产视频文件）。 */
  modes?: Array<"copy" | "image" | "video">
}
export interface GenerateVariantsOutput {
  variants: PostVariant[]
}

/** 7 天计划。 */
export interface GeneratePlanInput {
  planName: string
  primaryGoal: ContentGoal
  topicTheme?: string
  platforms: Platform[]
  brand: BrandContext
}
export interface GeneratePlanOutput {
  items: PlanItem[]
}

/** 从 URL 生成品牌档案草稿：只补缺失字段，不覆盖已填（spec §8）。 */
export interface GenerateProfileDraftInput {
  websiteUrl: string
  brand: Partial<BrandContext>
}
export interface GenerateProfileDraftOutput {
  /** 仅包含新补的字段。 */
  patch: Partial<BrandContext>
}

/** 生成/修改图片。P0 只做封面/缩略图等，不产视频文件。instruction 存在 = Modify。 */
export interface GenerateImageInput {
  platform: Platform
  format: string
  mediaAsset?: string
  hook: string
  body: string
  brand: BrandContext
  /** 自然语言修改要求（Modify image）；缺省 = 全新生成（Regenerate）。 */
  instruction?: string
  /** 图片槽描述：有值时作为出图 prompt 主来源（取代 hook+body 拼接）。 */
  description?: string
}
export interface GenerateImageOutput {
  assetUrl: string
  mimeType: string
  ratio: string
}

/** 运营推荐（只给建议，不自动改内容/排期/发布，spec §13）。 */
export interface GenerateRecommendationsInput {
  brand: BrandContext
  /** 运营指标摘要文本（可选，供模型参考）。 */
  metricsSummary?: string
}
export interface GenerateRecommendationsOutput {
  recommendations: Recommendation[]
}

// ── 模型调用元数据（对齐 yanfa 的 t_model_usage：feature/model/tokens）──
export interface GenerationUsage {
  model?: string
  vendor?: string
  requestTokens?: number
  responseTokens?: number
}

// ── credits 计费网关（生成侧口径：CREDIT_COSTS[actionType]，是 GLBGPT credits，不是 provider usd cents）──
// 与 @social/publisher 的 provider-cost BillingGateway 互补、职责不同。
// server 侧同一个 GLBGPT 计费适配对象可同时实现两者 —— 接真计费只改一处（铁律2 不重复真源）。
// 三段式：reserve（预扣/冻结）→ 执行 → settle（回写 actual）或 refund（失败退款）。绝不假扣。
export interface CreditReservation {
  reservationId: string
  estimatedCredits: number
}
export interface CreditBillingContext {
  userId: string
  workspaceId: string
  projectId: string
  actionType: BillingActionType
}
export interface CreditBillingGateway {
  reserveCredits(input: CreditBillingContext & { estimatedCredits: number }): Promise<CreditReservation>
  settleCredits(reservationId: string, actualCredits: number, usage?: GenerationUsage): Promise<void>
  refundCredits(reservationId: string): Promise<void>
}

// ── 生成错误码（可辨识联合，路由据此映射响应）──
export type GenerationErrorCode =
  | "not_configured" // 模型层未接通（未配 GLBGPT 模型 key）
  | "model_error" // 上游模型报错
  | "content_invalid" // 输入不合法（空 topic / 无平台）
  | "rate_limited"
  | "unsupported" // 平台/模式不支持（如 P0 不生成视频文件）
