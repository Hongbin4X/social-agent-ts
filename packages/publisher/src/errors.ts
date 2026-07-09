// 发布层错误类型。
// 铁律：遇问题直接报错、不静默降级。adapter 内部把平台错误抛成带 code 的 PublisherError，
// 由 PublishingService 统一 catch 成一条 outcome:"failed" 的结果（不掩盖、可回写、可退款）。

import type { PublishErrorCode } from "@social/shared"

/** 带机器可读 code 的发布错误。 */
export class PublisherError extends Error {
  readonly code: PublishErrorCode
  constructor(code: PublishErrorCode, message: string) {
    super(message)
    this.name = "PublisherError"
    this.code = code
  }
}

/**
 * 本地缺少该平台/聚合服务的 API 配置时抛出——这是「联调前的正常状态」，不是 bug。
 * 例如：聚合服务没配 apiKey、平台缺 app 凭证。service 会映射成 outcome:"failed" code:"not_configured"，
 * 让前端显式提示"该平台自动发布尚未接通"，而不是假装成功。
 */
export class PublisherNotConfiguredError extends PublisherError {
  constructor(message: string) {
    super("not_configured", message)
    this.name = "PublisherNotConfiguredError"
  }
}
