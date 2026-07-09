"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import {
  initialAccounts,
  initialCalendar,
  initialPosts,
  initialProfile,
  initialWorkspace,
  opsRecommendations,
  planTemplate,
} from "@/features/social/data/mock"
// 后端 API 客户端：store 的关键操作（加载数据 / 生成变体 / 建工作区 / 存帖子 / 切项目）走真实后端。
import { api } from "@/features/social/data/api"
// store 非组件、用不了 useLang hook，toast 文案用模块级 translate(en,zh)（读当前语言，一次性取值）。
import { translate } from "@/features/social/i18n"
import type {
  Account,
  AccountStatus,
  BrandProfile,
  CalendarItem,
  ContentGoal,
  PlanItem,
  Platform,
  PostStatus,
  PostVariant,
  Recommendation,
  SocialPost,
  Toast,
} from "@social/shared"
// 平台自动发布能力的唯一真源在 @social/shared（后端也复用同一份）。这里 import 后再 re-export，
// 让原型里所有「从 store 引 AUTO_PLATFORMS / platformPublishMode」的调用方零改动。
import { AUTO_PLATFORMS, platformPublishMode } from "@social/shared"
export { AUTO_PLATFORMS, platformPublishMode }

export type AgentTab = "Home" | "Content Create" | "Calendar" | "Operations Data"
export type AgentSecondary = "brand" | "accounts" | null
export type CreateIntent = "post" | "plan" | null

export interface StudioDraft {
  sourcePlanId?: string
  topic: string
  platforms: Platform[]
  copyGenerated: boolean
  imageGenerated: boolean
  variants: PostVariant[]
}

interface ProjectInput {
  brandName: string
  description: string
  targetMarket: string
  platforms: Platform[]
  primaryGoal: ContentGoal
  websiteUrl?: string
  tone?: string
}

interface WorkspaceInput extends ProjectInput {
  name: string
}

export interface Project extends ProjectInput {
  id: string
}

interface Store {
  view: "home" | "agent"
  setView: (v: "home" | "agent") => void
  goToAgent: () => void
  agentTab: AgentTab
  setAgentTab: (t: AgentTab) => void
  agentSecondary: AgentSecondary
  setAgentSecondary: (v: AgentSecondary) => void
  createIntent: CreateIntent
  setCreateIntent: (v: CreateIntent) => void

  hasWorkspace: boolean
  workspace: typeof initialWorkspace | null
  createWorkspace: (input: WorkspaceInput) => void
  projects: Project[]
  activeProjectId: string | null
  switchProject: (id: string) => void
  createProject: (input: ProjectInput) => void

  credits: number
  profile: BrandProfile
  updateProfile: (patch: Partial<BrandProfile>) => void
  profileCompletion: () => { pct: number; missing: number }
  generateProfileDraft: () => void

  plan: PlanItem[]
  generatePlan: () => void
  addPlanItemToCalendar: (item: PlanItem) => void

  studio: StudioDraft
  startStudioFromPlan: (item: PlanItem) => void
  startStudioBlank: () => void
  generateCopy: () => void
  generateImage: (params: {
    platform: Platform
    format: string
    hook: string
    body: string
    mediaAsset?: string
    instruction?: string
  }) => Promise<void>
  generateVariants: () => Promise<void>
  startManualVariants: () => void
  updateVariant: (platform: Platform, patch: Partial<PostVariant>) => void
  setStudioPlatforms: (p: Platform[]) => void
  setStudioTopic: (t: string) => void

  posts: SocialPost[]
  saveStudioToLibrary: () => Promise<SocialPost | null>
  markManuallyPublished: (postId: string) => void
  retryFailed: (postId: string) => void
  archivePost: (postId: string) => void

  calendar: CalendarItem[]
  addStudioToCalendar: (date?: string, time?: string) => void
  schedulePost: (post: SocialPost) => void
  rescheduleCalendarItem: (id: string, date: string, time: string) => void
  cancelCalendarItem: (id: string) => void
  publishCalendarItemNow: (id: string) => void
  convertCalendarItemToManual: (id: string) => void

