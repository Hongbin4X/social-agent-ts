// 前端 → 后端 API 客户端。
// 走 Next 反代的同源 /bff/*（→ 后端 /api/*）。本地开发用固定 dev userId（对齐后端 DEV_FAKE_USER_ID）。
// 生产改为携带 GLBGPT JWT，这里只需换 authHeaders() 一处。

import type {
  Account,
  BatchPublishResult,
  BrandProfile,
  CalendarItem,
  GenerateVariantsInput,
  Platform,
  PostVariant,
  PublishItem,
  SocialPost,
} from "@social/shared"

// 本地开发身份（与后端 .env 的 DEV_FAKE_USER_ID 一致）。
const DEV_USER_ID = process.env.NEXT_PUBLIC_DEV_USER_ID ?? "1000000000000000001"
const BFF = "/bff"

function authHeaders(): Record<string, string> {
  return { "x-user-id": DEV_USER_ID, "Content-Type": "application/json" }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BFF}${path}`, { ...init, headers: { ...authHeaders(), ...(init?.headers ?? {}) } })
  const text = await res.text()
  const data = text ? JSON.parse(text) : {}
  if (!res.ok) {
    const msg = (data && (data.message || data.error)) || `请求失败 ${res.status}`
    throw new Error(`${path}: ${msg}`)
  }
  return data as T
}

// ── 类型（后端返回形状）──
export interface ApiProject {
  id: string
  brandName: string
  description: string
  targetMarket: string
  platforms: Platform[]
  primaryGoal: BrandProfile["contentGoals"][number]
  websiteUrl?: string
  tone?: string
}
export interface ApiWorkspace {
  id: string
  userId: string
  name: string
  timezone: string
  activeProjectId?: string | null
}

// ── 端点 ──
export const api = {
  // workspace
  getWorkspace: () => req<{ workspace: ApiWorkspace | null }>("/workspace"),
  createWorkspace: (input: Record<string, unknown>) =>
    req<{ workspace: ApiWorkspace; project: ApiProject }>("/workspace", { method: "POST", body: JSON.stringify(input) }),
  setActiveProject: (projectId: string) =>
    req<{ ok: boolean; activeProjectId: string }>("/workspace/active-project", { method: "POST", body: JSON.stringify({ projectId }) }),

  // projects
  getProjects: () => req<{ projects: ApiProject[] }>("/projects"),
  createProject: (input: Record<string, unknown>) =>
    req<{ project: ApiProject }>("/projects", { method: "POST", body: JSON.stringify(input) }),
  getBrandProfile: (projectId: string) => req<{ brandProfile: BrandProfile | null }>(`/projects/${projectId}/brand-profile`),
  updateBrandProfile: (projectId: string, patch: Partial<BrandProfile>) =>
    req<{ brandProfile: BrandProfile }>(`/projects/${projectId}/brand-profile`, { method: "PATCH", body: JSON.stringify(patch) }),
  getPosts: (projectId: string) => req<{ posts: SocialPost[] }>(`/projects/${projectId}/posts`),
  getCalendar: (projectId: string) => req<{ calendar: CalendarItem[] }>(`/projects/${projectId}/calendar`),

  // accounts
  getAccounts: () => req<{ accounts: Account[] }>("/accounts"),
  addAccount: (input: { platform: Platform; name: string; url?: string }) =>
    req<{ account: Account }>("/accounts", { method: "POST", body: JSON.stringify(input) }),
  updateAccount: (id: string, patch: Record<string, unknown>) =>
    req<{ ok: boolean }>(`/accounts/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),

  // ── X 账号 OAuth 连接（真授权重定向流）──
  // 第①步：拿授权链接 + state（codeVerifier 只在后端，绝不下发）。前端新开窗打开 authorizeUrl。
  startXAuth: () =>
    req<{ authorizeUrl: string; state: string }>("/connections/x/authorize-url", { method: "POST", body: "{}" }),
  // 断开 X 授权（清 token、状态置 NotConnected）。
  disconnectX: (accountId: string) =>
    req<{ ok: boolean }>(`/connections/x/${accountId}/disconnect`, { method: "POST", body: "{}" }),

  // posts
  savePost: (input: {
    projectId: string
    title: string
    platforms: Platform[]
    assetType?: string
    status?: string
    hasImage?: boolean
    variants: PostVariant[]
  }) => req<{ post: SocialPost }>("/posts", { method: "POST", body: JSON.stringify(input) }),
  updatePost: (id: string, patch: Record<string, unknown>) =>
    req<{ post: SocialPost }>(`/posts/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  // 硬删除草稿：projectId 走 body，供后端做归属校验 + 项目级删除。
  deletePost: (id: string, projectId: string) =>
    req<{ ok: boolean }>(`/posts/${id}`, { method: "DELETE", body: JSON.stringify({ projectId }) }),
  // 真实发布：调发布层（@social/publisher）。userId/workspaceId 由后端从鉴权上下文取，前端只给 projectId+postId+items。
  publish: (input: { projectId: string; postId?: string; items: PublishItem[] }) =>
    req<BatchPublishResult>("/publish", { method: "POST", body: JSON.stringify(input) }),

  // calendar（排期 / 改期 / 取消 / 立即发布 / 转手动 —— 全部落库）
  createCalendarItem: (input: {
    projectId: string
    postId?: string
    topic: string
    date?: string
    time?: string
    status?: string
    variants: CalendarItem["variants"]
  }) => req<{ item: CalendarItem }>("/calendar", { method: "POST", body: JSON.stringify(input) }),
  updateCalendarItem: (id: string, patch: Record<string, unknown>) =>
    req<{ item: CalendarItem }>(`/calendar/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  updateCalendarJobs: (
    id: string,
    input: { projectId: string; itemStatus?: string; jobs: CalendarItem["variants"] },
  ) => req<{ item: CalendarItem }>(`/calendar/${id}/jobs`, { method: "PATCH", body: JSON.stringify(input) }),
  // 按 postId 删排期（二次修改已排期帖子「撤回草稿」用；帖子保留，只清日历）。
  deleteCalendarByPost: (postId: string, projectId: string) =>
    req<{ ok: boolean }>(`/calendar/by-post/${postId}`, { method: "DELETE", body: JSON.stringify({ projectId }) }),

  // generation
  generateVariants: (input: { projectId: string } & Omit<GenerateVariantsInput, "brand">) =>
    req<{ variants: PostVariant[]; credits: number; generationJobId: string }>("/generate/variants", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  generateImage: (input: {
    projectId: string
    platform: Platform
    format: string
    hook: string
    body: string
    mediaAsset?: string
    instruction?: string
    description?: string
  }) =>
    req<{ asset: { id: string; url: string; mimeType: string; ratio: string }; credits: number; generationJobId: string }>(
      "/generate/image",
      { method: "POST", body: JSON.stringify(input) },
    ),
  generateProfileDraft: (projectId: string, websiteUrl: string) =>
    req<{ patch: Partial<BrandProfile>; credits: number }>("/generate/profile-draft", {
      method: "POST",
      body: JSON.stringify({ projectId, websiteUrl }),
    }),
}
