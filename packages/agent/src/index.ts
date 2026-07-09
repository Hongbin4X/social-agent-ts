// @social/agent 桶文件：生成层对外入口（apps/server 从这里拿 service / 装配 / 端口类型）。
//
// 典型用法（apps/server 里）：
//   const generator = createGeneratorFromEnv()            // 默认桩；配齐 env 则真模型
//   const service = new GenerationService({ generator, billing })
//   const r = await service.runGenerateVariants(ctx, input)
//   if (r.ok) { /* 落 ssa_generation_job：r.data.variants + r.reservationId + r.actualCredits + r.usage */ }
//   else      { /* 据 r.code 映射响应，credits 已退款 */ }

// 端口与能力类型
export type {
  ContentGenerator,
  PromptTemplateProvider,
  PromptMessages,
  UsageReporting,
} from "./ports"
export { isUsageReporting } from "./ports"

// 编排 service
export { GenerationService } from "./service"
export type {
  GenerationContext,
  GenerationServiceDeps,
  GenerationResult,
} from "./service"

// 生成器 adapter
export { StubContentGenerator, buildStubVariant, PLATFORM_VARIANT_DEFAULTS } from "./adapters/stub"
export { LlmContentGenerator, type LlmContentGeneratorConfig } from "./adapters/llm"

// prompt 模板（数据驱动、可被后台覆盖）
export {
  DefaultPromptTemplateProvider,
  buildVariantPrompt,
  VARIANT_SYSTEM_TEMPLATES,
} from "./prompts"

// 环境装配
export {
  generatorConfigFromEnv,
  createGeneratorFromEnv,
  type GeneratorEnvConfig,
  type CreateGeneratorDeps,
} from "./config"

// 错误类型
export { GeneratorError, GeneratorNotConfiguredError } from "./errors"
