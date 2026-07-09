// 品牌档案 / 项目仓储（切换单元 = 资源隔离锚点）。
//
// 设计要点：
//  · project 与 brand_profile 合一（schema §2）：核心字段（切换项展示）+ 扩展字段（档案二级页）同一张表。
//  · 对外提供两种视图：Project（贴合前端 store 的切换项 + 扩展字段）与 BrandProfile（@social/shared 的完整档案）。
//  · 所有读写按 workspaceId / id 限定，绝不跨工作区。

import { asc, eq } from "drizzle-orm"
import type { BrandProfile, ContentGoal, Platform } from "@social/shared"
import type { Database } from "../client"
import { newId } from "../id"
import { ssaProject } from "../schema"

/** 对外的 Project 领域形状：贴合前端 store 的切换项，并带上完整扩展档案字段。 */
export interface Project {
  id: string
  brandName: string
  description: string
  targetMarket: string
  platforms: Platform[]
  primaryGoal: ContentGoal
  websiteUrl?: string
  tone?: string
  // 扩展档案字段
  productUrl?: string
  targetAudience?: string
  contentGoals: ContentGoal[]
  weeklyFrequency: number
  defaultCta?: string
  hashtags?: string
  forbiddenTopics?: string
  brandColors?: string
  visualStyle?: string
  logoAssetId?: string
}

/** 创建/更新 project 的入参：brandName 必填，其余可缺省（走 DB 默认或 null）。 */
export interface ProjectInput {
  brandName: string
  description?: string
  targetMarket?: string
  platforms?: Platform[]
  primaryGoal?: ContentGoal
  websiteUrl?: string
  tone?: string
  productUrl?: string
  targetAudience?: string
  contentGoals?: ContentGoal[]
  weeklyFrequency?: number
  defaultCta?: string
  hashtags?: string
  forbiddenTopics?: string
  brandColors?: string
  visualStyle?: string
  logoAssetId?: string
}

export interface ProjectRepo {
  listByWorkspace(workspaceId: string): Promise<Project[]>
  getById(id: string): Promise<Project | null>
  create(workspaceId: string, input: ProjectInput): Promise<Project>
  update(id: string, patch: Partial<ProjectInput>): Promise<Project>
  getBrandProfile(projectId: string): Promise<BrandProfile | null>
  updateBrandProfile(projectId: string, patch: Partial<BrandProfile>): Promise<void>
}

type ProjectRow = typeof ssaProject.$inferSelect

export class DrizzleProjectRepo implements ProjectRepo {
  constructor(private readonly db: Database) {}

  async listByWorkspace(workspaceId: string): Promise<Project[]> {
    const rows = await this.db
      .select()
      .from(ssaProject)
      .where(eq(ssaProject.workspaceId, workspaceId))
      .orderBy(asc(ssaProject.createdAt))
    return rows.map(rowToProject)
  }

  async getById(id: string): Promise<Project | null> {
    const rows = await this.db.select().from(ssaProject).where(eq(ssaProject.id, id)).limit(1)
    return rows[0] ? rowToProject(rows[0]) : null
  }

  async create(workspaceId: string, input: ProjectInput): Promise<Project> {
    const id = newId("prj")
    await this.db.insert(ssaProject).values({
      id,
      workspaceId,
      brandName: input.brandName,
      description: input.description ?? null,
      targetMarket: input.targetMarket ?? null,
      platforms: input.platforms ?? [],
      primaryGoal: input.primaryGoal ?? null,
      websiteUrl: input.websiteUrl ?? null,
      tone: input.tone ?? null,
      productUrl: input.productUrl ?? null,
      targetAudience: input.targetAudience ?? null,
      contentGoals: input.contentGoals ?? [],
      weeklyFrequency: input.weeklyFrequency ?? 5,
      defaultCta: input.defaultCta ?? null,
      hashtags: input.hashtags ?? null,
      forbiddenTopics: input.forbiddenTopics ?? null,
      brandColors: input.brandColors ?? null,
      visualStyle: input.visualStyle ?? null,
      logoAssetId: input.logoAssetId ?? null,
    })
    const created = await this.getById(id)
    return created! // 刚建必然存在
  }

  async update(id: string, patch: Partial<ProjectInput>): Promise<Project> {
    if (Object.keys(patch).length > 0) {
      // ProjectInput 的键与列名一一对应，可直接 set；undefined 键会被 drizzle 忽略。
      await this.db.update(ssaProject).set(patch).where(eq(ssaProject.id, id))
    }
    const updated = await this.getById(id)
    if (!updated) throw new Error(`project ${id} not found`)
    return updated
  }

  async getBrandProfile(projectId: string): Promise<BrandProfile | null> {
    const rows = await this.db.select().from(ssaProject).where(eq(ssaProject.id, projectId)).limit(1)
    return rows[0] ? rowToBrandProfile(rows[0]) : null
  }

  async updateBrandProfile(projectId: string, patch: Partial<BrandProfile>): Promise<void> {
    if (Object.keys(patch).length === 0) return
    // BrandProfile 的键同样与列名一一对应（brandName/websiteUrl/…/visualStyle）。
    await this.db.update(ssaProject).set(patch).where(eq(ssaProject.id, projectId))
  }
}

function rowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    brandName: row.brandName,
    description: row.description ?? "",
    targetMarket: row.targetMarket ?? "",
    platforms: (row.platforms as Platform[] | null) ?? [],
    primaryGoal: (row.primaryGoal as ContentGoal | null) ?? "Grow awareness",
    websiteUrl: row.websiteUrl ?? undefined,
    tone: row.tone ?? undefined,
    productUrl: row.productUrl ?? undefined,
    targetAudience: row.targetAudience ?? undefined,
    contentGoals: (row.contentGoals as ContentGoal[] | null) ?? [],
    weeklyFrequency: row.weeklyFrequency,
    defaultCta: row.defaultCta ?? undefined,
    hashtags: row.hashtags ?? undefined,
    forbiddenTopics: row.forbiddenTopics ?? undefined,
    brandColors: row.brandColors ?? undefined,
    visualStyle: row.visualStyle ?? undefined,
    logoAssetId: row.logoAssetId ?? undefined,
  }
}

// BrandProfile（@social/shared）所有字段非空 —— null 一律补空串/空数组/默认值。
function rowToBrandProfile(row: ProjectRow): BrandProfile {
  return {
    brandName: row.brandName,
    websiteUrl: row.websiteUrl ?? "",
    productUrl: row.productUrl ?? "",
    description: row.description ?? "",
    targetMarket: row.targetMarket ?? "",
    targetAudience: row.targetAudience ?? "",
    contentGoals: (row.contentGoals as ContentGoal[] | null) ?? [],
    platforms: (row.platforms as Platform[] | null) ?? [],
    weeklyFrequency: row.weeklyFrequency,
    tone: row.tone ?? "",
    defaultCta: row.defaultCta ?? "",
    hashtags: row.hashtags ?? "",
    forbiddenTopics: row.forbiddenTopics ?? "",
    brandColors: row.brandColors ?? "",
    visualStyle: row.visualStyle ?? "",
  }
}
