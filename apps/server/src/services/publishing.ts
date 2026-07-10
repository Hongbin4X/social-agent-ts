// 发布服务装配 —— 把 @social/publisher 的编排 service 接上后端的真实外部依赖。
//
//   · TokenStore   → DbTokenStore：从 ssa_social_account 读账号 token，发帖前自动续期（见 token-store.ts）。
//                    X 未配置（无 X_CLIENT_ID）时退回「恒返回 null」的空 store（=无连接可解析，如实暴露）。
//   · BillingGateway → LocalProviderCostBilling：provider cost 预扣/结算/退款如实记本地账本，
//                    不假扣、不假称对接 GLBGPT（真实扣费联调时换适配器，端口不变）。
//   · MediaResolver 暂不注入（IG 发图联调时补）。

import {
  createPublisherRegistry,
  publisherConfigFromEnv,
  PublishingService,
  type TokenStore,
} from "@social/publisher"
import { getContainer } from "../container"
import { getXApp } from "./x-auth"
import { DbTokenStore, LocalProviderCostBilling } from "./token-store"

let singleton: PublishingService | null = null

/** 懒加载单例。发布模式（direct / aggregator）与各平台配置来自环境变量（见 publisherConfigFromEnv）。 */
export function getPublishingService(): PublishingService {
  if (!singleton) {
    const { repos } = getContainer()
    const xapp = getXApp()
    // X 已配置 → 用 DB 版 TokenStore（读时自动续期）；未配置 → 无连接可解析。
    const tokenStore: TokenStore = xapp
      ? new DbTokenStore({ accounts: repos.accounts, xapp, logger: console })
      : { async getConnection() { return null } }
    const billing = new LocalProviderCostBilling(repos.billingRecords, console)
    const registry = createPublisherRegistry(publisherConfigFromEnv())
    singleton = new PublishingService({ registry, tokenStore, billing, logger: console })
  }
  return singleton
}
