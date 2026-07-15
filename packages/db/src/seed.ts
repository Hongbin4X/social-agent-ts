// 种子脚本：镜像前端 mock（apps/web/.../data/mock.ts）造一套可跑通全链路的 Northstar AI 数据。
// 用法：pnpm --filter @social/db db:seed（tsx src/seed.ts）。
//
// 幂等：先按 userId 查工作区，已存在则跳过（不重复灌）。要重灌请先手动清库。
//
// 数据来源：apps/web/src/features/social/data/mock.ts 的 initialWorkspace / initialProfile /
// initialAccounts / initialPosts / initialCalendar（此处内联，不跨包 import —— @social/db 不依赖 apps/web）。

import type { Account, CalendarItem, SocialPost } from "@social/shared"
import { loadEnv } from "../../../scripts/load-env.mjs"
import { createDb } from "./client"
import { createRepositories } from "./repositories/index"

// env 加载统一走 scripts/load-env.mjs（拿 DEV_FAKE_USER_ID 与 DB 连接）。
loadEnv()

const USER_ID = process.env.DEV_FAKE_USER_ID ?? "1000000000000000001"

// ── 账号（工作区级，6 个）──
const SEED_ACCOUNTS: Account[] = [
  { id: "acc_x", platform: "X", type: "connected", name: "@northstar_ai", url: "https://x.com/northstar_ai", status: "Connected", expiresAt: "2026-09-30", capabilities: "Auto publishing available", notes: "Primary launch channel" },
  { id: "acc_ig", platform: "Instagram", type: "connected", name: "@northstar.ai", url: "https://instagram.com/northstar.ai", status: "Expired", expiresAt: "2026-06-28", capabilities: "Feed image publishing available, Reels cover manual fallback", notes: "Token expired — reconnect to resume auto publishing" },
  { id: "acc_fb", platform: "Facebook", type: "connected", name: "Northstar AI Page", url: "https://facebook.com/northstarai", status: "PermissionMissing", expiresAt: "2026-10-12", capabilities: "Auto publishing available once permissions are granted", notes: "Missing pages_manage_posts permission" },
  { id: "acc_tiktok", platform: "TikTok", type: "manual", name: "@northstar.ai", url: "https://tiktok.com/@northstar.ai", status: "UnsupportedPublishing", capabilities: "Cover image only, manual fallback", notes: "Video generation out of P0 scope" },
  { id: "acc_yt", platform: "YouTube", type: "manual", name: "Northstar AI", url: "https://youtube.com/@northstarai", status: "UnsupportedPublishing", capabilities: "Thumbnail and description only, manual fallback", notes: "" },
  { id: "acc_reddit", platform: "Reddit", type: "manual", name: "u/northstar_team", url: "https://reddit.com/user/northstar_team", status: "UnsupportedPublishing", capabilities: "Manual fallback only", notes: "Community posts only" },
]

