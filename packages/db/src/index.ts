// @social/db 桶文件：持久化层对外的唯一入口。
//
// 典型用法（apps/server）：
//   import { createDb, createRepositories } from "@social/db"
//   const { db, pool } = createDb()
//   const repos = createRepositories(db)

// 连接工厂 + 类型
export { createDb, type Database } from "./client"
export { dbConfigFromEnv, type DbConfig } from "./config"

// ID 生成器（上层若需自造关联 id 可复用同一真源）
export { newId } from "./id"

// 仓储装配 + 全部接口/类型
export { createRepositories, type Repositories } from "./repositories/index"
export type {
  AccountInput,
  AccountPatch,
  AccountRepo,
  BillingRecordInput,
  BillingRecordPatch,
  BillingRecordRepo,
  BillingRecordRow,
  CalendarItemInput,
  CalendarItemPatch,
  CalendarJobPatch,
  CalendarRepo,
  GenerationJobInput,
  GenerationJobPatch,
  GenerationJobRepo,
  GenerationJobRow,
  MediaAsset,
  MediaInput,
  MediaRepo,
  Plan,
  PlanInput,
  PlanItemInput,
  PlanRepo,
  PostInput,
  PostPatch,
  PostRepo,
  Project,
  ProjectInput,
  ProjectRepo,
  PromptRepo,
  PromptRow,
  UpdateTokensInput,
  UpsertConnectedInput,
  WorkspaceCreateInput,
  WorkspacePatch,
  WorkspaceRepo,
  XTokenSnapshot,
} from "./repositories/index"

// Drizzle schema（drizzle-kit / 迁移 / 需要直接拿表的场景引用）
export * as schema from "./schema"
