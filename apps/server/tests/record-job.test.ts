// recordJob 计费血缘 —— 每条生成审计(ssa_generation_job)必须回填 billingRecordId，
// 指向本次生成的计费流水(ssa_billing_usage_record.id = GenerationResult.reservationId)。
// 用假 repos 捕获 generationJobs.create 入参，脱离真实 DB。
import { describe, expect, it } from "vitest"
import { recordJob } from "../src/routes/generate"

/** 假 repos：只实现 recordJob 用到的 generationJobs.create，记录入参。 */
function fakeRepos() {
  const created: Array<Record<string, unknown>> = []
  const repos = {
    generationJobs: {
      async create(input: Record<string, unknown>) {
        created.push(input)
        return { id: "gen-1" }
      },
    },
  }
  return { repos, created }
}

const ctx = { userId: "u1", workspaceId: "w1", projectId: "p1" }

describe("recordJob 计费血缘 billingRecordId", () => {
  it("成功生成：把 result.reservationId 写进 job.billingRecordId", async () => {
    const { repos, created } = fakeRepos()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await recordJob(repos as any, ctx, "generateVariants", { topic: "x" }, {
      ok: true,
      data: { variants: [] },
      reservationId: "bill-123",
      actualCredits: 5,
      usage: { model: "gpt-5.3-chat", requestTokens: 100, responseTokens: 50 },
    })
    expect(created).toHaveLength(1)
    expect(created[0].billingRecordId).toBe("bill-123")
    expect(created[0].status).toBe("succeeded")
  })

  it("失败生成：预扣后失败也把 reservationId 落进 billingRecordId（退款了也要留血缘）", async () => {
    const { repos, created } = fakeRepos()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await recordJob(repos as any, ctx, "generateVariants", { topic: "x" }, {
      ok: false,
      code: "model_error",
      message: "boom",
      reservationId: "bill-456",
    })
    expect(created[0].billingRecordId).toBe("bill-456")
    expect(created[0].status).toBe("failed")
  })

  it("无 reservationId（理论边界）：billingRecordId 为 undefined，不崩", async () => {
    const { repos, created } = fakeRepos()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await recordJob(repos as any, ctx, "generateVariants", { topic: "x" }, {
      ok: true,
      data: {},
      actualCredits: 5,
    })
    expect(created[0].billingRecordId).toBeUndefined()
  })
})
