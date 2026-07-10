// 日历仓储（项目级隔离）：calendar_item（日历任务）+ calendar_job（每平台子任务，映射为 variants）。

import { and, asc, eq, inArray } from "drizzle-orm"
import type { CalendarItem, Platform, PostStatus, PublishMode } from "@social/shared"
import type { Database } from "../client"
import { newId } from "../id"
import { ssaCalendarItem, ssaCalendarJob } from "../schema"

/** CalendarItem 的单个子任务（= variant）形状。 */
type CalendarJob = CalendarItem["variants"][number]

export interface CalendarItemInput {
  postId?: string
  topic: string
  date?: string
  time?: string
  status: PostStatus
}

export type CalendarItemPatch = Partial<{
  postId: string
  topic: string
  date: string
  time: string
  status: PostStatus
}>

/** 子任务补丁：按 platform 定位，改 status/time/publishMode/account/reason。 */
export type CalendarJobPatch = { platform: Platform } & Partial<Omit<CalendarJob, "platform">>

export interface CalendarRepo {
  listByProject(projectId: string): Promise<CalendarItem[]>
  getById(id: string): Promise<CalendarItem | null>
  create(
    projectId: string,
    workspaceId: string,
    item: CalendarItemInput,
    jobs: CalendarJob[],
  ): Promise<CalendarItem>
  update(id: string, patch: CalendarItemPatch): Promise<void>
  updateJobs(calendarItemId: string, projectId: string, jobsPatch: CalendarJobPatch[]): Promise<void>
  /** 按 postId 硬删除该帖子的所有日历项 + 子任务（删除/二次修改已排期帖子时的级联清理，防到点空发）。 */
  deleteByPostId(projectId: string, postId: string): Promise<void>
}

type CalendarItemRow = typeof ssaCalendarItem.$inferSelect
type CalendarJobRow = typeof ssaCalendarJob.$inferSelect

export class DrizzleCalendarRepo implements CalendarRepo {
  constructor(private readonly db: Database) {}

  async listByProject(projectId: string): Promise<CalendarItem[]> {
    const items = await this.db
      .select()
      .from(ssaCalendarItem)
      .where(eq(ssaCalendarItem.projectId, projectId))
      .orderBy(asc(ssaCalendarItem.createdAt))
    if (items.length === 0) return []
    const ids = items.map((i) => i.id)
    const jobs = await this.db
      .select()
      .from(ssaCalendarJob)
      .where(inArray(ssaCalendarJob.calendarItemId, ids))
    const byItem = new Map<string, CalendarJob[]>()
    for (const j of jobs) {
      const list = byItem.get(j.calendarItemId) ?? []
      list.push(rowToJob(j))
      byItem.set(j.calendarItemId, list)
    }
    return items.map((i) => rowToCalendarItem(i, byItem.get(i.id) ?? []))
  }

  async getById(id: string): Promise<CalendarItem | null> {
    const rows = await this.db.select().from(ssaCalendarItem).where(eq(ssaCalendarItem.id, id)).limit(1)
    const row = rows[0]
    if (!row) return null
    const jobs = await this.db
      .select()
      .from(ssaCalendarJob)
      .where(eq(ssaCalendarJob.calendarItemId, id))
    return rowToCalendarItem(row, jobs.map(rowToJob))
  }

  async create(
    projectId: string,
    workspaceId: string,
    item: CalendarItemInput,
    jobs: CalendarJob[],
  ): Promise<CalendarItem> {
    const id = newId("cal")
    await this.db.insert(ssaCalendarItem).values({
      id,
      workspaceId,
      projectId,
      postId: item.postId ?? null,
      topic: item.topic,
      date: item.date || null,
      time: item.time || null,
      status: item.status,
    })
    if (jobs.length > 0) {
      await this.db.insert(ssaCalendarJob).values(
        jobs.map((j) => ({
          id: newId("cj"),
          calendarItemId: id,
          projectId,
          platform: j.platform,
          account: j.account || null,
          time: j.time || null,
          publishMode: j.publishMode,
          status: j.status,
          reason: j.reason ?? null,
        })),
      )
    }
    return {
      id,
      postId: item.postId ?? "",
      topic: item.topic,
      date: item.date ?? "",
      time: item.time ?? "",
      status: item.status,
      variants: jobs,
    }
  }

  async update(id: string, patch: CalendarItemPatch): Promise<void> {
    if (Object.keys(patch).length === 0) return
    // CalendarItemPatch 键与列名一一对应。
    await this.db.update(ssaCalendarItem).set(patch).where(eq(ssaCalendarItem.id, id))
  }

  async deleteByPostId(projectId: string, postId: string): Promise<void> {
    // 先查出该帖子(项目内)的所有日历项 id，删掉它们的子任务，再删日历项本身。
    // 项目级隔离：全程带 projectId，越权(postId 对但 projectId 不对)删不动别人的排期。
    const items = await this.db
      .select({ id: ssaCalendarItem.id })
      .from(ssaCalendarItem)
      .where(and(eq(ssaCalendarItem.projectId, projectId), eq(ssaCalendarItem.postId, postId)))
    if (items.length === 0) return
    const ids = items.map((i) => i.id)
    await this.db
      .delete(ssaCalendarJob)
      .where(and(eq(ssaCalendarJob.projectId, projectId), inArray(ssaCalendarJob.calendarItemId, ids)))
    await this.db
      .delete(ssaCalendarItem)
      .where(and(eq(ssaCalendarItem.projectId, projectId), eq(ssaCalendarItem.postId, postId)))
  }

  async updateJobs(
    calendarItemId: string,
    projectId: string,
    jobsPatch: CalendarJobPatch[],
  ): Promise<void> {
    // 项目级隔离：逐条按 (calendarItemId, projectId, platform) 定位子任务后打补丁。
    for (const patch of jobsPatch) {
      const { platform, ...rest } = patch
      const set: Partial<typeof ssaCalendarJob.$inferInsert> = {}
      if (rest.account !== undefined) set.account = rest.account
      if (rest.time !== undefined) set.time = rest.time
      if (rest.publishMode !== undefined) set.publishMode = rest.publishMode
      if (rest.status !== undefined) set.status = rest.status
      if (rest.reason !== undefined) set.reason = rest.reason
      if (Object.keys(set).length === 0) continue
      await this.db
        .update(ssaCalendarJob)
        .set(set)
        .where(
          and(
            eq(ssaCalendarJob.calendarItemId, calendarItemId),
            eq(ssaCalendarJob.projectId, projectId),
            eq(ssaCalendarJob.platform, platform),
          ),
        )
    }
  }
}

function rowToCalendarItem(row: CalendarItemRow, variants: CalendarJob[]): CalendarItem {
  return {
    id: row.id,
    postId: row.postId ?? "",
    topic: row.topic,
    date: row.date ?? "",
    time: row.time ?? "",
    status: row.status as PostStatus,
    variants,
  }
}

function rowToJob(row: CalendarJobRow): CalendarJob {
  return {
    platform: row.platform as Platform,
    account: row.account ?? "",
    time: row.time ?? "",
    publishMode: (row.publishMode as PublishMode | null) ?? "manual",
    status: row.status as PostStatus,
    reason: row.reason ?? undefined,
  }
}
