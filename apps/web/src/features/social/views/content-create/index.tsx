"use client"

import { useEffect, useState } from "react"
import { useSocial } from "@/features/social/store"
import { useLang } from "@/features/social/i18n"
import { cn } from "@/lib/utils"
import { ArrowRight, CalendarRange, PencilLine } from "lucide-react"
import { CreatePostWizard } from "./create-content-wizard"
import { PlanWizard } from "./plan-wizard"
import { ContentLibrary } from "./content-library"

export function ContentCreateTab() {
  const { createIntent, setCreateIntent, startStudioBlank, startStudioFromPlan } = useSocial()
  const { t } = useLang()
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
        <h2 className="text-lg font-semibold text-foreground">{t("Content Create", "内容创作")}</h2>
        <p className="text-sm text-muted-foreground">
          {t(
            "Start a guided compose flow or generate a full week of on-brand topics. Everything you produce lands in your library below.",
            "开启引导式创作流程，或一键生成契合品牌调性的一周选题。你产出的所有内容都会归入下方的内容库。",
          )}
        </p>
      </div>

      {/* two big create entries */}
      <div className="grid gap-4 sm:grid-cols-2">
        <BigActionCard
          icon={PencilLine}
          title={t("Create content", "创作内容")}
          description={t(
            "Compose a post, customize it for each network, then schedule or publish — step by step.",
            "撰写一条帖子，为每个平台分别定制，再逐步排期或发布。",
          )}
          cta={t("Start composing", "开始创作")}
          accent
          onClick={() => {
            startStudioBlank()
            setCreateOpen(true)
          }}
        />
        <BigActionCard
          icon={CalendarRange}
          title={t("Create 7-day plan", "生成 7 天计划")}
          description={t(
            "Generate a week of topics from your brand profile, then open any topic in the composer.",
            "根据品牌资料生成一周选题，再在创作台中打开任意选题。",
          )}
          cta={t("Generate plan", "生成计划")}
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
        {/* 强调卡底色为浅紫 brand-muted：文字需用恒定深紫 brand-muted-foreground，
            否则深色主题下 text-foreground 翻白、浅底白字看不清。 */}
        <p className={cn("text-base font-semibold", accent ? "text-brand-muted-foreground" : "text-foreground")}>{title}</p>
        <p className={cn("mt-1 text-sm", accent ? "text-brand-muted-foreground/80" : "text-muted-foreground")}>{description}</p>
      </div>
      <span className={cn("mt-auto inline-flex items-center gap-1.5 text-sm font-medium", accent ? "text-brand" : "text-foreground")}>
        {cta}
        <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </button>
  )
}
