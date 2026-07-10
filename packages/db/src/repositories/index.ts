// 仓储装配桶：聚合所有仓储接口 + createRepositories(db) 工厂。
//
// 用法（apps/server 侧）：
//   const { db, pool } = createDb()
//   const repos = createRepositories(db)
//   const ws = await repos.workspaces.getByUserId(userId)

import type { Database } from "../client"
import { DrizzleAccountRepo, type AccountRepo } from "./account.repo"
import { DrizzleBillingRecordRepo, type BillingRecordRepo } from "./billing-record.repo"
import { DrizzleCalendarRepo, type CalendarRepo } from "./calendar.repo"
import { DrizzleGenerationJobRepo, type GenerationJobRepo } from "./generation-job.repo"
import { DrizzleMediaRepo, type MediaRepo } from "./media.repo"
import { DrizzlePlanRepo, type PlanRepo } from "./plan.repo"
import { DrizzlePostRepo, type PostRepo } from "./post.repo"
import { DrizzleProjectRepo, type ProjectRepo } from "./project.repo"
import { DrizzlePromptRepo, type PromptRepo } from "./prompt.repo"
import { DrizzleWorkspaceRepo, type WorkspaceRepo } from "./workspace.repo"

/** 全部仓储的聚合面 —— 上层唯一依赖的持久化入口。 */
export interface Repositories {
  workspaces: WorkspaceRepo
  projects: ProjectRepo
  accounts: AccountRepo
  posts: PostRepo
  plans: PlanRepo
  calendar: CalendarRepo
  media: MediaRepo
  generationJobs: GenerationJobRepo
  billingRecords: BillingRecordRepo
  prompts: PromptRepo
}

/** 用同一个 db 实例装配全部 Drizzle 仓储实现。 */
export function createRepositories(db: Database): Repositories {
  return {
    workspaces: new DrizzleWorkspaceRepo(db),
    projects: new DrizzleProjectRepo(db),
    accounts: new DrizzleAccountRepo(db),
    posts: new DrizzlePostRepo(db),
    plans: new DrizzlePlanRepo(db),
    calendar: new DrizzleCalendarRepo(db),
    media: new DrizzleMediaRepo(db),
    generationJobs: new DrizzleGenerationJobRepo(db),
    billingRecords: new DrizzleBillingRecordRepo(db),
    prompts: new DrizzlePromptRepo(db),
  }
}

// 仓储接口 + 领域/入参类型 re-export（上层按需引用）。
export type {
  AccountInput,
  AccountPatch,
  AccountRepo,
  UpdateTokensInput,
  UpsertConnectedInput,
  XTokenSnapshot,
} from "./account.repo"
export type {
  BillingRecordInput,
  BillingRecordPatch,
  BillingRecordRepo,
  BillingRecordRow,
} from "./billing-record.repo"
export type {
  CalendarItemInput,
  CalendarItemPatch,
  CalendarJobPatch,
  CalendarRepo,
} from "./calendar.repo"
export type {
  GenerationJobInput,
  GenerationJobPatch,
  GenerationJobRepo,
  GenerationJobRow,
} from "./generation-job.repo"
export type { MediaAsset, MediaInput, MediaRepo } from "./media.repo"
export type { Plan, PlanInput, PlanItemInput, PlanRepo } from "./plan.repo"
export type { PostInput, PostPatch, PostRepo } from "./post.repo"
export type { Project, ProjectInput, ProjectRepo } from "./project.repo"
export type { PromptRepo, PromptRow } from "./prompt.repo"
export type { WorkspaceCreateInput, WorkspacePatch, WorkspaceRepo } from "./workspace.repo"
