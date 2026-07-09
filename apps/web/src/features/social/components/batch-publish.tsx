"use client"

import { Button } from "@/components/ui/button"
import { CreditsPill, Modal, PlatformBadge } from "@/features/social/components/ui"
import type { PostVariant } from "@social/shared"
import { CircleCheck, TriangleAlert } from "lucide-react"

export function BatchPublishModal({
  open,
  onClose,
  topic,
  variants,
  onConfirm,
}: {
  open: boolean
  onClose: () => void
  topic: string
  variants: PostVariant[]
  onConfirm: () => void
}) {
  const autoCount = variants.filter((v) => v.publishMode === "auto").length
  const manualCount = variants.length - autoCount

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title="Confirm publishing"
      description={`${topic} · ${variants.length} platform${variants.length === 1 ? "" : "s"}`}
      footer={
        <>
          <div className="mr-auto flex items-center gap-2 text-xs text-muted-foreground">
            <CreditsPill credits={12} />
            <span>Provider cost applies per auto publish</span>
          </div>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" className="bg-brand text-brand-foreground hover:bg-brand/90" onClick={onConfirm}>
            Confirm schedule
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        {variants.map((v) => {
          const auto = v.publishMode === "auto"
          return (
            <div key={v.platform} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3">
              <div className="flex min-w-0 items-center gap-2">
                <PlatformBadge platform={v.platform} size="md" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {v.platform} · {v.account || "No account"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {v.suggestedTime} · {v.format} · {v.hook.slice(0, 40)}
                  </p>
                </div>
              </div>
              <span
                className={
                  "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium " +
                  (auto
                    ? "bg-[oklch(0.95_0.05_150)] text-status-published"
                    : "bg-[oklch(0.96_0.04_70)] text-[oklch(0.48_0.13_55)]")
                }
              >
                {auto ? <CircleCheck className="size-3" /> : <TriangleAlert className="size-3" />}
                {auto ? "Auto publishing available" : "Manual fallback required"}
              </span>
            </div>
          )
        })}
      </div>
      {manualCount > 0 ? (
        <p className="mt-3 rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          {manualCount} platform{manualCount === 1 ? "" : "s"} cannot auto-publish in P0 and will enter{" "}
          <span className="font-medium text-[oklch(0.48_0.13_55)]">Manual fallback</span>. You can still confirm — auto platforms
          become Scheduled.
        </p>
      ) : null}
    </Modal>
  )
}
