// 7 天计划仓储（项目级隔离）：plan（计划头）+ plan_item（计划项）。

import { and, asc, eq } from "drizzle-orm"
import type { ContentGoal, Platform, PlanItem } from "@social/shared"
import type { Database } from "../client"
import { newId } from "../id"
import { ssaPlan, ssaPlanItem } from "../schema"

/** 计划头。 */
export interface Plan {
  id: string
  planName: string
  primaryGoal?: ContentGoal
  topicTheme?: string
}

export interface PlanInput {
  planName: string
  primaryGoal?: ContentGoal
  topicTheme?: string
}

/** PlanItem 的 status 联合。 */
type PlanItemStatus = PlanItem["status"]
/** 计划项入参：完整 PlanItem 去掉 id（随 plan 一起落库）。 */
export type PlanItemInput = Omit<PlanItem, "id">

export interface PlanRepo {
  create(
    projectId: string,
    workspaceId: string,
    plan: PlanInput,
    items: PlanItemInput[],
  ): Promise<{ plan: Plan; items: PlanItem[] }>
  listItemsByProject(projectId: string): Promise<PlanItem[]>
  updateItemStatus(itemId: string, projectId: string, status: PlanItemStatus): Promise<void>
}

type PlanItemRow = typeof ssaPlanItem.$inferSelect

export class DrizzlePlanRepo implements PlanRepo {
  constructor(private readonly db: Database) {}

  async create(
    projectId: string,
    workspaceId: string,
    plan: PlanInput,
    items: PlanItemInput[],
  ): Promise<{ plan: Plan; items: PlanItem[] }> {
    const planId = newId("plan")
    await this.db.insert(ssaPlan).values({
      id: planId,
      workspaceId,
      projectId,
      planName: plan.planName,
      primaryGoal: plan.primaryGoal ?? null,
      topicTheme: plan.topicTheme ?? null,
    })
    const withIds: PlanItem[] = items.map((it) => ({ id: newId("pi"), ...it }))
    if (withIds.length > 0) {
      await this.db.insert(ssaPlanItem).values(
        withIds.map((it) => ({
          id: it.id,
          planId,
          projectId,
          date: it.date || null,
          time: it.time || null,
          topic: it.topic,
          pillar: it.pillar || null,
          goal: it.goal ?? null,
          platforms: it.platforms ?? [],
          assetType: it.assetType || null,
          cta: it.cta || null,
          status: it.status,
        })),
      )
    }
    return { plan: { id: planId, ...plan }, items: withIds }
  }

  async listItemsByProject(projectId: string): Promise<PlanItem[]> {
    const rows = await this.db
      .select()
      .from(ssaPlanItem)
      .where(eq(ssaPlanItem.projectId, projectId))
      .orderBy(asc(ssaPlanItem.createdAt))
    return rows.map(rowToPlanItem)
  }

  async updateItemStatus(itemId: string, projectId: string, status: PlanItemStatus): Promise<void> {
    await this.db
      .update(ssaPlanItem)
      .set({ status })
      .where(and(eq(ssaPlanItem.id, itemId), eq(ssaPlanItem.projectId, projectId)))
  }
}

function rowToPlanItem(row: PlanItemRow): PlanItem {
  return {
    id: row.id,
    date: row.date ?? "",
    time: row.time ?? "",
    topic: row.topic,
    pillar: row.pillar ?? "",
    goal: (row.goal as ContentGoal | null) ?? "Grow awareness",
    platforms: (row.platforms as Platform[] | null) ?? [],
    assetType: row.assetType ?? "",
    cta: row.cta ?? "",
    status: (row.status as PlanItemStatus) ?? "Planned",
  }
}
