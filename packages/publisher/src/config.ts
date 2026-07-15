// 发布层装配：一份配置 → 一个装好 adapter 的 PublisherRegistry。
//
// mode 决定「自动发布平台」用哪条路：
//   · "direct"     —— 直连各平台 API（X→XPublisher，IG/FB→MetaPublisher）。无第三方订阅费，工程量大。
//   · "aggregator" —— 走聚合服务（X/IG/FB 都用 AggregatorPublisher）。一次接入覆盖多平台，按订阅付费。
// 不论哪种 mode，TikTok/YouTube/Reddit 恒为手动兜底（spec §3 是产品决策，与技术能力无关）——
// 用 PLATFORM_CAPABILITIES[p].autoPublish 派生，保证这条不变式两种 mode 下都成立、且只有一个真源。

import type { Platform } from "@social/shared"
import { ALL_PLATFORMS, PLATFORM_CAPABILITIES } from "@social/shared"
import type { AdapterDeps, MediaResolver } from "./ports"
import { PublisherRegistry } from "./registry"
import { XPublisher, type XConfig } from "./adapters/x"
import { MetaPublisher, type MetaConfig } from "./adapters/meta"
import { AggregatorPublisher, type AggregatorConfig } from "./adapters/aggregator"

export type PublisherMode = "direct" | "aggregator"

export interface PublisherConfig {
  mode: PublisherMode
  /** 注入 fetch（测试用）；缺省用运行时全局 fetch（Node 20+）。 */
  fetchImpl?: typeof fetch
  logger?: AdapterDeps["logger"]
  /** direct 模式各平台配置。 */
  x?: XConfig
  meta?: MetaConfig
  /** aggregator 模式的聚合服务配置。 */
  aggregator?: AggregatorConfig
  /** 素材库 → 公网 URL 解析（Instagram 发图必需）。 */
  media?: MediaResolver
}

export function createPublisherRegistry(config: PublisherConfig): PublisherRegistry {
  const deps: AdapterDeps = { fetch: config.fetchImpl ?? fetch, logger: config.logger }
  const reg = new PublisherRegistry()

  for (const platform of ALL_PLATFORMS) {
    if (!PLATFORM_CAPABILITIES[platform].autoPublish) {
      // TikTok / YouTube / Reddit 不支持自动发布，不注册任何 adapter。
      // 曾经这里注册 ManualFallbackPublisher 返回 manual_fallback，随「转手动」整套移除——
      // 注：那条路在真实前端链路里从未被走到过（store 在发布前就把 manual 变体过滤掉了）。
      continue
    }
    if (config.mode === "aggregator") {
      reg.register(new AggregatorPublisher(platform, deps, config.aggregator))
      continue
    }
    // direct 模式：按平台挑具体 adapter。
    if (platform === "X") {
      reg.register(new XPublisher(deps, config.x))
    } else {
      // 走到这里只剩 Instagram / Facebook（唯二的其它自动发布平台）。
      reg.register(new MetaPublisher(platform as "Instagram" | "Facebook", deps, config.meta, config.media))
    }
  }

  return reg
}

// 供 apps/server 从环境变量装配的便捷读取（联调时用；缺省 direct）。
export function publisherConfigFromEnv(env: NodeJS.ProcessEnv = process.env): PublisherConfig {
  const mode: PublisherMode = env.SOCIAL_PUBLISH_MODE === "aggregator" ? "aggregator" : "direct"
  return {
    mode,
    x: { apiBaseUrl: env.X_API_BASE_URL },
    meta: { apiBaseUrl: env.META_API_BASE_URL, graphVersion: env.META_GRAPH_VERSION },
    aggregator: { apiBaseUrl: env.AGGREGATOR_API_BASE_URL, apiKey: env.AGGREGATOR_API_KEY },
  }
}

export type { Platform }
