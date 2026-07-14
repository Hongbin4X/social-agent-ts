// GlbgptCreditBilling —— 生成侧计费适配器（CreditBillingGateway），把 reserve/settle/refund 接到
// ai-api 的 checkPermission/recordBill。用注入的假 fetch + 假账本，完全脱离真实网络/DB。
//
// 钉死的正确性（见飞书子文档① B/E）：
//  · reserve(checkPermission) 失败 → 抛（GenerationService 在 try 外，抛了就不生成、路由转 402）。
//  · settle(recordBill) 失败 → 绝不抛（已成功交付；抛了 GenerationService 会误 refund + 报错）。
//  · 判成功看 body.code===1（或 null）；HTTP 200 且 code≠1 = 失败。
//  · 后端可信身份：用 userId + 共享密钥自签 token 调 ai-api（免透传用户原始 token）。
import { describe, expect, it } from "vitest"
import { jwtVerify } from "jose"
import { GlbgptCreditBilling, type BillingLedger } from "../src/services/glbgpt-billing"

const SECRET = "test-共享密钥"

/** 假账本：内存记录，暴露 create/markSettled/markRefunded/getUserId。 */
function fakeLedger() {
  const rows = new Map<string, { userId: string; status: string; actualCredits?: number; glbgptRef?: string }>()
  let seq = 0
  const ledger: BillingLedger = {
    async create(input) {
      const id = `res-${++seq}`
      rows.set(id, { userId: input.userId, status: "reserved" })
      return { reservationId: id }
    },
    async markSettled(id, patch) {
      rows.set(id, { ...rows.get(id)!, status: "settled", ...patch })
    },
    async markRefunded(id) {
      rows.set(id, { ...rows.get(id)!, status: "refunded" })
    },
    async getUserId(id) {
      return rows.get(id)?.userId ?? null
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
    billingModel: "gpt-5.4",
    ledger,
    fetchImpl,
  })
}

const ctx = { userId: "2000208", workspaceId: "w1", projectId: "p1", actionType: "generateVariants" as const }

describe("GlbgptCreditBilling.reserveCredits", () => {
  it("checkPermission 返回 code=1 → 记账本 reserved + 打到正确 URL、带自签 Bearer、productNo/model", async () => {
    const { fn, calls } = fakeFetch(() => ({ body: { code: 1 } }))
    const { ledger } = fakeLedger()
    const billing = makeBilling(fn, ledger)

    const r = await billing.reserveCredits({ ...ctx, estimatedCredits: 10 })

    expect(r.reservationId).toBeTruthy()
    expect(r.estimatedCredits).toBe(10)
    // 打到 checkPermission
    const call = calls.find((c) => c.url.includes("/ai-api/ai/bill/checkPermission"))
    expect(call).toBeTruthy()
    // 带自签 Bearer，验签得回 userId
    const authz = (call!.init.headers as Record<string, string>).Authorization
    expect(authz).toMatch(/^Bearer /)
    const { payload } = await jwtVerify(authz.slice(7), new TextEncoder().encode(SECRET))
    expect(String(payload.userId)).toBe("2000208")
    // body 带 productNo + model
    const body = JSON.parse(call!.init.body as string)
    expect(body.productNo).toBe("glbgpt")
    expect(body.model).toBe("gpt-5.4")
  })

  it("checkPermission HTTP 402（余额不足）→ 抛（不吞，让路由转 402 引导充值）", async () => {
    const { fn } = fakeFetch(() => ({ status: 402, body: { code: 402, data: { subCode: 4002 } } }))
    const { ledger } = fakeLedger()
    const billing = makeBilling(fn, ledger)
    await expect(billing.reserveCredits({ ...ctx, estimatedCredits: 10 })).rejects.toThrow()
  })

  it("checkPermission HTTP200 但 code≠1 → 抛（防静默漏扣）", async () => {
    const { fn } = fakeFetch(() => ({ body: { code: 0 } }))
    const { ledger } = fakeLedger()
    const billing = makeBilling(fn, ledger)
    await expect(billing.reserveCredits({ ...ctx, estimatedCredits: 10 })).rejects.toThrow()
  })
})

