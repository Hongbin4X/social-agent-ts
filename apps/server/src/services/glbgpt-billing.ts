// GlbgptCreditBilling —— 生成侧计费适配器：把 CreditBillingGateway(reserve/settle/refund)
// 接到 ai-api 的 checkPermission / recordBill。见飞书子文档① B/E、②改造清单 #4。
//
// ── 平台契约（2026-07-15 深挖 references/yanfa-ai-api 源码确认，别凭印象改）──
// ⚠️ 我们调的 /ai-api/ai/bill/* 由 references/yanfa-ai-api 提供，【不是】 yanfa-chatpal-api。
//    两仓的 PriceTypeEnum 不同：ai-api 多一个 COST，其 needPreBlock() = type≠TOKENS && type≠COST。
//
// robot 表无 price_type 列，计价全在 price 这个 JSON 列里（ddl.sql:1302 / RobotPO.PriceConfig）；
// 按 model 精确等值查行（RobotMapper.xml:26）。算钱见 UserServiceImpl.java:1001-1046：
//   tokens    input×promptTokens/1000 + output×completionTokens/1000     ← 文本走这条
//   once      直接返回 price.price，【完全不看 token】（:1021-1026，注释原文「按次计费模式(图像生成等)」）← 图片走这条
//   character price×promptTokens / duration price×completionTokens / cost 用第三方实际成本
//
// 于是【文本】与【图片】是两条本质不同的路，本文件按 actionType 严格分流：
//
//                  文本(tokens)                    图片(once)
//   计价依据        真实 token 用量                  按次固定价，token 传 0 即可
//   预冻结          ✗ 不冻结                        ✓ checkPermission 就冻结 price.price 全额
//                                                    (PriceTypeEnum:46 → GlbgptLifeCycleService:87-110)
//   解冻            —                               只能靠 recordBill(after→doUnblock, :200)
//   失败释放        —                               failed()→doUnblock【没有 HTTP 端点】(BillAPI 只有
//                                                    estimatePrice/checkPermission/recordBill/system/recordBill)
//
// ⇒ 图片生成失败时若不调 recordBill，冻结额【永久泄漏】（doUnblock:114 自己都 log「冻结金额可能泄漏」），
//   用户余额平白少掉且毫无感知、也拿不到账单。两害相权：认扣费 > 静默泄漏。故 refund 对图片仍调 recordBill。
//
// ── 正确性铁律 ──
//  · reserve(checkPermission) 失败 → 抛（GenerationService 在 try 外，抛了就不生成、app.onError 转 402 引导充值）。
//  · settle(recordBill) 失败 → 绝不抛（已成功交付；抛了 GenerationService 会误判失败+退款）；标 settle_failed 待补偿。
//  · 判成功看 body.code===1；HTTP 200 且 code≠1 = 失败（防静默漏扣）。
//  · 后端可信身份：userId + 共享密钥自签 token 调 ai-api（免透传用户原始 token）。
import { SignJWT } from "jose"
import type {
  CreditBillingContext,
  CreditBillingGateway,
  CreditReservation,
  GenerationUsage,
} from "@social/shared"

/**
 * 适配器依赖的窄账本端口（DI，解耦 @social/db；container.ts 用 repos.billingRecords 适配）。
 *
 * 账本状态机（ssa_billing_usage_record.status，varchar(20) 无枚举约束，加状态不用迁移）：
 *   reserved       预扣中（生成进行中）
 *   settled        已扣费（平台 recordBill 成功）
 *   refunded       生成失败、无扣费（文本：本就没冻结）
 *   rejected       checkPermission 未过（余额不足/无权限）→【从未生成】
 *   settle_failed  已交付但【没扣到钱】/ 冻结未解 →【待补偿】
 *
 * rejected / settle_failed 是 2026-07-15 自审补的：此前二者都原样停在 reserved，
 * 于是「余额不足压根没生成」和「已交付但漏扣」在库里长得一模一样，补偿脚本无法区分，
 * 且任何按 status='reserved' 统计「在途预扣」的口径都会被失败重试无限撑大。
 */
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
  /** checkPermission 未过：没生成、没扣钱，别把行留在 reserved 变孤儿。 */
  markRejected(id: string): Promise<void>
  /** 已交付但没扣到钱 / 图片冻结未解：必须在库里可识别，否则漏扣不可追溯、补偿无从下手。 */
  markSettleFailed(id: string): Promise<void>
  /** 取回预扣上下文：settle/refund 要用 userId 自签 token，用 actionType 分流文本/图片两条计费路。 */
  getContext(id: string): Promise<{ userId: string; actionType: string } | null>
}

