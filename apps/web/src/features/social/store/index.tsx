"use client"

import {
  createContext,
  useCallback,
  useContext,
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
  generateImage: () => void
  generateVariants: () => void
  startManualVariants: () => void
  updateVariant: (platform: Platform, patch: Partial<PostVariant>) => void
  setStudioPlatforms: (p: Platform[]) => void
  setStudioTopic: (t: string) => void

  posts: SocialPost[]
  saveStudioToLibrary: () => SocialPost | null
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
      pushToast("Workspace created", "success")
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
      pushToast(`Project "${proj.brandName}" created`, "success")
    },
    [applyProjectToState, pushToast],
  )

  const switchProject = useCallback(
    (id: string) => {
      const proj = projects.find((p) => p.id === id)
      if (!proj) return
      setActiveProjectId(id)
      applyProjectToState(proj)
      pushToast(`Switched to ${proj.brandName}`, "default")
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
    pushToast("Profile draft generated. Actual credits: 11", "success")
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
    pushToast("7-day plan generated. Actual credits: 22", "success")
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
    pushToast("Copy generated. Actual credits: 7", "success")
  }, [profile, pushToast])

  const generateImage = useCallback(() => {
    setCredits((c) => c - 30)
    setStudio((s) => ({ ...s, imageGenerated: true }))
    pushToast("Image generated. Actual credits: 28", "success")
  }, [pushToast])

  const generateVariants = useCallback(() => {
    setCredits((c) => c - 16)
    setStudio((s) => ({
      ...s,
      copyGenerated: true,
      variants: s.platforms.map((p) => {
        const existing = s.variants.find((v) => v.platform === p)
        return existing || buildVariant(p, s.topic || "New social topic", profile)
      }),
    }))
    pushToast("Variants generated · Actual credits: 15", "success")
  }, [profile, pushToast])

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

  const saveStudioToLibrary = useCallback((): SocialPost | null => {
    let saved: SocialPost | null = null
    setStudio((s) => {
      if (!s.topic && s.variants.length === 0) return s
      const post: SocialPost = {
        id: nextId("post"),
        title: s.topic || "Untitled topic",
        platforms: s.platforms,
        assetType: s.imageGenerated ? "Copy + image" : "Copy",
        status: "Ready",
        tags: ["studio"],
        updatedAt: "Just now",
        owner: "L",
        hasImage: s.imageGenerated,
        variants:
          s.variants.length > 0
            ? s.variants
            : s.platforms.map((p) => buildVariant(p, s.topic, profile)),
      }
      saved = post
      return s
    })
    if (saved) {
      setPosts((prev) => [saved as SocialPost, ...prev])
      pushToast("Saved to Content Library", "success")
    }
    return saved
  }, [profile, pushToast])

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
      pushToast("Added to calendar", "success")
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
      pushToast("Added to calendar", "success")
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
      pushToast("Job rescheduled", "success")
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
      pushToast("Job cancelled", "default")
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
      pushToast("Auto platforms published now", "success")
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
      pushToast("Converted to manual fallback", "default")
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
      pushToast("Publish jobs confirmed", "success")
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
    pushToast("Marked as manually published", "success")
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
    pushToast("Retry scheduled", "success")
  }, [])

  const archivePost = useCallback((postId: string) => {
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, status: "Archived" } : p)))
    pushToast("Archived", "default")
  }, [])

  const addManualAccount = useCallback(
    (a: Omit<Account, "id" | "status" | "type">) => {
      setAccounts((prev) => [
        ...prev,
        { ...a, id: nextId("acc"), type: "manual", status: "UnsupportedPublishing" },
      ])
      pushToast("Manual account added", "success")
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
      pushToast(`${platform} connected`, "success")
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
      pushToast("Account disconnected", "default")
    },
    [pushToast],
  )

  const refreshAccount = useCallback(
    (id: string) => {
      setAccounts((prev) => prev.map((a) => (a.id === id ? { ...a } : a)))
      pushToast("Status refreshed", "default")
    },
    [pushToast],
  )

  const generateSuggestions = useCallback(() => {
    setCredits((c) => c - 18)
    setSuggestions(opsRecommendations)
    setSuggestionsGenerated(true)
    pushToast("Recommendations generated. Actual credits: 16", "success")
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
