"use client"

import { useEffect, useState } from "react"
import { useSocial } from "@/features/social/store"
import { useLang } from "@/features/social/i18n"
import { CONTENT_GOAL_LABELS } from "@/features/social/i18n/labels"
import { CONTENT_GOALS, type ContentGoal, type PlanItem } from "@social/shared"
import { Button } from "@/components/ui/button"
import {
  CreditsPill,
  Field,
  Modal,
  PlatformBadge,
  Select,
  StatusBadge,
  TextArea,
  TextInput,
} from "@/features/social/components/ui"
import { CalendarPlus, RefreshCw, Sparkles, SquareArrowOutUpRight } from "lucide-react"

/* ---------- 7-day plan wizard ---------- */
export function PlanWizard({
  open,
  onClose,
  onOpenComposer,
}: {
  open: boolean
  onClose: () => void
  onOpenComposer: (item: PlanItem) => void
}) {
  const { workspace, plan, generatePlan, addPlanItemToCalendar, pushToast } = useSocial()
  const { t, te } = useLang()
  const [planName, setPlanName] = useState("Launch Week Plan")
  const [planGoal, setPlanGoal] = useState<ContentGoal>(workspace?.primaryGoal ?? CONTENT_GOALS[0])
  const [planTopic, setPlanTopic] = useState("")
  const [showResults, setShowResults] = useState(false)

  useEffect(() => {
    if (open) {
      setShowResults(false)
      setPlanGoal(workspace?.primaryGoal ?? CONTENT_GOALS[0])
    }
  }, [open, workspace?.primaryGoal])

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={t("Create 7-day plan", "生成 7 天计划")}
      description={
        showResults
          ? t("Open any topic in the composer or drop it straight onto the calendar.", "在创作台中打开任意选题，或直接拖到日历上。")
          : t("This plan uses your brand profile and target platforms.", "该计划会依据你的品牌资料与目标平台生成。")
      }
      footer={
        showResults ? (
          <>
            <Button variant="outline" size="sm" onClick={() => setShowResults(false)}>
              <RefreshCw className="size-4" /> {t("Regenerate", "重新生成")}
            </Button>
            <Button size="sm" className="bg-brand text-brand-foreground hover:bg-brand/90" onClick={onClose}>
              {t("Done", "完成")}
            </Button>
          </>
        ) : (
          <>
            <Button variant="outline" size="sm" onClick={onClose}>
              {t("Cancel", "取消")}
            </Button>
            <Button
              size="sm"
              className="bg-brand text-brand-foreground hover:bg-brand/90"
              onClick={() => {
                generatePlan()
                setShowResults(true)
              }}
            >
              <Sparkles className="size-4" /> {t("Confirm and generate", "确认并生成")}
            </Button>
          </>
        )
      }
    >
      {showResults ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">{planName}</h3>
            <span className="text-xs text-muted-foreground">
              {plan.length} {t("topics", "个主题")}
            </span>
          </div>
          {plan.map((item) => (
            <div key={item.id} className="rounded-md border border-border p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-foreground">{item.date}</span>
                    <span className="text-xs text-muted-foreground">{item.time}</span>
                    <span className="rounded-full bg-brand-muted px-2 py-0.5 text-xs font-medium text-brand">{item.pillar}</span>
                    {item.status !== "Planned" ? <StatusBadge status={item.status === "Scheduled" ? "Scheduled" : "Planned"} /> : null}
                  </div>
                  <p className="mt-1.5 font-medium text-foreground">{item.topic}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>{t("Goal", "目标")}: {te(CONTENT_GOAL_LABELS[item.goal])}</span>
                    <span>{t("Asset", "素材")}: {item.assetType}</span>
                    <span className="flex items-center gap-1">
                      {item.platforms.map((p) => (
                        <PlatformBadge key={p} platform={p} />
                      ))}
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-1.5">
                  <Button size="xs" className="bg-brand text-brand-foreground hover:bg-brand/90" onClick={() => onOpenComposer(item)}>
                    <SquareArrowOutUpRight className="size-3" /> {t("Open in composer", "在创作台打开")}
                  </Button>
                  <Button size="xs" variant="outline" onClick={() => addPlanItemToCalendar(item)}>
                    <CalendarPlus className="size-3" /> {t("Calendar", "日历")}
                  </Button>
                  <Button size="xs" variant="ghost" onClick={() => pushToast(t("Regenerating topic…", "正在重新生成选题…"), "default")}>
                    <RefreshCw className="size-3" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          <Field label={t("Plan name", "计划名称")}>
            <TextInput value={planName} onChange={(e) => setPlanName(e.target.value)} />
          </Field>
          <Field label={t("Primary goal", "主要目标")}>
            <Select value={planGoal} onChange={(e) => setPlanGoal(e.target.value as ContentGoal)}>
              {CONTENT_GOALS.map((g) => (
                <option key={g} value={g}>
                  {te(CONTENT_GOAL_LABELS[g])}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("Topic / theme", "主题 / 方向")}>
            <TextArea
              value={planTopic}
              onChange={(e) => setPlanTopic(e.target.value)}
              placeholder={t(
                "What should this week focus on? e.g. Launching Northstar 2.0, sharing customer wins",
                "本周应聚焦什么？例如：发布 Northstar 2.0、分享客户成功案例",
              )}
              className="min-h-20"
            />
          </Field>
          <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 px-3 py-2">
            <span className="text-sm text-foreground">
              {t(
                `7 topics across ${workspace?.platforms.length ?? 0} platforms`,
                `7 个主题，覆盖 ${workspace?.platforms.length ?? 0} 个平台`,
              )}
            </span>
            <CreditsPill credits={24} />
          </div>
        </div>
      )}
    </Modal>
  )
}
