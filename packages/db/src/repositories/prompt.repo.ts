// 平台 prompt 仓储（后台管理预留）：管理员按 平台×动作 编辑生成 prompt，数据驱动。
// 非项目级数据（全局配置），不按 projectId 隔离。

import { and, asc, eq } from "drizzle-orm"
import type { BillingActionType, Platform } from "@social/shared"
import type { Database } from "../client"
import { newId } from "../id"
import { ssaPlatformPrompt } from "../schema"

export type PromptRow = typeof ssaPlatformPrompt.$inferSelect

export interface PromptRepo {
  /** 取指定 平台×动作 的 prompt 模板（仅 enabled 生效）；无则 null。 */
  get(platform: Platform, actionType: BillingActionType): Promise<string | null>
  /** upsert：按唯一键 (platform, actionType) 插入或更新模板。 */
  upsert(
    platform: Platform,
    actionType: BillingActionType,
    template: string,
    updatedBy?: string,
  ): Promise<void>
  /** 列出全部（后台管理列表用）。 */
  list(): Promise<PromptRow[]>
}

export class DrizzlePromptRepo implements PromptRepo {
  constructor(private readonly db: Database) {}

  async get(platform: Platform, actionType: BillingActionType): Promise<string | null> {
    const rows = await this.db
      .select()
      .from(ssaPlatformPrompt)
      .where(
        and(
          eq(ssaPlatformPrompt.platform, platform),
          eq(ssaPlatformPrompt.actionType, actionType),
          eq(ssaPlatformPrompt.enabled, 1),
        ),
      )
      .limit(1)
    return rows[0]?.template ?? null
  }

  async upsert(
    platform: Platform,
    actionType: BillingActionType,
    template: string,
    updatedBy?: string,
  ): Promise<void> {
    // 唯一索引 uq_prompt_platform_action 兜底冲突 → onDuplicateKeyUpdate 更新模板。
    await this.db
      .insert(ssaPlatformPrompt)
      .values({
        id: newId("pp"),
        platform,
        actionType,
        template,
        updatedBy: updatedBy ?? null,
      })
      .onDuplicateKeyUpdate({ set: { template, updatedBy: updatedBy ?? null } })
  }

  async list(): Promise<PromptRow[]> {
    return this.db.select().from(ssaPlatformPrompt).orderBy(asc(ssaPlatformPrompt.createdAt))
  }
}
