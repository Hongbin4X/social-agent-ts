// 生成任务审计仓储：每次 AI 生成的输入/输出/模型/token/credits 落库审计。
// 项目级隔离：create 必带 projectId；getById 走唯一主键（调用方已限定范围）。

import { eq } from "drizzle-orm"
import type { Database } from "../client"
import { newId } from "../id"
import { ssaGenerationJob } from "../schema"

/** 创建入参：排除自动列（id / 时间戳）。workspaceId / projectId / userId / actionType 必填在插入类型里。 */
export type GenerationJobInput = Omit<
  typeof ssaGenerationJob.$inferInsert,
  "id" | "createdAt" | "updatedAt"
>
/** 补丁：不许改归属字段（workspaceId / projectId / userId），其余可改（状态/输出/token/credits/错误…）。 */
export type GenerationJobPatch = Partial<
  Omit<
    typeof ssaGenerationJob.$inferInsert,
    "id" | "createdAt" | "updatedAt" | "workspaceId" | "projectId" | "userId"
  >
>

export type GenerationJobRow = typeof ssaGenerationJob.$inferSelect

export interface GenerationJobRepo {
  create(input: GenerationJobInput): Promise<{ id: string }>
  update(id: string, patch: GenerationJobPatch): Promise<void>
  getById(id: string): Promise<GenerationJobRow | null>
}

export class DrizzleGenerationJobRepo implements GenerationJobRepo {
  constructor(private readonly db: Database) {}

  async create(input: GenerationJobInput): Promise<{ id: string }> {
    const id = newId("gen")
    await this.db.insert(ssaGenerationJob).values({ ...input, id })
    return { id }
  }

  async update(id: string, patch: GenerationJobPatch): Promise<void> {
    if (Object.keys(patch).length === 0) return
    await this.db.update(ssaGenerationJob).set(patch).where(eq(ssaGenerationJob.id, id))
  }

  async getById(id: string): Promise<GenerationJobRow | null> {
    const rows = await this.db.select().from(ssaGenerationJob).where(eq(ssaGenerationJob.id, id)).limit(1)
    return rows[0] ?? null
  }
}
