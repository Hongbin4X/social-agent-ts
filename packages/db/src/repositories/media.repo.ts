// 媒体资源仓储（项目级隔离）：生成/上传的图片。

import { desc, eq } from "drizzle-orm"
import type { Database } from "../client"
import { newId } from "../id"
import { ssaMediaAsset } from "../schema"

/** 媒体资源领域对象（= 表行原样映射；@social/shared 无对应类型，就地定义）。 */
export interface MediaAsset {
  id: string
  workspaceId: string
  projectId: string
  postId?: string
  variantId?: string
  kind: string
  url: string
  mimeType?: string
  ratio?: string
  prompt?: string
  model?: string
  createdAt: string
}

/** 创建入参：projectId / workspaceId 走参数传入，故此处排除。 */
export type MediaInput = Omit<
  typeof ssaMediaAsset.$inferInsert,
  "id" | "projectId" | "workspaceId" | "createdAt"
>

export interface MediaRepo {
  create(projectId: string, workspaceId: string, input: MediaInput): Promise<MediaAsset>
  listByProject(projectId: string): Promise<MediaAsset[]>
  getById(id: string): Promise<MediaAsset | null>
}

type MediaRow = typeof ssaMediaAsset.$inferSelect

export class DrizzleMediaRepo implements MediaRepo {
  constructor(private readonly db: Database) {}

  async create(projectId: string, workspaceId: string, input: MediaInput): Promise<MediaAsset> {
    const id = newId("media")
    await this.db.insert(ssaMediaAsset).values({
      ...input,
      id,
      projectId,
      workspaceId,
      kind: input.kind ?? "image",
    })
    const created = await this.getById(id)
    if (!created) throw new Error(`media ${id} not found after insert`)
    return created
  }

  async listByProject(projectId: string): Promise<MediaAsset[]> {
    const rows = await this.db
      .select()
      .from(ssaMediaAsset)
      .where(eq(ssaMediaAsset.projectId, projectId))
      .orderBy(desc(ssaMediaAsset.createdAt))
    return rows.map(rowToMedia)
  }

  async getById(id: string): Promise<MediaAsset | null> {
    const rows = await this.db.select().from(ssaMediaAsset).where(eq(ssaMediaAsset.id, id)).limit(1)
    return rows[0] ? rowToMedia(rows[0]) : null
  }
}

function rowToMedia(row: MediaRow): MediaAsset {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    postId: row.postId ?? undefined,
    variantId: row.variantId ?? undefined,
    kind: row.kind,
    url: row.url,
    mimeType: row.mimeType ?? undefined,
    ratio: row.ratio ?? undefined,
    prompt: row.prompt ?? undefined,
    model: row.model ?? undefined,
    createdAt: row.createdAt.toISOString(),
  }
}
