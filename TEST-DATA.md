# 测试数据 · Super Social Agent

一组**风格迥异、字段完整**的品牌档案，用来测试产品的核心能力——尤其是「**当前品牌上下文 + 主题 + 平台 → 每平台定制生成**」是否真的吃进了品牌语气/受众/CTA/禁忌，并按平台差异化。

## 怎么用

这些品牌档案**已经灌进数据库**（作为当前工作区下的多个 project / 品牌档案），运行 `pnpm --filter @social/db db:seed:brands` 可重新灌（幂等，已存在则跳过）。

在产品里测试：
1. 打开 `http://52.54.122.204:3001` → Plan social posts。
2. Home 顶部点**品牌切换器**（"Northstar AI ▾"）→ 选一个下面的品牌。
3. Content Create → Start composing → 填该品牌下面列的**测试主题** → 选平台 → Generate & customize。
4. 观察：不同品牌 / 不同平台，生成的**语气、格式、话题标签、CTA、是否规避禁忌**是否随品牌上下文变化。

> 注：切换品牌后「生成」用的是该品牌在数据库里的完整档案（后端按 projectId 取），所以生成结果会体现品牌差异。

---

## 1. Lumio — 可持续护肤 DTC（美妆/电商）

| 字段 | 值 |
|---|---|
| Brand / project name | Lumio |
| Description | Plant-based, refillable skincare for sensitive skin — clean formulas, zero-waste glass packaging. |
| Target market | US |
| Target audience | Eco-conscious millennials & Gen Z, sensitive-skin sufferers, clean-beauty shoppers |
| Content goals | Grow awareness, Drive purchase |
| Platforms | Instagram, TikTok, Facebook |
| Weekly frequency | 5 |
| Brand tone | Warm, honest, a little playful — no hype, no fear-mongering |
| Default CTA | Shop the refill ritual |
| Hashtags | #CleanBeauty #ZeroWaste #SensitiveSkin #RefillNotLandfill |
| Forbidden topics | Competitor callouts, unproven "detox" claims, medical before/after claims |
| Brand colors | #6B8E7B, #F4EDE4, #2E2A26 |
| Visual style | Soft natural light, earthy tones, real skin texture, matte glass bottles |
| Website / Product | https://lumio.example · https://lumio.example/refill-ritual |

**测试主题**：
- Why we switched to refillable glass (and what it saves)
- How to layer serums for sensitive skin without irritation
- Behind the formula: our fragrance-free promise

---

## 2. Forkful — 快手家庭餐包 App（食品/家庭）

| 字段 | 值 |
|---|---|
| Brand / project name | Forkful |
| Description | A weeknight meal-kit app that turns 5 pantry staples into 20-minute family dinners. |
| Target market | US |
| Target audience | Busy working parents, families with young kids, budget-conscious home cooks |
| Content goals | Get followers, Drive trial |
| Platforms | Instagram, TikTok, YouTube, Facebook |
| Weekly frequency | 6 |
| Brand tone | Friendly, practical, encouraging — real-kitchen, not gourmet |
| Default CTA | Get your first week free |
| Hashtags | #WeeknightDinner #MealPrep #FamilyMeals #20MinuteMeals |
| Forbidden topics | Fad diets, calorie shaming, medical nutrition claims |
| Brand colors | #E8552D, #FFC85C, #2B2B2B |
| Visual style | Bright overhead food shots, hands-in-frame, cozy kitchen, quick-cut process |
| Website / Product | https://forkful.example · https://forkful.example/first-week-free |

**测试主题**：
- 5 pantry staples, 3 completely different dinners
- The 20-minute sheet-pan trick busy parents swear by
- What my kids actually eat (an honest weeknight menu)

---

## 3. Ledgerly — 自由职业者发票 SaaS（B2B/金融科技）

