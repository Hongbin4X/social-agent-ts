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
  const published = count((s) => s === "Published" || s === "ManuallyPublished")
  const failed = count((s) => s === "Failed")
  const fallback = count((s) => s === "ManualFallback")

  const recentDrafts = posts.filter((p) => p.status === "Draft" || p.status === "Ready").slice(0, 4)
  const upcoming = calendar.filter((c) => c.status === "Scheduled" || c.status === "Planned").slice(0, 4)
  const recentResults = posts
    .filter((p) => ["Published", "ManuallyPublished", "Failed", "ManualFallback"].includes(p.status))
    .slice(0, 4)

  const expired = accounts.filter((a) => a.status === "Expired")
  const permission = accounts.filter((a) => a.status === "PermissionMissing")
  const connected = accounts.filter((a) => a.status === "Connected").length
  const issues = expired.length + permission.length

  const attention: { text: string; tone: string; action: string; onClick: () => void }[] = []
  if (failed > 0)
    attention.push({ text: `${failed} failed publish job${failed > 1 ? "s" : ""}`, tone: "text-status-failed", action: "Review in calendar", onClick: () => setAgentTab("Calendar") })
  if (fallback > 0)
    attention.push({ text: `${fallback} manual fallback${fallback > 1 ? "s" : ""} awaiting action`, tone: "text-[oklch(0.48_0.13_55)]", action: "Open calendar", onClick: () => setAgentTab("Calendar") })
  expired.forEach((a) =>
    attention.push({ text: `${a.platform} token expired`, tone: "text-status-failed", action: "Reconnect", onClick: () => setAgentSecondary("accounts") }),
  )
  permission.forEach((a) =>
    attention.push({ text: `${a.platform} permission missing`, tone: "text-[oklch(0.48_0.13_55)]", action: "Fix", onClick: () => setAgentSecondary("accounts") }),
  )
  if (pct < 100)
    attention.push({ text: `Brand profile ${pct}% complete`, tone: "text-muted-foreground", action: "Complete", onClick: () => setAgentSecondary("brand") })

  const quickActions = [
    { label: "Create 7-day plan", icon: Sparkles, onClick: () => { setAgentTab("Content Create"); setCreateIntent("plan") } },
    { label: "Create social content", icon: FileEdit, onClick: () => { setAgentTab("Content Create"); setCreateIntent("post") } },
    { label: "View calendar", icon: CalendarDays, onClick: () => setAgentTab("Calendar") },
    { label: "Operations data", icon: BarChart3, onClick: () => setAgentTab("Operations Data") },
    { label: "Complete brand profile", icon: UserCog, onClick: () => setAgentSecondary("brand") },
    { label: "Connect account", icon: Plug, onClick: () => setAgentSecondary("accounts") },
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
                    <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Projects / brands</p>
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
                      <Plus className="size-4" /> New project
                    </button>
                  </div>
                ) : null}
              </div>
              <span className="rounded-full bg-brand-muted px-2 py-0.5 text-xs font-medium text-brand">{workspace.primaryGoal}</span>
              <button
                onClick={() => setNewProjectOpen(true)}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted"
              >
                <Plus className="size-3.5" /> New project
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
            <FileEdit className="size-4" /> Create content
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
              <p className="text-sm text-muted-foreground">Brand profile</p>
              <p className="text-3xl font-bold leading-tight text-foreground">{pct}%</p>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => setAgentSecondary("brand")}>
            {pct < 100 ? "Complete" : "Open"}
          </Button>
        </Card>
        <Card className="flex items-center justify-between gap-3 p-5">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-lg bg-muted text-foreground">
              <Plug className="size-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm text-muted-foreground">Connections</p>
                {issues > 0 ? (
                  <span className="h-1.5 w-1.5 rounded-full bg-status-failed" aria-label={`${issues} issues`} />
                ) : null}
              </div>
              <p className="text-3xl font-bold leading-tight text-foreground">
                {connected}
                <span className="text-lg font-semibold text-muted-foreground">/{accounts.length}</span>
              </p>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => setAgentSecondary("accounts")}>
            Manage
          </Button>
        </Card>
      </div>

      {/* status summary — 7 metrics */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
        <Stat label="Drafts" value={drafts} />
        <Stat label="Planned" value={planned} />
        <Stat label="Scheduled" value={scheduled} tone="text-status-scheduled" />
        <Stat label="Published" value={published} tone="text-status-published" />
        <Stat label="Manual fallback" value={fallback} tone="text-[oklch(0.48_0.13_55)]" />
        <Stat label="Failed" value={failed} tone="text-status-failed" />
        <Stat label="Est. credits" value={credits} tone="text-brand" />
      </div>

      {/* needs attention */}
      {attention.length > 0 && (
        <Card className="border-status-fallback/30 bg-[oklch(0.98_0.02_70)] p-4">
          <div className="flex items-center gap-1.5">
            <TriangleAlert className="size-4 text-status-fallback" />
            <span className="text-sm font-semibold text-foreground">Needs attention</span>
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
          <SectionTitle hint="Editable">Recent drafts</SectionTitle>
          <div className="mt-3 space-y-2">
            {recentDrafts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No drafts yet.</p>
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
          <SectionTitle hint="Next up">Upcoming posts</SectionTitle>
          <div className="mt-3 space-y-2">
            {upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing scheduled.</p>
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
          <SectionTitle hint="Latest">Recent publish results</SectionTitle>
          <div className="mt-3 space-y-2">
            {recentResults.length === 0 ? (
              <p className="text-sm text-muted-foreground">No results yet.</p>
            ) : (
              recentResults.map((p) => (
                <div key={p.id} className="rounded-md border border-border px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-sm text-foreground">{p.title}</span>
                    <StatusBadge status={p.status} />
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">Updated {p.updatedAt}</div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      {/* quick actions */}
      <Card className="p-5">
        <SectionTitle>Quick actions</SectionTitle>
        <div className="mt-3 flex flex-wrap gap-2">
          {quickActions.map((a) => (
            <Button key={a.label} variant="outline" size="sm" onClick={a.onClick}>
              <a.icon className="size-4 text-muted-foreground" /> {a.label}
            </Button>
          ))}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Credits are metered per generation. Estimated credits are shown before every paid action.
        </p>
      </Card>

      <NewProjectModal open={newProjectOpen} onClose={() => setNewProjectOpen(false)} />
    </div>
  )
}

function NewProjectModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { createProject } = useSocial()
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
      title="Create a new project"
      description="Add another brand or project to this workspace. You can switch between them anytime."
      wide
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!canCreate}
            onClick={handleCreate}
            className="bg-brand text-brand-foreground hover:bg-brand/90"
          >
            Create project
          </Button>
        </>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Brand / project name" required>
          <TextInput value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="e.g. Northstar AI" />
        </Field>
        <Field label="Target market">
          <Select value={market} onChange={(e) => setMarket(e.target.value)}>
            <option>US</option>
            <option>Europe</option>
            <option>Global English Market</option>
            <option>Custom</option>
          </Select>
        </Field>
        <div className="md:col-span-2">
          <Field label="Product or brand description">
            <TextArea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What does your product do?" />
          </Field>
        </div>
        <Field label="Primary content goal">
          <Select value={goal} onChange={(e) => setGoal(e.target.value as ContentGoal)}>
            {CONTENT_GOALS.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </Select>
        </Field>
        <Field label="Website URL (optional)">
          <TextInput value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" />
        </Field>
        <div className="md:col-span-2">
          <Field label="Target platforms">
            <div className="flex flex-wrap gap-2">
              {ALL_PLATFORMS.map((p) => (
                <PlatformChip key={p} platform={p} selected={platforms.includes(p)} onClick={() => togglePlatform(p)} />
              ))}
            </div>
          </Field>
        </div>
        <div className="md:col-span-2">
          <Field label="Brand tone (optional)">
            <TextInput value={tone} onChange={(e) => setTone(e.target.value)} placeholder="e.g. clear, helpful" />
          </Field>
        </div>
      </div>
    </Modal>
  )
}
