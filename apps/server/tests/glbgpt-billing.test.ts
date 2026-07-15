// GlbgptCreditBilling —— 生成侧计费适配器（CreditBillingGateway），把 reserve/settle/refund 接到
// ai-api 的 checkPermission/recordBill。用注入的假 fetch + 假账本，完全脱离真实网络/DB。
//
// 钉死的正确性（见飞书子文档① B/E + glbgpt-billing.ts 顶部平台契约注释）：
//  · reserve(checkPermission) 失败 → 抛（GenerationService 在 try 外，抛了就不生成、app.onError 转 402）；
//    且账本标 rejected，不留 reserved 孤儿行。
//  · settle(recordBill) 失败 → 绝不抛（已成功交付；抛了 GenerationService 会误 refund + 报错）；标 settle_failed。
//  · 判成功看 body.code===1；HTTP200 且 code≠1、乃至【无 code】都算失败（fail-closed，防静默漏扣）。
//  · 文本(tokens) vs 图片(once) 两条路：
//      文本 —— 按真实 token 计价、不预冻结；拿不到 usage 绝不按 0 上报（会白嫖且被标 settled）。
//      图片 —— 按次固定价、token 传 0；checkPermission【会冻结】，失败也必须 recordBill 解冻，否则永久泄漏。
//  · 后端可信身份：用 userId + 共享密钥自签 token 调 ai-api（免透传用户原始 token）。
import { describe, expect, it } from "vitest"
import { jwtVerify } from "jose"
import { GlbgptCreditBilling, type BillingLedger } from "../src/services/glbgpt-billing"

const SECRET = "test-共享密钥"

/** 假账本：内存记录，暴露全部状态迁移。 */
function fakeLedger() {
  const rows = new Map<string, { userId: string; actionType: string; status: string; actualCredits?: number; model?: string; glbgptRef?: string }>()
  let seq = 0
  const ledger: BillingLedger = {
    async create(input) {
      const id = `res-${++seq}`
      rows.set(id, { userId: input.userId, actionType: input.actionType, status: "reserved" })
      return { reservationId: id }
    },
    async markSettled(id, patch) {
      rows.set(id, { ...rows.get(id)!, status: "settled", ...patch })
    },
    async markRefunded(id) {
      rows.set(id, { ...rows.get(id)!, status: "refunded" })
    },
    async markRejected(id) {
      rows.set(id, { ...rows.get(id)!, status: "rejected" })
    },
    async markSettleFailed(id) {
      rows.set(id, { ...rows.get(id)!, status: "settle_failed" })
    },
    async getContext(id) {
      const r = rows.get(id)
      return r ? { userId: r.userId, actionType: r.actionType } : null
    },
  }
  return { ledger, rows }
}

/** 假 fetch：记录调用，按预设返回 JSON。 */
function fakeFetch(handler: (url: string, init: RequestInit) => { status?: number; body: unknown }) {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    const { status = 200, body } = handler(url, init)
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
  }) as unknown as typeof fetch
  return { fn, calls }
}

function makeBilling(fetchImpl: typeof fetch, ledger: BillingLedger) {
  return new GlbgptCreditBilling({
    baseUrl: "http://ai-api.test",
    jwtSecret: SECRET,
    productNo: "glbgpt",
    textBillingModel: "gpt-5.4",
    imageBillingModel: "nano_banana_2_1k",
    ledger,
    fetchImpl,
  })
}

const ctx = { userId: "2000208", workspaceId: "w1", projectId: "p1", actionType: "generateVariants" as const }
const seed = (ledger: BillingLedger, actionType = "generateVariants") =>
  ledger.create({ userId: "2000208", workspaceId: "w", projectId: "p", actionType, estimatedCredits: 10 })
const bodyOf = (calls: Array<{ url: string; init: RequestInit }>, urlPart: string) =>
  JSON.parse(calls.find((c) => c.url.includes(urlPart))!.init.body as string)

