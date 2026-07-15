// 发布记录仓储 —— 「这条帖子发到过哪些账号、链接是什么」的唯一答案。
//
// 2026-07-15 新增。此前发布结果只活在一次 toast 里：remoteUrl 从 X API 回来 → 前端弹个提示 → 丢掉。
// 于是既无法回看自己发出去的帖子，也无法支持「换个账号再发一次」（不知道发过哪些号）。
//
// 刻意【不去重】：同一帖子发到不同账号、改了文案再发一次，都是合法且用户明确要的场景
// （用户 2026-07-15：「不要把再次发布的可能性封死了」）。这里如实记流水，判重与否交给上层决定。

import { and, desc, eq } from "drizzle-orm"
import type { Platform } from "@social/shared"
import type { Database } from "../client"
import { newId } from "../id"
import { ssaPublishRecord } from "../schema"

export interface PublishRecordInput {
  workspaceId: string
  projectId: string
  postId: string
  platform: Platform
  accountId: string
  /** 发布时的账号显示名快照——账号事后被删/改名，历史记录仍要能读懂。 */
  accountName?: string
  remoteId?: string
  remoteUrl?: string
  outcome: "published" | "failed"
  failureReason?: string
  postType?: string
}

export interface PublishRecordRow {
  id: string
  postId: string
  platform: Platform
  accountId: string
  accountName?: string
  remoteId?: string
  remoteUrl?: string
  outcome: string
  failureReason?: string
  postType?: string
  createdAt: string
}

export interface PublishRecordRepo {
  create(input: PublishRecordInput): Promise<{ id: string }>
  /** 某帖的全部发布记录（新→旧）。 */
  listByPost(postId: string): Promise<PublishRecordRow[]>
  /** 该帖【成功发布过】的账号 id 集合——用于提示"这个号已经发过了"。 */
  publishedAccountIds(postId: string): Promise<string[]>
}

const toRow = (r: typeof ssaPublishRecord.$inferSelect): PublishRecordRow => ({
  id: r.id,
  postId: r.postId,
  platform: r.platform,
  accountId: r.accountId,
  accountName: r.accountName ?? undefined,
  remoteId: r.remoteId ?? undefined,
  remoteUrl: r.remoteUrl ?? undefined,
  outcome: r.outcome,
  failureReason: r.failureReason ?? undefined,
  postType: r.postType ?? undefined,
  createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
})

export class DrizzlePublishRecordRepo implements PublishRecordRepo {
  constructor(private readonly db: Database) {}

  async create(input: PublishRecordInput): Promise<{ id: string }> {
    const id = newId("pub")
    await this.db.insert(ssaPublishRecord).values({ ...input, id })
    return { id }
  }

  async listByPost(postId: string): Promise<PublishRecordRow[]> {
    const rows = await this.db
      .select()
      .from(ssaPublishRecord)
      .where(eq(ssaPublishRecord.postId, postId))
      .orderBy(desc(ssaPublishRecord.createdAt))
    return rows.map(toRow)
  }

  async publishedAccountIds(postId: string): Promise<string[]> {
    const rows = await this.db
      .select({ accountId: ssaPublishRecord.accountId })
      .from(ssaPublishRecord)
      .where(and(eq(ssaPublishRecord.postId, postId), eq(ssaPublishRecord.outcome, "published")))
    return [...new Set(rows.map((r) => r.accountId))]
  }
}