/**
 * 图片类动作 —— robot 里是 once 按次计价 + 会预冻结，与文本(tokens/不冻结)是两条路。
 * 与 CREDIT_COSTS / GenerationService.runGenerateImage 的 actionType 口径一致。
 */
const IMAGE_ACTIONS = new Set(["regenerateImage", "modifyImage"])

const isImageAction = (actionType: string): boolean => IMAGE_ACTIONS.has(actionType)

export interface GlbgptBillingDeps {
  /** ai-api 根地址，如 http://<测试服内网>:8070。适配器自拼 /ai-api/ai/bill/*。 */
  baseUrl: string
  /** 平台共享 JWT 密钥（自签调用 token 用，原始 UTF-8 字节）。 */
  jwtSecret: string
  /** 账单归属产品号（本项目复用 glbgpt）。 */
  productNo: string
  /** 文本计费档（robot tokens 计价行，如 gpt-5.4）。用于 generateVariants/Plan/Recommendations/ProfileDraft。 */
  textBillingModel: string
  /**
   * 图片计费档（robot once 计价行）。⚠️ 这是【规格内嵌的计费键】，不是模型名：
   * 规格揉进键里，不同规格 = 不同 robot 行 = 不同价（0.5k/1k/2k/4k）。
   * 必须与实际出图模型对应：GENERATION_IMAGE_MODEL=gemini-3.1-flash-image-preview 即平台的 nano_banana_2
   * （GenerationAPI.java:3780 把二者视为同一模型），我们不传 resolution → 平台默认 1K（:3833）→ nano_banana_2_1k。
   * 换出图模型/规格必须同步换这里，否则扣错档。
   */
  imageBillingModel: string
  ledger: BillingLedger
  fetchImpl?: typeof fetch
  logger?: Pick<Console, "info" | "warn" | "error">
}

/**
 * checkPermission 未通过 —— reserve 抛它，app.onError 据 kind 分流。
 *
 * ⚠️ 必须区分 kind，别一律当「余额不足」（2026-07-15 实机踩到）：
 * 平台的 401「Invalid token」也走这条失败路径，若统一报「余额不足，请充值」，用户会去充值——
 * 充完还是不行，而真因是我们的服务端密钥不对。错误信息误导人 = 把排查方向带沟里，比不报还糟。
 */
export type BillingFailureKind =
  /** 余额/权益不足（subCode 4002 需充值 / 4003·4004 订阅余额不足 / 4009 需 PRO）→ 402，引导充值。 */
  | "insufficient"
  /** 平台不认我们的服务端身份（401/403）→ 这是【我方配置错误】，不是用户的问题，绝不能让用户去充值。 */
  | "unauthorized"
  /** 其他上游异常（5xx、非预期 code）→ 502。 */
  | "upstream"

export class BillingPermissionError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly kind: BillingFailureKind,
    readonly data?: unknown,
  ) {
    super(message)
    this.name = "BillingPermissionError"
  }
}

/**
 * 判定 checkPermission 失败的性质。依据平台契约：
 *  · 业务码在 body.code（HTTP 常年 200），401=token 不被接受；402=余额/权益不足（细分见 body.data.subCode）。
 *  · HTTP 层的 401/403/402 同样按其语义归类（走反代时可能由网关直接返）。
 */
