// 发布层两个注入端口的真实实现（把 @social/publisher 的编排接上后端 DB + 本地计费账本）。
//
//  · DbTokenStore（实现 TokenStore）：发帖前读账号 token，**读时自动续期**——快过期就用 refresh_token 换新的，
//    并把轮换后的 refresh_token 覆盖写回（demo 授权流程文档的头号翻车点：不写回=用户掉线）。
//    续不了（无 refresh / refresh 失败）就把账号标成需重连并返回 null，绝不静默假装成功（铁律：不掩盖）。
//    返回的连接恒是「立即可用的新鲜 token」，故 service 的 isExpired 判定永远通过、不会误落 manual_fallback。
//
//  · LocalProviderCostBilling（实现 BillingGateway）：provider cost（X 按次付费的第三方成本）预扣/结算/退款
//    如实记进 ssa_billing_usage_record（本地账本）。**不做真实余额扣减、不假称对接 GLBGPT**——真实扣费是
//    三大外部依赖之一，联调时换成调 GLBGPT 的适配器即可，端口不变。与 container.ts 的 LocalCreditBilling 同哲学。

import type { Platform, PublishContent } from "@social/shared"
import type { XTokenSnapshot } from "@social/db"
import type { BillingGateway, PlatformConnection, ProviderCostReservation, TokenStore, XApp } from "@social/publisher"

/** DbTokenStore 依赖的账号 token 读写子集（repos.accounts 结构上即满足）。 */
export interface AccountTokenGateway {
  getTokens(accountId: string): Promise<XTokenSnapshot | null>
  updateTokens(
    accountId: string,
    input: { accessToken: string; refreshToken?: string | null; scope?: string | null; tokenExpiresAt: number },
  ): Promise<void>
  setStatus(accountId: string, status: XTokenSnapshot["status"]): Promise<void>
}

export interface DbTokenStoreDeps {
  accounts: AccountTokenGateway
  /** 用来续期 X token 的 XApp（用真实 client_id/secret 装配）。 */
  xapp: XApp
  logger?: Pick<Console, "info" | "warn" | "error">
  /** 提前多少秒判定「该续了」，默认 30s，避免卡在临界点。 */
  skewSeconds?: number
}

export class DbTokenStore implements TokenStore {
  constructor(private readonly deps: DbTokenStoreDeps) {}

  async getConnection(accountId: string, platform: Platform): Promise<PlatformConnection | null> {
    const snap = await this.deps.accounts.getTokens(accountId)
    if (!snap || !snap.accessToken) return null // 无此账号 / 从未授权 → 未连接（如实暴露）

    const skew = this.deps.skewSeconds ?? 30
    const nowSec = Math.floor(Date.now() / 1000)
    const expiring = snap.tokenExpiresAt != null && nowSec >= snap.tokenExpiresAt - skew

    if (!expiring) {
      // 未过期（或过期时间未知）→ 直接用现有 token。
      return this.toConnection(snap, snap.accessToken, snap.refreshToken, snap.tokenExpiresAt)
    }

    // 本版只对 X 做自动续期（IG/FB 长效 token 续期机制不同，未接入 → 留待联调）。
    if (platform !== "X" || !snap.refreshToken) {
      // 续不了：没有续卡凭证 → 标过期、返回 null，让用户重连（而不是拿一张必然失效的卡去发）。
      await this.deps.accounts.setStatus(accountId, "Expired")
      return null
    }

    try {
      const token = await this.deps.xapp.refresh(snap.refreshToken)
      const newExpiry = nowSec + (token.expires_in ?? 7200)
      // X 续期通常轮换 refresh_token：返回了就覆盖写回旧的（漏了这步下次续必失败）。
      await this.deps.accounts.updateTokens(accountId, {
        accessToken: token.access_token,
        refreshToken: token.refresh_token, // undefined 时仓储保留旧的，不会抹成 null
        scope: token.scope,
        tokenExpiresAt: newExpiry,
      })
      return this.toConnection(snap, token.access_token, token.refresh_token ?? snap.refreshToken, newExpiry)
    } catch (err) {
      // refresh 失败（用户在 X 端撤销授权 / refresh_token 被回收等）：标需重连，返回 null，绝不掩盖。
      const msg = err instanceof Error ? err.message : String(err)
      this.deps.logger?.error(`[token-store] X 续期失败 account=${accountId}: ${msg}`)
      await this.deps.accounts.setStatus(accountId, "PermissionMissing")
      return null
    }
  }

  private toConnection(
    snap: XTokenSnapshot,
    accessToken: string,
    refreshToken: string | null,
    expiresAtSec: number | null,
  ): PlatformConnection {
    return {
      accountId: snap.accountId,
      accessToken,
      refreshToken: refreshToken ?? undefined,
      externalAccountId: snap.externalAccountId ?? undefined,
      scopes: snap.scope ? snap.scope.split(/\s+/).filter(Boolean) : undefined,
      expiresAt: expiresAtSec != null ? new Date(expiresAtSec * 1000).toISOString() : undefined,
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────

/** LocalProviderCostBilling 依赖的账本写入子集（repos.billingRecords 结构上即满足）。 */
export interface BillingRecordGateway {
  create(input: {
    userId: string
    workspaceId: string
    projectId: string
    actionType: "publish"
    estimatedCredits: number
    providerCost?: string | null
    status: string
  }): Promise<{ id: string }>
  update(id: string, patch: { status?: string; actualCredits?: number }): Promise<void>
}

export class LocalProviderCostBilling implements BillingGateway {
  constructor(
    private readonly billingRecords: BillingRecordGateway,
    private readonly logger?: Pick<Console, "info" | "warn" | "error">,
  ) {}

  async reserveProviderCost(input: {
    userId: string
    workspaceId: string
    projectId: string
    platform: Platform
    estimatedUsdCents: number
  }): Promise<ProviderCostReservation> {
    // 本地占位换算：1¢ ≈ 1 credit（真实 credits 换算率是 GLBGPT 侧的事，本层不臆造 —— 见 pricing.ts）。
    const estimatedCredits = Math.max(1, Math.ceil(input.estimatedUsdCents))
    const { id } = await this.billingRecords.create({
      userId: input.userId,
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      actionType: "publish",
      estimatedCredits,
      providerCost: (input.estimatedUsdCents / 100).toFixed(6), // 美元，落审计（decimal 列存字符串）
      status: "reserved",
    })
    this.logger?.info(`[billing] provider cost 预扣 ${input.platform} ~$${(input.estimatedUsdCents / 100).toFixed(3)} → record=${id}`)
    return { reservationId: id, estimatedCredits }
  }

  async settleProviderCost(reservationId: string, actualCredits: number): Promise<void> {
    await this.billingRecords.update(reservationId, { status: "settled", actualCredits })
  }

  async refundProviderCost(reservationId: string): Promise<void> {
    await this.billingRecords.update(reservationId, { status: "refunded" })
  }
}
