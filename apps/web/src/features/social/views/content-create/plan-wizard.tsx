"use client"

import { useEffect, useState } from "react"
import { useSocial } from "@/features/social/store"
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
      title="Create 7-day plan"
      description={
        showResults
          ? "Open any topic in the composer or drop it straight onto the calendar."
          : "This plan uses your brand profile and target platforms."
      }
      footer={
        showResults ? (
          <>
            <Button variant="outline" size="sm" onClick={() => setShowResults(false)}>
              <RefreshCw className="size-4" /> Regenerate
            </Button>
            <Button size="sm" className="bg-brand text-brand-foreground hover:bg-brand/90" onClick={onClose}>
              Done
            </Button>
          </>
        ) : (
          <>
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="bg-brand text-brand-foreground hover:bg-brand/90"
              onClick={() => {
                generatePlan()
                setShowResults(true)
              }}
            >
              <Sparkles className="size-4" /> Confirm and generate
            </Button>
          </>
        )
      }
    >
      {showResults ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">{planName}</h3>
            <span className="text-xs text-muted-foreground">{plan.length} topics</span>
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
                    <span>Goal: {item.goal}</span>
                    <span>Asset: {item.assetType}</span>
                    <span className="flex items-center gap-1">
                      {item.platforms.map((p) => (
                        <PlatformBadge key={p} platform={p} />
                      ))}
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-1.5">
                  <Button size="xs" className="bg-brand text-brand-foreground hover:bg-brand/90" onClick={() => onOpenComposer(item)}>
                    <SquareArrowOutUpRight className="size-3" /> Open in composer
                  </Button>
                  <Button size="xs" variant="outline" onClick={() => addPlanItemToCalendar(item)}>
                    <CalendarPlus className="size-3" /> Calendar
                  </Button>
                  <Button size="xs" variant="ghost" onClick={() => pushToast("Regenerating topic…", "default")}>
                    <RefreshCw className="size-3" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          <Field label="Plan name">
            <TextInput value={planName} onChange={(e) => setPlanName(e.target.value)} />
          </Field>
          <Field label="Primary goal">
            <Select value={planGoal} onChange={(e) => setPlanGoal(e.target.value as ContentGoal)}>
              {CONTENT_GOALS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Topic / theme">
            <TextArea
              value={planTopic}
              onChange={(e) => setPlanTopic(e.target.value)}
              placeholder="What should this week focus on? e.g. Launching Northstar 2.0, sharing customer wins"
              className="min-h-20"
            />
          </Field>
          <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 px-3 py-2">
            <span className="text-sm text-foreground">7 topics across {workspace?.platforms.length ?? 0} platforms</span>
            <CreditsPill credits={24} />
          </div>
        </div>
      )}
    </Modal>
  )
}
