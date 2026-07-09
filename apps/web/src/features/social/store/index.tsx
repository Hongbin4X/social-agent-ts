"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
  saveProfile: () => Promise<void>
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
    // 按槽出图：命中正文 [[img:ref]] 的某一槽时传 ref + 该槽描述；不传则回退旧的整贴 mediaUrl 逻辑。
    slotRef?: number
    description?: string
  }) => Promise<void>
  generateVariants: (modes?: Array<"copy" | "image" | "video">) => Promise<void>
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
    async (input: WorkspaceInput) => {
      try {
        const { workspace: ws, project } = await api.createWorkspace({
          name: input.name,
          brandName: input.brandName,
          description: input.description,
          targetMarket: input.targetMarket,
          platforms: input.platforms,
          primaryGoal: input.primaryGoal,
          websiteUrl: input.websiteUrl,
          tone: input.tone,
        })
        setWorkspace({
          ...initialWorkspace,
          id: ws.id,
          name: ws.name,
          timezone: ws.timezone,
          brandName: input.brandName,
          description: input.description,
          targetMarket: input.targetMarket,
          platforms: input.platforms,
          primaryGoal: input.primaryGoal,
          websiteUrl: input.websiteUrl,
          tone: input.tone,
        })
        const firstProject: Project = {
          id: project.id,
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
        setPosts([])
        setCalendar([])
        setView("agent")
        setAgentTab("Home")
        pushToast(translate("Workspace created", "已创建工作区"), "success")
      } catch (e) {
        pushToast(translate(`Create workspace failed: ${(e as Error).message}`, `创建工作区失败：${(e as Error).message}`), "warn")
      }
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

  // 竞态守卫：连续/并发切项目时只应用「最后一次」发起的加载结果（旧请求返回则丢弃）。
  const loadSeqRef = useRef(0)
  // 加载某品牌档案的项目级资源（完整档案 + 帖子 + 日历）——切项目与初次进入都用它，保证资源随 projectId 切换。
  const loadProjectResources = useCallback(async (projectId: string) => {
    const seq = ++loadSeqRef.current
    try {
      const [bpRes, postsRes, calRes] = await Promise.all([
        api.getBrandProfile(projectId),
        api.getPosts(projectId),
        api.getCalendar(projectId),
      ])
      if (seq !== loadSeqRef.current) return // 已有更新的加载发起，丢弃本次结果
      if (bpRes.brandProfile) setProfile(bpRes.brandProfile)
      setPosts(postsRes.posts)
      setCalendar(calRes.calendar)
    } catch (e) {
      console.warn("[store] 加载项目资源失败：", (e as Error).message)
    }
  }, [])

  const createProject = useCallback(
    async (input: ProjectInput) => {
      try {
        const { project } = await api.createProject({
          brandName: input.brandName,
          description: input.description,
          targetMarket: input.targetMarket,
          platforms: input.platforms,
          primaryGoal: input.primaryGoal,
          websiteUrl: input.websiteUrl,
          tone: input.tone,
        })
        const proj: Project = {
          id: project.id,
          brandName: project.brandName,
          description: project.description,
          targetMarket: project.targetMarket,
          platforms: project.platforms,
          primaryGoal: project.primaryGoal as ContentGoal,
          websiteUrl: project.websiteUrl,
          tone: project.tone,
        }
        setProjects((prev) => [...prev, proj])
        setActiveProjectId(proj.id)
        applyProjectToState(proj)
        setPosts([]) // 新品牌暂无帖子/日历
        setCalendar([])
        await api.setActiveProject(proj.id)
        setView("agent")
        setAgentTab("Home")
        pushToast(translate(`Project "${proj.brandName}" created`, `已创建项目"${proj.brandName}"`), "success")
      } catch (e) {
        pushToast(translate(`Create project failed: ${(e as Error).message}`, `创建项目失败：${(e as Error).message}`), "warn")
      }
    },
    [applyProjectToState, pushToast],
  )

  const switchProject = useCallback(
    async (id: string) => {
      const proj = projects.find((p) => p.id === id)
      if (!proj) return
      setActiveProjectId(id) // 本地即时切换核心字段，UI 无延迟
      applyProjectToState(proj)
      pushToast(translate(`Switched to ${proj.brandName}`, `已切换到 ${proj.brandName}`), "default")
      try {
        await api.setActiveProject(id) // 落库 active project（刷新后仍选中它）
      } catch (e) {
        console.warn("[store] 设置 active project 失败：", (e as Error).message)
      }
      // 资源隔离的核心：拉该品牌自己的帖子 / 日历 / 完整档案，替换当前视图数据。
      await loadProjectResources(id)
    },
    [projects, applyProjectToState, pushToast, loadProjectResources],
  )

  const updateProfile = useCallback((patch: Partial<BrandProfile>) => {
    setProfile((p) => ({ ...p, ...patch }))
  }, [])

  // 显式保存品牌档案到后端（Brand Profile 面板「保存」按钮触发）；updateProfile 仅改本地即时态。
  const saveProfile = useCallback(async () => {
    if (!activeProjectId) {
      pushToast(translate("Select a project first", "请先选择项目"), "warn")
      return
    }
    try {
      const { brandProfile } = await api.updateBrandProfile(activeProjectId, profile)
      if (brandProfile) setProfile(brandProfile)
      // 档案里的核心字段（名称/描述/市场/平台）同步到切换器与顶部 workspace 展示。
      setProjects((prev) =>
        prev.map((p) =>
          p.id === activeProjectId
            ? { ...p, brandName: profile.brandName, description: profile.description, targetMarket: profile.targetMarket, platforms: profile.platforms }
            : p,
        ),
      )
      setWorkspace((w) =>
        w ? { ...w, brandName: profile.brandName, description: profile.description, targetMarket: profile.targetMarket, platforms: profile.platforms } : w,
      )
      pushToast(translate("Brand profile saved", "品牌资料已保存"), "success")
    } catch (e) {
      pushToast(translate(`Save failed: ${(e as Error).message}`, `保存失败：${(e as Error).message}`), "warn")
    }
  }, [activeProjectId, profile, pushToast])

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

  // 走后端真实 AI（gpt-5.3-chat）：按网站 URL 草拟缺失的品牌档案字段。回填到本地，用户点「保存」再落库。
  const generateProfileDraft = useCallback(async () => {
    if (!activeProjectId) {
      pushToast(translate("Select a project first", "请先选择项目"), "warn")
      return
    }
    try {
      const { patch, credits } = await api.generateProfileDraft(activeProjectId, profile.websiteUrl || "")
      setProfile((p) => ({ ...p, ...patch }))
      setCredits((c) => c - credits)
      pushToast(translate(`Profile draft generated. Actual credits: ${credits}`, `已生成品牌档案草稿。实际 credits：${credits}`), "success")
    } catch (e) {
      pushToast(translate(`Draft failed: ${(e as Error).message}`, `生成草稿失败：${(e as Error).message}`), "warn")
    }
  }, [activeProjectId, profile.websiteUrl, pushToast])

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

  // 走后端真实图片模型（gemini image）：按当前变体的平台/格式/文案生成，落库并回填展示真图。
  // 有 slotRef 时是"按槽出图"（正文 [[img:ref]] 内联配图场景）：只更新该变体 imageSlots 里对应 ref 的槽状态，
  // 不影响同变体的其它槽、也不碰旧的整贴 mediaUrl；没有 slotRef 时保持旧行为（整贴 mediaUrl）。
  const generateImage = useCallback(
    async (params: {
      platform: Platform
      format: string
      hook: string
      body: string
      mediaAsset?: string
      instruction?: string
      slotRef?: number
      description?: string
    }) => {
      if (!activeProjectId) {
        pushToast(translate("Select a project first", "请先选择项目"), "warn")
        return
      }
      // 出图前把目标槽标记 generating（铁律2.5：AI 等待必须有即时反馈，不能让用户对着空槽干等）。
      if (params.slotRef != null) {
        setStudio((s) => ({
          ...s,
          variants: s.variants.map((v) =>
            v.platform === params.platform
              ? { ...v, imageSlots: (v.imageSlots ?? []).map((sl) => (sl.ref === params.slotRef ? { ...sl, status: "generating" } : sl)) }
              : v,
          ),
        }))
      }
      try {
        const res = await api.generateImage({
          projectId: activeProjectId,
          platform: params.platform,
          format: params.format,
          hook: params.hook,
          body: params.body,
          mediaAsset: params.mediaAsset,
          instruction: params.instruction,
          description: params.description,
        })
        setCredits((c) => c - res.credits)
        setStudio((s) => ({
          ...s,
          imageGenerated: true,
          variants: s.variants.map((v) => {
            if (v.platform !== params.platform) return v
            if (params.slotRef == null) return { ...v, mediaUrl: res.asset.url }
            return {
              ...v,
              imageSlots: (v.imageSlots ?? []).map((sl) =>
                sl.ref === params.slotRef ? { ...sl, url: res.asset.url, mimeType: res.asset.mimeType, status: "ready" } : sl,
              ),
            }
          }),
        }))
        pushToast(translate("Image generated (AI)", "已生成图片（AI）"), "success")
      } catch (e) {
        // 出图失败：只标记目标槽 failed + 原因，不阻塞其它槽；退款由后端三段式负责，前端只反映状态。
        if (params.slotRef != null) {
          setStudio((s) => ({
            ...s,
            variants: s.variants.map((v) =>
              v.platform === params.platform
                ? {
                    ...v,
                    imageSlots: (v.imageSlots ?? []).map((sl) =>
                      sl.ref === params.slotRef ? { ...sl, status: "failed", failureReason: (e as Error).message } : sl,
                    ),
                  }
                : v,
            ),
          }))
        }
        pushToast(translate("Image generation failed", "图片生成失败") + `: ${(e as Error).message}`, "warn")
      }
    },
    [activeProjectId, pushToast],
  )

  // 走后端真实 AI（gpt-5.3-chat）：品牌上下文 + 主题 + 平台 → 每平台定制变体。
  // modes 透传给后端：P0 只有 copy/image（video 目前只做封面/caption），决定要不要顺带生成配图槽/占位。
  const generateVariants = useCallback(async (modes?: Array<"copy" | "image" | "video">) => {
    if (!activeProjectId) {
      pushToast(translate("Select a project first", "请先选择项目"), "warn")
      return
    }
    try {
      const res = await api.generateVariants({
        projectId: activeProjectId,
        topic: studio.topic || "New social topic",
        platforms: studio.platforms,
        modes,
      })
      // imageGenerated 重置为 false：新一轮生成会带来新的 imageSlots（多为 empty），旧的"已出图"标记不该延续。
      setStudio((s) => ({ ...s, copyGenerated: true, imageGenerated: false, variants: res.variants }))
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
    // hasImage/assetType 不能只看 studio.imageGenerated（那是整贴出图时代的旧字段）：
    // 按槽出图场景下即使 imageGenerated 没置位，只要任一变体里有槽已经 ready，也算"有图"。
    const hasReadyImage =
      studio.imageGenerated || variants.some((v) => (v.imageSlots ?? []).some((sl) => sl.status === "ready"))
    // FIX 3（不持久化 "generating" 状态）：如果用户在某个槽出图中途点了保存，直接把 variants 原样存库，
    // "generating" 会被落进 DB；下次加载这条帖子时既没有真实请求在跑，也不会再收到出图完成回调，
    // 那颗槽就会变成永久转圈的假死状态。这里只在存库前把它兜底改回 "empty"（未生成过），
    // "ready"/"failed"/"empty" 保持不变；不影响上面已经算好的 hasReadyImage（只看 "ready"）。
    // 只在原本就有 imageSlots 的变体上做转换，没有 slots 的变体保持原样（不无中生有塞一个空数组进去）。
    const variantsToSave = variants.map((v) =>
      v.imageSlots
        ? { ...v, imageSlots: v.imageSlots.map((sl) => (sl.status === "generating" ? { ...sl, status: "empty" as const } : sl)) }
        : v,
    )
    try {
      const { post } = await api.savePost({
        projectId: activeProjectId,
        title: studio.topic || "Untitled topic",
        platforms: studio.platforms,
        assetType: hasReadyImage ? "Copy + image" : "Copy",
        status: "Ready",
        hasImage: hasReadyImage,
        variants: variantsToSave,
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
    async (date = "Wed Jul 8", time = "09:00") => {
      if (studio.variants.length === 0 && !studio.topic) return
      if (!activeProjectId) {
        pushToast(translate("Select a project first", "请先选择项目"), "warn")
        return
      }
      const variants =
        studio.variants.length > 0 ? studio.variants : studio.platforms.map((p) => buildVariant(p, studio.topic, profile))
      const jobs = variants.map((v) => ({
        platform: v.platform,
        account: v.account,
        time: v.suggestedTime,
        publishMode: v.publishMode,
        status: "Planned" as PostStatus,
      }))
      try {
        const { item } = await api.createCalendarItem({
          projectId: activeProjectId,
          topic: studio.topic || "Untitled topic",
          date,
          time,
          status: "Planned",
          variants: jobs,
        })
        setCalendar((prev) => [...prev, item])
        pushToast(translate("Added to calendar", "已加入日历"), "success")
      } catch (e) {
        pushToast(translate(`Add to calendar failed: ${(e as Error).message}`, `加入日历失败：${(e as Error).message}`), "warn")
      }
    },
    [studio.variants, studio.topic, studio.platforms, activeProjectId, profile, pushToast],
  )

  const addPlanItemToCalendar = useCallback(
    async (item: PlanItem) => {
      if (!activeProjectId) {
        pushToast(translate("Select a project first", "请先选择项目"), "warn")
        return
      }
      const jobs = item.platforms.map((p) => ({
        platform: p,
        account: VARIANT_DEFAULTS[p].account,
        time: item.time,
        publishMode: platformPublishMode(p),
        status: "Planned" as PostStatus,
      }))
      try {
        const { item: calItem } = await api.createCalendarItem({
          projectId: activeProjectId,
          topic: item.topic,
          date: item.date,
          time: item.time,
          status: "Planned",
          variants: jobs,
        })
        setCalendar((prev) => [...prev, calItem])
        setPlan((prev) => prev.map((pi) => (pi.id === item.id ? { ...pi, status: "Scheduled" } : pi)))
        pushToast(translate("Added to calendar", "已加入日历"), "success")
      } catch (e) {
        pushToast(translate(`Add to calendar failed: ${(e as Error).message}`, `加入日历失败：${(e as Error).message}`), "warn")
      }
    },
    [activeProjectId, pushToast],
  )

  const rescheduleCalendarItem = useCallback(
    async (id: string, date: string, time: string) => {
      setCalendar((prev) =>
        prev.map((c) =>
          c.id === id ? { ...c, date, time, variants: c.variants.map((v) => ({ ...v, time })) } : c,
        ),
      )
      try {
        await api.updateCalendarItem(id, { date, time })
      } catch (e) {
        console.warn("[store] 改期落库失败：", (e as Error).message)
      }
      pushToast(translate("Job rescheduled", "任务已重新排期"), "success")
    },
    [pushToast],
  )

  const cancelCalendarItem = useCallback(
    async (id: string) => {
      const item = calendar.find((c) => c.id === id)
      const jobs = (item?.variants ?? []).map((v) => ({ ...v, status: "Cancelled" as PostStatus }))
      setCalendar((prev) => prev.map((c) => (c.id === id ? { ...c, status: "Cancelled", variants: jobs } : c)))
      try {
        if (activeProjectId) await api.updateCalendarJobs(id, { projectId: activeProjectId, itemStatus: "Cancelled", jobs })
        else await api.updateCalendarItem(id, { status: "Cancelled" })
      } catch (e) {
        console.warn("[store] 取消落库失败：", (e as Error).message)
      }
      pushToast(translate("Job cancelled", "任务已取消"), "default")
    },
    [calendar, activeProjectId, pushToast],
  )

  // 注：这里把日历任务标记为 Published 是「状态记录落库」，不代表已真发到平台。真实自动发布走 /api/publish（发布层，
  // 需平台 OAuth token，属外部联调 seam）。联调后把这里改成调发布层、按其结果回写状态即可。
  const publishCalendarItemNow = useCallback(
    async (id: string) => {
      const item = calendar.find((c) => c.id === id)
      const hasManual = (item?.variants ?? []).some((v) => v.publishMode === "manual")
      const itemStatus: PostStatus = hasManual ? "ManualFallback" : "Published"
      const jobs = (item?.variants ?? []).map((v) =>
        v.publishMode === "auto" ? { ...v, status: "Published" as PostStatus } : v,
      )
      setCalendar((prev) => prev.map((c) => (c.id === id ? { ...c, status: itemStatus, variants: jobs } : c)))
      try {
        if (activeProjectId) await api.updateCalendarJobs(id, { projectId: activeProjectId, itemStatus, jobs })
      } catch (e) {
        console.warn("[store] 立即发布落库失败：", (e as Error).message)
      }
      pushToast(translate("Auto platforms published now", "自动平台已立即发布"), "success")
    },
    [calendar, activeProjectId, pushToast],
  )

  const convertCalendarItemToManual = useCallback(
    async (id: string) => {
      const item = calendar.find((c) => c.id === id)
      const jobs = (item?.variants ?? []).map((v) => ({
        ...v,
        publishMode: "manual" as const,
        status: "ManualFallback" as PostStatus,
        reason: "Converted to manual publishing",
      }))
      setCalendar((prev) => prev.map((c) => (c.id === id ? { ...c, status: "ManualFallback", variants: jobs } : c)))
      try {
        if (activeProjectId) await api.updateCalendarJobs(id, { projectId: activeProjectId, itemStatus: "ManualFallback", jobs })
      } catch (e) {
        console.warn("[store] 转手动落库失败：", (e as Error).message)
      }
      pushToast(translate("Converted to manual fallback", "已转为手动发布"), "default")
    },
    [calendar, activeProjectId, pushToast],
  )

  const schedulePost = useCallback(
    async (post: SocialPost) => {
      if (!activeProjectId) {
        pushToast(translate("Select a project first", "请先选择项目"), "warn")
        return
      }
      const allManual = post.variants.every((v) => v.publishMode === "manual")
      const postStatus: PostStatus = allManual ? "ManualFallback" : "Scheduled"
      const jobs = post.variants.map((v) => ({
        platform: v.platform,
        account: v.account,
        time: v.suggestedTime,
        publishMode: v.publishMode,
        status: (v.publishMode === "auto" ? "Scheduled" : "ManualFallback") as PostStatus,
        reason: v.publishMode === "manual" ? "Auto publishing not supported in P0" : undefined,
      }))
      try {
        await api.updatePost(post.id, { status: postStatus })
        const { item } = await api.createCalendarItem({
          projectId: activeProjectId,
          postId: post.id,
          topic: post.title,
          date: "Wed Jul 8",
          time: post.variants[0]?.suggestedTime || "09:00",
          status: postStatus,
          variants: jobs,
        })
        setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, status: postStatus, updatedAt: "Just now" } : p)))
        setCalendar((prev) => [...prev.filter((c) => c.postId !== post.id), item])
        pushToast(translate("Publish jobs confirmed", "发布任务已确认"), "success")
      } catch (e) {
        pushToast(translate(`Schedule failed: ${(e as Error).message}`, `排期失败：${(e as Error).message}`), "warn")
      }
    },
    [activeProjectId, pushToast],
  )

  const markManuallyPublished = useCallback(
    async (postId: string) => {
      try {
        await api.updatePost(postId, { status: "ManuallyPublished" })
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
      } catch (e) {
        pushToast(translate(`Update failed: ${(e as Error).message}`, `更新失败：${(e as Error).message}`), "warn")
      }
    },
    [pushToast],
  )

  const retryFailed = useCallback(
    async (postId: string) => {
      try {
        await api.updatePost(postId, { status: "Scheduled", failureReason: null })
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
      } catch (e) {
        pushToast(translate(`Retry failed: ${(e as Error).message}`, `重试失败：${(e as Error).message}`), "warn")
      }
    },
    [pushToast],
  )

  const archivePost = useCallback(
    async (postId: string) => {
      try {
        await api.updatePost(postId, { status: "Archived" })
        setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, status: "Archived" } : p)))
        pushToast(translate("Archived", "已归档"), "default")
      } catch (e) {
        pushToast(translate(`Archive failed: ${(e as Error).message}`, `归档失败：${(e as Error).message}`), "warn")
      }
    },
    [pushToast],
  )

  const addManualAccount = useCallback(
    async (a: Omit<Account, "id" | "status" | "type">) => {
      try {
        const { account } = await api.addAccount({ platform: a.platform, name: a.name, url: a.url })
        setAccounts((prev) => [...prev, account])
        pushToast(translate("Manual account added", "已添加手动账号"), "success")
      } catch (e) {
        pushToast(translate(`Add account failed: ${(e as Error).message}`, `添加账号失败：${(e as Error).message}`), "warn")
      }
    },
    [pushToast],
  )

  // 注：真实自动发布要平台 OAuth（发布层 TokenStore，属外部联调 seam）。connect/disconnect 这里落库的是账号「连接状态记录」，
  // 不代表已拿到真实 token；联调平台 OAuth 后把 connect 改成触发授权流程即可，其余不动。
  const connectAccount = useCallback(
    async (platform: Platform) => {
      const target = accounts.find((a) => a.platform === platform && a.status === "NotConnected")
      if (!target) return
      const patch = { status: "Connected", type: "connected", capabilities: "Auto publishing available", expiresAt: "2026-12-31" } as const
      setAccounts((prev) => prev.map((a) => (a.id === target.id ? { ...a, ...patch } : a)))
      try {
        await api.updateAccount(target.id, patch)
      } catch (e) {
        console.warn("[store] 账号状态落库失败：", (e as Error).message)
      }
      pushToast(translate(`${platform} connected`, `已连接 ${platform}`), "success")
    },
    [accounts, pushToast],
  )

  const disconnectAccount = useCallback(
    async (id: string) => {
      const patch = { status: "NotConnected", capabilities: "Not connected" } as const
      setAccounts((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch, expiresAt: undefined } : a)))
      try {
        await api.updateAccount(id, patch)
      } catch (e) {
        console.warn("[store] 账号状态落库失败：", (e as Error).message)
      }
      pushToast(translate("Account disconnected", "已断开账号"), "default")
    },
    [pushToast],
  )

  const refreshAccount = useCallback(
    async (id: string) => {
      void id
      try {
        const { accounts: fresh } = await api.getAccounts()
        setAccounts(fresh)
      } catch (e) {
        console.warn("[store] 刷新账号失败：", (e as Error).message)
      }
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
      saveProfile,
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
      saveProfile,
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
