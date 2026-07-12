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
  PublishItem,
  Recommendation,
  SocialPost,
  Toast,
} from "@social/shared"
// 平台自动发布能力的唯一真源在 @social/shared（后端也复用同一份）。这里 import 后再 re-export，
// 让原型里所有「从 store 引 AUTO_PLATFORMS / platformPublishMode」的调用方零改动。
import { AUTO_PLATFORMS, platformPublishMode, stripImageTokens } from "@social/shared"
export { AUTO_PLATFORMS, platformPublishMode }

export type AgentTab = "Home" | "Content Create" | "Calendar" | "Operations Data"
export type AgentSecondary = "brand" | "accounts" | null
export type CreateIntent = "post" | "plan" | null

export interface StudioDraft {
  sourcePlanId?: string
  // 二次修改时记住正在编辑的那条库内帖子 id：存回走「更新同一条」而非「新建副本」（避免制造重复入库）。
  // 空 = 全新草稿，存库走新建。
  editingPostId?: string
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
  // 从库内已存帖子把内容灌回 studio 做二次修改（存回更新同一条）。
  startStudioFromPost: (post: SocialPost) => void
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
  // 硬删除草稿（不可恢复；UI 侧已限定作用面并二次确认）。
  deletePost: (postId: string) => void

  // 真实发布一条帖子到平台（调发布层）。返回各 outcome 计数；无可发布项/出错返回 null。
  publishPostNow: (post: SocialPost) => Promise<{ published: number; failed: number; manual: number } | null>

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

