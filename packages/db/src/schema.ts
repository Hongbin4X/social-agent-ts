// Drizzle schema —— Super Social Agent 领域数据（独立库 social_agent）。
//
// 设计要点：
//  1. 资源隔离（用户 2026-07-09 需求 §2）：一个账号 1 个工作区；工作区下多品牌档案(project)；
//     用户产物（post/variant/media/plan/calendar/generation）**一律带 project_id**，仓储层强制按
//     project_id 过滤 —— 前端切品牌档案=换 project_id，资源自动切换。
//  2. project 与 brand_profile 合一：前端的「Project(切换项)」与「BrandProfile(详细档案)」是同一实体的
//     核心/扩展字段，合成一张 ssa_project 避免同步复杂度（铁律7 第一性原理）。
//  3. userId 用 varchar 存 GLBGPT 的 bigint 雪花 id（JS number 会丢精度；yanfa 的 t_model_usage 也用 varchar）。
//     只逻辑引用 platform_user.id，不跨库外键（最大解耦，便于本地/远端切换）。
//  4. 计费/模型用量真源在 GLBGPT（platform_user.balance / t_model_usage / bill）；这里只留本地审计表。
//  5. ssa_platform_prompt 为后台管理预留（管理员按平台/动作编辑 prompt，数据驱动，见 [[social-agent-admin-backend]]）。

