"use client"

import type { PostVariant } from "@social/shared"
import { splitBodyByImageTokens, stripImageTokens } from "@social/shared"
import { Button } from "@/components/ui/button"
import { PlatformBadge } from "@/features/social/components/ui"
import { useLang } from "@/features/social/i18n"
import { cn } from "@/lib/utils"
import { CircleCheck, ImageIcon, Info, Pencil, RefreshCw } from "lucide-react"
import { deriveMode, ratioOf, validations } from "./helpers"
import { PlatformFrame } from "./platform-frames"

/* ---------- preview ---------- */
export function PreviewCard({
  variant,
  hasImage,
  onRegenerateImage,
  onEditImage,
  onGenerateSlot,
}: {
  variant: PostVariant
  hasImage: boolean
  onRegenerateImage?: () => void
  onEditImage?: () => void
  /** 按槽出图（正文内联配图占位卡的 Generate 按钮）；不传则占位卡不显示按钮。 */
  onGenerateSlot?: (ref: number) => void
}) {
  const { t } = useLang()
  const mode = deriveMode(variant)
  const checks = validations(variant)
  const ratio = ratioOf(variant.format)
  const showMedia = variant.mediaAsset !== "No media"
  // 有 imageSlots 时走「正文按 token 内联渲染」新路径；无 slots 时维持旧的单媒体块（向后兼容旧数据/非 image 帖子）。
  const slots = variant.imageSlots ?? []

  // X 走【真实发布效果】单一预览：不再叠一个编辑态卡片（那会把同一素材画两遍，用户 2026-07-15 反馈
  // "会把素材显示两遍，我只需要预览真实发表时候的效果"）。配图的生成/重出控件挪到下方独立的「素材」区——
  // 它是【操作区】不是第二个预览，不会造成"两个版本"的困惑。
  const isX = variant.platform === "X"
  // 只有"还需要动手"的槽才需要操作入口：已 ready 的图上方真实预览已经画了。
  const pendingSlots = slots.filter((sl) => sl.status !== "ready" || !sl.url)

  return (
    <div className="mt-3 space-y-3">
      {isX ? (
        <XLivePreview variant={variant} />
      ) : (
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
            {mode === "auto" ? t("Auto publishing available", "支持自动发布") : t("Auto publishing unsupported", "不支持自动发布")}
          </span>
        </div>

        <p className="mt-3 text-sm font-medium text-foreground">{variant.hook || t("Untitled", "未命名")}</p>
        {/* 正文渲染分两条路径：
            - 有 imageSlots：按 [[img:N]] token 顺序内联渲染——文本段落 + 每个槽（ready 真图 / 否则描述占位卡 + Generate 按钮），
              所见即发布（token 本身不会作为文字出现，因为 splitBodyByImageTokens 已把它拆成独立的 image 段）。
            - 无 imageSlots：维持旧的单段纯文本渲染（向后兼容旧数据 / 非 image 模式生成的帖子）。 */}
        {slots.length > 0 ? (
          <div className="mt-1 space-y-2">
            {splitBodyByImageTokens(variant.body).map((seg, i) =>
              seg.type === "text" ? (
                seg.text.trim() ? (
                  <p key={i} className="whitespace-pre-line text-sm text-muted-foreground">
                    {seg.text.trim()}
                  </p>
                ) : null
              ) : (
                <SlotPreview
                  key={i}
                  slot={slots.find((s) => s.ref === seg.ref)}
                  ratio={ratio}
                  onGenerate={onGenerateSlot}
                />
              ),
            )}
          </div>
        ) : (
          // FIX 2（无 slots 分支也会漏 token）：模型偶尔会吐出 [[img:N]] 但没配套生成 imageSlots，
          // 这条旧的纯文本渲染路径不做按 token 分段，必须先剥离 token 再展示，否则会当成字面文案泄漏给用户。
          <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{stripImageTokens(variant.body) || t("No copy yet.", "尚无文案。")}</p>
        )}

        {slots.length === 0 && showMedia ? (
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
        ) : slots.length === 0 ? (
          <div className="mt-3 flex h-16 items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground">
            {t("Text-only · no media", "纯文本 · 无媒体")}
          </div>
        ) : null}

        {variant.hashtags ? <p className="mt-2 text-xs text-status-scheduled">{variant.hashtags}</p> : null}
      </div>
      )}

      {/* 待生成的配图（仅 X）—— 这是【操作区】，不是第二个预览。
          只列【还需要动手的槽】（未生成 / 失败 / 生成中）：
          已 ready 的图在上方真实预览里已经画出来了，这里再画一遍就是"素材显示两遍"
          （用户 2026-07-15 连着指出两次的同一个毛病：我只是把重复挪了个位置）。
          全部出完图后本区自动消失——没有待办就不该占地方。 */}
      {isX && pendingSlots.length > 0 ? (
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-xs font-semibold text-foreground">
            {t(`Images to generate (${pendingSlots.length})`, `待生成配图（${pendingSlots.length} 张）`)}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {t("Generated images are attached below the text — X has no inline images.", "生成后统一附在正文下方 —— X 不支持内联图。")}
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {pendingSlots.map((sl) => (
              <SlotPreview key={sl.ref} slot={sl} ratio={ratio} onGenerate={onGenerateSlot} />
            ))}
          </div>
        </div>
      ) : null}

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

/* ---------- 正文内联配图槽：ready 显示真图，否则显示描述 + Generate 占位卡 ---------- */
function SlotPreview({
  slot,
  ratio,
  onGenerate,
}: {
  slot?: import("@social/shared").ImageSlot
  ratio: string
  onGenerate?: (ref: number) => void
}) {
  const { t } = useLang()
  // 防御：正文里有 token 但 imageSlots 里找不到对应 ref（理论上不该发生），不渲染任何东西而不是崩溃。
  if (!slot) return null
  return (
    <div
      className="relative flex items-center justify-center overflow-hidden rounded-md border border-border bg-muted text-xs text-muted-foreground"
      style={{ aspectRatio: ratio.replace(":", "/") }}
    >
      {slot.url ? (
        // 真实生成的图片（本地 FS 经 /media 反代）。用户内容动态 URL，用原生 img。
        // eslint-disable-next-line @next/next/no-img-element
        <img src={slot.url} alt={`img ${slot.ref}`} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="flex flex-col items-center gap-1 p-2 text-center">
          <span className="font-medium">[[img:{slot.ref}]] · {ratio}</span>
          <span className="line-clamp-2 opacity-80">{slot.description || t("No description yet", "尚无描述")}</span>
          {onGenerate ? (
            <button
              type="button"
              disabled={slot.status === "generating" || !slot.description.trim()}
              onClick={() => onGenerate(slot.ref)}
              className="mt-1 rounded-md bg-brand px-2 py-0.5 text-[11px] font-medium text-brand-foreground disabled:opacity-50"
            >
              {/* 铁律2.5：生成中要有过程态文案，不能让用户以为卡死。 */}
              {slot.status === "generating" ? t("Generating…", "生成中…") : t("Generate", "生成配图")}
            </button>
          ) : null}
        </div>
      )}
    </div>
  )
}

/**
 * X 的「真实发布效果」预览 —— 直接复用 PlatformFrame（它内部已按 xPostType 分流成
 * 普通推 / 串推 / Article 三种渲染，且分段与配图分配来自与发布层同源的 planXTweets）。
 *
 * 放在编辑态卡片【上方】：用户改文案/切形态 → 立刻看到会发成几条、每条长什么样。
 * 2026-07-15：此前右侧只有编辑态卡片，它按 imageSlots 渲染、完全不看 xPostType，
 * 所以切「普通推/串推/Article」毫无反应（我第一次还改错了对象——改的是内容库弹窗用的那个）。
 */
function XLivePreview({ variant }: { variant: PostVariant }) {
  const { t } = useLang()
  const label =
    variant.xPostType === "thread"
      ? t("Thread", "串推")
      : variant.xPostType === "article"
        ? t("Article", "长文")
        : t("Single tweet", "普通推文")
  return (
    <div className="rounded-lg border border-brand/30 bg-brand-muted/30 p-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-brand-muted-foreground">
        <CircleCheck className="size-3.5" />
        {t(`Live preview · ${label}`, `真实发布效果 · ${label}`)}
      </p>
      <PlatformFrame variant={variant} />
    </div>
  )
}