describe("GlbgptCreditBilling.reserveCredits", () => {
  it("checkPermission 返回 code=1 → 记账本 reserved + 打到正确 URL、带自签 Bearer、productNo/model", async () => {
    const { fn, calls } = fakeFetch(() => ({ body: { code: 1 } }))
    const { ledger } = fakeLedger()
    const billing = makeBilling(fn, ledger)

    const r = await billing.reserveCredits({ ...ctx, estimatedCredits: 10 })

    expect(r.reservationId).toBeTruthy()
    expect(r.estimatedCredits).toBe(10)
    const call = calls.find((c) => c.url.includes("/ai-api/ai/bill/checkPermission"))
    expect(call).toBeTruthy()
    // 带自签 Bearer，验签得回 userId
    const authz = (call!.init.headers as Record<string, string>).Authorization
    expect(authz).toMatch(/^Bearer /)
    const { payload } = await jwtVerify(authz.slice(7), new TextEncoder().encode(SECRET))
    expect(String(payload.userId)).toBe("2000208")
    const body = JSON.parse(call!.init.body as string)
    expect(body.productNo).toBe("glbgpt")
    expect(body.model).toBe("gpt-5.4")
  })

  it("checkPermission HTTP 402（余额不足）→ 抛（不吞，让 app.onError 转 402 引导充值）", async () => {
    const { fn } = fakeFetch(() => ({ status: 402, body: { code: 402, data: { subCode: 4002 } } }))
    const { ledger } = fakeLedger()
    await expect(makeBilling(fn, ledger).reserveCredits({ ...ctx, estimatedCredits: 10 })).rejects.toThrow()
  })

  it("checkPermission HTTP200 但 code≠1 → 抛（防静默漏扣）", async () => {
    const { fn } = fakeFetch(() => ({ body: { code: 0 } }))
    const { ledger } = fakeLedger()
    await expect(makeBilling(fn, ledger).reserveCredits({ ...ctx, estimatedCredits: 10 })).rejects.toThrow()
  })

  // fail-closed：平台 BaseResponse.code 恒有值，故「200 + 无 code」必来自【非平台】（反代健康页 / 地址配错 /
  // 路径被 SPA fallback 接走）。此前当成功 → 放行生成 = 白嫖。
  it("checkPermission HTTP200 但【无 code】→ 抛（不是平台的响应，绝不当成功）", async () => {
    const { fn } = fakeFetch(() => ({ body: { hello: "我不是平台" } }))
    const { ledger } = fakeLedger()
    await expect(makeBilling(fn, ledger).reserveCredits({ ...ctx, estimatedCredits: 10 })).rejects.toThrow()
  })

  // 自审 #6：此前失败时账本行永久停在 reserved，与「在途预扣」混淆，被重试无限撑大。
  it("checkPermission 未过 → 账本标 rejected（不留 reserved 孤儿行）", async () => {
    const { fn } = fakeFetch(() => ({ status: 402, body: { code: 402, data: { subCode: 4002 } } }))
    const { ledger, rows } = fakeLedger()
    await makeBilling(fn, ledger).reserveCredits({ ...ctx, estimatedCredits: 10 }).catch(() => {})
    expect([...rows.values()][0]?.status).toBe("rejected")
  })

  // 2026-07-15 实机踩到：平台的 401「Invalid token」（我方密钥与平台注入值不符）此前被一律当成
  // 「余额不足」抛给用户 → 用户去充值，充完还是不行，真因是配置事故。错误信息误导 = 排查方向被带偏。
  it("平台返 401(不认我方自签 token) → kind=unauthorized，【不是】余额不足", async () => {
    const { fn } = fakeFetch(() => ({ body: { code: 401, message: "Invalid token. Please sign in again." } }))
    const { ledger } = fakeLedger()
    await expect(makeBilling(fn, ledger).reserveCredits({ ...ctx, estimatedCredits: 10 })).rejects.toMatchObject({
      kind: "unauthorized",
    })
  })

  it("平台返 402/subCode → kind=insufficient（这才该引导用户充值）", async () => {
    const { fn } = fakeFetch(() => ({ status: 402, body: { code: 402, data: { subCode: 4002 } } }))
    const { ledger } = fakeLedger()
    await expect(makeBilling(fn, ledger).reserveCredits({ ...ctx, estimatedCredits: 10 })).rejects.toMatchObject({
      kind: "insufficient",
    })
  })

  it("图片动作 → checkPermission 用【图片档】(once 规格内嵌键)，不是文本档", async () => {
    const { fn, calls } = fakeFetch(() => ({ body: { code: 1 } }))
    const { ledger } = fakeLedger()
    await makeBilling(fn, ledger).reserveCredits({ ...ctx, actionType: "regenerateImage", estimatedCredits: 30 })
    expect(bodyOf(calls, "/checkPermission").model).toBe("nano_banana_2_1k")
  })
})

