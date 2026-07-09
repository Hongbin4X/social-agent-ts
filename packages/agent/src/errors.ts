// 生成层错误类型。
// 铁律（项目性质）：遇问题直接报错、绝不静默降级/假成功。adapter 内部把模型/输入错误抛成带 code 的
// GeneratorError；由 GenerationService 统一 catch 成一条 { ok:false, code, message } 的结果（不掩盖、可退款）。
// 与 @social/publisher 的 PublisherError 同构（铁律：两姊妹包保持一致的错误约定）。

import type { GenerationErrorCode } from "@social/shared"

/** 带机器可读 code 的生成错误。路由据 code 映射 HTTP 响应。 */
export class GeneratorError extends Error {
  readonly code: GenerationErrorCode
  constructor(code: GenerationErrorCode, message: string) {
    super(message)
    this.name = "GeneratorError"
    this.code = code
  }
}

/**
 * 本地未接通模型层（未配 GLBGPT 模型 key/baseUrl，或缺 imageModel 却要生成图片）时抛出——
 * 这是「联调前的正常状态」，不是 bug。service 会映射成 { ok:false, code:"not_configured" }，
 * 让上层显式提示"生成尚未接通真模型"，而不是假装生成成功。
 */
export class GeneratorNotConfiguredError extends GeneratorError {
  constructor(message: string) {
    super("not_configured", message)
    this.name = "GeneratorNotConfiguredError"
  }
}