function classifyFailure(status: number, json: { code?: number } | null): BillingFailureKind {
  const code = json?.code
  if (code === 401 || code === 403 || status === 401 || status === 403) return "unauthorized"
  if (code === 402 || status === 402) return "insufficient"
  // 平台对余额不足的其它表达（code=0 + subCode）也归为 insufficient；否则当上游异常。
  const sub = (json as { data?: { subCode?: number } } | null)?.data?.subCode
  if (sub != null) return "insufficient"
  return "upstream"
}

/** 判平台调用是否成功。 */
function isBillingOk(status: number, json: { code?: number } | null): boolean {
  // ⚠️ code 必须【显式】等于 1 才算成功。平台 BaseResponse.code 默认 1 且永远序列化，
  // 所以「200 + 无 code」不可能来自真平台，只可能来自不是平台的东西：反代/LB 的健康页、
  // AI_API_BASE_URL 配错指到别的服务、路径前缀变更后被 SPA fallback 接走。
  // 此时若判成功 → checkPermission 放行(白嫖) + recordBill 标 settled(实际没扣)，静默漏钱。
  // 故 fail-closed：拿不准就算失败（2026-07-15 自审 #9；此前 `code == null` 也算成功）。
  return status >= 200 && status < 300 && json?.code === 1
}

/** 尽力从 recordBill 响应提取平台流水号回填 glbgptRef；recordBill 返 BaseResponse 未必带，取不到即 undefined。 */
function extractRef(json: { data?: unknown } | null): string | undefined {
  const data = json?.data as { billId?: unknown; id?: unknown } | undefined
  const ref = data?.billId ?? data?.id
  return ref == null ? undefined : String(ref)
}

export class GlbgptCreditBilling implements CreditBillingGateway {
  constructor(private readonly deps: GlbgptBillingDeps) {}

  /** 按动作选计费档：图片 → once 档（规格内嵌键）；其余 → 文本 tokens 档。 */
  private modelForAction(actionType: string): string {
    return isImageAction(actionType) ? this.deps.imageBillingModel : this.deps.textBillingModel
  }

  async reserveCredits(input: CreditBillingContext & { estimatedCredits: number }): Promise<CreditReservation> {
    const { reservationId } = await this.deps.ledger.create({
      userId: input.userId,
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      actionType: input.actionType,
      estimatedCredits: input.estimatedCredits,
    })
    const token = await this.signToken(input.userId)
    // ⚠️ 图片(once)：这一发【会真冻结】用户余额（PriceTypeEnum:46 → GlbgptLifeCycleService:87-110），
    //    之后无论成败都必须走到 recordBill 去解冻，否则永久泄漏。文本(tokens)不冻结。
    const { status, json } = await this.post(
      "/ai-api/ai/bill/checkPermission",
      { productNo: this.deps.productNo, model: this.modelForAction(input.actionType), agentId: null },
      token,
    )
    if (!isBillingOk(status, json)) {
      // 没生成、没扣钱、也没冻结成功：标 rejected，别留成永久 reserved 孤儿——
      // 否则用户每点一次生成就多一条假「在途预扣」，统计口径会被无限撑大（2026-07-15 自审 #6）。
      await this.safe(() => this.deps.ledger.markRejected(reservationId), `标记 rejected res=${reservationId}`)
      const kind = classifyFailure(status, json)
      if (kind === "unauthorized") {
        // 我方服务端身份不被平台接受（多半是 JWT_SECRET 与平台注入值不一致）。这是【配置事故】不是用户余额问题，
        // 必须在服务端日志里喊出来，否则只会看到一片「余额不足」，排查方向被带偏。
        this.deps.logger?.error(
          `[glbgpt-billing] ⚠️ 平台拒绝我方自签 token（${JSON.stringify(json)}）——` +
            `请核对 JWT_SECRET 是否与平台实际注入值一致（.env 里那串是 yml 的默认回落串，测试/生产多半已注入真值）。`,
        )
      }
      // 抛（GenerationService reserve 在 try 外 → 不生成；app.onError 据 kind 转 402/502）。
      throw new BillingPermissionError("checkPermission 未通过", status, kind, (json as { data?: unknown } | null)?.data ?? json)
    }
    return { reservationId, estimatedCredits: input.estimatedCredits }
  }