describe("GlbgptCreditBilling.settleCredits", () => {
  it("recordBill：带 productNo/model/真实 tokens、自签 token（userId 从账本读回）、账本标 settled", async () => {
    const { fn, calls } = fakeFetch(() => ({ body: { code: 1 } }))
    const { ledger, rows } = fakeLedger()
    const { reservationId } = await seed(ledger)
    const billing = makeBilling(fn, ledger)

    await billing.settleCredits(reservationId, 10, { model: "gpt-5.4", requestTokens: 1200, responseTokens: 340 })

    const call = calls.find((c) => c.url.includes("/ai-api/ai/bill/recordBill"))
    expect(call).toBeTruthy()
    // device 必须是 RequestDevice 对象（实机踩坑：传字符串 → recordBill 反序列化失败 code:0）。
    expect(JSON.parse(call!.init.body as string)).toMatchObject({
      productNo: "glbgpt", model: "gpt-5.4", promptTokens: 1200, completionTokens: 340, device: { deviceType: "web" },
    })
    const authz = (call!.init.headers as Record<string, string>).Authorization
    const { payload } = await jwtVerify(authz.slice(7), new TextEncoder().encode(SECRET))
    expect(String(payload.userId)).toBe("2000208")
    expect(rows.get(reservationId)?.status).toBe("settled")
  })

  it("recordBill 的 model 用计费档，忽略 usage.model（真实模型 gpt-5-chat 在 robot 无价）", async () => {
    const { fn, calls } = fakeFetch(() => ({ body: { code: 1 } }))
    const { ledger, rows } = fakeLedger()
    const { reservationId } = await seed(ledger)
    await makeBilling(fn, ledger).settleCredits(reservationId, 10, { model: "gpt-5-chat", requestTokens: 100, responseTokens: 50 })
    expect(bodyOf(calls, "/recordBill").model).toBe("gpt-5.4") // 上报计费档，不是 gpt-5-chat（否则 no_robot_row 扣不到）
    expect(rows.get(reservationId)?.model).toBe("gpt-5-chat") // 账本记真实生成模型（审计）
  })

  it("settle 把 recordBill 返回的平台流水号回填 glbgptRef（data.billId 优先，退回 data.id）", async () => {
    {
      const { fn } = fakeFetch(() => ({ body: { code: 1, data: { billId: "BILL-xyz" } } }))
      const { ledger, rows } = fakeLedger()
      const { reservationId } = await seed(ledger)
      await makeBilling(fn, ledger).settleCredits(reservationId, 10, { model: "gpt-5.4", requestTokens: 1, responseTokens: 1 })
      expect(rows.get(reservationId)?.glbgptRef).toBe("BILL-xyz")
    }
    {
      const { fn } = fakeFetch(() => ({ body: { code: 1, data: { id: 987654 } } }))
      const { ledger, rows } = fakeLedger()
      const { reservationId } = await seed(ledger)
      await makeBilling(fn, ledger).settleCredits(reservationId, 10, { model: "gpt-5.4", requestTokens: 1, responseTokens: 1 })
      expect(rows.get(reservationId)?.glbgptRef).toBe("987654")
    }
  })

  it("recordBill 返 code≠1 → 不抛（已成功交付，绝不因扣费失败回滚/报错），但账本标 settle_failed 待补偿", async () => {
    const { fn } = fakeFetch(() => ({ body: { code: 0, msg: "fail" } }))
    const { ledger, rows } = fakeLedger()
    const { reservationId } = await seed(ledger)
    await expect(
      makeBilling(fn, ledger).settleCredits(reservationId, 10, { model: "gpt-5.4", requestTokens: 1, responseTokens: 1 }),
    ).resolves.toBeUndefined()
    // 关键：不能停在 reserved —— 那样「已交付但漏扣」和「压根没开始」在库里没法区分，补偿无从下手。
    expect(rows.get(reservationId)?.status).toBe("settle_failed")
  })

  // 自审 #4：BILLING_MODE=real + GENERATION_MODE=stub（两 env 独立，联调期极易同时出现）→ usage=undefined。
  // 旧代码按 0/0 上报 → 平台按 0 token 算 0 元 → 白嫖，且账本标 settled 完全看不出来。
  it("【文本】拿不到真实 token 用量 → 绝不按 0 上报（不打 recordBill），标 settle_failed 待补偿", async () => {
    const { fn, calls } = fakeFetch(() => ({ body: { code: 1 } }))
    const { ledger, rows } = fakeLedger()
    const { reservationId } = await seed(ledger)
    await makeBilling(fn, ledger).settleCredits(reservationId, 10, undefined)
    expect(calls.length).toBe(0) // 一发都不许打——打了就是按 0 计价白嫖
    expect(rows.get(reservationId)?.status).toBe("settle_failed")
  })

  // 图片是 once 按次计价，平台压根不看 token（UserServiceImpl:1021-1026），0/0 是正确入参。
  // 若把上面那条文本防线套到图片上 → 不调 recordBill → 冻结额不解冻 → 永久泄漏，比漏扣更糟。
  it("【图片】token 为 0 是正常的 → 照常 recordBill 解冻+扣次费，标 settled", async () => {
    const { fn, calls } = fakeFetch(() => ({ body: { code: 1 } }))
    const { ledger, rows } = fakeLedger()
    const { reservationId } = await seed(ledger, "regenerateImage")
    await makeBilling(fn, ledger).settleCredits(reservationId, 30, undefined)
    expect(bodyOf(calls, "/recordBill")).toMatchObject({ model: "nano_banana_2_1k", promptTokens: 0, completionTokens: 0 })
    expect(rows.get(reservationId)?.status).toBe("settled")
  })
})