  // 二次修改：把库内帖子灌回 studio。记 editingPostId 让存回走「更新同一条」。
  // copyGenerated=true（已有文案，直接进编辑窗口而非重新生成）；imageGenerated 按是否已有 ready 配图槽 / hasImage 派生。
  //
  // 已排期帖子（Scheduled/ManualFallback）的「撤回草稿再改」：点击二次修改的瞬间就把它从排期撤下——
  // 帖子回到 Ready、删掉日历项。理由（用户拍板）：编辑期间它必须不在发布队列里，否则到点会自动投递出半成品/非预期内容。
  // 先同步 setStudio 让编辑弹窗立刻带内容打开，再异步做撤回（不阻塞开窗）。
  const startStudioFromPost = useCallback(
    (post: SocialPost) => {
      const hasReadyImage =
        post.hasImage || post.variants.some((v) => (v.imageSlots ?? []).some((sl) => sl.status === "ready"))
      setStudio({
        editingPostId: post.id,
        topic: post.title,
        platforms: post.platforms,
        copyGenerated: true,
        imageGenerated: hasReadyImage,
        // 拷贝一份，避免编辑态直接改到 posts 列表里的同一引用。
        variants: post.variants.map((v) => ({ ...v, imageSlots: v.imageSlots ? v.imageSlots.map((s) => ({ ...s })) : v.imageSlots })),
      })
      setAgentTab("Content Create")

      // 已排期 → 撤回草稿（去队列）。仅对 Scheduled/ManualFallback 生效；Ready/Draft 本就没排期，跳过。
      const isScheduled = post.status === "Scheduled" || post.status === "ManualFallback"
      if (isScheduled && activeProjectId) {
        // 乐观更新本地：帖子回 Ready、日历移除该帖排期。
        setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, status: "Ready", updatedAt: "Just now" } : p)))
        setCalendar((prev) => prev.filter((c) => c.postId !== post.id))
        ;(async () => {
          try {
            await api.updatePost(post.id, { status: "Ready" })
            await api.deleteCalendarByPost(post.id, activeProjectId)
          } catch (e) {
            // 撤回失败要明确告知：此时它可能仍在发布队列里，风险实在，绝不静默。
            pushToast(
              translate(`Unschedule failed: ${(e as Error).message}`, `撤回排期失败：${(e as Error).message}`),
              "warn",
            )
          }
        })()
      }
    },
    [activeProjectId, pushToast],
  )

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
    const fields = {
      title: studio.topic || "Untitled topic",
      platforms: studio.platforms,
      assetType: hasReadyImage ? "Copy + image" : "Copy",
      status: "Ready",
      hasImage: hasReadyImage,
    }
    try {
      // 二次修改：存回更新同一条（PATCH 带 projectId + variants → 后端整替变体），替换列表里的那条，不新建副本。
      if (studio.editingPostId) {
        const { post } = await api.updatePost(studio.editingPostId, {
          projectId: activeProjectId,
          ...fields,
          variants: variantsToSave,
        })
        setPosts((prev) => prev.map((p) => (p.id === post.id ? post : p)))
        // 存回完成即退出编辑态，避免下次全新草稿误更到这条上。
        setStudio((s) => ({ ...s, editingPostId: undefined }))
        pushToast(translate("Draft updated", "草稿已更新"), "success")
        return post
      }
      const { post } = await api.savePost({ projectId: activeProjectId, ...fields, variants: variantsToSave })
      setPosts((prev) => [post, ...prev])
      pushToast(translate("Saved to Content Library", "已保存到内容库"), "success")
      return post
    } catch (e) {
      pushToast(translate(`Save failed: ${(e as Error).message}`, `保存失败：${(e as Error).message}`), "warn")
      return null
    }
  }, [activeProjectId, studio.editingPostId, studio.topic, studio.platforms, studio.variants, studio.imageGenerated, profile, pushToast])

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

  // 真实发布：把 post 里 auto 的变体组装成发布项，调 /api/publish 真发到平台，按结果回写帖子状态。
  // 手动平台/无已连接账号的变体不进 items（发布层对它们本就会返回 manual_fallback）；全部无可发时如实提示。
  const publishPostNow = useCallback(
    async (post: SocialPost): Promise<{ published: number; failed: number; manual: number } | null> => {
      if (!activeProjectId) {
        pushToast(translate("Select a project first", "请先选择项目"), "warn")
        return null
      }
      // 已发布过的帖子不再重复发：X 等平台会因「重复内容」直接 403 拒绝，重发既无意义又误导用户。
      // 要再发请先「二次修改」改文案（会回到草稿态），或复制成新帖。
      if (post.status === "Published" || post.status === "ManuallyPublished") {
        pushToast(translate("Already published — edit the copy to publish again.", "该帖已发布过，如需再发请先二次修改文案。"), "warn")
        return null
      }
      const items: PublishItem[] = []
      for (const v of post.variants) {
        if (v.publishMode !== "auto") continue
        // 为该 auto 变体找同平台的已连接账号：优先精确匹配变体选定的账号名，退回该平台任一已连接账号。
        const norm = (s: string) => s.replace(/^@/, "")
        const acct =
          accounts.find(
            (a) => a.platform === v.platform && a.status === "Connected" && norm(a.name) === norm(v.account),
          ) ?? accounts.find((a) => a.platform === v.platform && a.status === "Connected")
        if (!acct) continue // 无已连接账号 → 交给手动兜底，不进自动发布 items
        items.push({
          target: { platform: v.platform, accountId: acct.id, accountType: acct.type },
          content: {
            // X 等单文本平台由发布层 composeText 组装：正文(去内联图 token) + 话题标签 + CTA 链接。
            text: [v.hook, stripImageTokens(v.body)].map((s) => s?.trim()).filter(Boolean).join("\n\n"),
            hashtags: v.hashtags?.trim() || undefined,
            linkUrl: v.ctaUrl?.trim() || undefined,
            // X 发帖形态（普通推/串推/长文）由用户在变体上选定；缺省普通推文。发布层据此走三条不同发帖路径。
            ...(v.platform === "X" ? { x: { postType: v.xPostType ?? "tweet" } } : {}),
          },
        })
      }
      if (items.length === 0) {
        pushToast(
          translate("No connected account to auto-publish — export and post manually.", "没有可自动发布的已连接账号，请手动发布。"),
          "warn",
        )
        return null
      }
      try {
        const res = await api.publish({ projectId: activeProjectId, postId: post.id, items })
        const published = res.results.filter((r) => r.outcome === "published").length
        const failed = res.results.filter((r) => r.outcome === "failed")
        const manual = res.results.filter((r) => r.outcome === "manual_fallback").length
        // 回写帖子状态：有失败=Failed；全成功=Published；否则(仅手动兜底)=ManualFallback。
        const status: PostStatus = failed.length > 0 ? "Failed" : published > 0 ? "Published" : "ManualFallback"
        const failureReason =
          failed.length > 0 ? failed.map((f) => `${f.platform}: ${f.message}`).join("; ") : null
        await api.updatePost(post.id, { status, failureReason })
        setPosts((prev) =>
          prev.map((p) => (p.id === post.id ? { ...p, status, failureReason: failureReason ?? undefined, updatedAt: "Just now" } : p)),
        )
        if (failed.length > 0) {
          pushToast(translate(`Publish failed: ${failureReason}`, `发布失败：${failureReason}`), "warn")
        } else if (published > 0) {
          pushToast(translate(`Published to ${published} platform(s)`, `已发布到 ${published} 个平台`), "success")
        } else {
          pushToast(translate("Some platforms need manual publishing", "部分平台需手动发布"), "default")
        }
        return { published, failed: failed.length, manual }
      } catch (e) {
        pushToast(translate(`Publish failed: ${(e as Error).message}`, `发布失败：${(e as Error).message}`), "warn")
        return null
      }
    },
    [activeProjectId, accounts, pushToast],
  )

  // 日历「立即发布」：走真实发布——按 postId 找到帖子，调 publishPostNow 真发，再按结果回写日历项/子任务状态。
  const publishCalendarItemNow = useCallback(
    async (id: string) => {
      const item = calendar.find((c) => c.id === id)
      const post = item?.postId ? posts.find((p) => p.id === item.postId) : undefined
      if (!post) {
        pushToast(translate("Post not found for this schedule", "找不到该排期对应的帖子"), "warn")
        return
      }
      const outcome = await publishPostNow(post)
      if (!outcome) return // publishPostNow 已 toast 原因（无可发/失败）
      // 回写日历项：auto 子任务标 Published，失败则整项 Failed；有手动则 ManualFallback。
      const itemStatus: PostStatus = outcome.failed > 0 ? "Failed" : outcome.published > 0 ? "Published" : "ManualFallback"
      const jobs = (item?.variants ?? []).map((v) =>
        v.publishMode === "auto" ? { ...v, status: itemStatus } : v,
      )
      setCalendar((prev) => prev.map((c) => (c.id === id ? { ...c, status: itemStatus, variants: jobs } : c)))
      try {
        if (activeProjectId) await api.updateCalendarJobs(id, { projectId: activeProjectId, itemStatus, jobs })
      } catch (e) {
        console.warn("[store] 立即发布落库失败：", (e as Error).message)
      }
    },
    [calendar, posts, activeProjectId, publishPostNow, pushToast],
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

  // 硬删除草稿：调后端 DELETE（项目级隔离），成功后从本地列表移除。作用面/二次确认在 UI 层保证。
  const deletePost = useCallback(
    async (postId: string) => {
      if (!activeProjectId) {
        pushToast(translate("Select a project first", "请先选择项目"), "warn")
        return
      }
      try {
        await api.deletePost(postId, activeProjectId)
        setPosts((prev) => prev.filter((p) => p.id !== postId))
        // 后端已级联删该帖子的日历项/子任务；本地日历状态也同步移除，避免日历视图残留空排期。
        setCalendar((prev) => prev.filter((c) => c.postId !== postId))
        pushToast(translate("Deleted", "已删除"), "default")
      } catch (e) {
        pushToast(translate(`Delete failed: ${(e as Error).message}`, `删除失败：${(e as Error).message}`), "warn")
      }
    },
    [activeProjectId, pushToast],
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

  // X 走【真实 OAuth 授权重定向流】：拿授权链接 → 新开窗让用户授权 → X 重定向到后端 GET 回调自动落 token →
  //   前端靠「postMessage（同源快路径）+ 轮询 getAccounts（跨域兜底路径）」感知连接成功、刷新账号。
  // 其它平台（IG/FB）OAuth 未接通，暂沿用「只标状态」的原型行为（不假装拿到 token；接通后同样改成触发真授权）。
  const connectX = useCallback(async () => {
    let authorizeUrl: string
    // 先权威快照「当前已连接的 X 账号 id」——用来识别本次【新授权】的那个账号。
    // 关键：库里可能已有连接的 X 账号，若只看「有没有已连接 X」会秒误判成功、根本没等新授权。
    let prevConnectedIds = new Set<string>()
    try {
      const [auth, before] = await Promise.all([api.startXAuth(), api.getAccounts()])
      authorizeUrl = auth.authorizeUrl
      prevConnectedIds = new Set(
        before.accounts.filter((a) => a.platform === "X" && a.status === "Connected").map((a) => a.id),
      )
    } catch (e) {
      // 后端没配 X_CLIENT_ID 会 501；如实告知，不假装已连。
      pushToast(translate(`Cannot start X authorization: ${(e as Error).message}`, `无法发起 X 授权：${(e as Error).message}`), "warn")
      return
    }
    const popup = window.open(authorizeUrl, "x-oauth", "width=600,height=760,noopener=no")
    if (!popup) {
      pushToast(translate("Popup blocked — allow popups and retry.", "弹窗被拦截,请允许弹窗后重试。"), "warn")
      return
    }
    pushToast(translate("Authorize X in the popup…", "请在弹窗中完成 X 授权…"), "default")

    // 成功感知有两种情形：
    //   · 新增账号：出现「不在快照里的已连接 X 账号」——轮询可察觉。
    //   · 重新授权已连接账号：回调只更新了该账号的 token（状态仍 Connected），轮询**察觉不到**——
    //     只能靠回调成功页的 postMessage 确认（同源可达时）；跨源时靠「弹窗关闭」给中性提示，token 其实已更新。
    let done = false
    const newlyConnected = (list: Account[]) =>
      list.find((a) => a.platform === "X" && a.status === "Connected" && !prevConnectedIds.has(a.id))
    const finish = async (reason: "message" | "poll" | "close") => {
      if (done) return
      done = true
      window.removeEventListener("message", onMsg)
      clearInterval(poll)
      try {
        const { accounts: fresh } = await api.getAccounts()
        setAccounts(fresh)
        const added = newlyConnected(fresh)
        if (added) {
          pushToast(translate(`X connected: ${added.name}`, `已连接 X:${added.name}`), "success")
        } else if (reason === "message") {
          // 回调 postMessage 确认成功（多为重新授权已连接账号）：token 已更新。
          pushToast(translate("X account authorized — token updated.", "X 账号授权成功,token 已更新。"), "success")
        } else if (reason === "close") {
          // 跨源部署下察觉不到 token 更新：给中性提示,不吓唬也不假装（token 若已授权其实已落库）。
          pushToast(
            translate(
              "Authorization window closed. If you finished authorizing, the token is updated — retry publishing.",
              "授权窗口已关闭。若你已完成授权,该账号 token 已更新,直接重试发布即可。",
            ),
            "default",
          )
        }
      } catch (e) {
        console.warn("[store] 刷新账号失败：", (e as Error).message)
      }
    }
    // 快路径：同源部署时回调成功页 postMessage 过来（新增/重新授权都能确认）。
    const onMsg = (ev: MessageEvent) => {
      if (ev?.data && (ev.data as { type?: string }).type === "x-oauth" && (ev.data as { ok?: boolean }).ok)
        void finish("message")
    }
    window.addEventListener("message", onMsg)
    // 兜底路径：轮询后端账号，出现新的已连接 X 账号即成功；弹窗关闭后再兜一轮；3 分钟超时。
    const deadline = Date.now() + 3 * 60_000
    const poll = setInterval(async () => {
      if (done) return
      try {
        const { accounts: fresh } = await api.getAccounts()
        if (newlyConnected(fresh)) {
          void finish("poll")
          return
        }
      } catch {
        /* 轮询期间的瞬时错误忽略，继续轮询 */
      }
      if (Date.now() > deadline || popup.closed) {
        clearInterval(poll)
        if (!done) void finish("close") // 超时/关窗兜底：refresh + 中性提示（token 若已授权其实已更新）
      }
    }, 2500)
  }, [pushToast])

  const connectAccount = useCallback(
    async (platform: Platform) => {
      if (platform === "X") {
        await connectX()
        return
      }
      // 非 X：OAuth 未接通，沿用原型「只标连接状态记录」行为（不代表已拿 token）。
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
    [accounts, pushToast, connectX],
  )

  const disconnectAccount = useCallback(
    async (id: string) => {
      const target = accounts.find((a) => a.id === id)
      setAccounts((prev) => prev.map((a) => (a.id === id ? { ...a, status: "NotConnected", capabilities: "Not connected", expiresAt: undefined } : a)))
      try {
        // X 已连接的账号走后端真断开（清 token）；其余仅落状态。
        if (target?.platform === "X" && target.status === "Connected") {
          await api.disconnectX(id)
        } else {
          await api.updateAccount(id, { status: "NotConnected", capabilities: "Not connected" })
        }
      } catch (e) {
        console.warn("[store] 断开账号失败：", (e as Error).message)
      }
      pushToast(translate("Account disconnected", "已断开账号"), "default")
    },
    [accounts, pushToast],
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
      startStudioFromPost,
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
      deletePost,
      publishPostNow,
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
      startStudioFromPost,
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
      deletePost,
      publishPostNow,
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
