// 工作区仓储：1 用户 1 工作区（user_id 唯一）。
//
// 领域映射说明（铁律3 全局结构师视角）：
//   前端的 `Workspace` 领域类型把「工作区级字段（name/timezone）」与「品牌字段（brandName/description/…）」
//   混在一起，但新 schema 已按资源隔离把品牌字段下沉到 ssaProject。所以这里返回 Workspace 时，
//   用「工作区行 + 其 active project（无则取该工作区第一个 project）」拼出完整领域形状。
//   —— 读 project 仍限定在同一 workspace 内，不跨工作区泄漏。

import { and, asc, eq } from "drizzle-orm"
import type { ContentGoal, Platform, Workspace } from "@social/shared"
import type { Database } from "../client"
import { newId } from "../id"
import { ssaProject, ssaWorkspace } from "../schema"

export interface WorkspaceCreateInput {
  userId: string
  name: string
  timezone?: string
  activeProjectId?: string
}

export type WorkspacePatch = Partial<{
  name: string
  timezone: string
  activeProjectId: string
}>

export interface WorkspaceRepo {
  getByUserId(userId: string): Promise<Workspace | null>
  create(input: WorkspaceCreateInput): Promise<Workspace>
  update(id: string, patch: WorkspacePatch): Promise<void>
  setActiveProject(workspaceId: string, projectId: string): Promise<void>
}

type WorkspaceRow = typeof ssaWorkspace.$inferSelect
type ProjectRow = typeof ssaProject.$inferSelect

export class DrizzleWorkspaceRepo implements WorkspaceRepo {
  constructor(private readonly db: Database) {}

  async getByUserId(userId: string): Promise<Workspace | null> {
    const rows = await this.db.select().from(ssaWorkspace).where(eq(ssaWorkspace.userId, userId)).limit(1)
    const row = rows[0]
    if (!row) return null
    return this.buildWorkspace(row)
  }

  async create(input: WorkspaceCreateInput): Promise<Workspace> {
    const id = newId("ws")
    await this.db.insert(ssaWorkspace).values({
      id,
      userId: input.userId,
      name: input.name,
      timezone: input.timezone ?? "America/Los_Angeles",
      activeProjectId: input.activeProjectId ?? null,
    })
    const rows = await this.db.select().from(ssaWorkspace).where(eq(ssaWorkspace.id, id)).limit(1)
    // 刚建的行必然存在；再取一次拿到 DB 填充的默认值（timezone 等）。
    return this.buildWorkspace(rows[0]!)
  }

  async update(id: string, patch: WorkspacePatch): Promise<void> {
    if (Object.keys(patch).length === 0) return
    await this.db.update(ssaWorkspace).set(patch).where(eq(ssaWorkspace.id, id))
  }

  async setActiveProject(workspaceId: string, projectId: string): Promise<void> {
    await this.db
      .update(ssaWorkspace)
      .set({ activeProjectId: projectId })
      .where(eq(ssaWorkspace.id, workspaceId))
  }

  // 拼出完整 Workspace：品牌字段来自 active project（无则取该工作区最早创建的 project）。
  private async buildWorkspace(row: WorkspaceRow): Promise<Workspace> {
    const project = await this.resolveBrandProject(row)
    return {
      id: row.id,
      name: row.name,
      timezone: row.timezone,
      // 带上 active project id：前端挂载时据此选中 DB 里真正激活的品牌（不再 fallback 到列表第一个）。
      activeProjectId: row.activeProjectId ?? null,
      brandName: project?.brandName ?? "",
      description: project?.description ?? "",
      targetMarket: project?.targetMarket ?? "",
      platforms: (project?.platforms as Platform[] | undefined) ?? [],
      // 领域类型 primaryGoal 非空；DB 允许空时给一个安全默认（seed 必填，实际不会命中默认）。
      primaryGoal: (project?.primaryGoal as ContentGoal | null) ?? "Grow awareness",
      websiteUrl: project?.websiteUrl ?? undefined,
      tone: project?.tone ?? undefined,
    }
  }

  private async resolveBrandProject(row: WorkspaceRow): Promise<ProjectRow | undefined> {
    if (row.activeProjectId) {
      const rows = await this.db
        .select()
        .from(ssaProject)
        .where(and(eq(ssaProject.id, row.activeProjectId), eq(ssaProject.workspaceId, row.id)))
        .limit(1)
      if (rows[0]) return rows[0]
    }
    const first = await this.db
      .select()
      .from(ssaProject)
      .where(eq(ssaProject.workspaceId, row.id))
      .orderBy(asc(ssaProject.createdAt))
      .limit(1)
    return first[0]
  }
}
