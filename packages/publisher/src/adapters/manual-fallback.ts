// 手动兜底 adapter：服务 TikTok / YouTube / Reddit（spec §3：P0 这三家只走手动/导出）。
//
// 注意：这里返回 manual_fallback 是「产品要求的一等结果」，不是"降级掩盖错误"（区别于铁律里禁止的降级）。
// 它明确告诉上层：该平台在 P0 不自动发，请走导出手动流程。

import type { Platform, PublishResult } from "@social/shared"
import { PLATFORM_CAPABILITIES } from "@social/shared"
import type { PublishContext, SocialPublisher } from "../ports"

export class ManualFallbackPublisher implements SocialPublisher {
  readonly platform: Platform
  constructor(platform: Platform) {
    this.platform = platform
  }

  get capability() {
    return PLATFORM_CAPABILITIES[this.platform]
  }

  async publish(ctx: PublishContext): Promise<PublishResult> {
    return {
      outcome: "manual_fallback",
      platform: this.platform,
      accountId: ctx.target.accountId,
      reason: "platform_manual_only",
      exportHint: `${this.platform} 在 P0 走手动发布：已生成封面/文案，请在 Content Library 导出后自行发布。`,
    }
  }
}
