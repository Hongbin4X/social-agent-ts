"use client"

import type { ImageSlot, PostVariant } from "@social/shared"
import { insertImageToken, nextImageRef } from "@social/shared"
import { TextArea } from "@/features/social/components/ui"
import { useLang } from "@/features/social/i18n"
import { ImagePlus, RefreshCw, Pencil, Loader2 } from "lucide-react"

// 编辑区「配图槽」面板：位置在正文里挪 [[img:N]]，描述/出图在这里。
// 铁律2.5：出图是 AI 等待，用 status=generating 的转圈 + 文案给反馈。
export function ImageSlotPanel({
  current,
  onApplyEdit,
  onGenerate,
  onModify,
}: {
  current: PostVariant
  onApplyEdit: (patch: Partial<PostVariant>) => void
  onGenerate: (ref: number, description: string) => void
  onModify: (ref: number, description: string) => void
}) {
  const { t } = useLang()
  const slots = current.imageSlots ?? []

  const updateSlot = (ref: number, patch: Partial<ImageSlot>) =>
    onApplyEdit({ imageSlots: slots.map((s) => (s.ref === ref ? { ...s, ...patch } : s)) })

  const addSlot = () => {
    const ref = nextImageRef(slots)
    onApplyEdit({
      body: insertImageToken(current.body, ref),
      imageSlots: [...slots, { ref, description: "", status: "empty" }],
    })
  }

  const removeSlot = (ref: number) =>
    onApplyEdit({
      // 删槽同时从正文剥掉对应 token。
      body: current.body.replace(new RegExp(`\\n?\\[\\[img:${ref}\\]\\]\\n?`, "g"), "\n"),
      imageSlots: slots.filter((s) => s.ref !== ref),
    })

  return (
    <div className="mt-3 rounded-lg border border-border bg-card p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-foreground">{t("Images", "配图")}</p>
        <button
          type="button"
          onClick={addSlot}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground hover:bg-muted"
        >
          <ImagePlus className="size-3.5" /> {t("Add image slot", "插入配图")}
        </button>
      </div>

      {slots.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {t("No image placeholders. Add one to insert [[img:N]] in the body.", "暂无配图占位。点上方按钮在正文插入 [[img:N]]。")}
        </p>
      ) : (
        <ul className="mt-2 space-y-3">
          {slots.map((s) => (
            <li key={s.ref} className="rounded-md border border-border p-2">
              <div className="flex items-center justify-between">
                <span className="rounded bg-brand-muted px-1.5 py-0.5 text-[11px] font-semibold text-brand">[[img:{s.ref}]]</span>
                <button type="button" onClick={() => removeSlot(s.ref)} className="text-[11px] text-muted-foreground hover:text-foreground">
                  {t("Remove", "删除")}
                </button>
              </div>
              <TextArea
                className="mt-2 min-h-16 text-xs"
                value={s.description}
                onChange={(e) => updateSlot(s.ref, { description: e.target.value })}
                placeholder={t("Describe this image: subject, composition, style, colors…", "描述这张图：主体、构图、风格、色调…")}
              />
              {s.url ? (
                // 用户内容动态 URL，用原生 img（eslint-disable-next-line 必须独占一行才会生效，见 preview-card.tsx 同款写法）。
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.url} alt={`img ${s.ref}`} className="mt-2 max-h-40 w-full rounded object-cover" />
              ) : null}
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  disabled={s.status === "generating" || !s.description.trim()}
                  onClick={() => onGenerate(s.ref, s.description)}
                  className="inline-flex items-center gap-1 rounded-md bg-brand px-2 py-1 text-xs font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
                >
                  {s.status === "generating" ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
                  {s.status === "generating"
                    ? t("Generating…", "生成中…")
                    : s.url
                      ? t("Regenerate", "重新生成")
                      : t("Generate", "生成配图")}
                </button>
                {s.url ? (
                  <button
                    type="button"
                    onClick={() => onModify(s.ref, s.description)}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground hover:bg-muted"
                  >
                    <Pencil className="size-3" /> {t("Modify", "修改")}
                  </button>
                ) : null}
                {s.status === "failed" ? <span className="text-[11px] text-status-failed">{t("Failed", "失败")}</span> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
