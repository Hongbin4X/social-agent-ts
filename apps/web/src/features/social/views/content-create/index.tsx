"use client"

import { useEffect, useState } from "react"
import { useSocial } from "@/features/social/store"
import { cn } from "@/lib/utils"
import { ArrowRight, CalendarRange, PencilLine } from "lucide-react"
import { CreatePostWizard } from "./create-content-wizard"
import { PlanWizard } from "./plan-wizard"
import { ContentLibrary } from "./content-library"

export function ContentCreateTab() {
  const { createIntent, setCreateIntent, startStudioBlank, startStudioFromPlan } = useSocial()
  const [createOpen, setCreateOpen] = useState(false)
  const [planOpen, setPlanOpen] = useState(false)

  useEffect(() => {
    if (createIntent === "post") {
      startStudioBlank()
      setCreateOpen(true)
      setCreateIntent(null)
    } else if (createIntent === "plan") {
      setPlanOpen(true)
      setCreateIntent(null)
    }
  }, [createIntent, startStudioBlank, setCreateIntent])

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Content Create</h2>
        <p className="text-sm text-muted-foreground">
          Start a guided compose flow or generate a full week of on-brand topics. Everything you produce lands in your library below.
        </p>
      </div>

      {/* two big create entries */}
      <div className="grid gap-4 sm:grid-cols-2">
        <BigActionCard
          icon={PencilLine}
          title="Create content"
          description="Compose a post, customize it for each network, then schedule or publish — step by step."
          cta="Start composing"
          accent
          onClick={() => {
            startStudioBlank()
            setCreateOpen(true)
          }}
        />
        <BigActionCard
          icon={CalendarRange}
          title="Create 7-day plan"
          description="Generate a week of topics from your brand profile, then open any topic in the composer."
          cta="Generate plan"
          onClick={() => setPlanOpen(true)}
        />
      </div>

      {/* content library */}
      <ContentLibrary />

      <CreatePostWizard open={createOpen} onClose={() => setCreateOpen(false)} />
      <PlanWizard
        open={planOpen}
        onClose={() => setPlanOpen(false)}
        onOpenComposer={(item) => {
          startStudioFromPlan(item)
          setPlanOpen(false)
          setCreateOpen(true)
        }}
      />
    </div>
  )
}

/* ---------- big action card ---------- */
function BigActionCard({
  icon: Icon,
  title,
  description,
  cta,
  accent,
  onClick,
}: {
  icon: typeof PencilLine
  title: string
  description: string
  cta: string
  accent?: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "group flex flex-col items-start gap-3 rounded-lg border p-5 text-left transition-colors",
        accent ? "border-brand bg-brand-muted hover:bg-brand-muted/70" : "border-border bg-card hover:bg-muted",
      )}
    >
      <span
        className={cn(
          "flex size-10 items-center justify-center rounded-lg",
          accent ? "bg-brand text-brand-foreground" : "bg-muted text-foreground",
        )}
      >
        <Icon className="size-5" />
      </span>
      <div>
        <p className="text-base font-semibold text-foreground">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <span className={cn("mt-auto inline-flex items-center gap-1.5 text-sm font-medium", accent ? "text-brand" : "text-foreground")}>
        {cta}
        <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </button>
  )
}