  async settleCredits(reservationId: string, actualCredits: number, usage?: GenerationUsage): Promise<void> {
    // 已成功交付后扣费：无论如何绝不抛（抛了 GenerationService 会误判失败+退款）。
    // 但「不抛」≠「不记」：任何扣不到钱的分支都必须标 settle_failed，让漏扣在库里可见、可补偿。
    try {
      const ctx = await this.deps.ledger.getContext(reservationId)
      if (!ctx) {
        this.deps.logger?.error(`[glbgpt-billing] settle 找不到 reservation=${reservationId}，无法计费`)
        return
      }
      const { userId, actionType } = ctx

      // ⚠️ 漏扣防线（2026-07-15 自审 #4）—— 仅对【文本(tokens)】生效：
      // 文本按 token 计价，拿不到真实用量就【绝不】按 0/0 上报（旧代码 `usage?.requestTokens ?? 0` 会这么干）：
      // 平台按 0 token 算出 0 元 → 扣 0 元，却照样把账本标 settled = 生成成功 + 白嫖 + 账面显示已结算，没人发现。
      // 触发场景：BILLING_MODE=real 配上 GENERATION_MODE=stub（两个 env 互相独立，联调期极易同时出现，
      // StubContentGenerator 不实现 UsageReporting → usage=undefined）；或网关响应未带 usage。
      // 【图片(once)不适用】：它按次固定价、平台压根不看 token，0/0 是正确入参——若在此拦下反而不解冻→泄漏。
      const promptTokens = usage?.requestTokens ?? 0
      const completionTokens = usage?.responseTokens ?? 0
      if (!isImageAction(actionType) && promptTokens <= 0 && completionTokens <= 0) {
        this.deps.logger?.error(
          `[glbgpt-billing] settle 无真实 token 用量(待补偿) res=${reservationId} action=${actionType} ` +
            `usage=${JSON.stringify(usage)} —— 已交付但无法计费，不按 0 上报。` +
            `若 BILLING_MODE=real 请确认 GENERATION_MODE=llm（stub 生成器不产 usage）。`,
        )
        await this.markSettleFailedSafe(reservationId)
        return
      }

      const model = this.modelForAction(actionType)
      const ok = await this.recordBill(userId, model, promptTokens, completionTokens, reservationId)
      if (!ok.ok) {
        await this.markSettleFailedSafe(reservationId)
        return
      }
      // 账本的 model 记【真实生成模型】（审计用），计费档只在上报时用——二者故意解耦，见飞书子文档① H.1。
      await this.deps.ledger.markSettled(reservationId, {
        actualCredits,
        model: usage?.model ?? model,
        glbgptRef: ok.ref,
      })
    } catch (err) {
      // 网络异常 / 上游返非 JSON（nginx 502 HTML 错误页）等：同样是「已交付但没扣到钱」，标待补偿。
      this.deps.logger?.error(`[glbgpt-billing] settle 异常(待补偿) res=${reservationId}: ${msg(err)}`)
      await this.markSettleFailedSafe(reservationId)
    }
  }

