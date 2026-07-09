// 生成层的「端口」定义（六边形架构 ports），与 @social/publisher 的 SocialPublisher 姊妹对称。
//
// 核心思想（铁律7 第一性原理）：把"AI 辅助生成内容"这件事收敛成一个稳定接口 ContentGenerator，
// 上层（service / 后端路由 / 前端）只依赖这个接口；底层用「确定性桩」还是「真 LLM / Agent workflow」
// 是可替换的 adapter。免 key 本地跑 → StubContentGenerator；填 env → LlmContentGenerator，编排/路由零改动。
//
// PromptTemplateProvider 是给"后台管理可覆盖平台 prompt"预留的端口：默认从内置模板取，
// 将来注入 DB 版即可让运营在后台改各平台 prompt，而不用改代码（数据驱动）。

import type {
  BillingActionType,
  GenerateImageInput,
  GenerateImageOutput,
  GeneratePlanInput,
  GeneratePlanOutput,
  GenerateProfileDraftInput,
  GenerateProfileDraftOutput,
  GenerateRecommendationsInput,
  GenerateRecommendationsOutput,
  GenerateVariantsInput,
  GenerateVariantsOutput,
  GenerationUsage,
  Platform,
} from "@social/shared"

/**
 * 统一生成端口。一个实现覆盖全部生成动作（内容变体 / 7 天计划 / 图片 / 运营推荐 / 品牌草稿）。
 * 这是全层唯一被上层依赖的抽象——adapter 怎么实现、调不调模型，上层一概不知。
 */
export interface ContentGenerator {
  readonly kind: "stub" | "llm"
  generateVariants(input: GenerateVariantsInput): Promise<GenerateVariantsOutput>
  generatePlan(input: GeneratePlanInput): Promise<GeneratePlanOutput>
  generateImage(input: GenerateImageInput): Promise<GenerateImageOutput>
  generateRecommendations(
    input: GenerateRecommendationsInput,
  ): Promise<GenerateRecommendationsOutput>
  generateProfileDraft(input: GenerateProfileDraftInput): Promise<GenerateProfileDraftOutput>
}

/**
 * 可选能力：报告"最近一次生成"消耗的 token 用量。
 * ContentGenerator 接口本身只返回领域结果（形状由 @social/shared 钉死，不塞 usage）；
 * 真实 token 用量通过这个可选副通道从 adapter 透传给 service，用于 settleCredits 回写。
 * StubContentGenerator 不实现它（桩不消耗 token）；LlmContentGenerator 实现它（累加 response.usage）。
 * drain 语义：取走并清空，供 service 在一次 run 内「调用生成 → 立刻 drain」配对使用。
 */
export interface UsageReporting {
  drainUsage(): GenerationUsage | undefined
}

export function isUsageReporting(x: unknown): x is UsageReporting {
  return typeof (x as Partial<UsageReporting> | null)?.drainUsage === "function"
}

/** 组装好的一次生成的 chat 消息（OpenAI 兼容：system + user）。 */
export interface PromptMessages {
  system: string
  user: string
}

/**
 * 端口：按「平台 + 动作类型」取 prompt 模板字符串。
 * 默认实现（DefaultPromptTemplateProvider）从内置模板 Map 取；
 * 后台管理版可实现同接口、命中返回 DB 里运营编辑过的模板、未命中返回 null（由调用方回退默认）。
 */
export interface PromptTemplateProvider {
  getTemplate(platform: Platform, actionType: BillingActionType): Promise<string | null>
}