// ── 帖子（项目级，8 个，含 variants）──
const SEED_POSTS: SocialPost[] = [
  {
    id: "post_1", title: "Why small teams waste 6 hours a week on busywork", platforms: ["X", "Reddit"], assetType: "Text + image",
    status: "Published", tags: ["awareness", "launch-week"], updatedAt: "Jul 6, 09:12", owner: "L", hasImage: true,
    variants: [{ platform: "X", account: "@northstar_ai", hook: "Small teams lose 6 hours a week to busywork.", body: "We measured it. Here's where the time goes — and how to win it back.", hashtags: "#AIProductivity #StartupTools", cta: "Start your free trial", format: "16:9", publishMode: "auto", state: "Valid", suggestedTime: "09:00" }],
  },
  {
    id: "post_2", title: "3 Northstar workflows that save founders a full day", platforms: ["Instagram", "X"], assetType: "Carousel cover",
    status: "Scheduled", tags: ["how-to"], updatedAt: "Jul 7, 08:40", owner: "L", hasImage: true,
    variants: [
      { platform: "Instagram", account: "@northstar.ai", hook: "3 workflows. One free day back.", body: "Swipe for the exact setup our power users rely on.", hashtags: "#AIProductivity", cta: "Try it free", format: "4:5", publishMode: "auto", state: "Valid", suggestedTime: "11:30" },
      { platform: "X", account: "@northstar_ai", hook: "3 Northstar workflows that save founders a full day:", body: "A short thread.", hashtags: "#StartupTools", cta: "Try it free", format: "1:1", publishMode: "auto", state: "Valid", suggestedTime: "11:30" },
    ],
  },
  {
    id: "post_3", title: "Customer spotlight: Acme cut reporting time by 70%", platforms: ["Instagram", "Reddit"], assetType: "Quote image",
    status: "ManualFallback", tags: ["social-proof"], updatedAt: "Jul 9, 07:55", owner: "L", hasImage: true,
    variants: [
      { platform: "Instagram", account: "@northstar.ai", hook: "70% less time on reporting.", body: "How Acme rebuilt their weekly reporting with Northstar.", hashtags: "#AIProductivity", cta: "Start your free trial", format: "1:1", publishMode: "auto", state: "Valid", suggestedTime: "10:00" },
      { platform: "Reddit", account: "u/northstar_team", hook: "We helped a customer cut reporting time by 70% [case study]", body: "Full breakdown of the workflow in the comments.", hashtags: "", cta: "Start your free trial", format: "16:9", publishMode: "manual", state: "Manual fallback", suggestedTime: "10:00" },
    ],
  },
  {
    id: "post_4", title: "Launch week: what's new in Northstar 2.0", platforms: ["X", "Instagram", "YouTube"], assetType: "Cover image + copy",
    status: "Failed", tags: ["launch", "release"], updatedAt: "Jul 10, 15:48", owner: "L", hasImage: true, failureReason: "Provider rate limit reached. The post was not published.",
    variants: [{ platform: "X", account: "@northstar_ai", hook: "Northstar 2.0 is here.", body: "Faster automations, smarter summaries, and a brand-new planner.", hashtags: "#StartupTools", cta: "See what's new", format: "16:9", publishMode: "auto", state: "Valid", suggestedTime: "16:00" }],
  },
  {
    id: "post_5", title: "AMA recap: top 5 questions about AI productivity", platforms: ["Reddit", "X"], assetType: "Text",
    status: "ManuallyPublished", tags: ["community"], updatedAt: "Jul 11, 13:20", owner: "L", hasImage: false,
    variants: [{ platform: "Reddit", account: "u/northstar_team", hook: "AMA recap: your top 5 questions, answered", body: "Thanks to everyone who joined. Here are the highlights.", hashtags: "", cta: "Join the next AMA", format: "16:9", publishMode: "manual", state: "Manual fallback", suggestedTime: "12:00" }],
  },
  {
    id: "post_6", title: "Founder story: building Northstar with a 4-person team", platforms: ["X", "YouTube"], assetType: "Thumbnail + copy",
    status: "Draft", tags: ["founder-story"], updatedAt: "Jul 5, 19:02", owner: "L", hasImage: false,
    variants: [{ platform: "X", account: "@northstar_ai", hook: "We built Northstar with 4 people.", body: "Here's what we learned shipping fast with a tiny team.", hashtags: "#StartupTools", cta: "Follow the journey", format: "16:9", publishMode: "auto", state: "Needs edits", suggestedTime: "14:00" }],
  },
  {
    id: "post_7", title: "Behind the scenes: how we design features", platforms: ["Instagram", "YouTube"], assetType: "Cover image",
    status: "Ready", tags: ["bts"], updatedAt: "Jul 4, 11:10", owner: "L", hasImage: true,
    variants: [{ platform: "Instagram", account: "@northstar.ai", hook: "How a Northstar feature goes from idea to ship.", body: "A look inside our design process.", hashtags: "#AIProductivity", cta: "Follow for more", format: "9:16", publishMode: "manual", state: "Manual fallback", suggestedTime: "18:00" }],
  },
  {
    id: "post_8", title: "5 prompts every founder should steal", platforms: ["X"], assetType: "Text",
    status: "Planned", tags: ["how-to"], updatedAt: "Jul 3, 09:30", owner: "L", hasImage: false,
    variants: [{ platform: "X", account: "@northstar_ai", hook: "5 prompts every founder should steal:", body: "Save this thread for your next busy week.", hashtags: "#AIProductivity", cta: "Try it free", format: "1:1", publishMode: "auto", state: "Valid", suggestedTime: "09:00" }],
  },
]

