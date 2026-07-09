"use client"

import type { PostVariant } from "@social/shared"
import { Button } from "@/components/ui/button"
import { PlatformBadge } from "@/features/social/components/ui"
import { useLang } from "@/features/social/i18n"
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
  const { t } = useLang()
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
              <p className="text-sm font-semibold text-foreground">{variant.account || t("account", "账号")}</p>
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
            {mode === "auto" ? t("Auto publishing available", "支持自动发布") : t("Manual fallback required", "需转手动发布")}
          </span>
        </div>

        <p className="mt-3 text-sm font-medium text-foreground">{variant.hook || t("Untitled", "未命名")}</p>
        <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{variant.body || t("No copy yet.", "尚无文案。")}</p>

        {showMedia ? (
          <div
            className="relative mt-3 flex items-center justify-center overflow-hidden rounded-md border border-border bg-muted text-xs text-muted-foreground"
            style={{ aspectRatio: ratio.replace(":", "/") }}
          >
            {variant.mediaUrl ? (
              // 真实生成的图片（本地 FS 经 /media 反代）。用户内容动态 URL，用原生 img。
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={variant.mediaUrl}
                alt={t("Generated image", "生成的图片")}
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <span className="flex items-center">
                <ImageIcon className="mr-1.5 size-4" />
                {hasImage ? `${variant.mediaAsset} · ${ratio}` : `${variant.mediaAsset} ${t("placeholder", "占位图")} · ${ratio}`}
              </span>
            )}
            {onRegenerateImage || onEditImage ? (
              <div className="absolute bottom-2 right-2 flex items-center gap-1.5">
                {onRegenerateImage ? (
                  <button
                    type="button"
                    onClick={onRegenerateImage}
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-background/90 px-2 py-1 text-xs font-medium text-foreground shadow-sm hover:bg-background"
                  >
                    <RefreshCw className="size-3" /> {t("Regenerate", "重新生成")}
                  </button>
                ) : null}
                {onEditImage ? (
                  <button
                    type="button"
                    onClick={onEditImage}
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-background/90 px-2 py-1 text-xs font-medium text-foreground shadow-sm hover:bg-background"
                  >
                    <Pencil className="size-3" /> {t("Modify", "修改")}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mt-3 flex h-16 items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground">
            {t("Text-only · no media", "纯文本 · 无媒体")}
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
                ? t("CTA preview — links to the post destination, not an internal page.", "CTA 预览 — 跳转至帖子的目标链接，而非站内页面。")
                : t("CTA preview — add a destination URL to make it actionable.", "CTA 预览 — 添加目标链接后即可点击跳转。")}
            </p>
          </div>
        ) : null}
      </div>

      <div className="rounded-lg border border-border bg-card p-3">
        <p className="text-xs font-semibold text-foreground">{t("Pre-publish checks", "发布前检查")}</p>
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

      <p className="text-xs text-muted-foreground">{t("Lightweight preview to compare platform differences — not a pixel-perfect replica.", "轻量预览，用于对比各平台差异 — 并非像素级还原。")}</p>
    </div>
  )
}
