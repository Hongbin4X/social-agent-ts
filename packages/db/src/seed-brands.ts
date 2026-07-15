// 灌入 TEST-DATA.md 里的高质量测试品牌档案（作为当前工作区下的多个 project）。
// 幂等：按 brandName 判重，已存在则跳过。运行：pnpm --filter @social/db db:seed:brands
import type { ContentGoal, Platform } from "@social/shared"
import { loadEnv } from "../../../scripts/load-env.mjs"
import { createDb } from "./client"
import type { ProjectInput } from "./repositories/project.repo"
import { createRepositories } from "./repositories"

// env 加载统一走 scripts/load-env.mjs。
loadEnv()

const BRANDS: ProjectInput[] = [
  {
    brandName: "Lumio",
    description: "Plant-based, refillable skincare for sensitive skin — clean formulas, zero-waste glass packaging.",
    targetMarket: "US",
    platforms: ["Instagram", "TikTok", "Facebook"] as Platform[],
    primaryGoal: "Grow awareness" as ContentGoal,
    contentGoals: ["Grow awareness", "Drive purchase"] as ContentGoal[],
    websiteUrl: "https://lumio.example",
    productUrl: "https://lumio.example/refill-ritual",
    tone: "Warm, honest, a little playful — no hype, no fear-mongering",
    targetAudience: "Eco-conscious millennials & Gen Z, sensitive-skin sufferers, clean-beauty shoppers",
    weeklyFrequency: 5,
    defaultCta: "Shop the refill ritual",
    hashtags: "#CleanBeauty #ZeroWaste #SensitiveSkin #RefillNotLandfill",
    forbiddenTopics: "Competitor callouts, unproven detox claims, medical before/after claims",
    brandColors: "#6B8E7B, #F4EDE4, #2E2A26",
    visualStyle: "Soft natural light, earthy tones, real skin texture, matte glass bottles",
  },
  {
    brandName: "Forkful",
    description: "A weeknight meal-kit app that turns 5 pantry staples into 20-minute family dinners.",
    targetMarket: "US",
    platforms: ["Instagram", "TikTok", "YouTube", "Facebook"] as Platform[],
    primaryGoal: "Get followers" as ContentGoal,
    contentGoals: ["Get followers", "Drive trial"] as ContentGoal[],
    websiteUrl: "https://forkful.example",
    productUrl: "https://forkful.example/first-week-free",
    tone: "Friendly, practical, encouraging — real-kitchen, not gourmet",
    targetAudience: "Busy working parents, families with young kids, budget-conscious home cooks",
    weeklyFrequency: 6,
    defaultCta: "Get your first week free",
    hashtags: "#WeeknightDinner #MealPrep #FamilyMeals #20MinuteMeals",
    forbiddenTopics: "Fad diets, calorie shaming, medical nutrition claims",
    brandColors: "#E8552D, #FFC85C, #2B2B2B",
    visualStyle: "Bright overhead food shots, hands-in-frame, cozy kitchen, quick-cut process",
  },
  {
    brandName: "Ledgerly",
    description: "Simple invoicing + expense tracking that gets freelancers paid faster.",
    targetMarket: "Global English Market",
    platforms: ["X", "Reddit", "YouTube", "Facebook"] as Platform[],
    primaryGoal: "Generate leads" as ContentGoal,
    contentGoals: ["Generate leads", "Drive trial"] as ContentGoal[],
    websiteUrl: "https://ledgerly.example",
    productUrl: "https://ledgerly.example/signup",
    tone: "Clear, no-nonsense, quietly witty — respects the reader's time",
    targetAudience: "Freelancers, solo consultants, indie designers & developers",
    weeklyFrequency: 4,
    defaultCta: "Start invoicing free",
    hashtags: "#Freelance #Invoicing #FreelanceLife #GetPaid",
    forbiddenTopics: "Tax/legal advice, competitor pricing claims",
    brandColors: "#1F6FEB, #0D1117, #F0F3F6",
    visualStyle: "Clean product-UI screenshots, minimal, high-contrast, single accent color",
  },
  {
    brandName: "Trailhead Coffee",
    description: "Small-batch specialty coffee roasted in Portland — single-origin subscriptions and a neighborhood cafe.",
    targetMarket: "US",
    platforms: ["Instagram", "TikTok", "Reddit"] as Platform[],
    primaryGoal: "Grow awareness" as ContentGoal,
    contentGoals: ["Grow awareness", "Get followers"] as ContentGoal[],
    websiteUrl: "https://trailhead.example",
    productUrl: "https://trailhead.example/subscribe",
    tone: "Cozy, craft-nerdy, community-first — passionate, not pretentious",
    targetAudience: "Coffee enthusiasts, local Portland community, home-brew hobbyists",
    weeklyFrequency: 5,
    defaultCta: "Meet this month's roast",
    hashtags: "#SpecialtyCoffee #SingleOrigin #PourOver #PDXCoffee",
    forbiddenTopics: "Health claims about caffeine, disparaging chains by name",
    brandColors: "#4A2C2A, #C68B59, #EFE6DA",
    visualStyle: "Warm film-like tones, steam & pour shots, roastery textures, hands & mugs",
  },
  {
    brandName: "Pulse Fit",
    description: "AI-personalized strength training that adapts to your recovery — not a fixed plan.",
    targetMarket: "Global English Market",
    platforms: ["Instagram", "TikTok", "YouTube", "X"] as Platform[],
    primaryGoal: "Drive trial" as ContentGoal,
    contentGoals: ["Drive trial", "Launch campaign"] as ContentGoal[],
    websiteUrl: "https://pulsefit.example",
    productUrl: "https://pulsefit.example/start",
    tone: "Motivating, science-backed, inclusive — no shame, no crash-diet hype",
    targetAudience: "Busy professionals 25–45, returning-to-gym lifters, home-gym owners",
    weeklyFrequency: 7,
    defaultCta: "Start your 7-day program",
    hashtags: "#StrengthTraining #ProgressiveOverload #HomeGym #FitnessJourney",
    forbiddenTopics: "Extreme diets, body shaming, unverified supplement claims",
    brandColors: "#12E29A, #0B0F14, #EAF2EF",
    visualStyle: "High-energy gym & home-workout clips, form close-ups, bold text overlays",
  },
]

async function main() {
  const userId = process.env.DEV_FAKE_USER_ID ?? "1000000000000000001"
  const { db, pool } = createDb()
  const repos = createRepositories(db)

  const workspace = await repos.workspaces.getByUserId(userId)
  if (!workspace) {
    console.error(`[seed:brands] 找不到 userId=${userId} 的工作区。请先跑 db:seed 建工作区。`)
    await pool.end()
    process.exit(1)
  }

  const existing = await repos.projects.listByWorkspace(workspace.id)
  const existingNames = new Set(existing.map((p) => p.brandName))

  let created = 0
  for (const brand of BRANDS) {
    if (existingNames.has(brand.brandName)) {
      console.log(`  · 跳过（已存在）: ${brand.brandName}`)
      continue
    }
    const project = await repos.projects.create(workspace.id, brand)
    console.log(`  ✅ 建档案: ${brand.brandName} → ${project.id}`)
    created++
  }

  console.log(`[seed:brands] 完成：新增 ${created} 个品牌档案，工作区共 ${existing.length + created} 个 project。`)
  await pool.end()
  process.exit(0)
}

main().catch((e) => {
  console.error("[seed:brands] 失败：", e)
  process.exit(1)
})