  accounts: Account[]
  addManualAccount: (a: Omit<Account, "id" | "status" | "type">) => void
  connectAccount: (platform: Platform) => void
  disconnectAccount: (id: string) => void
  refreshAccount: (id: string) => void

  suggestions: Recommendation[]
  suggestionsGenerated: boolean
  generateSuggestions: () => void

  toasts: Toast[]
  pushToast: (message: string, tone?: Toast["tone"]) => void
  dismissToast: (id: string) => void
}

const Ctx = createContext<Store | null>(null)

let idc = 1000
const nextId = (p: string) => `${p}_${++idc}`

const VARIANT_DEFAULTS: Record<
  Platform,
  { account: string; accountType: "manual" | "connected"; format: string; media: string }
> = {
  TikTok: { account: "Manual paste account", accountType: "manual", format: "Cover 9:16", media: "Cover image" },
  Instagram: { account: "@northstar.ai", accountType: "connected", format: "Feed 1:1", media: "Generated image" },
  YouTube: { account: "Northstar AI", accountType: "manual", format: "Thumbnail 16:9", media: "Thumbnail" },
  X: { account: "@northstar_ai", accountType: "connected", format: "Landscape 16:9", media: "Generated image" },
  Reddit: { account: "u/northstar_team", accountType: "manual", format: "Text post · No media", media: "No media" },
  Facebook: { account: "Northstar AI Page", accountType: "connected", format: "Landscape 1.91:1", media: "Generated image" },
}

const COPY_BODY: Record<Platform, (topic: string, p: BrandProfile) => string> = {
  X: (t, p) => `${t} — ${p.description}. Keep it punchy. ${p.defaultCta}.`,
  Instagram: (t, p) => `${t}\n\n${p.description}. Save this for later and tap to learn more.`,
  TikTok: (t) => `Hook: ${t}. On-screen caption only — script + voiceover are added by your editor.`,
  YouTube: (t, p) => `${t}\n\nDescription: ${p.description}. Chapters + links go here. Upload the video manually.`,
  Reddit: (t, p) => `${t}\n\nBody: honest, no-hype writeup for the community. ${p.description}.`,
  Facebook: (t, p) => `${t} — ${p.description}. Friendly, conversational tone for the Page audience.`,
}

export function buildVariant(platform: Platform, topic: string, profile: BrandProfile): PostVariant {
  const mode = platformPublishMode(platform)
  const d = VARIANT_DEFAULTS[platform]
  const safeTopic = topic || "New social topic"
  return {
    platform,
    account: d.account,
    accountType: d.accountType,
    hook: safeTopic,
    body: COPY_BODY[platform](safeTopic, profile),
    hashtags: profile.hashtags,
    cta: profile.defaultCta || "Start your free trial",
    ctaUrl: profile.productUrl || profile.websiteUrl || "",
    format: d.format,
    mediaAsset: d.media,
    publishMode: mode,
    state: mode === "manual" ? "Manual fallback" : "Valid",
    suggestedTime: "10:00",
  }
}

