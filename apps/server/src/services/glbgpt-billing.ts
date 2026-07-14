// GlbgptCreditBilling —— 生成侧计费适配器：把 CreditBillingGateway(reserve/settle/refund)
// 接到 ai-api 的 checkPermission / recordBill。见飞书子文档① B/E、②改造清单 #4。
//
// 正确性铁律：
//  · reserve(checkPermission) 失败 → 抛（GenerationService 在 try 外，抛了就不生成、路由转 402 引导充值）。
//  · settle(recordBill) 失败 → 绝不抛（已成功交付；抛了会被误判失败+退款）；记 pending_compensation 日志。
//  · 判成功看 body.code===1（或 null）；HTTP 200 且 code≠1 = 失败。
//  · 后端可信身份：userId + 共享密钥自签 token 调 ai-api（免透传用户原始 token）。文本 tokens 不预冻结。
import { SignJWT } from "jose"
import type {
  CreditBillingContext,
  CreditBillingGateway,
  CreditReservation,
  GenerationUsage,
} from "@social/shared"

/** 适配器依赖的窄账本端口（DI，解耦 @social/db；container.ts 用 repos.billingRecords 适配）。 */
export interface BillingLedger {
  create(input: {
    userId: string
    workspaceId: string
    projectId: string
    actionType: string
    estimatedCredits: number
  }): Promise<{ reservationId: string }>
  markSettled(id: string, patch: { actualCredits?: number; model?: string; glbgptRef?: string }): Promise<void>
  markRefunded(id: string): Promise<void>
  getUserId(id: string): Promise<string | null>
}

export interface GlbgptBillingDeps {
  /** ai-api 根地址，如 http://<测试服内网>:8070。适配器自拼 /ai-api/ai/bill/*。 */
  baseUrl: string
  /** 平台共享 JWT 密钥（自签调用 token 用，原始 UTF-8 字节）。 */
  jwtSecret: string
  /** 账单归属产品号（本项目复用 glbgpt）。 */
  productNo: string
  /** reserve 阶段 checkPermission 用的文本计费模型（robot 表 tokens 行，如 gpt-5.4）。 */
  billingModel: string
  ledger: BillingLedger
  fetchImpl?: typeof fetch
  logger?: Pick<Console, "info" | "warn" | "error">
}

/** checkPermission 未通过（余额不足/无权限）——reserve 抛它，路由据 status/data 转 402 + 透传 subCode 给前端弹窗。 */
export class BillingPermissionError extends Error {
  constructor(message: string, readonly status: number, readonly data?: unknown) {
    super(message)
    this.name = "BillingPermissionError"
  }
}

/** 判平台调用是否成功：HTTP 2xx 且 body.code===1（或 null）。HTTP200 且 code≠1 也算失败（防静默漏扣）。 */
function isBillingOk(status: number, json: { code?: number } | null): boolean {
  return status >= 200 && status < 300 && (json?.code === 1 || json?.code == null)
}

/** 尽力从 recordBill 响应提取平台流水号回填 glbgptRef；recordBill 返 BaseResponse 未必带，取不到即 undefined。 */
function extractRef(json: { data?: unknown } | null): string | undefined {
  const data = json?.data as { billId?: unknown; id?: unknown } | undefined
  const ref = data?.billId ?? data?.id
  return ref == null ? undefined : String(ref)
}

export class GlbgptCreditBilling implements CreditBillingGateway {
  constructor(private readonly deps: GlbgptBillingDeps) {}

  async reserveCredits(input: CreditBillingContext & { estimatedCredits: number }): Promise<CreditReservation> {
    const { reservationId } = await this.deps.ledger.create({
      userId: input.userId,
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      actionType: input.actionType,
      estimatedCredits: input.estimatedCredits,
    })
    const token = await this.signToken(input.userId)
    const { status, json } = await this.post(
      "/ai-api/ai/bill/checkPermission",
      { productNo: this.deps.productNo, model: this.deps.billingModel, agentId: null },
      token,
    )
    if (!isBillingOk(status, json)) {
      // 余额不足/无权限：抛（GenerationService reserve 在 try 外 → 不生成；路由转 402、透传 data 供前端弹窗）。
      throw new BillingPermissionError("checkPermission 未通过", status, (json as { data?: unknown } | null)?.data ?? json)
    }
    return { reservationId, estimatedCredits: input.estimatedCredits }
  }

  async settleCredits(reservationId: string, actualCredits: number, usage?: GenerationUsage): Promise<void> {
    // 已成功交付后扣费：无论如何绝不抛（抛了 GenerationService 会误判失败+退款）。失败记 pending_compensation 日志。
    try {
      const userId = await this.deps.ledger.getUserId(reservationId)
      if (!userId) {
        this.deps.logger?.warn(`[glbgpt-billing] settle 找不到 reservation=${reservationId} 的 userId，跳过`)
        return
      }
      const token = await this.signToken(userId)
      // recordBill 上报「计费档」billingModel（robot 有价）；真实生成模型 usage.model 只入本地账本审计。
      // 二者故意解耦：网关真实模型(如 gpt-5.3-chat) 与 robot 计费档(gpt-5.4) 名字不重合，见飞书子文档① H.1。
      const { status, json } = await this.post(
        "/ai-api/ai/bill/recordBill",
        {
          productNo: this.deps.productNo,
          model: this.deps.billingModel,
          promptTokens: usage?.requestTokens ?? 0,
          completionTokens: usage?.responseTokens ?? 0,
          // ⚠️ device 必须是 RequestDevice 对象（{deviceType}），传字符串 Jackson 反序列化失败 → 通用错。
          // 2026-07-14 实机验证踩过：device:"web" → recordBill code:0；device:{deviceType:"web"} → code:1。
          device: { deviceType: "web" },
        },
        token,
      )
      if (!isBillingOk(status, json)) {
        this.deps.logger?.warn(`[glbgpt-billing] settle 计费失败(待补偿) res=${reservationId} status=${status} code=${json?.code}`)
        return
      }
      await this.deps.ledger.markSettled(reservationId, { actualCredits, model: usage?.model ?? this.deps.billingModel, glbgptRef: extractRef(json) })
    } catch (err) {
      this.deps.logger?.error(`[glbgpt-billing] settle 异常(待补偿) res=${reservationId}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  async refundCredits(reservationId: string): Promise<void> {
    // 文本 tokens 不预冻结、平台无对外 failed 端点 → 无需调平台，只标本地账本 refunded。失败不抛。
    try {
      await this.deps.ledger.markRefunded(reservationId)
    } catch (err) {
      this.deps.logger?.error(`[glbgpt-billing] refund 标记失败 res=${reservationId}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  private async signToken(userId: string): Promise<string> {
    return new SignJWT({ userId, channel: "web" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .sign(new TextEncoder().encode(this.deps.jwtSecret))
  }

  private async post(path: string, body: unknown, token: string): Promise<{ status: number; json: { code?: number; data?: unknown } | null }> {
    const f = this.deps.fetchImpl ?? fetch
    const res = await f(`${this.deps.baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    })
    const text = await res.text()
    return { status: res.status, json: text ? JSON.parse(text) : null }
  }
}
