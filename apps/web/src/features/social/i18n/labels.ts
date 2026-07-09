// 领域枚举的中英显示名（唯一真源）。
//
// 为什么单独一份：PostStatus/AccountStatus 等枚举既当"数据键"又要"显示"——不能翻译键本身，
// 只能在渲染处按当前语言取显示名。组件用 useLang().te(MAP[value]) 取；命令式代码用 tl(MAP[value])。
// 平台名（Platform）是专有名词，不在这里翻（见 components/ui.tsx 的 PLATFORM_META）。

import type { AccountStatus, ContentGoal, PostStatus, VariantState } from "@social/shared"
import type { LangEntry } from "./index"

export const STATUS_LABELS: Record<PostStatus, LangEntry> = {
  Draft: { en: "Draft", zh: "草稿" },
  Ready: { en: "Ready", zh: "就绪" },
  Planned: { en: "Planned", zh: "已计划" },
  Scheduled: { en: "Scheduled", zh: "已排期" },
  Publishing: { en: "Publishing", zh: "发布中" },
  Published: { en: "Published", zh: "已发布" },
  Failed: { en: "Failed", zh: "失败" },
  Cancelled: { en: "Cancelled", zh: "已取消" },
  ManualFallback: { en: "Manual fallback", zh: "转手动" },
  ManuallyPublished: { en: "Manually published", zh: "已手动发布" },
  Archived: { en: "Archived", zh: "已归档" },
}

export const ACCOUNT_STATUS_LABELS: Record<AccountStatus, LangEntry> = {
  NotConnected: { en: "Not connected", zh: "未连接" },
  Connected: { en: "Connected", zh: "已连接" },
  Expired: { en: "Expired", zh: "已过期" },
  PermissionMissing: { en: "Permission missing", zh: "权限缺失" },
  UnsupportedPublishing: { en: "Unsupported publishing", zh: "不支持自动发布" },
  Error: { en: "Error", zh: "错误" },
}

export const VARIANT_STATE_LABELS: Record<VariantState, LangEntry> = {
  Valid: { en: "Valid", zh: "有效" },
  "Needs edits": { en: "Needs edits", zh: "需修改" },
  "Manual fallback": { en: "Manual fallback", zh: "转手动" },
  Unsupported: { en: "Unsupported", zh: "不支持" },
}

export const CONTENT_GOAL_LABELS: Record<ContentGoal, LangEntry> = {
  "Grow awareness": { en: "Grow awareness", zh: "提升认知" },
  "Get followers": { en: "Get followers", zh: "增长粉丝" },
  "Generate leads": { en: "Generate leads", zh: "获取线索" },
  "Drive trial": { en: "Drive trial", zh: "促进试用" },
  "Drive purchase": { en: "Drive purchase", zh: "促进购买" },
  "Launch campaign": { en: "Launch campaign", zh: "发起活动" },
}

// 运营数据指标名（按 mock 的 metric.key）。value/数字保持原样，只翻标签。
export const METRIC_LABELS: Record<string, LangEntry> = {
  published: { en: "Posts published", zh: "已发布帖子" },
  impressions: { en: "Impressions", zh: "曝光量" },
  engagement: { en: "Engagement rate", zh: "互动率" },
  clicks: { en: "Link clicks", zh: "链接点击" },
  followers: { en: "Net new followers", zh: "净增粉丝" },
  failed: { en: "Failed jobs", zh: "失败任务" },
  manual: { en: "Manual fallbacks", zh: "转手动数" },
  video: { en: "Video views", zh: "视频播放" },
}

/** 数据不可用时的占位（mock 里的 "Not available"）。 */
export const NOT_AVAILABLE: LangEntry = { en: "Not available", zh: "暂无数据" }

// Super Social Agent 的二级导航标签（store 的 AgentTab；侧栏与 workbench 共用）。
export const NAV_LABELS: Record<string, LangEntry> = {
  Home: { en: "Home", zh: "首页" },
  "Content Create": { en: "Content Create", zh: "内容创作" },
  Calendar: { en: "Calendar", zh: "日历" },
  "Operations Data": { en: "Operations Data", zh: "运营数据" },
}
