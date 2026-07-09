"use client"

import { useSocial, type AgentTab } from "@/features/social/store"
import { cn } from "@/lib/utils"
import { Onboarding } from "@/features/social/onboarding"
import { AgentHome } from "@/features/social/views/home"
import { ContentCreateTab } from "@/features/social/views/content-create"
import { CalendarTab } from "@/features/social/views/calendar"
import { OperationsDataTab } from "@/features/social/views/operations-data"
import { BrandProfilePanel } from "@/features/social/panels/brand-profile-panel"
import { AccountHubPanel } from "@/features/social/panels/account-hub-panel"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Clock, Plus, Sparkles } from "lucide-react"

const TABS: AgentTab[] = ["Home", "Content Create", "Calendar", "Operations Data"]

export function Workbench() {
  const {
    hasWorkspace,
    workspace,
    agentTab,
    setAgentTab,
    agentSecondary,
    setAgentSecondary,
    setCreateIntent,
    credits,
  } = useSocial()

  if (!hasWorkspace || !workspace) return <Onboarding />

  const goTab = (t: AgentTab) => {
    setAgentSecondary(null)
    setAgentTab(t)
  }

  const openCreate = (intent: "post" | "plan") => {
    setAgentSecondary(null)
    setAgentTab("Content Create")
    setCreateIntent(intent)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* workbench top bar */}
      <div className="border-b border-border px-6 pb-0 pt-1">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-semibold text-foreground">
              <span className="flex size-5 items-center justify-center rounded bg-brand text-[10px] font-bold text-brand-foreground">
                {workspace.name.slice(0, 1)}
              </span>
              {workspace.name}
            </span>
            <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:inline-flex">
              <Clock className="size-3.5" />
              {workspace.timezone}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-brand" />
              Est. credits: <span className="text-foreground">{credits}</span>
            </span>
            <Button size="sm" variant="outline" onClick={() => openCreate("plan")}>
              <Sparkles className="size-3.5" /> Create 7-day plan
            </Button>
            <Button size="sm" onClick={() => openCreate("post")} className="bg-brand text-brand-foreground hover:bg-brand/90">
              <Plus className="size-3.5" /> Create content
            </Button>
          </div>
        </div>

        {/* secondary tabs */}
        <div className="flex flex-wrap gap-1">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => goTab(t)}
              className={cn(
                "relative px-3 py-2 text-sm font-medium transition-colors",
                agentTab === t && !agentSecondary ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t}
              {agentTab === t && !agentSecondary ? (
                <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand" />
              ) : null}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-muted/30">
        {agentSecondary ? (
          <SecondaryPage view={agentSecondary} onBack={() => setAgentSecondary(null)} />
        ) : (
          <>
            {agentTab === "Home" && <AgentHome />}
            {agentTab === "Content Create" && <ContentCreateTab />}
            {agentTab === "Calendar" && <CalendarTab />}
            {agentTab === "Operations Data" && <OperationsDataTab />}
          </>
        )}
      </div>
    </div>
  )
}

function SecondaryPage({ view, onBack }: { view: "brand" | "accounts"; onBack: () => void }) {
  const title = view === "brand" ? "Brand profile" : "Third-party connections"
  const subtitle =
    view === "brand"
      ? "Complete your brand context so plans, copy, and images stay on-brand."
      : "Connect platforms for auto publishing, or add manual accounts for export-only workflows."

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <div className="flex items-center gap-3">
        <Button size="sm" variant="outline" onClick={onBack}>
          <ArrowLeft className="size-4" /> Back
        </Button>
        <div>
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      {view === "brand" ? <BrandProfilePanel /> : <AccountHubPanel />}
    </div>
  )
}
