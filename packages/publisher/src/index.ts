// @social/publisher 桶文件：apps/server 从这里拿装配入口、service 与端口类型。
//
// 典型用法（联调时在 apps/server 里）：
//   const registry = createPublisherRegistry(publisherConfigFromEnv())
//   const service = new PublishingService({ registry, tokenStore, billing })
//   const result = await service.publishBatch(req)   // req: @social/shared 的 PublishRequest

export { PublishingService } from "./service"
export type { PublishingServiceDeps } from "./service"
export { PublisherRegistry } from "./registry"
export {
  createPublisherRegistry,
  publisherConfigFromEnv,
  type PublisherConfig,
  type PublisherMode,
} from "./config"
export { estimateProviderCostUsdCents } from "./pricing"
export { PublisherError, PublisherNotConfiguredError } from "./errors"

// 端口类型：apps/server 需要实现 TokenStore / BillingGateway / MediaResolver。
export type {
  AdapterDeps,
  BillingGateway,
  MediaResolver,
  PlatformConnection,
  ProviderCostReservation,
  PublishContext,
  SocialPublisher,
  TokenStore,
} from "./ports"

// X OAuth2 + PKCE 授权核心（框架无关纯函数 + XApp 封装）。授权路由/DbTokenStore 从这里取用。
export {
  buildAuthorizeUrl,
  exchangeCode,
  extractCode,
  generatePkce,
  getMe,
  refreshAccessToken,
  XOAuthError,
  X_AUTHORIZE_URL,
  X_DEFAULT_SCOPES,
  X_ME_URL,
  X_TOKEN_URL,
  type AuthorizeUrlParams,
  type ExchangeCodeParams,
  type Pkce,
  type RefreshParams,
  type XTokenResponse,
  type XUser,
} from "./x/oauth"
export {
  XApp,
  type XAppConfig,
  type FinishAuthorizationParams,
  type StartAuthorizationResult,
} from "./x/xapp"

// adapter 与其配置类型（一般不用直接 new，但联调/自定义装配时可能要）。
export { XPublisher, type XConfig } from "./adapters/x"
export { MetaPublisher, type MetaConfig } from "./adapters/meta"
export { ManualFallbackPublisher } from "./adapters/manual-fallback"
export { AggregatorPublisher, type AggregatorConfig } from "./adapters/aggregator"
