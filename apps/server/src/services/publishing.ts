// 发布服务装配 —— 把 @social/publisher 的编排 service 接上后端的外部依赖。
//
// 三个注入端口现在都是「联调桩」，且刻意做成「如实暴露未接通、绝不假装成功」（铁律：不掩盖问题）：
//   · TokenStore  恒返回 null（=账号未连 OAuth）→ 自动平台落 failed(not_connected)，手动平台照常 manual_fallback。
//   · BillingGateway 一旦被调用就报错（provider cost 预扣未接通）——因 token 为 null 时自动路径在计费前已短路，
//     所以现在 POST /api/publish 仍能端到端跑通并返回真实结果；等接 GLBGPT 计费再换真实现。
//   · MediaResolver 暂不注入（IG 发图联调时补）。

import {
  createPublisherRegistry,
  publisherConfigFromEnv,
  PublishingService,
  type BillingGateway,
  type TokenStore,
} from "@social/publisher"

// 联调 TODO：接 GLBGPT 账号 OAuth token 存储（连接账号时写入、发布时读取并按需刷新）。
const tokenStore: TokenStore = {
  async getConnection() {
    return null
  },
}

// 联调 TODO：接 GLBGPT 计费系统（spec §16 预扣/结算/退款）。现在被调用即报错，杜绝静默假扣。
const billing: BillingGateway = {
  async reserveProviderCost() {
    throw new Error("GLBGPT 计费网关尚未联调：provider cost 预扣未接通")
  },
  async settleProviderCost() {
    throw new Error("GLBGPT 计费网关尚未联调：provider cost 结算未接通")
  },
  async refundProviderCost() {
    throw new Error("GLBGPT 计费网关尚未联调：provider cost 退款未接通")
  },
}

let singleton: PublishingService | null = null

/** 懒加载单例。发布模式（direct / aggregator）与各平台配置来自环境变量（见 publisherConfigFromEnv）。 */
export function getPublishingService(): PublishingService {
  if (!singleton) {
    const registry = createPublisherRegistry(publisherConfigFromEnv())
    singleton = new PublishingService({ registry, tokenStore, billing, logger: console })
  }
  return singleton
}