// ── 日历（项目级，5 个，含 jobs → variants）；postId 引用 mock 帖子 id，灌库时映射到真实 id ──
const SEED_CALENDAR: CalendarItem[] = [
  { id: "cal_1", postId: "post_1", topic: "Why small teams waste 6 hours a week", date: "Mon Jul 6", time: "09:00", status: "Published", variants: [{ platform: "X", account: "@northstar_ai", time: "09:00", publishMode: "auto", status: "Published" }, { platform: "Reddit", account: "u/northstar_team", time: "09:30", publishMode: "manual", status: "ManuallyPublished" }] },
  { id: "cal_2", postId: "post_2", topic: "3 Northstar workflows", date: "Tue Jul 7", time: "11:30", status: "Scheduled", variants: [{ platform: "Instagram", account: "@northstar.ai", time: "11:30", publishMode: "auto", status: "Scheduled" }, { platform: "X", account: "@northstar_ai", time: "11:35", publishMode: "auto", status: "Scheduled" }] },
  { id: "cal_3", postId: "post_4", topic: "Launch week: Northstar 2.0", date: "Fri Jul 10", time: "16:00", status: "Failed", variants: [{ platform: "X", account: "@northstar_ai", time: "16:00", publishMode: "auto", status: "Failed", reason: "Provider rate limit reached" }, { platform: "Instagram", account: "@northstar.ai", time: "16:05", publishMode: "auto", status: "Published" }, { platform: "YouTube", account: "Northstar AI", time: "16:10", publishMode: "manual", status: "ManualFallback", reason: "Video upload unsupported in P0" }] },
  { id: "cal_4", postId: "post_3", topic: "Customer spotlight: Acme", date: "Thu Jul 9", time: "10:00", status: "ManualFallback", variants: [{ platform: "Instagram", account: "@northstar.ai", time: "10:00", publishMode: "auto", status: "Published" }, { platform: "Reddit", account: "u/northstar_team", time: "10:30", publishMode: "manual", status: "ManualFallback", reason: "Reddit auto publishing not supported" }] },
  { id: "cal_5", postId: "post_8", topic: "5 prompts every founder should steal", date: "Wed Jul 8", time: "09:00", status: "Planned", variants: [{ platform: "X", account: "@northstar_ai", time: "09:00", publishMode: "auto", status: "Planned" }] },
]

async function main(): Promise<void> {
  const { db, pool } = createDb()
  const repos = createRepositories(db)

  // 幂等：已存在则跳过。
  const existing = await repos.workspaces.getByUserId(USER_ID)
  if (existing) {
    console.log(`ℹ️  [seed] workspace for user ${USER_ID} 已存在（${existing.id}），跳过。`)
    await pool.end()
    process.exit(0)
  }

  // 1) 工作区（对齐 initialWorkspace）。
  const workspace = await repos.workspaces.create({
    userId: USER_ID,
    name: "Northstar Launch",
    timezone: "America/Los_Angeles",
  })

  // 2) 项目 / 品牌档案（对齐 initialProfile + initialWorkspace 核心字段）。
  const project = await repos.projects.create(workspace.id, {
    brandName: "Northstar AI",
    description: "AI productivity assistant for small teams",
    targetMarket: "US",
    platforms: ["X", "Reddit", "Instagram", "YouTube"],
    primaryGoal: "Drive trial",
    websiteUrl: "https://northstar.ai",
    tone: "clear, helpful, slightly bold",
    productUrl: "",
    targetAudience: "startup founders, indie makers, marketing leads",
    contentGoals: ["Drive trial"],
    weeklyFrequency: 5,
    defaultCta: "Start your free trial",
    hashtags: "#AIProductivity #StartupTools",
    forbiddenTopics: "",
    brandColors: "",
    visualStyle: "",
  })
  await repos.workspaces.setActiveProject(workspace.id, project.id)

  // 3) 账号（工作区级）。
  for (const acc of SEED_ACCOUNTS) {
    const { id: _ignore, ...input } = acc
    await repos.accounts.create(workspace.id, input)
  }

  // 4) 帖子（项目级）；记录 mock id → 真实 id 映射，供日历关联。
  const postIdMap = new Map<string, string>()
  for (const post of SEED_POSTS) {
    const { id: mockId, ...input } = post
    const created = await repos.posts.create(project.id, workspace.id, input)
    postIdMap.set(mockId, created.id)
  }

  // 5) 日历（项目级），postId 映射到真实帖子 id。
  for (const cal of SEED_CALENDAR) {
    await repos.calendar.create(
      project.id,
      workspace.id,
      {
        postId: cal.postId ? postIdMap.get(cal.postId) : undefined,
        topic: cal.topic,
        date: cal.date,
        time: cal.time,
        status: cal.status,
      },
      cal.variants,
    )
  }

  console.log(
    `✅ [seed] workspace=${workspace.id} project=${project.id} | ${SEED_ACCOUNTS.length} accounts, ${SEED_POSTS.length} posts, ${SEED_CALENDAR.length} calendar items`,
  )
  await pool.end()
  process.exit(0)
}

main().catch((err: unknown) => {
  console.error("❌ [seed] failed:", err)
  process.exit(1)
})
