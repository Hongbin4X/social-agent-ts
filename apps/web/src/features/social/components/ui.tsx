"use client"

import { cn } from "@/lib/utils"
import { X } from "lucide-react"
import type { ReactNode } from "react"
import type { Platform, PostStatus } from "@social/shared"

/* ---------- Platform identity ---------- */

const PLATFORM_META: Record<Platform, { label: string; short: string; className: string }> = {
  TikTok: { label: "TikTok", short: "TT", className: "bg-foreground text-background" },
  Instagram: { label: "Instagram", short: "IG", className: "bg-[oklch(0.55_0.2_18)] text-white" },
  YouTube: { label: "YouTube", short: "YT", className: "bg-[oklch(0.55_0.22_27)] text-white" },
  X: { label: "X", short: "X", className: "bg-foreground text-background" },
  Reddit: { label: "Reddit", short: "RD", className: "bg-[oklch(0.62_0.18_40)] text-white" },
  Facebook: { label: "Facebook", short: "FB", className: "bg-[oklch(0.5_0.18_255)] text-white" },
}

export function PlatformBadge({ platform, size = "sm" }: { platform: Platform; size?: "sm" | "md" }) {
  const m = PLATFORM_META[platform]
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-md font-semibold",
        m.className,
        size === "sm" ? "h-5 w-5 text-[10px]" : "h-7 w-7 text-xs",
      )}
      title={m.label}
      aria-label={m.label}
    >
      {m.short}
    </span>
  )
}

export function PlatformChip({
  platform,
  selected,
  onClick,
}: {
  platform: Platform
  selected?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
        selected
          ? "border-brand bg-brand-muted text-foreground"
          : "border-border bg-background text-muted-foreground hover:bg-muted",
      )}
    >
      <PlatformBadge platform={platform} />
      {PLATFORM_META[platform].label}
    </button>
  )
}

/* ---------- Status badge ---------- */

const STATUS_META: Record<PostStatus, { label: string; dot: string; text: string; bg: string }> = {
  Draft: { label: "Draft", dot: "bg-status-draft", text: "text-foreground", bg: "bg-muted" },
  Ready: { label: "Ready", dot: "bg-status-ready", text: "text-status-ready", bg: "bg-[oklch(0.95_0.03_240)]" },
  Planned: { label: "Planned", dot: "bg-status-planned", text: "text-status-planned", bg: "bg-brand-muted" },
  Scheduled: { label: "Scheduled", dot: "bg-status-scheduled", text: "text-status-scheduled", bg: "bg-[oklch(0.95_0.03_240)]" },
  Publishing: { label: "Publishing", dot: "bg-status-publishing", text: "text-[oklch(0.45_0.12_70)]", bg: "bg-[oklch(0.95_0.04_80)]" },
  Published: { label: "Published", dot: "bg-status-published", text: "text-status-published", bg: "bg-[oklch(0.95_0.05_150)]" },
  Failed: { label: "Failed", dot: "bg-status-failed", text: "text-status-failed", bg: "bg-[oklch(0.95_0.04_27)]" },
  Cancelled: { label: "Cancelled", dot: "bg-status-draft", text: "text-muted-foreground", bg: "bg-muted" },
  ManualFallback: { label: "Manual fallback", dot: "bg-status-fallback", text: "text-[oklch(0.48_0.13_55)]", bg: "bg-[oklch(0.96_0.04_70)]" },
  ManuallyPublished: { label: "Manually published", dot: "bg-status-manual", text: "text-status-manual", bg: "bg-[oklch(0.95_0.03_200)]" },
  Archived: { label: "Archived", dot: "bg-status-draft", text: "text-muted-foreground", bg: "bg-muted" },
}

export function StatusBadge({ status }: { status: PostStatus }) {
  const m = STATUS_META[status]
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium", m.bg, m.text)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", m.dot)} />
      {m.label}
    </span>
  )
}

/* ---------- Card ---------- */

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("rounded-lg border border-border bg-card", className)}>{children}</div>
}

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <h3 className="text-sm font-semibold text-foreground">{children}</h3>
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </div>
  )
}

/* ---------- Modal ---------- */

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  wide,
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children?: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "relative z-10 flex max-h-[88vh] w-full flex-col overflow-hidden rounded-lg border border-border bg-card shadow-xl",
          wide ? "max-w-2xl" : "max-w-md",
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">{title}</h2>
            {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>
        {children ? <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div> : null}
        {footer ? <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">{footer}</div> : null}
      </div>
    </div>
  )
}

/* ---------- Credits pill ---------- */

export function CreditsPill({ credits, kind = "estimated" }: { credits: number; kind?: "estimated" | "actual" }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground">
      <span className="h-1.5 w-1.5 rounded-full bg-brand" />
      {kind === "estimated" ? "Est. credits" : "Actual"}: <span className="text-foreground">{credits}</span>
    </span>
  )
}

/* ---------- Form fields ---------- */

export function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string
  hint?: string
  required?: boolean
  children: ReactNode
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-foreground">
        {label}
        {required ? <span className="ml-0.5 text-status-failed">*</span> : null}
      </span>
      {children}
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </label>
  )
}

const inputCls =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-brand focus:ring-2 focus:ring-brand/20"

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(inputCls, props.className)} />
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(inputCls, "min-h-20 resize-y", props.className)} />
}

export function Select({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={cn(inputCls, "cursor-pointer", props.className)}>
      {children}
    </select>
  )
}

/* ---------- Stat ---------- */

export function Stat({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <div className={cn("text-2xl font-semibold tabular-nums", tone)}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  )
}