  async refundCredits(reservationId: string): Promise<void> {
    // 生成失败的退款路径。文本与图片在这里【行为完全不同】，别合并：
    try {
      const ctx = await this.deps.ledger.getContext(reservationId)
      if (!ctx) {
        this.deps.logger?.error(`[glbgpt-billing] refund 找不到 reservation=${reservationId}`)
        return
      }
      if (!isImageAction(ctx.actionType)) {
        // 文本(tokens)：不预冻结、平台也没有对外 failed 端点 → 没有任何东西需要向平台释放，只标本地账本。
        await this.deps.ledger.markRefunded(reservationId)
        return
      }
      // 图片(once)：checkPermission 已经【冻结】了钱。平台的 failed()→doUnblock 没有 HTTP 端点（BillAPI 只有
      // estimatePrice/checkPermission/recordBill/system/recordBill），跨 HTTP 够不着 ⇒ 唯一解冻途径就是 recordBill。
      // 两害相权：调它 = 用户为失败的生成付了一次钱（有账单可查、可申诉）；不调 = 冻结额永久泄漏
      // （doUnblock:114 自己都 log「冻结金额可能泄漏」），用户平白少钱、无账单、无感知。故选前者。
      // TODO(平台侧): 推动 ai-api 暴露 failed/release 端点，届时这里改调它，才能做到「失败真不收钱」。
      this.deps.logger?.warn(
        `[glbgpt-billing] 图片生成失败但已预冻结：调 recordBill 解冻(=认扣费) res=${reservationId} action=${ctx.actionType}。` +
          `平台无 failed 端点，不调则冻结额永久泄漏。`,
      )
      const ok = await this.recordBill(ctx.userId, this.modelForAction(ctx.actionType), 0, 0, reservationId)
      if (!ok.ok) {
        // 解冻失败 = 冻结额还挂着 → 必须人工补偿，绝不能标成 refunded 假装没事。
        this.deps.logger?.error(`[glbgpt-billing] 图片解冻失败，冻结额可能泄漏(待补偿) res=${reservationId}`)
        await this.markSettleFailedSafe(reservationId)
        return
      }
      // 已解冻且实际扣了钱：如实记 settled（不是 refunded——用户确实被扣了）。
      await this.deps.ledger.markSettled(reservationId, { model: this.modelForAction(ctx.actionType), glbgptRef: ok.ref })
    } catch (err) {
      this.deps.logger?.error(`[glbgpt-billing] refund 异常 res=${reservationId}: ${msg(err)}`)
      await this.markSettleFailedSafe(reservationId)
    }
  }

  /** 调 recordBill（解冻 + 记账单）。图片 token 传 0（once 不看 token）。 */
  private async recordBill(
    userId: string,
    model: string,
    promptTokens: number,
    completionTokens: number,
    reservationId: string,
  ): Promise<{ ok: true; ref?: string } | { ok: false }> {
    const token = await this.signToken(userId)
    const { status, json } = await this.post(
      "/ai-api/ai/bill/recordBill",
      {
        productNo: this.deps.productNo,
        model,
        promptTokens,
        completionTokens,
        // ⚠️ device 必须是 RequestDevice 对象（{deviceType}），传字符串 Jackson 反序列化失败 → 通用错。
        // 2026-07-14 实机验证踩过：device:"web" → recordBill code:0；device:{deviceType:"web"} → code:1。
        device: { deviceType: "web" },
      },
      token,
    )
    if (!isBillingOk(status, json)) {
      this.deps.logger?.error(`[glbgpt-billing] recordBill 失败 res=${reservationId} model=${model} status=${status} code=${json?.code}`)
      return { ok: false }
    }
    return { ok: true, ref: extractRef(json) }
  }

  /** 标 settle_failed；它自己再失败也只记日志（settle/refund 绝不抛）。 */
  private markSettleFailedSafe(reservationId: string): Promise<void> {
    return this.safe(() => this.deps.ledger.markSettleFailed(reservationId), `标记 settle_failed res=${reservationId}`)
  }

  private async safe(fn: () => Promise<void>, what: string): Promise<void> {
    try {
      await fn()
    } catch (e) {
      this.deps.logger?.error(`[glbgpt-billing] ${what} 失败: ${msg(e)}`)
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
    // 上游返非 JSON（如 nginx 502 HTML 错误页）时 JSON.parse 会抛 SyntaxError；
    // 调用方全部在 try 内（settle/refund 不抛、reserve 抛→onError 转 500），行为是 fail-closed 不漏钱。
    return { status: res.status, json: text ? JSON.parse(text) : null }
  }
}

const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e))