import type {
  AccountStatus,
  AccountType,
  BillingActionType,
  ContentGoal,
  GenerationErrorCode,
  Platform,
  PostStatus,
  PublishMode,
  VariantState,
} from "@social/shared"
import { sql } from "drizzle-orm"
import {
  bigint,
  decimal,
  index,
  int,
  json,
  mysqlTable,
  text,
  timestamp,
  tinyint,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core"

const id = () => varchar("id", { length: 32 }).primaryKey()
const createdAt = () => timestamp("created_at").defaultNow().notNull()
const updatedAt = () => timestamp("updated_at").defaultNow().onUpdateNow().notNull()

// ── 工作区：1 用户 1 工作区（user_id 唯一）──
export const ssaWorkspace = mysqlTable(
  "ssa_workspace",
  {
    id: id(),
    userId: varchar("user_id", { length: 32 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    timezone: varchar("timezone", { length: 64 }).notNull().default("America/Los_Angeles"),
    activeProjectId: varchar("active_project_id", { length: 32 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("uq_workspace_user").on(t.userId)],
)

// ── 品牌档案 / 项目（切换单元 = 隔离锚点；核心+扩展字段合一）──
export const ssaProject = mysqlTable(
  "ssa_project",
  {
    id: id(),
    workspaceId: varchar("workspace_id", { length: 32 }).notNull(),
    // 核心（切换项展示）
    brandName: varchar("brand_name", { length: 200 }).notNull(),
    description: text("description"),
    targetMarket: varchar("target_market", { length: 64 }),
    platforms: json("platforms").$type<Platform[]>().notNull().default([]),
    primaryGoal: varchar("primary_goal", { length: 64 }).$type<ContentGoal>(),
    websiteUrl: varchar("website_url", { length: 512 }),
    tone: varchar("tone", { length: 255 }),
    // 扩展（品牌档案二级页）
    productUrl: varchar("product_url", { length: 512 }),
    targetAudience: varchar("target_audience", { length: 500 }),
    contentGoals: json("content_goals").$type<ContentGoal[]>().notNull().default([]),
    weeklyFrequency: int("weekly_frequency").notNull().default(5),
    defaultCta: varchar("default_cta", { length: 200 }),
    hashtags: varchar("hashtags", { length: 500 }),
    forbiddenTopics: varchar("forbidden_topics", { length: 500 }),
    brandColors: varchar("brand_colors", { length: 255 }),
    visualStyle: varchar("visual_style", { length: 255 }),
    logoAssetId: varchar("logo_asset_id", { length: 32 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("idx_project_workspace").on(t.workspaceId)],
)

// ── 社媒账号：工作区级（跨品牌共享）──
export const ssaSocialAccount = mysqlTable(
  "ssa_social_account",
  {
    id: id(),
    workspaceId: varchar("workspace_id", { length: 32 }).notNull(),
    platform: varchar("platform", { length: 20 }).$type<Platform>().notNull(),
    type: varchar("type", { length: 20 }).$type<AccountType>().notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    url: varchar("url", { length: 512 }),
    status: varchar("status", { length: 30 }).$type<AccountStatus>().notNull(),
    expiresAt: varchar("expires_at", { length: 30 }),
    capabilities: varchar("capabilities", { length: 500 }),
    notes: varchar("notes", { length: 500 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("idx_account_workspace").on(t.workspaceId)],
)

// ── 帖子（项目级隔离）──
export const ssaPost = mysqlTable(
  "ssa_post",
  {
    id: id(),
    workspaceId: varchar("workspace_id", { length: 32 }).notNull(),
    projectId: varchar("project_id", { length: 32 }).notNull(),
    title: varchar("title", { length: 500 }).notNull(),
    platforms: json("platforms").$type<Platform[]>().notNull().default([]),
    assetType: varchar("asset_type", { length: 64 }),
    status: varchar("status", { length: 30 }).$type<PostStatus>().notNull(),
    tags: json("tags").$type<string[]>().notNull().default([]),
    owner: varchar("owner", { length: 20 }),
    hasImage: tinyint("has_image").notNull().default(0),
    failureReason: varchar("failure_reason", { length: 1000 }),
    source: varchar("source", { length: 30 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("idx_post_project").on(t.projectId),
    index("idx_post_project_status").on(t.projectId, t.status),
  ],
)

// ── 帖子变体（每平台一条，随 post 一起隔离）──
export const ssaPostVariant = mysqlTable(
  "ssa_post_variant",
  {
    id: id(),
    postId: varchar("post_id", { length: 32 }).notNull(),
    projectId: varchar("project_id", { length: 32 }).notNull(),
    platform: varchar("platform", { length: 20 }).$type<Platform>().notNull(),
    account: varchar("account", { length: 200 }),
    accountType: varchar("account_type", { length: 20 }).$type<AccountType>(),
    hook: text("hook"),
    body: text("body"),
    hashtags: varchar("hashtags", { length: 500 }),
    cta: varchar("cta", { length: 200 }),
    ctaUrl: varchar("cta_url", { length: 512 }),
    format: varchar("format", { length: 100 }),
    mediaAsset: varchar("media_asset", { length: 100 }),
    mediaAssetId: varchar("media_asset_id", { length: 32 }),
    publishMode: varchar("publish_mode", { length: 10 }).$type<PublishMode>(),
    state: varchar("state", { length: 30 }).$type<VariantState>(),
    suggestedTime: varchar("suggested_time", { length: 10 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("idx_variant_post").on(t.postId)],
)

// ── 媒体资源（生成/上传的图片，项目级隔离）──
export const ssaMediaAsset = mysqlTable(
  "ssa_media_asset",
  {
    id: id(),
    workspaceId: varchar("workspace_id", { length: 32 }).notNull(),
    projectId: varchar("project_id", { length: 32 }).notNull(),
    postId: varchar("post_id", { length: 32 }),
    variantId: varchar("variant_id", { length: 32 }),
    kind: varchar("kind", { length: 20 }).notNull().default("image"),
    url: varchar("url", { length: 1000 }).notNull(),
    mimeType: varchar("mime_type", { length: 50 }),
    ratio: varchar("ratio", { length: 20 }),
    prompt: text("prompt"),
    model: varchar("model", { length: 128 }),
    createdAt: createdAt(),
  },
  (t) => [index("idx_media_project").on(t.projectId)],
)

// ── 7 天计划 + 计划项（项目级隔离）──
export const ssaPlan = mysqlTable(
  "ssa_plan",
  {
    id: id(),
    workspaceId: varchar("workspace_id", { length: 32 }).notNull(),
    projectId: varchar("project_id", { length: 32 }).notNull(),
    planName: varchar("plan_name", { length: 200 }).notNull(),
    primaryGoal: varchar("primary_goal", { length: 64 }).$type<ContentGoal>(),
    topicTheme: varchar("topic_theme", { length: 1000 }),
    createdAt: createdAt(),
  },
  (t) => [index("idx_plan_project").on(t.projectId)],
)

export const ssaPlanItem = mysqlTable(
  "ssa_plan_item",
  {
    id: id(),
    planId: varchar("plan_id", { length: 32 }).notNull(),
    projectId: varchar("project_id", { length: 32 }).notNull(),
    date: varchar("date", { length: 40 }),
    time: varchar("time", { length: 10 }),
    topic: varchar("topic", { length: 500 }).notNull(),
    pillar: varchar("pillar", { length: 100 }),
    goal: varchar("goal", { length: 64 }).$type<ContentGoal>(),
    platforms: json("platforms").$type<Platform[]>().notNull().default([]),
    assetType: varchar("asset_type", { length: 64 }),
    cta: varchar("cta", { length: 200 }),
    status: varchar("status", { length: 30 }).notNull().default("Planned"),
    createdAt: createdAt(),
  },
  (t) => [index("idx_planitem_plan").on(t.planId)],
)

// ── 日历任务 + 每平台子任务（项目级隔离）──
export const ssaCalendarItem = mysqlTable(
  "ssa_calendar_item",
  {
    id: id(),
    workspaceId: varchar("workspace_id", { length: 32 }).notNull(),
    projectId: varchar("project_id", { length: 32 }).notNull(),
    postId: varchar("post_id", { length: 32 }),
    topic: varchar("topic", { length: 500 }).notNull(),
    date: varchar("date", { length: 40 }),
    time: varchar("time", { length: 10 }),
    status: varchar("status", { length: 30 }).$type<PostStatus>().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("idx_cal_project").on(t.projectId)],
)

export const ssaCalendarJob = mysqlTable(
  "ssa_calendar_job",
  {
    id: id(),
    calendarItemId: varchar("calendar_item_id", { length: 32 }).notNull(),
    projectId: varchar("project_id", { length: 32 }).notNull(),
    platform: varchar("platform", { length: 20 }).$type<Platform>().notNull(),
    account: varchar("account", { length: 200 }),
    time: varchar("time", { length: 10 }),
    publishMode: varchar("publish_mode", { length: 10 }).$type<PublishMode>(),
    status: varchar("status", { length: 30 }).$type<PostStatus>().notNull(),
    reason: varchar("reason", { length: 500 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("idx_caljob_item").on(t.calendarItemId)],
)

// ── 生成任务审计（每次生成的输入/输出/模型/token/credits）──
export const ssaGenerationJob = mysqlTable(
  "ssa_generation_job",
  {
    id: id(),
    workspaceId: varchar("workspace_id", { length: 32 }).notNull(),
    projectId: varchar("project_id", { length: 32 }).notNull(),
    userId: varchar("user_id", { length: 32 }).notNull(),
    actionType: varchar("action_type", { length: 40 }).$type<BillingActionType>().notNull(),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    inputJson: json("input_json"),
    outputJson: json("output_json"),
    model: varchar("model", { length: 128 }),
    vendor: varchar("vendor", { length: 128 }),
    requestTokens: bigint("request_tokens", { mode: "number" }),
    responseTokens: bigint("response_tokens", { mode: "number" }),
    estimatedCredits: int("estimated_credits"),
    actualCredits: int("actual_credits"),
    billingRecordId: varchar("billing_record_id", { length: 32 }),
    errorCode: varchar("error_code", { length: 40 }).$type<GenerationErrorCode>(),
    errorMessage: varchar("error_message", { length: 1000 }),
    traceId: varchar("trace_id", { length: 64 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("idx_genjob_project").on(t.projectId)],
)

// ── 本地计费审计（真源在 GLBGPT；这里做审计/幂等）──
export const ssaBillingUsageRecord = mysqlTable(
  "ssa_billing_usage_record",
  {
    id: id(),
    userId: varchar("user_id", { length: 32 }).notNull(),
    workspaceId: varchar("workspace_id", { length: 32 }).notNull(),
    projectId: varchar("project_id", { length: 32 }).notNull(),
    actionType: varchar("action_type", { length: 40 }).$type<BillingActionType>().notNull(),
    estimatedCredits: int("estimated_credits").notNull(),
    actualCredits: int("actual_credits"),
    providerCost: decimal("provider_cost", { precision: 12, scale: 6 }),
    model: varchar("model", { length: 128 }),
    status: varchar("status", { length: 20 }).notNull().default("estimated"),
    reservationId: varchar("reservation_id", { length: 64 }),
    glbgptRef: varchar("glbgpt_ref", { length: 64 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("idx_billing_user").on(t.userId)],
)

// ── 平台 prompt（后台管理预留：管理员按 平台×动作 编辑生成 prompt，数据驱动）──
export const ssaPlatformPrompt = mysqlTable(
  "ssa_platform_prompt",
  {
    id: id(),
    platform: varchar("platform", { length: 20 }).$type<Platform>().notNull(),
    actionType: varchar("action_type", { length: 40 }).$type<BillingActionType>().notNull(),
    template: text("template").notNull(),
    enabled: tinyint("enabled").notNull().default(1),
    updatedBy: varchar("updated_by", { length: 32 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("uq_prompt_platform_action").on(t.platform, t.actionType)],
)

// 供 migrate / drizzle-kit 引用的全表集合的类型辅助（可选）。
export const schema = {
  ssaWorkspace,
  ssaProject,
  ssaSocialAccount,
  ssaPost,
  ssaPostVariant,
  ssaMediaAsset,
  ssaPlan,
  ssaPlanItem,
  ssaCalendarItem,
  ssaCalendarJob,
  ssaGenerationJob,
  ssaBillingUsageRecord,
  ssaPlatformPrompt,
}

// 忽略未使用的 sql import 警告：保留以便后续在列默认值里用原生表达式。
void sql
