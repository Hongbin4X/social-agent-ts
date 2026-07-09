// 本地计费审计仓储：credits 计费的本地审计/幂等（真源在 GLBGPT）。

import { eq } from "drizzle-orm"
import type { Database } from "../client"
import { newId } from "../id"
import { ssaBillingUsageRecord } from "../schema"

/** 创建入参：排除自动列（id / 时间戳）。归属字段与 estimatedCredits 必填在插入类型里。 */
export type BillingRecordInput = Omit<
  typeof ssaBillingUsageRecord.$inferInsert,
  "id" | "createdAt" | "updatedAt"
>
/** 补丁：不许改归属字段，其余可改（actual/status/providerCost/reservation/glbgptRef…）。 */
export type BillingRecordPatch = Partial<
  Omit<
    typeof ssaBillingUsageRecord.$inferInsert,
    "id" | "createdAt" | "updatedAt" | "userId" | "workspaceId" | "projectId"
  >
>

export type BillingRecordRow = typeof ssaBillingUsageRecord.$inferSelect

export interface BillingRecordRepo {
  create(input: BillingRecordInput): Promise<{ id: string }>
  update(id: string, patch: BillingRecordPatch): Promise<void>
  getById(id: string): Promise<BillingRecordRow | null>
}

export class DrizzleBillingRecordRepo implements BillingRecordRepo {
  constructor(private readonly db: Database) {}

  async create(input: BillingRecordInput): Promise<{ id: string }> {
    const id = newId("bill")
    await this.db.insert(ssaBillingUsageRecord).values({ ...input, id })
    return { id }
  }

  async update(id: string, patch: BillingRecordPatch): Promise<void> {
    if (Object.keys(patch).length === 0) return
    await this.db.update(ssaBillingUsageRecord).set(patch).where(eq(ssaBillingUsageRecord.id, id))
  }

  async getById(id: string): Promise<BillingRecordRow | null> {
    const rows = await this.db
      .select()
      .from(ssaBillingUsageRecord)
      .where(eq(ssaBillingUsageRecord.id, id))
      .limit(1)
    return rows[0] ?? null
  }
}
