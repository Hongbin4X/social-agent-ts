"use client"

import { useSocial } from "@/features/social/store"
import { cn } from "@/lib/utils"
import { Check, Info, TriangleAlert } from "lucide-react"

export function Toaster() {
  const { toasts, dismissToast } = useSocial()
  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[60] flex w-80 flex-col gap-2">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => dismissToast(t.id)}
          className={cn(
            "pointer-events-auto flex items-center gap-2 rounded-lg border bg-card px-3 py-2.5 text-left text-sm shadow-md",
            t.tone === "success"
              ? "border-status-published/40"
              : t.tone === "warn"
                ? "border-status-fallback/40"
                : "border-border",
          )}
        >
          <span
            className={cn(
              "flex size-5 shrink-0 items-center justify-center rounded-full",
              t.tone === "success"
                ? "bg-status-published/15 text-status-published"
                : t.tone === "warn"
                  ? "bg-status-fallback/15 text-status-fallback"
                  : "bg-muted text-muted-foreground",
            )}
          >
            {t.tone === "success" ? <Check className="size-3" /> : t.tone === "warn" ? <TriangleAlert className="size-3" /> : <Info className="size-3" />}
          </span>
          <span className="text-foreground">{t.message}</span>
        </button>
      ))}
    </div>
  )
}
