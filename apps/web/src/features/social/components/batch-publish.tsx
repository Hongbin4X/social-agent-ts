"use client"

import { Button } from "@/components/ui/button"
import { CreditsPill, Modal, PlatformBadge } from "@/features/social/components/ui"
import { useLang } from "@/features/social/i18n"
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
  const { t } = useLang()
  const autoCount = variants.filter((v) => v.publishMode === "auto").length
  const manualCount = variants.length - autoCount

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={t("Confirm publishing", "确认发布")}
      description={`${topic} · ${t(`${variants.length} platform${variants.length === 1 ? "" : "s"}`, `${variants.length} 个平台`)}`}
      footer={
        <>
          <div className="mr-auto flex items-center gap-2 text-xs text-muted-foreground">
            <CreditsPill credits={12} />
            <span>{t("Provider cost applies per auto publish", "每次自动发布按服务商成本计费")}</span>
          </div>
          <Button variant="outline" size="sm" onClick={onClose}>
            {t("Cancel", "取消")}
          </Button>
          <Button size="sm" className="bg-brand text-brand-foreground hover:bg-brand/90" onClick={onConfirm}>
            {t("Confirm schedule", "确认排期")}
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
                    {v.platform} · {v.account || t("No account", "未绑定账号")}
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
                {auto ? t("Auto publishing available", "支持自动发布") : t("Manual fallback required", "需转为手动发布")}
              </span>
            </div>
          )
        })}
      </div>
      {manualCount > 0 ? (
        <p className="mt-3 rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          {t(
            `${manualCount} platform${manualCount === 1 ? "" : "s"} cannot auto-publish in P0 and will enter`,
            `${manualCount} 个平台在 P0 阶段无法自动发布，将转入`,
          )}{" "}
          <span className="font-medium text-[oklch(0.48_0.13_55)]">{t("Manual fallback", "转手动")}</span>
          {t(
            ". You can still confirm — auto platforms become Scheduled.",
            "。你仍可确认——可自动发布的平台将变为已排期。",
          )}
        </p>
      ) : null}
    </Modal>
  )
}
