// 从环境变量装配 ContentGenerator（默认桩、免 key 即可跑；填 env 切真 AI）。
//
// mode 决定用哪条路：
//   · "stub"（默认）—— StubContentGenerator：确定性桩，无需任何 key，本地即可跑通全流程。
//   · "llm"          —— LlmContentGenerator：OpenAI 兼容真模型。但仅当 baseUrl+apiKey+textModel 齐全才启用；
//                       缺任何一个 → 回退桩并 logger.warn（联调前的正常状态，不假装接通）。
//
// 铁律（模型选型）：不在代码里臆测 model id。textModel 必须由 GENERATION_TEXT_MODEL 显式给；
//   缺失即视为未接通、回退桩，绝不硬编一个"猜的"模型名。

import type { ContentGenerator, PromptTemplateProvider } from "./ports"
import { DefaultPromptTemplateProvider } from "./prompts"
import { StubContentGenerator } from "./adapters/stub"
import { LlmContentGenerator } from "./adapters/llm"

export interface GeneratorEnvConfig {
  mode: "stub" | "llm"
  baseUrl?: string
  apiKey?: string
  textModel?: string
  imageModel?: string
}

export function generatorConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): GeneratorEnvConfig {
  const mode: GeneratorEnvConfig["mode"] = env.GENERATION_MODE === "llm" ? "llm" : "stub"
  return {
    mode,
    // 兼容两套命名：优先 GLBGPT_MODEL_*（联调真源），回退通用 GENERATION_*。
    baseUrl: env.GLBGPT_MODEL_BASE_URL ?? env.GENERATION_BASE_URL,
    apiKey: env.GLBGPT_MODEL_API_KEY ?? env.GENERATION_API_KEY,
    textModel: env.GENERATION_TEXT_MODEL,
    imageModel: env.GENERATION_IMAGE_MODEL,
  }
}

export interface CreateGeneratorDeps {
  prompts?: PromptTemplateProvider
  fetchImpl?: typeof fetch
  logger?: Pick<Console, "info" | "warn" | "error">
}

export function createGeneratorFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  deps: CreateGeneratorDeps = {},
): ContentGenerator {
  const cfg = generatorConfigFromEnv(env)
  const logger = deps.logger ?? console

  if (cfg.mode === "llm") {
    if (cfg.baseUrl && cfg.apiKey && cfg.textModel) {
      return new LlmContentGenerator({
        baseUrl: cfg.baseUrl,
        apiKey: cfg.apiKey,
        textModel: cfg.textModel,
        imageModel: cfg.imageModel,
        fetchImpl: deps.fetchImpl,
        prompts: deps.prompts ?? new DefaultPromptTemplateProvider(),
      })
    }
    logger.warn(
      "[generation] GENERATION_MODE=llm 但缺 baseUrl/apiKey/textModel，回退 StubContentGenerator（桩）。" +
        "设 GLBGPT_MODEL_BASE_URL + GLBGPT_MODEL_API_KEY + GENERATION_TEXT_MODEL 后再切真模型。",
    )
    return new StubContentGenerator()
  }

  logger.warn(
    "[generation] 使用 StubContentGenerator（确定性桩，免 key）。设 GENERATION_MODE=llm 且配齐模型 env 切真 AI。",
  )
  return new StubContentGenerator()
}