| 字段 | 值 |
|---|---|
| Brand / project name | Ledgerly |
| Description | Simple invoicing + expense tracking that gets freelancers paid faster. |
| Target market | Global English Market |
| Target audience | Freelancers, solo consultants, indie designers & developers |
| Content goals | Generate leads, Drive trial |
| Platforms | X, Reddit, YouTube, Facebook |
| Weekly frequency | 4 |
| Brand tone | Clear, no-nonsense, quietly witty — respects the reader's time |
| Default CTA | Start invoicing free |
| Hashtags | #Freelance #Invoicing #FreelanceLife #GetPaid |
| Forbidden topics | Tax/legal advice, competitor pricing claims |
| Brand colors | #1F6FEB, #0D1117, #F0F3F6 |
| Visual style | Clean product-UI screenshots, minimal, high-contrast, single accent color |
| Website / Product | https://ledgerly.example · https://ledgerly.example/signup |

**测试主题**：
- Late-paying clients? Steal this net-14 payment clause
- How I automate invoice reminders and never chase again
- A freelancer's end-of-quarter money checklist

---

## 4. Trailhead Coffee — 精品咖啡烘焙商 + 社区咖啡馆（F&B/生活方式）

| 字段 | 值 |
|---|---|
| Brand / project name | Trailhead Coffee |
| Description | Small-batch specialty coffee roasted in Portland — single-origin subscriptions and a neighborhood cafe. |
| Target market | US |
| Target audience | Coffee enthusiasts, local Portland community, home-brew hobbyists |
| Content goals | Grow awareness, Get followers |
| Platforms | Instagram, TikTok, Reddit |
| Weekly frequency | 5 |
| Brand tone | Cozy, craft-nerdy, community-first — passionate, not pretentious |
| Default CTA | Meet this month's roast |
| Hashtags | #SpecialtyCoffee #SingleOrigin #PourOver #PDXCoffee |
| Forbidden topics | Health claims about caffeine, disparaging chains by name |
| Brand colors | #4A2C2A, #C68B59, #EFE6DA |
| Visual style | Warm film-like tones, steam & pour shots, roastery textures, hands & mugs |
| Website / Product | https://trailhead.example · https://trailhead.example/subscribe |

**测试主题**：
- How we cup and score a new Ethiopian lot
- The pour-over ratio we actually swear by
- Meet the farm behind this month's single-origin

---

## 5. Pulse Fit — 自适应力量训练 App（健康/健身）

| 字段 | 值 |
|---|---|
| Brand / project name | Pulse Fit |
| Description | AI-personalized strength training that adapts to your recovery — not a fixed plan. |
| Target market | Global English Market |
| Target audience | Busy professionals 25–45, returning-to-gym lifters, home-gym owners |
| Content goals | Drive trial, Launch campaign |
| Platforms | Instagram, TikTok, YouTube, X |
| Weekly frequency | 7 |
| Brand tone | Motivating, science-backed, inclusive — no shame, no crash-diet hype |
| Default CTA | Start your 7-day program |
| Hashtags | #StrengthTraining #ProgressiveOverload #HomeGym #FitnessJourney |
| Forbidden topics | Extreme diets, body shaming, unverified supplement claims |
| Brand colors | #12E29A, #0B0F14, #EAF2EF |
| Visual style | High-energy gym & home-workout clips, form close-ups, bold text overlays |
| Website / Product | https://pulsefit.example · https://pulsefit.example/start |

**测试主题**：
- Why your program should change when you're under-recovered
- Progressive overload when you don't have more time
- 3 cues for a stronger, safer deadlift

---

## 建议的测试场景（覆盖核心链路）

1. **品牌差异化**：同一主题（如 "behind the scenes of how we work"）分别在 Lumio 和 Ledgerly 下生成，对比语气/术语/CTA 是否明显不同。
2. **平台定制**：同一品牌选 3+ 平台一次生成，看 X（精炼）/ Instagram（视觉+多标签）/ Reddit（第一人称社区，自动 manual fallback）/ YouTube（标题+描述）是否各自成形。
3. **禁忌规避**：给 Pulse Fit 出一个容易踩雷的主题（如 "lose 10 lbs fast"），看是否规避 extreme diets / body shaming。
4. **计费闭环**：每次生成看右上 credits 是否扣、失败是否退款（后端 `ssa_billing_usage_record`）。
5. **落库**：Save as draft 后刷新页面，帖子是否还在（`ssa_post`）。

> 数据只用于测试，均为虚构品牌；`*.example` 域名不真实存在。
</content>