export function SocialProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<"home" | "agent">("home")
  const [agentTab, setAgentTab] = useState<AgentTab>("Home")
  const [agentSecondary, setAgentSecondary] = useState<AgentSecondary>(null)
  const [createIntent, setCreateIntent] = useState<CreateIntent>(null)
  const [workspace, setWorkspace] = useState<typeof initialWorkspace | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [credits, setCredits] = useState(748)
  const [profile, setProfile] = useState<BrandProfile>(initialProfile)
  const [plan, setPlan] = useState<PlanItem[]>([])
  const [posts, setPosts] = useState<SocialPost[]>(initialPosts)
  const [calendar, setCalendar] = useState<CalendarItem[]>(initialCalendar)
  const [accounts, setAccounts] = useState<Account[]>(initialAccounts)
  const [suggestions, setSuggestions] = useState<Recommendation[]>([])
  const [suggestionsGenerated, setSuggestionsGenerated] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [studio, setStudio] = useState<StudioDraft>({
    topic: "",
    platforms: ["X", "Instagram"],
    copyGenerated: false,
    imageGenerated: false,
    variants: [],
  })

  const pushToast = useCallback((message: string, tone: Toast["tone"] = "default") => {
    const id = nextId("toast")
    setToasts((t) => [...t, { id, message, tone }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200)
  }, [])
  const dismissToast = useCallback((id: string) => setToasts((t) => t.filter((x) => x.id !== id)), [])

  // 挂载时从后端加载真实数据（前后端数据库打通）。后端不可用则保留 mock，UI 仍可看。
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { workspace: ws } = await api.getWorkspace()
        if (!ws || cancelled) return
        const { projects: projs } = await api.getProjects()
        const activeId = ws.activeProjectId ?? projs[0]?.id ?? null
        const activeProj = projs.find((p) => p.id === activeId) ?? projs[0]
        const [accsRes, bpRes, postsRes, calRes] = await Promise.all([
          api.getAccounts(),
          activeId ? api.getBrandProfile(activeId) : Promise.resolve({ brandProfile: null }),
          activeId ? api.getPosts(activeId) : Promise.resolve({ posts: [] as SocialPost[] }),
          activeId ? api.getCalendar(activeId) : Promise.resolve({ calendar: [] as CalendarItem[] }),
        ])
        if (cancelled) return
        setWorkspace({
          ...initialWorkspace,
          id: ws.id,
          name: ws.name,
          timezone: ws.timezone,
          brandName: activeProj?.brandName ?? initialWorkspace.brandName,
          description: activeProj?.description ?? "",
          targetMarket: activeProj?.targetMarket ?? "US",
          platforms: activeProj?.platforms ?? [],
          primaryGoal: (activeProj?.primaryGoal as ContentGoal) ?? "Grow awareness",
          websiteUrl: activeProj?.websiteUrl,
          tone: activeProj?.tone,
        })
        setProjects(projs.map((p) => ({ id: p.id, brandName: p.brandName, description: p.description, targetMarket: p.targetMarket, platforms: p.platforms, primaryGoal: p.primaryGoal as ContentGoal, websiteUrl: p.websiteUrl, tone: p.tone })))
        setActiveProjectId(activeId)
        if (bpRes.brandProfile) setProfile(bpRes.brandProfile)
        setAccounts(accsRes.accounts)
        setPosts(postsRes.posts)
        setCalendar(calRes.calendar)
      } catch (e) {
        console.warn("[store] 后端加载失败，回退本地 mock：", (e as Error).message)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const goToAgent = useCallback(() => {
    setView("agent")
    setAgentTab("Home")
  }, [])

  const createWorkspace = useCallback(
    (input: WorkspaceInput) => {
      const ws = {
        ...initialWorkspace,
        id: nextId("ws"),
        name: input.name,
        brandName: input.brandName,
        description: input.description,
        targetMarket: input.targetMarket,
        platforms: input.platforms,
        primaryGoal: input.primaryGoal,
        websiteUrl: input.websiteUrl,
        tone: input.tone,
      }
      setWorkspace(ws)
      const firstProject: Project = {
        id: nextId("proj"),
        brandName: input.brandName,
        description: input.description,
        targetMarket: input.targetMarket,
        platforms: input.platforms,
        primaryGoal: input.primaryGoal,
        websiteUrl: input.websiteUrl,
        tone: input.tone,
      }
      setProjects([firstProject])
      setActiveProjectId(firstProject.id)
      setProfile((p) => ({
        ...p,
        brandName: input.brandName,
        description: input.description,
        targetMarket: input.targetMarket,
        platforms: input.platforms,
        contentGoals: [input.primaryGoal],
        websiteUrl: input.websiteUrl || "",
        tone: input.tone || "",
      }))
      setView("agent")
      setAgentTab("Home")
      pushToast(translate("Workspace created", "已创建工作区"), "success")
    },
    [pushToast],
  )

  const applyProjectToState = useCallback((proj: Project) => {
    setWorkspace((w) =>
      w
        ? {
            ...w,
            brandName: proj.brandName,
            description: proj.description,
            targetMarket: proj.targetMarket,
            platforms: proj.platforms,
            primaryGoal: proj.primaryGoal,
            websiteUrl: proj.websiteUrl,
            tone: proj.tone,
          }
        : w,
    )
    setProfile((p) => ({
      ...p,
      brandName: proj.brandName,
      description: proj.description,
      targetMarket: proj.targetMarket,
      platforms: proj.platforms,
      contentGoals: [proj.primaryGoal],
      websiteUrl: proj.websiteUrl || "",
      tone: proj.tone || "",
    }))
  }, [])

  const createProject = useCallback(
    (input: ProjectInput) => {
      const proj: Project = { id: nextId("proj"), ...input }
      setProjects((prev) => [...prev, proj])
      setActiveProjectId(proj.id)
      applyProjectToState(proj)
      setView("agent")
      setAgentTab("Home")
      pushToast(translate(`Project "${proj.brandName}" created`, `已创建项目"${proj.brandName}"`), "success")
    },
    [applyProjectToState, pushToast],
  )

  const switchProject = useCallback(
    (id: string) => {
      const proj = projects.find((p) => p.id === id)
      if (!proj) return
      setActiveProjectId(id)
      applyProjectToState(proj)
      pushToast(translate(`Switched to ${proj.brandName}`, `已切换到 ${proj.brandName}`), "default")
    },
    [projects, applyProjectToState, pushToast],
  )

  const updateProfile = useCallback((patch: Partial<BrandProfile>) => {
    setProfile((p) => ({ ...p, ...patch }))
  }, [])

  const profileCompletion = useCallback(() => {
    const checks = [
      profile.brandName,
      profile.websiteUrl,
      profile.productUrl,
      profile.description,
      profile.targetMarket,
      profile.targetAudience,
      profile.contentGoals.length > 0,
      profile.platforms.length > 0,
      profile.tone,
      profile.defaultCta,
      profile.hashtags,
      profile.brandColors,
      profile.visualStyle,
    ]
    const filled = checks.filter(Boolean).length
    const pct = Math.round((filled / checks.length) * 100)
    return { pct, missing: checks.length - filled }
  }, [profile])

  const generateProfileDraft = useCallback(() => {
    setCredits((c) => c - 12)
    setProfile((p) => ({
      ...p,
      productUrl: p.productUrl || "https://northstar.ai/product",
      targetAudience: p.targetAudience || "startup founders, indie makers, marketing leads",
      tone: p.tone || "clear, helpful, slightly bold",
      defaultCta: p.defaultCta || "Start your free trial",
      hashtags: p.hashtags || "#AIProductivity #StartupTools",
      visualStyle: p.visualStyle || "Clean, modern, high-contrast product shots",
      brandColors: p.brandColors || "#7C5CFC, #111111, #F5F5F5",
    }))
    pushToast(translate("Profile draft generated. Actual credits: 11", "已生成品牌档案草稿。实际 credits：11"), "success")
  }, [pushToast])

  const generatePlan = useCallback(() => {
    setCredits((c) => c - 24)
    setPlan(
      planTemplate.map((t) => ({
        ...t,
        id: nextId("plan"),
        status: "Planned" as const,
      })),
    )
    pushToast(translate("7-day plan generated. Actual credits: 22", "已生成 7 天计划。实际 credits：22"), "success")
  }, [pushToast])

  const startStudioFromPlan = useCallback((item: PlanItem) => {
    setStudio({
      sourcePlanId: item.id,
      topic: item.topic,
      platforms: item.platforms,
      copyGenerated: false,
      imageGenerated: false,
      variants: [],
    })
    setAgentTab("Content Create")
  }, [])

  const startStudioBlank = useCallback(() => {
    setStudio({
      topic: "",
      platforms: ["X", "Instagram"],
      copyGenerated: false,
      imageGenerated: false,
      variants: [],
    })
    setAgentTab("Content Create")
  }, [])

  const generateCopy = useCallback(() => {
    setCredits((c) => c - 8)
    setStudio((s) => ({
      ...s,
      copyGenerated: true,
      variants:
        s.variants.length > 0
          ? s.variants
          : s.platforms.map((p) => buildVariant(p, s.topic || "New social topic", profile)),
    }))
    pushToast(translate("Copy generated. Actual credits: 7", "已生成文案。实际 credits：7"), "success")
  }, [profile, pushToast])

  // 走后端真实图片模型（gemini image）：按当前变体的平台/格式/文案生成，落库并回填 mediaUrl 展示真图。
  const generateImage = useCallback(
    async (params: {
      platform: Platform
      format: string
      hook: string
      body: string
      mediaAsset?: string
      instruction?: string
    }) => {
      if (!activeProjectId) {
        pushToast(translate("Select a project first", "请先选择项目"), "warn")
        return
      }
      try {
        const res = await api.generateImage({ projectId: activeProjectId, ...params })
        setCredits((c) => c - res.credits)
        setStudio((s) => ({
          ...s,
          imageGenerated: true,
          variants: s.variants.map((v) => (v.platform === params.platform ? { ...v, mediaUrl: res.asset.url } : v)),
        }))
        pushToast(translate("Image generated (AI)", "已生成图片（AI）"), "success")
      } catch (e) {
        pushToast(translate("Image generation failed", "图片生成失败") + `: ${(e as Error).message}`, "warn")
      }
    },
    [activeProjectId, pushToast],
  )

  // 走后端真实 AI（gpt-5.3-chat）：品牌上下文 + 主题 + 平台 → 每平台定制变体。
  const generateVariants = useCallback(async () => {
    if (!activeProjectId) {
      pushToast(translate("Select a project first", "请先选择项目"), "warn")
      return
    }
    try {
      const res = await api.generateVariants({
        projectId: activeProjectId,
        topic: studio.topic || "New social topic",
        platforms: studio.platforms,
      })
      setStudio((s) => ({ ...s, copyGenerated: true, variants: res.variants }))
      setCredits((c) => c - res.credits)
      pushToast(translate(`Variants generated (AI) · credits: ${res.credits}`, `已生成内容变体（AI）· credits：${res.credits}`), "success")
    } catch (e) {
      pushToast(translate(`Generation failed: ${(e as Error).message}`, `生成失败：${(e as Error).message}`), "warn")
      throw e
    }
  }, [activeProjectId, studio.topic, studio.platforms, pushToast])

  const startManualVariants = useCallback(() => {
    setStudio((s) => ({
      ...s,
      copyGenerated: false,
      variants: s.platforms.map((p) => {
        const existing = s.variants.find((v) => v.platform === p)
        if (existing) return existing
        const base = buildVariant(p, s.topic || "New social topic", profile)
        return { ...base, hook: "", body: "", hashtags: "", state: "Needs edits" as const }
      }),
    }))
  }, [profile])

  const updateVariant = useCallback((platform: Platform, patch: Partial<PostVariant>) => {
    setStudio((s) => ({
      ...s,
      variants: s.variants.map((v) => (v.platform === platform ? { ...v, ...patch } : v)),
    }))
  }, [])

  const setStudioPlatforms = useCallback((p: Platform[]) => {
    setStudio((s) => ({
      ...s,
      platforms: p,
      variants: s.variants.filter((v) => p.includes(v.platform)),
    }))
  }, [])

  const setStudioTopic = useCallback((t: string) => setStudio((s) => ({ ...s, topic: t })), [])

  // 存到库走后端持久化（落 ssa_post + variants），返回后端真实 post。
  const saveStudioToLibrary = useCallback(async (): Promise<SocialPost | null> => {
    if (!studio.topic && studio.variants.length === 0) return null
    if (!activeProjectId) {
      pushToast(translate("Select a project first", "请先选择项目"), "warn")
      return null
    }
    const variants =
      studio.variants.length > 0 ? studio.variants : studio.platforms.map((p) => buildVariant(p, studio.topic, profile))
    try {
      const { post } = await api.savePost({
        projectId: activeProjectId,
        title: studio.topic || "Untitled topic",
        platforms: studio.platforms,
        assetType: studio.imageGenerated ? "Copy + image" : "Copy",
        status: "Ready",
        hasImage: studio.imageGenerated,
        variants,
      })
      setPosts((prev) => [post, ...prev])
      pushToast(translate("Saved to Content Library", "已保存到内容库"), "success")
      return post
    } catch (e) {
      pushToast(translate(`Save failed: ${(e as Error).message}`, `保存失败：${(e as Error).message}`), "warn")
      return null
    }
  }, [activeProjectId, studio.topic, studio.platforms, studio.variants, studio.imageGenerated, profile, pushToast])

  const addStudioToCalendar = useCallback(
    (date = "Wed Jul 8", time = "09:00") => {
      setStudio((s) => {
        if (s.variants.length === 0 && !s.topic) return s
        const variants = s.variants.length > 0 ? s.variants : s.platforms.map((p) => buildVariant(p, s.topic, profile))
        const item: CalendarItem = {
          id: nextId("cal"),
          postId: nextId("post"),
          topic: s.topic || "Untitled topic",
          date,
          time,
          status: "Planned",
          variants: variants.map((v) => ({
            platform: v.platform,
            account: v.account,
            time: v.suggestedTime,
            publishMode: v.publishMode,
            status: "Planned" as PostStatus,
          })),
        }
        setCalendar((prev) => [...prev, item])
        return s
      })
      pushToast(translate("Added to calendar", "已加入日历"), "success")
    },
    [profile, pushToast],
  )

  const addPlanItemToCalendar = useCallback(
    (item: PlanItem) => {
      const calItem: CalendarItem = {
        id: nextId("cal"),
        postId: nextId("post"),
        topic: item.topic,
        date: item.date,
        time: item.time,
        status: "Planned",
        variants: item.platforms.map((p) => ({
          platform: p,
          account: VARIANT_DEFAULTS[p].account,
          time: item.time,
          publishMode: platformPublishMode(p),
          status: "Planned" as PostStatus,
        })),
      }
      setCalendar((prev) => [...prev, calItem])
      setPlan((prev) => prev.map((pi) => (pi.id === item.id ? { ...pi, status: "Scheduled" } : pi)))
      pushToast(translate("Added to calendar", "已加入日历"), "success")
    },
    [pushToast],
  )

  const rescheduleCalendarItem = useCallback(
    (id: string, date: string, time: string) => {
      setCalendar((prev) =>
        prev.map((c) =>
          c.id === id ? { ...c, date, time, variants: c.variants.map((v) => ({ ...v, time })) } : c,
        ),
      )
      pushToast(translate("Job rescheduled", "任务已重新排期"), "success")
    },
    [pushToast],
  )

  const cancelCalendarItem = useCallback(
    (id: string) => {
      setCalendar((prev) =>
        prev.map((c) =>
          c.id === id
            ? { ...c, status: "Cancelled", variants: c.variants.map((v) => ({ ...v, status: "Cancelled" as PostStatus })) }
            : c,
        ),
      )
      pushToast(translate("Job cancelled", "任务已取消"), "default")
    },
    [pushToast],
  )

  const publishCalendarItemNow = useCallback(
    (id: string) => {
      setCalendar((prev) =>
        prev.map((c) =>
          c.id === id
            ? {
                ...c,
                status: c.variants.some((v) => v.publishMode === "manual") ? "ManualFallback" : "Published",
                variants: c.variants.map((v) =>
                  v.publishMode === "auto" ? { ...v, status: "Published" as PostStatus } : v,
                ),
              }
            : c,
        ),
      )
      pushToast(translate("Auto platforms published now", "自动平台已立即发布"), "success")
    },
    [pushToast],
  )

  const convertCalendarItemToManual = useCallback(
    (id: string) => {
      setCalendar((prev) =>
        prev.map((c) =>
          c.id === id
            ? {
                ...c,
                status: "ManualFallback",
                variants: c.variants.map((v) => ({
                  ...v,
                  publishMode: "manual" as const,
                  status: "ManualFallback" as PostStatus,
                  reason: "Converted to manual publishing",
                })),
              }
            : c,
        ),
      )
      pushToast(translate("Converted to manual fallback", "已转为手动发布"), "default")
    },
    [pushToast],
  )

  const schedulePost = useCallback(
    (post: SocialPost) => {
      setPosts((prev) =>
        prev.map((p) => {
          if (p.id !== post.id) return p
          const allManual = p.variants.every((v) => v.publishMode === "manual")
          return { ...p, status: allManual ? "ManualFallback" : "Scheduled", updatedAt: "Just now" }
        }),
      )
      const calItem: CalendarItem = {
        id: nextId("cal"),
        postId: post.id,
        topic: post.title,
        date: "Wed Jul 8",
        time: post.variants[0]?.suggestedTime || "09:00",
        status: post.variants.every((v) => v.publishMode === "manual") ? "ManualFallback" : "Scheduled",
        variants: post.variants.map((v) => ({
          platform: v.platform,
          account: v.account,
          time: v.suggestedTime,
          publishMode: v.publishMode,
          status: v.publishMode === "auto" ? "Scheduled" : "ManualFallback",
          reason: v.publishMode === "manual" ? "Auto publishing not supported in P0" : undefined,
        })),
      }
      setCalendar((prev) => [...prev.filter((c) => c.postId !== post.id), calItem])
      pushToast(translate("Publish jobs confirmed", "发布任务已确认"), "success")
    },
    [pushToast],
  )

  const markManuallyPublished = useCallback((postId: string) => {
    setPosts((prev) =>
      prev.map((p) => (p.id === postId ? { ...p, status: "ManuallyPublished", updatedAt: "Just now" } : p)),
    )
    setCalendar((prev) =>
      prev.map((c) =>
        c.postId === postId
          ? {
              ...c,
              status: "ManuallyPublished",
              variants: c.variants.map((v) =>
                v.status === "ManualFallback" ? { ...v, status: "ManuallyPublished" } : v,
              ),
            }
          : c,
      ),
    )
    pushToast(translate("Marked as manually published", "已标记为手动发布"), "success")
  }, [])

  const retryFailed = useCallback((postId: string) => {
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, status: "Scheduled", failureReason: undefined, updatedAt: "Just now" } : p)))
    setCalendar((prev) =>
      prev.map((c) =>
        c.postId === postId
          ? {
              ...c,
              status: "Scheduled",
              variants: c.variants.map((v) => (v.status === "Failed" ? { ...v, status: "Scheduled", reason: undefined } : v)),
            }
          : c,
      ),
    )
    pushToast(translate("Retry scheduled", "已安排重试"), "success")
  }, [])

  const archivePost = useCallback((postId: string) => {
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, status: "Archived" } : p)))
    pushToast(translate("Archived", "已归档"), "default")
  }, [])

  const addManualAccount = useCallback(
    (a: Omit<Account, "id" | "status" | "type">) => {
      setAccounts((prev) => [
        ...prev,
        { ...a, id: nextId("acc"), type: "manual", status: "UnsupportedPublishing" },
      ])
      pushToast(translate("Manual account added", "已添加手动账号"), "success")
    },
    [pushToast],
  )

  const connectAccount = useCallback(
    (platform: Platform) => {
      setAccounts((prev) =>
        prev.map((a) =>
          a.platform === platform && a.status === "NotConnected"
            ? { ...a, status: "Connected" as AccountStatus, type: "connected", capabilities: "Auto publishing available", expiresAt: "2026-12-31" }
            : a,
        ),
      )
      pushToast(translate(`${platform} connected`, `已连接 ${platform}`), "success")
    },
    [pushToast],
  )

  const disconnectAccount = useCallback(
    (id: string) => {
      setAccounts((prev) =>
        prev.map((a) =>
          a.id === id
            ? { ...a, status: "NotConnected" as AccountStatus, capabilities: "Not connected", expiresAt: undefined }
            : a,
        ),
      )
      pushToast(translate("Account disconnected", "已断开账号"), "default")
    },
    [pushToast],
  )

  const refreshAccount = useCallback(
    (id: string) => {
      setAccounts((prev) => prev.map((a) => (a.id === id ? { ...a } : a)))
      pushToast(translate("Status refreshed", "已刷新状态"), "default")
    },
    [pushToast],
  )

  const generateSuggestions = useCallback(() => {
    setCredits((c) => c - 18)
    setSuggestions(opsRecommendations)
    setSuggestionsGenerated(true)
    pushToast(translate("Recommendations generated. Actual credits: 16", "已生成运营建议。实际 credits：16"), "success")
  }, [pushToast])

  const value = useMemo<Store>(
    () => ({
      view,
      setView,
      goToAgent,
      agentTab,
      setAgentTab,
      agentSecondary,
      setAgentSecondary,
      createIntent,
      setCreateIntent,
      hasWorkspace: workspace !== null,
      workspace,
      createWorkspace,
      projects,
      activeProjectId,
      switchProject,
      createProject,
      credits,
      profile,
      updateProfile,
      profileCompletion,
      generateProfileDraft,
      plan,
      generatePlan,
      addPlanItemToCalendar,
      studio,
      startStudioFromPlan,
      startStudioBlank,
      generateCopy,
      generateImage,
      generateVariants,
      startManualVariants,
      updateVariant,
      setStudioPlatforms,
      setStudioTopic,
      posts,
      saveStudioToLibrary,
      markManuallyPublished,
      retryFailed,
      archivePost,
      calendar,
      addStudioToCalendar,
      schedulePost,
      rescheduleCalendarItem,
      cancelCalendarItem,
      publishCalendarItemNow,
      convertCalendarItemToManual,
      accounts,
      addManualAccount,
      connectAccount,
      disconnectAccount,
      refreshAccount,
      suggestions,
      suggestionsGenerated,
      generateSuggestions,
      toasts,
      pushToast,
      dismissToast,
    }),
    [
      view,
      goToAgent,
      agentTab,
      agentSecondary,
      createIntent,
      workspace,
      createWorkspace,
      projects,
      activeProjectId,
      switchProject,
      createProject,
      credits,
      profile,
      updateProfile,
      profileCompletion,
      generateProfileDraft,
      plan,
      generatePlan,
      addPlanItemToCalendar,
      studio,
      startStudioFromPlan,
      startStudioBlank,
      generateCopy,
      generateImage,
      generateVariants,
      startManualVariants,
      updateVariant,
      setStudioPlatforms,
      setStudioTopic,
      posts,
      saveStudioToLibrary,
      markManuallyPublished,
      retryFailed,
      archivePost,
      calendar,
      addStudioToCalendar,
      schedulePost,
      rescheduleCalendarItem,
      cancelCalendarItem,
      publishCalendarItemNow,
      convertCalendarItemToManual,
      accounts,
      addManualAccount,
      connectAccount,
      disconnectAccount,
      refreshAccount,
      suggestions,
      suggestionsGenerated,
      generateSuggestions,
      toasts,
      pushToast,
      dismissToast,
    ],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useSocial() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("useSocial must be used within SocialProvider")
  return ctx
}