describe("GlbgptCreditBilling.refundCredits", () => {
  it("【文本】标账本 refunded、不打任何 HTTP（tokens 无预冻结、平台无对外 failed 端点）", async () => {
    const { fn, calls } = fakeFetch(() => ({ body: {} }))
    const { ledger, rows } = fakeLedger()
    const { reservationId } = await seed(ledger)
    await makeBilling(fn, ledger).refundCredits(reservationId)
    expect(rows.get(reservationId)?.status).toBe("refunded")
    expect(calls.length).toBe(0)
  })

  // 图片 once → needPreBlock()=true → checkPermission 已冻结。平台 failed()→doUnblock 无 HTTP 端点，
  // 唯一解冻途径就是 recordBill。不调 = 冻结额永久泄漏（用户平白少钱、无账单、无感知）。
  it("【图片】生成失败仍必须调 recordBill 解冻（否则冻结额永久泄漏），如实标 settled 而非 refunded", async () => {
    const { fn, calls } = fakeFetch(() => ({ body: { code: 1 } }))
    const { ledger, rows } = fakeLedger()
    const { reservationId } = await seed(ledger, "modifyImage")
    await makeBilling(fn, ledger).refundCredits(reservationId)
    expect(bodyOf(calls, "/recordBill").model).toBe("nano_banana_2_1k")
    // 用户确实被扣了（有账单可查/可申诉），不能标 refunded 假装没扣。
    expect(rows.get(reservationId)?.status).toBe("settled")
  })

  it("【图片】解冻失败 → 标 settle_failed（冻结额还挂着，必须人工补偿，不许假装 refunded）", async () => {
    const { fn } = fakeFetch(() => ({ body: { code: 0 } }))
    const { ledger, rows } = fakeLedger()
    const { reservationId } = await seed(ledger, "regenerateImage")
    await makeBilling(fn, ledger).refundCredits(reservationId)
    expect(rows.get(reservationId)?.status).toBe("settle_failed")
  })
})
