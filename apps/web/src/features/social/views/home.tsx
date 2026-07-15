"use client"

import { useEffect, useRef, useState } from "react"
import { useSocial } from "@/features/social/store"
import { ALL_PLATFORMS, CONTENT_GOALS, type ContentGoal, type Platform } from "@social/shared"
import { Button } from "@/components/ui/button"
import {
  Card,
  Field,
  Modal,
  PlatformBadge,
  PlatformChip,
  SectionTitle,
  Select,
  Stat,
  StatusBadge,
  TextArea,
  TextInput,
} from "@/features/social/components/ui"
import {
  BarChart3,
  CalendarDays,
  Check,
  ChevronDown,
  FileEdit,
  Plug,
  Plus,
  Sparkles,
  TriangleAlert,
  UserCog,
} from "lucide-react"
import { useLang } from "@/features/social/i18n"
import { CONTENT_GOAL_LABELS } from "@/features/social/i18n/labels"

export function AgentHome() {
  const {
    workspace,
    projects,
    activeProjectId,
    switchProject,
    profileCompletion,
    posts,
    calendar,
    plan,
    accounts,
    credits,
    setAgentTab,
    setAgentSecondary,
    setCreateIntent,
  } = useSocial()
  const { t, te } = useLang()
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [newProjectOpen, setNewProjectOpen] = useState(false)
  const switcherRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!switcherOpen) return
    const handler = (e: MouseEvent) => {
      if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) setSwitcherOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [switcherOpen])

  if (!workspace) return null
  const activeBrand = projects.find((p) => p.id === activeProjectId)?.brandName ?? workspace.brandName

  const { pct } = profileCompletion()
  const count = (fn: (s: string) => boolean) => posts.filter((p) => fn(p.status)).length
  const drafts = count((s) => s === "Draft")
  const planned = count((s) => s === "Planned") + plan.length
  const scheduled = count((s) => s === "Scheduled")
  const published = count((s) => s === "Published")
  const failed = count((s) => s === "Failed")

  const recentDrafts = posts.filter((p) => p.status === "Draft" || p.status === "Ready").slice(0, 4)
  const upcoming = calendar.filter((c) => c.status === "Scheduled" || c.status === "Planned").slice(0, 4)
  const recentResults = posts
    .filter((p) => ["Published", "Failed"].includes(p.status))
    .slice(0, 4)

  const expired = accounts.filter((a) => a.status === "Expired")
  const permission = accounts.filter((a) => a.status === "PermissionMissing")
  const connected = accounts.filter((a) => a.status === "Connected").length
  const issues = expired.length + permission.length

  const attention: { text: string; tone: string; action: string; onClick: () => void }[] = []
  if (failed > 0)
    attention.push({ text: t(`${failed} failed publish job${failed > 1 ? "s" : ""}`, `${failed} 个发布任务失败`), tone: "text-status-failed", action: t("Review in calendar", "在日历中查看"), onClick: () => setAgentTab("Calendar") })
  expired.forEach((a) =>
    attention.push({ text: t(`${a.platform} token expired`, `${a.platform} 令牌已过期`), tone: "text-status-failed", action: t("Reconnect", "重新连接"), onClick: () => setAgentSecondary("accounts") }),
  )
  permission.forEach((a) =>
    attention.push({ text: t(`${a.platform} permission missing`, `${a.platform} 权限缺失`), tone: "text-[oklch(0.48_0.13_55)]", action: t("Fix", "修复"), onClick: () => setAgentSecondary("accounts") }),
  )
  if (pct < 100)
    attention.push({ text: t(`Brand profile ${pct}% complete`, `品牌资料完成度 ${pct}%`), tone: "text-muted-foreground", action: t("Complete", "完善"), onClick: () => setAgentSecondary("brand") })

  const quickActions = [
    { label: t("Create 7-day plan", "生成 7 天计划"), icon: Sparkles, onClick: () => { setAgentTab("Content Create"); setCreateIntent("plan") } },
    { label: t("Create social content", "创作社交内容"), icon: FileEdit, onClick: () => { setAgentTab("Content Create"); setCreateIntent("post") } },
    { label: t("View calendar", "查看日历"), icon: CalendarDays, onClick: () => setAgentTab("Calendar") },
    { label: t("Operations data", "运营数据"), icon: BarChart3, onClick: () => setAgentTab("Operations Data") },
    { label: t("Complete brand profile", "完善品牌资料"), icon: UserCog, onClick: () => setAgentSecondary("brand") },
    { label: t("Connect account", "连接账号"), icon: Plug, onClick: () => setAgentSecondary("accounts") },
  ]

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-6">
      {/* workspace overview */}
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              {/* project / brand switcher */}
              <div className="relative" ref={switcherRef}>
                <button
                  onClick={() => setSwitcherOpen((o) => !o)}
                  className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1 text-lg font-semibold text-foreground hover:bg-muted"
                >
                  <span className="flex size-6 items-center justify-center rounded bg-brand text-xs font-bold text-brand-foreground">
                    {activeBrand.slice(0, 1)}
                  </span>
                  {activeBrand}
                  <ChevronDown className="size-4 text-muted-foreground" />
                </button>
                {switcherOpen ? (
                  <div className="absolute left-0 top-full z-20 mt-1 w-64 rounded-md border border-border bg-card p-1 shadow-md">
                    <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">{t("Projects / brands", "项目 / 品牌")}</p>
                    {projects.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => {
                          switchProject(p.id)
                          setSwitcherOpen(false)
                        }}
                        className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground hover:bg-muted"
                      >
                        <span className="min-w-0 truncate">{p.brandName}</span>
                        {p.id === activeProjectId ? <Check className="size-4 text-brand" /> : null}
                      </button>
                    ))}
                    <div className="my-1 h-px bg-border" />
                    <button
                      onClick={() => {
                        setNewProjectOpen(true)
                        setSwitcherOpen(false)
                      }}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium text-brand hover:bg-brand-muted"
                    >
                      <Plus className="size-4" /> {t("New project", "新建项目")}
                    </button>
                  </div>
                ) : null}
              </div>
              <span className="rounded-full bg-brand-muted px-2 py-0.5 text-xs font-medium text-brand">{te(CONTENT_GOAL_LABELS[workspace.primaryGoal])}</span>
              <button
                onClick={() => setNewProjectOpen(true)}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted"
              >
                <Plus className="size-3.5" /> {t("New project", "新建项目")}
              </button>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {workspace.targetMarket} · {workspace.timezone}
            </p>
            <div className="mt-3 flex items-center gap-1.5">
              {workspace.platforms.map((p) => (
                <PlatformBadge key={p} platform={p} size="md" />
              ))}
            </div>
          </div>
          <Button
            onClick={() => {
              setAgentTab("Content Create")
              setCreateIntent("post")
            }}
            className="bg-brand text-brand-foreground hover:bg-brand/90"
          >
            <FileEdit className="size-4" /> {t("Create content", "创作内容")}
          </Button>
        </div>
      </Card>

      {/* brand profile + connections entries */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="flex items-center justify-between gap-3 p-5">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-lg bg-brand-muted text-brand">
              <UserCog className="size-5" />
            </span>
            <div>
              <p className="text-sm text-muted-foreground">{t("Brand profile", "品牌资料")}</p>
              <p className="text-3xl font-bold leading-tight text-foreground">{pct}%</p>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => setAgentSecondary("brand")}>
            {pct < 100 ? t("Complete", "完善") : t("Open", "打开")}
          </Button>
        </Card>
        <Card className="flex items-center justify-between gap-3 p-5">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-lg bg-muted text-foreground">
              <Plug className="size-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm text-muted-foreground">{t("Connections", "账号连接")}</p>
                {issues > 0 ? (
                  <span className="h-1.5 w-1.5 rounded-full bg-status-failed" aria-label={t(`${issues} issues`, `${issues} 个问题`)} />
                ) : null}
              </div>
              <p className="text-3xl font-bold leading-tight text-foreground">
                {connected}
                <span className="text-lg font-semibold text-muted-foreground">/{accounts.length}</span>
              </p>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => setAgentSecondary("accounts")}>
            {t("Manage", "管理")}
          </Button>
        </Card>
      </div>

      {/* status summary — 6 metrics */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        <Stat label={t("Drafts", "草稿")} value={drafts} />
        <Stat label={t("Planned", "已计划")} value={planned} />
        <Stat label={t("Scheduled", "已排期")} value={scheduled} tone="text-status-scheduled" />
        <Stat label={t("Published", "已发布")} value={published} tone="text-status-published" />
        <Stat label={t("Failed", "失败")} value={failed} tone="text-status-failed" />
        <Stat label={t("Est. credits", "预估积分")} value={credits} tone="text-brand" />
      </div>

      {/* needs attention */}
      {attention.length > 0 && (
        <Card className="border-status-fallback/30 bg-[oklch(0.98_0.02_70)] p-4">
          <div className="flex items-center gap-1.5">
            <TriangleAlert className="size-4 text-status-fallback" />
            <span className="text-sm font-semibold text-foreground">{t("Needs attention", "需要关注")}</span>
            <span className="text-xs text-muted-foreground">({attention.length})</span>
          </div>
          <div className="mt-3 flex flex-col gap-2">
            {attention.slice(0, 5).map((a, i) => (
              <div key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2">
                <span className={`text-sm font-medium ${a.tone}`}>{a.text}</span>
                <Button size="xs" variant="outline" onClick={a.onClick}>
                  {a.action}
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* recent lists */}
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="p-5">
          <SectionTitle hint={t("Editable", "可编辑")}>{t("Recent drafts", "最近草稿")}</SectionTitle>
          <div className="mt-3 space-y-2">
            {recentDrafts.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("No drafts yet.", "暂无草稿。")}</p>
            ) : (
              recentDrafts.map((d) => (
                <button
                  key={d.id}
                  onClick={() => setAgentTab("Content Create")}
                  className="flex w-full items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-left hover:bg-muted"
                >
                  <span className="min-w-0 truncate text-sm text-foreground">{d.title}</span>
                  <StatusBadge status={d.status} />
                </button>
              ))
            )}
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle hint={t("Next up", "接下来")}>{t("Upcoming posts", "即将发布的帖子")}</SectionTitle>
          <div className="mt-3 space-y-2">
            {upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("Nothing scheduled.", "暂无排期。")}</p>
            ) : (
              upcoming.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setAgentTab("Calendar")}
                  className="block w-full rounded-md border border-border px-3 py-2 text-left hover:bg-muted"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-sm text-foreground">{c.topic}</span>
                    <StatusBadge status={c.status} />
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    {c.date} · {c.time}
                    <span className="flex gap-1">
                      {c.variants.map((v) => (
                        <PlatformBadge key={v.platform} platform={v.platform} />
                      ))}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle hint={t("Latest", "最新")}>{t("Recent publish results", "最近发布结果")}</SectionTitle>
          <div className="mt-3 space-y-2">
            {recentResults.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("No results yet.", "暂无结果。")}</p>
            ) : (
              recentResults.map((p) => (
                <div key={p.id} className="rounded-md border border-border px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-sm text-foreground">{p.title}</span>
                    <StatusBadge status={p.status} />
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">{t("Updated", "更新于")} {p.updatedAt}</div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      {/* quick actions */}
      <Card className="p-5">
        <SectionTitle>{t("Quick actions", "快捷操作")}</SectionTitle>
        <div className="mt-3 flex flex-wrap gap-2">
          {quickActions.map((a) => (
            <Button key={a.label} variant="outline" size="sm" onClick={a.onClick}>
              <a.icon className="size-4 text-muted-foreground" /> {a.label}
            </Button>
          ))}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          {t(
            "Credits are metered per generation. Estimated credits are shown before every paid action.",
            "积分按每次生成计费。每次付费操作前都会显示预估积分。",
          )}
        </p>
      </Card>

      <NewProjectModal open={newProjectOpen} onClose={() => setNewProjectOpen(false)} />
    </div>
  )
}

function NewProjectModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { createProject } = useSocial()
  const { t } = useLang()
  const [brand, setBrand] = useState("")
  const [desc, setDesc] = useState("")
  const [market, setMarket] = useState("US")
  const [platforms, setPlatforms] = useState<Platform[]>(["X", "Instagram"])
  const [goal, setGoal] = useState<ContentGoal>("Drive trial")
  const [website, setWebsite] = useState("")
  const [tone, setTone] = useState("")

  const togglePlatform = (p: Platform) =>
    setPlatforms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]))

  const canCreate = brand.trim().length > 0

  const handleCreate = () => {
    createProject({
      brandName: brand,
      description: desc,
      targetMarket: market,
      platforms,
      primaryGoal: goal,
      websiteUrl: website,
      tone,
    })
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("Create a new project", "新建项目")}
      description={t(
        "Add another brand or project to this workspace. You can switch between them anytime.",
        "为该工作区添加另一个品牌或项目，可随时切换。",
      )}
      wide
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose}>
            {t("Cancel", "取消")}
          </Button>
          <Button
            size="sm"
            disabled={!canCreate}
            onClick={handleCreate}
            className="bg-brand text-brand-foreground hover:bg-brand/90"
          >
            {t("Create project", "创建项目")}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Field label={t("Brand / project name", "品牌 / 项目名称")} required>
          <TextInput value={brand} onChange={(e) => setBrand(e.target.value)} placeholder={t("e.g. Northstar AI", "例如 Northstar AI")} />
        </Field>
        <Field label={t("Target market", "目标市场")}>
          <Select value={market} onChange={(e) => setMarket(e.target.value)}>
            <option>US</option>
            <option>Europe</option>
            <option>Global English Market</option>
            <option>Custom</option>
          </Select>
        </Field>
        <div className="md:col-span-2">
          <Field label={t("Product or brand description", "产品或品牌描述")}>
            <TextArea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={t("What does your product do?", "你的产品是做什么的？")} />
          </Field>
        </div>
        <Field label={t("Primary content goal", "主要内容目标")}>
          <Select value={goal} onChange={(e) => setGoal(e.target.value as ContentGoal)}>
            {CONTENT_GOALS.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </Select>
        </Field>
        <Field label={t("Website URL (optional)", "网站 URL（可选）")}>
          <TextInput value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" />
        </Field>
        <div className="md:col-span-2">
          <Field label={t("Target platforms", "目标平台")}>
            <div className="flex flex-wrap gap-2">
              {ALL_PLATFORMS.map((p) => (
                <PlatformChip key={p} platform={p} selected={platforms.includes(p)} onClick={() => togglePlatform(p)} />
              ))}
            </div>
          </Field>
        </div>
        <div className="md:col-span-2">
          <Field label={t("Brand tone (optional)", "品牌语气（可选）")}>
            <TextInput value={tone} onChange={(e) => setTone(e.target.value)} placeholder={t("e.g. clear, helpful", "例如 清晰、有帮助")} />
          </Field>
        </div>
      </div>
    </Modal>
  )
}
