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

// X v2 发帖客户端（三种形态的纯函数：单条/串推/长文），adapter 与联调 CLI 复用。
export {
  postTweet,
  postThread,
  postArticle,
  uploadMedia,
  planXTweets,
  splitIntoThreadSegments,
  // X 的加权长度（CJK 每字算 2）——判断是否超单条上限必须用它，不能用 .length。
  xWeightedLength,
  // CTA 行拼装（「文案: 链接」）——前后端共用，预览与实际发出去的必须一致。
  composeCtaLine,
  X_TWEET_MAX,
  type PostedTweet,
  type PostedThread,
  type PostedArticle,
  type UploadMediaParams,
} from "./x/client"

// adapter 与其配置类型（一般不用直接 new，但联调/自定义装配时可能要）。
export { XPublisher, type XConfig } from "./adapters/x"
export { MetaPublisher, type MetaConfig } from "./adapters/meta"
export { AggregatorPublisher, type AggregatorConfig } from "./adapters/aggregator"