describe("GlbgptCreditBilling.settleCredits", () => {
  it("recordBill：带 productNo/model/真实 tokens、自签 token（userId 从账本读回）、账本标 settled", async () => {
    const { fn, calls } = fakeFetch(() => ({ body: { code: 1 } }))
    const { ledger, rows } = fakeLedger()
    const { reservationId } = await ledger.create({ userId: "2000208", workspaceId: "w", projectId: "p", actionType: "generateVariants", estimatedCredits: 10 })
    const billing = makeBilling(fn, ledger)

    await billing.settleCredits(reservationId, 10, { model: "gpt-5.4", requestTokens: 1200, responseTokens: 340 })

    const call = calls.find((c) => c.url.includes("/ai-api/ai/bill/recordBill"))
    expect(call).toBeTruthy()
    const body = JSON.parse(call!.init.body as string)
    // device 必须是 RequestDevice 对象（实机踩坑：传字符串 → recordBill 反序列化失败 code:0）。
    expect(body).toMatchObject({ productNo: "glbgpt", model: "gpt-5.4", promptTokens: 1200, completionTokens: 340, device: { deviceType: "web" } })
    const authz = (call!.init.headers as Record<string, string>).Authorization
    const { payload } = await jwtVerify(authz.slice(7), new TextEncoder().encode(SECRET))
    expect(String(payload.userId)).toBe("2000208")
    expect(rows.get(reservationId)?.status).toBe("settled")
  })

  it("recordBill 的 model 用计费档 billingModel，忽略 usage.model（真实模型 gpt-5.3-chat 在 robot 无价）", async () => {
    const { fn, calls } = fakeFetch(() => ({ body: { code: 1 } }))
    const { ledger } = fakeLedger()
    const { reservationId } = await ledger.create({ userId: "2000208", workspaceId: "w", projectId: "p", actionType: "generateVariants", estimatedCredits: 10 })
    const billing = makeBilling(fn, ledger) // billingModel = gpt-5.4（robot 有价计费档）
    // usage.model = 真实生成模型 gpt-5.3-chat（网关实际模型，但 robot 计费表没有这一行）
    await billing.settleCredits(reservationId, 10, { model: "gpt-5.3-chat", requestTokens: 100, responseTokens: 50 })
    const body = JSON.parse(calls.find((c) => c.url.includes("/recordBill"))!.init.body as string)
    expect(body.model).toBe("gpt-5.4") // 上报计费档，不是 gpt-5.3-chat（否则 no_robot_row 扣不到）
  })

  it("settle 把 recordBill 返回的平台流水号回填 glbgptRef（data.billId 优先，退回 data.id）", async () => {
    // data.billId 命中
    {
      const { fn } = fakeFetch(() => ({ body: { code: 1, data: { billId: "BILL-xyz" } } }))
      const { ledger, rows } = fakeLedger()
      const { reservationId } = await ledger.create({ userId: "2000208", workspaceId: "w", projectId: "p", actionType: "generateVariants", estimatedCredits: 10 })
      await makeBilling(fn, ledger).settleCredits(reservationId, 10, { model: "gpt-5.4" })
      expect(rows.get(reservationId)?.glbgptRef).toBe("BILL-xyz")
    }
    // 无 billId 时退回 data.id
    {
      const { fn } = fakeFetch(() => ({ body: { code: 1, data: { id: 987654 } } }))
      const { ledger, rows } = fakeLedger()
      const { reservationId } = await ledger.create({ userId: "2000208", workspaceId: "w", projectId: "p", actionType: "generateVariants", estimatedCredits: 10 })
      await makeBilling(fn, ledger).settleCredits(reservationId, 10, { model: "gpt-5.4" })
      expect(rows.get(reservationId)?.glbgptRef).toBe("987654")
    }
  })

  it("recordBill 返 code≠1 → 不抛（已成功交付，绝不因扣费失败回滚/报错）", async () => {
    const { fn } = fakeFetch(() => ({ body: { code: 0, msg: "fail" } }))
    const { ledger } = fakeLedger()
    const { reservationId } = await ledger.create({ userId: "2000208", workspaceId: "w", projectId: "p", actionType: "generateVariants", estimatedCredits: 10 })
    const billing = makeBilling(fn, ledger)
    await expect(billing.settleCredits(reservationId, 10, { model: "gpt-5.4" })).resolves.toBeUndefined()
  })
})

describe("GlbgptCreditBilling.refundCredits", () => {
  it("标账本 refunded、不打任何 HTTP（文本 tokens 无冻结、平台无对外 failed 端点）", async () => {
    const { fn, calls } = fakeFetch(() => ({ body: {} }))
    const { ledger, rows } = fakeLedger()
    const { reservationId } = await ledger.create({ userId: "2000208", workspaceId: "w", projectId: "p", actionType: "generateVariants", estimatedCredits: 10 })
    const billing = makeBilling(fn, ledger)

    await billing.refundCredits(reservationId)

    expect(rows.get(reservationId)?.status).toBe("refunded")
    expect(calls.length).toBe(0)
  })
})
