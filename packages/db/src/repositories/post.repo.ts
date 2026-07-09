// 帖子仓储（项目级隔离）：post + variants 一体读写。
//
// 铁律：凡项目级数据一律按 projectId 过滤。listByProject/create/replaceVariants 都带 projectId；
// getById 走全局唯一主键（调用方已限定范围），变体仍按 postId 关联取。

import { and, desc, eq, inArray } from "drizzle-orm"
import type {
  AccountType,
  Platform,
  PostStatus,
  PostVariant,
  PublishMode,
  SocialPost,
  VariantState,
} from "@social/shared"
import type { Database } from "../client"
import { newId } from "../id"
import { ssaPost, ssaPostVariant } from "../schema"

/** 创建帖子入参：完整 SocialPost 去掉 id（含 variants，一并落库）。 */
export type PostInput = Omit<SocialPost, "id">
/** 帖子字段补丁（不含 id / variants / updatedAt —— updatedAt 由 DB onUpdateNow 维护）。 */
export type PostPatch = Partial<Omit<SocialPost, "id" | "variants" | "updatedAt">>

export interface PostRepo {
  listByProject(projectId: string, opts?: { status?: PostStatus }): Promise<SocialPost[]>
  getById(id: string): Promise<SocialPost | null>
  create(projectId: string, workspaceId: string, post: PostInput): Promise<SocialPost>
  update(id: string, patch: PostPatch): Promise<void>
  replaceVariants(postId: string, projectId: string, variants: PostVariant[]): Promise<void>
}

type PostRow = typeof ssaPost.$inferSelect
type VariantRow = typeof ssaPostVariant.$inferSelect

export class DrizzlePostRepo implements PostRepo {
  constructor(private readonly db: Database) {}

  async listByProject(projectId: string, opts?: { status?: PostStatus }): Promise<SocialPost[]> {
    const where = opts?.status
      ? and(eq(ssaPost.projectId, projectId), eq(ssaPost.status, opts.status))
      : eq(ssaPost.projectId, projectId)
    const posts = await this.db.select().from(ssaPost).where(where).orderBy(desc(ssaPost.updatedAt))
    if (posts.length === 0) return []
    // 一次性取回所有变体，避免 N+1。
    const ids = posts.map((p) => p.id)
    const variants = await this.db
      .select()
      .from(ssaPostVariant)
      .where(inArray(ssaPostVariant.postId, ids))
    const byPost = new Map<string, PostVariant[]>()
    for (const v of variants) {
      const list = byPost.get(v.postId) ?? []
      list.push(rowToVariant(v))
      byPost.set(v.postId, list)
    }
    return posts.map((p) => rowToPost(p, byPost.get(p.id) ?? []))
  }

  async getById(id: string): Promise<SocialPost | null> {
    const rows = await this.db.select().from(ssaPost).where(eq(ssaPost.id, id)).limit(1)
    const row = rows[0]
    if (!row) return null
    const variants = await this.db
      .select()
      .from(ssaPostVariant)
      .where(eq(ssaPostVariant.postId, id))
    return rowToPost(row, variants.map(rowToVariant))
  }

  async create(projectId: string, workspaceId: string, post: PostInput): Promise<SocialPost> {
    const id = newId("post")
    await this.db.insert(ssaPost).values({
      id,
      workspaceId,
      projectId,
      title: post.title,
      platforms: post.platforms,
      assetType: post.assetType || null,
      status: post.status,
      tags: post.tags,
      owner: post.owner || null,
      hasImage: post.hasImage ? 1 : 0,
      failureReason: post.failureReason ?? null,
    })
    const variants = await this.insertVariants(id, projectId, post.variants)
    // updatedAt 由 DB 生成；这里回读一次拿到真实时间戳，返回完整领域对象。
    const created = await this.getById(id)
    return created ?? rowToPostFromInput(id, post, variants)
  }

  async update(id: string, patch: PostPatch): Promise<void> {
    if (Object.keys(patch).length === 0) return
    const set: Partial<typeof ssaPost.$inferInsert> = {}
    if (patch.title !== undefined) set.title = patch.title
    if (patch.platforms !== undefined) set.platforms = patch.platforms
    if (patch.assetType !== undefined) set.assetType = patch.assetType
    if (patch.status !== undefined) set.status = patch.status
    if (patch.tags !== undefined) set.tags = patch.tags
    if (patch.owner !== undefined) set.owner = patch.owner
    if (patch.hasImage !== undefined) set.hasImage = patch.hasImage ? 1 : 0
    if (patch.failureReason !== undefined) set.failureReason = patch.failureReason
    if (Object.keys(set).length === 0) return
    await this.db.update(ssaPost).set(set).where(eq(ssaPost.id, id))
  }

  async replaceVariants(postId: string, projectId: string, variants: PostVariant[]): Promise<void> {
    // 项目级隔离：只删本项目下该 post 的变体。
    await this.db
      .delete(ssaPostVariant)
      .where(and(eq(ssaPostVariant.postId, postId), eq(ssaPostVariant.projectId, projectId)))
    await this.insertVariants(postId, projectId, variants)
  }

  private async insertVariants(
    postId: string,
    projectId: string,
    variants: PostVariant[],
  ): Promise<PostVariant[]> {
    if (variants.length === 0) return []
    await this.db.insert(ssaPostVariant).values(
      variants.map((v) => ({
        id: newId("pv"),
        postId,
        projectId,
        platform: v.platform,
        account: v.account || null,
        accountType: v.accountType ?? null,
        hook: v.hook || null,
        body: v.body || null,
        hashtags: v.hashtags || null,
        cta: v.cta || null,
        ctaUrl: v.ctaUrl ?? null,
        format: v.format || null,
        mediaAsset: v.mediaAsset ?? null,
        publishMode: v.publishMode,
        state: v.state,
        suggestedTime: v.suggestedTime || null,
      })),
    )
    return variants
  }
}

function rowToPost(row: PostRow, variants: PostVariant[]): SocialPost {
  return {
    id: row.id,
    title: row.title,
    platforms: (row.platforms as Platform[] | null) ?? [],
    assetType: row.assetType ?? "",
    status: row.status as PostStatus,
    tags: (row.tags as string[] | null) ?? [],
    updatedAt: row.updatedAt.toISOString(),
    owner: row.owner ?? "",
    variants,
    hasImage: row.hasImage === 1,
    failureReason: row.failureReason ?? undefined,
  }
}

// create 回读兜底（正常走 getById；此分支仅防御 getById 竞态返回空）。
function rowToPostFromInput(id: string, post: PostInput, variants: PostVariant[]): SocialPost {
  return { id, ...post, variants }
}

function rowToVariant(row: VariantRow): PostVariant {
  return {
    platform: row.platform as Platform,
    account: row.account ?? "",
    accountType: (row.accountType as AccountType | null) ?? undefined,
    hook: row.hook ?? "",
    body: row.body ?? "",
    hashtags: row.hashtags ?? "",
    cta: row.cta ?? "",
    ctaUrl: row.ctaUrl ?? undefined,
    format: row.format ?? "",
    mediaAsset: row.mediaAsset ?? undefined,
    publishMode: (row.publishMode as PublishMode | null) ?? "manual",
    state: (row.state as VariantState | null) ?? "Valid",
    suggestedTime: row.suggestedTime ?? "",
  }
}
