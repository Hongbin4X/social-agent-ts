"use client"

import type { PostVariant } from "@social/shared"
import { Button } from "@/components/ui/button"
import { PlatformBadge } from "@/features/social/components/ui"
import { cn } from "@/lib/utils"
import { CircleCheck, ImageIcon, Info, Pencil, RefreshCw } from "lucide-react"
import { deriveMode, ratioOf, validations } from "./helpers"

/* ---------- preview ---------- */
export function PreviewCard({
  variant,
  hasImage,
  onCtaPreview,
  onRegenerateImage,
  onEditImage,
}: {
  variant: PostVariant
  hasImage: boolean
  onCtaPreview: (url?: string) => void
  onRegenerateImage?: () => void
  onEditImage?: () => void
}) {
  const mode = deriveMode(variant)
  const checks = validations(variant)
  const ratio = ratioOf(variant.format)
  const showMedia = variant.mediaAsset !== "No media"

  return (
    <div className="mt-3 space-y-3">
      <div className="rounded-lg border border-border bg-background p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <PlatformBadge platform={variant.platform} size="md" />
            <div>
              <p className="text-sm font-semibold text-foreground">{variant.account || "account"}</p>
              <p className="text-xs text-muted-foreground">
                {variant.platform} · {variant.format}
              </p>
            </div>
          </div>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-xs font-medium",
              mode === "auto" ? "bg-[oklch(0.95_0.05_150)] text-status-published" : "bg-[oklch(0.96_0.04_70)] text-[oklch(0.48_0.13_55)]",
            )}
          >
            {mode === "auto" ? "Auto publishing available" : "Manual fallback required"}
          </span>
        </div>

        <p className="mt-3 text-sm font-medium text-foreground">{variant.hook || "Untitled"}</p>
        <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{variant.body || "No copy yet."}</p>

        {showMedia ? (
          <div
            className="relative mt-3 flex items-center justify-center overflow-hidden rounded-md border border-border bg-muted text-xs text-muted-foreground"
            style={{ aspectRatio: ratio.replace(":", "/") }}
          >
            <span className="flex items-center">
              <ImageIcon className="mr-1.5 size-4" />
              {hasImage ? `${variant.mediaAsset} · ${ratio}` : `${variant.mediaAsset} placeholder · ${ratio}`}
            </span>
            {onRegenerateImage || onEditImage ? (
              <div className="absolute bottom-2 right-2 flex items-center gap-1.5">
                {onRegenerateImage ? (
                  <button
                    type="button"
                    onClick={onRegenerateImage}
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-background/90 px-2 py-1 text-xs font-medium text-foreground shadow-sm hover:bg-background"
                  >
                    <RefreshCw className="size-3" /> Regenerate
                  </button>
                ) : null}
                {onEditImage ? (
                  <button
                    type="button"
                    onClick={onEditImage}
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-background/90 px-2 py-1 text-xs font-medium text-foreground shadow-sm hover:bg-background"
                  >
                    <Pencil className="size-3" /> Modify
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mt-3 flex h-16 items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground">
            Text-only · no media
          </div>
        )}

        {variant.hashtags ? <p className="mt-2 text-xs text-status-scheduled">{variant.hashtags}</p> : null}
        {variant.cta ? (
          <div className="mt-3 space-y-1">
            <Button type="button" size="xs" className="bg-brand text-brand-foreground hover:bg-brand/90" onClick={() => onCtaPreview(variant.ctaUrl)}>
              {variant.cta}
            </Button>
            <p className="text-[11px] text-muted-foreground">
              {variant.ctaUrl?.trim()
                ? "CTA preview — links to the post destination, not an internal page."
                : "CTA preview — add a destination URL to make it actionable."}
            </p>
          </div>
        ) : null}
      </div>

      <div className="rounded-lg border border-border bg-card p-3">
        <p className="text-xs font-semibold text-foreground">Pre-publish checks</p>
        <ul className="mt-2 space-y-1.5">
          {checks.map((c) => (
            <li key={c.text} className="flex items-start gap-2 text-xs">
              {c.ok ? (
                <CircleCheck className="mt-0.5 size-3.5 shrink-0 text-status-published" />
              ) : (
                <Info className="mt-0.5 size-3.5 shrink-0 text-[oklch(0.48_0.13_55)]" />
              )}
              <span className={c.ok ? "text-muted-foreground" : "text-foreground"}>{c.text}</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-xs text-muted-foreground">Lightweight preview to compare platform differences — not a pixel-perfect replica.</p>
    </div>
  )
}
