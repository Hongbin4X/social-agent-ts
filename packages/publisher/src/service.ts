// 发布编排 service —— 上层（apps/server 路由）唯一要打交道的入口。
//
// 每个 target 的处理流水线（严格按 spec §3 / §11 / §16）：
//   1. 找不到 adapter                 → failed(unsupported_platform)
//   2. 平台天然手动（TikTok/YT/Reddit）→ manual_fallback（不碰 token/计费）
//   3. 账号是 manual 类型              → manual_fallback(manual_account)
//   4. 解析 OAuth 连接：
//        · 无连接                      → failed(not_connected)（联调前的正常状态，如实暴露，别假装）
//        · 已过期                      → manual_fallback(token_expired)（spec §3）
//   5. provider cost 预扣（仅 usdCents>0，如 X 按次付费）
//   6. 调 adapter 真实发布：
//        · 成功/定时 → 结算 provider cost，回写 providerCostCredits
//        · 其它/异常 → 退款，落成 failed，绝不掩盖
//
// 计费 credits 换算是 GLBGPT 侧的事：这里只把「美分估算」丢给 BillingGateway，拿回它算好的 credits 回写。

import type {
  BatchPublishResult,
  Platform,
  PublishErrorCode,
  PublishItem,
  PublishRequest,
  PublishResult,
  PublishTarget,
} from "@social/shared"
import { PublisherError } from "./errors"
import { estimateProviderCostUsdCents } from "./pricing"
import type { BillingGateway, PlatformConnection, TokenStore } from "./ports"
import type { PublisherRegistry } from "./registry"

export interface PublishingServiceDeps {
  registry: PublisherRegistry
  tokenStore: TokenStore
  billing: BillingGateway
  logger?: Pick<Console, "info" | "warn" | "error">
}

export class PublishingService {
  constructor(private readonly deps: PublishingServiceDeps) {}

  async publishBatch(req: PublishRequest): Promise<BatchPublishResult> {
    const results: PublishResult[] = []
    // 串行：一次批量发布量不大，串行便于计费/日志顺序清晰；要并发再改 Promise.all。
    for (const item of req.items) {
      results.push(await this.publishOne(req, item))
    }
    const totalProviderCostCredits = results.reduce(
      (sum, r) => sum + (hasCost(r) ? (r.providerCostCredits ?? 0) : 0),
      0,
    )
    return { results, totalProviderCostCredits }
  }

  private async publishOne(req: PublishRequest, item: PublishItem): Promise<PublishResult> {
    const { target, content } = item
    const adapter = this.deps.registry.get(target.platform)
    if (!adapter) return failed(target, "unsupported_platform", `无 ${target.platform} 发布适配器`)

    // 2) manual 账号不能自动发（spec §3）。
    // 曾经返回 manual_fallback，现如实 failed——「转手动」整套已移除。
    if (target.accountType === "manual") {
      return failed(target, "unsupported_platform", "手动账号不支持自动发布")
    }

    // 4) 解析连接。
    const conn = await this.deps.tokenStore.getConnection(target.accountId, target.platform)
    if (!conn) return failed(target, "not_connected", "账号未完成 OAuth 连接（联调阶段属正常）")
    if (isExpired(conn)) return failed(target, "token_expired", "授权已过期，请重新授权账号")

    // 5) provider cost 预扣（只有真有第三方成本的平台才走计费，如 X）。
    const usdCents = estimateProviderCostUsdCents(target.platform, content)
    const reservation =
      usdCents > 0
        ? await this.deps.billing.reserveProviderCost({
            userId: req.userId,
            workspaceId: req.workspaceId,
            projectId: req.projectId,
            platform: target.platform,
            estimatedUsdCents: usdCents,
          })
        : undefined

    // 6) 执行 + 结算/退款。
    try {
      const result = await adapter.publish({ target, content, connection: conn })
      if (reservation) {
        if (result.outcome === "published" || result.outcome === "scheduled") {
          await this.deps.billing.settleProviderCost(reservation.reservationId, reservation.estimatedCredits)
          result.providerCostCredits = reservation.estimatedCredits
        } else {
          // adapter 自己判定为手动/失败：没真消耗第三方成本，退掉。
          await this.deps.billing.refundProviderCost(reservation.reservationId)
        }
      }
      return result
    } catch (err) {
      if (reservation) await this.deps.billing.refundProviderCost(reservation.reservationId)
      const code: PublishErrorCode = err instanceof PublisherError ? err.code : "provider_error"
      const message = err instanceof Error ? err.message : String(err)
      this.deps.logger?.error(`[publish] ${target.platform}/${target.accountId} 失败: ${message}`)
      return failed(target, code, message)
    }
  }
}

function isExpired(conn: PlatformConnection): boolean {
  if (!conn.expiresAt) return false
  return new Date(conn.expiresAt).getTime() <= Date.now()
}

function hasCost(r: PublishResult): r is Extract<PublishResult, { providerCostCredits?: number }> {
  return r.outcome === "published" || r.outcome === "scheduled"
}

function failed(target: PublishTarget, code: PublishErrorCode, message: string): PublishResult {
  return { outcome: "failed", platform: target.platform as Platform, accountId: target.accountId, code, message }
}

