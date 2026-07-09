// 发布层的「端口」定义（六边形架构里的 ports）。
//
// 核心思想（铁律7 第一性原理）：把"要发帖"这件事拆成一个稳定接口 SocialPublisher，
// 上层（后端路由/前端）只依赖这个接口；底层用「直连各平台 API」还是「走聚合服务」是可替换的 adapter。
// 这样"聚合 vs 直连"这个战略岔路就不再是一次性押注——换实现只换 adapter，编排/路由/前端零改动。
//
// 另外三个注入端口（TokenStore / BillingGateway / MediaResolver）是 @social/publisher 对外部世界的依赖，
// 由 apps/server 在联调时提供真实实现（对接 GLBGPT 计费、账号 OAuth token 存储、素材库）。

import type {
  MediaRef,
  Platform,
  PlatformCapability,
  PublishContent,
  PublishResult,
  PublishTarget,
} from "@social/shared"

/** 某账号在某平台上已解析出的连接凭证（由 TokenStore 提供；本层绝不落库、绝不存密码——只拿短期 token 用完即弃）。 */
export interface PlatformConnection {
  accountId: string
  /** OAuth access token（user context）。 */
  accessToken: string
  refreshToken?: string
  /** 平台侧账号标识：X user id / Instagram business account id / Facebook page id。 */
  externalAccountId?: string
  scopes?: string[]
  /** 过期时间（ISO）。过期的连接由 service 路由到 manual fallback（spec §3）。 */
  expiresAt?: string
}

/** 传给单个 adapter 的一次发布上下文。connection 已由 service 解析好；手动兜底 adapter 会忽略它。 */
export interface PublishContext {
  target: PublishTarget
  content: PublishContent
  connection?: PlatformConnection
}

/**
 * 统一发布端口。每个平台一个实现（或一个聚合实现服务所有平台）。
 * 这是全层唯一被上层依赖的抽象——adapter 怎么实现、调哪个 API，上层一概不知。
 */
export interface SocialPublisher {
  readonly platform: Platform
  readonly capability: PlatformCapability
  publish(ctx: PublishContext): Promise<PublishResult>
}

/** 注入端口①：拿账号的 OAuth 连接。联调时 apps/server 对接真实账号存储/刷新逻辑。 */
export interface TokenStore {
  getConnection(accountId: string, platform: Platform): Promise<PlatformConnection | null>
}

/** provider cost 预扣凭证。 */
export interface ProviderCostReservation {
  reservationId: string
  estimatedCredits: number
}

/**
 * 注入端口②：GLBGPT 计费网关（spec §16）。
 * provider cost（每次自动发布的第三方成本，如 X 按次付费）走「先预扣 → 执行后按实际结算 / 失败退款」。
 */
export interface BillingGateway {
  reserveProviderCost(input: {
    userId: string
    workspaceId: string
    projectId: string
    platform: Platform
    estimatedUsdCents: number
  }): Promise<ProviderCostReservation>
  settleProviderCost(reservationId: string, actualCredits: number): Promise<void>
  refundProviderCost(reservationId: string): Promise<void>
}

/** 注入端口③：把素材库引用解析成平台可投递的公网 URL（Instagram 发图必须公网 URL）。 */
export interface MediaResolver {
  toPublicUrl(ref: MediaRef): Promise<string>
}

/** adapter 的运行期依赖：可注入 fetch 便于测试；logger 可选。 */
export interface AdapterDeps {
  fetch: typeof fetch
  logger?: Pick<Console, "info" | "warn" | "error">
}
