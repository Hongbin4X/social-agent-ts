"use client"

import { useEffect, useMemo, useState } from "react"
import { useSocial } from "@/features/social/store"
import { useLang } from "@/features/social/i18n"
import { VARIANT_STATE_LABELS } from "@/features/social/i18n/labels"
import { ALL_PLATFORMS, type Platform, type PostVariant } from "@social/shared"
import { Button } from "@/components/ui/button"
import {
  CreditsPill,
  Field,
  Modal,
  PlatformBadge,
  PlatformChip,
  SectionTitle,
  Select,
  TextArea,
  TextInput,
} from "@/features/social/components/ui"
import { BatchPublishModal } from "@/features/social/components/batch-publish"
import { cn } from "@/lib/utils"
import {
  ArrowLeft,
  ArrowRight,
  CalendarPlus,
  CircleCheck,
  Loader2,
  Save,
  Send,
  Sparkles,
  Wand2,
  X,
} from "lucide-react"
import { PreviewCard } from "./preview-card"
import { ImageSlotPanel } from "./image-slot-panel"
import { DAYS, FORMAT_PRESETS, MEDIA_OPTIONS, STATE_META, copyTypeLabel, deriveMode, deriveState } from "./helpers"

/* ---------- step-by-step create wizard ---------- */
const WIZARD_STEPS = ["Draft", "Customize per network", "Schedule"] as const
const WIZARD_STEP_ZH: Record<(typeof WIZARD_STEPS)[number], string> = {
  Draft: "草稿",
  "Customize per network": "按平台定制",
  Schedule: "排期",
}

export function CreatePostWizard({
  open,
  onClose,
  initialStep = 0,
}: {
  open: boolean
  onClose: () => void
  // 打开时停在哪一步。二次修改传 1（=STEP 2 编辑窗口）；全新创作用默认 0。
  initialStep?: 0 | 1 | 2
}) {
  const {
    studio,
    accounts,
    setStudioTopic,
    setStudioPlatforms,
    generateImage,
    generateVariants,
    startManualVariants,
    updateVariant,
    saveStudioToLibrary,
    addStudioToCalendar,
    schedulePost,
    pushToast,
  } = useSocial()
  const { t, te } = useLang()

  const [step, setStep] = useState<0 | 1 | 2>(0)
  const [creationMethod, setCreationMethod] = useState<"agent" | "manual">("agent")
  const [genModes, setGenModes] = useState<Array<"copy" | "image" | "video">>(["copy"])
  const toggleGenMode = (k: "copy" | "image" | "video") =>
    setGenModes((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]))
  const [imageEditOpen, setImageEditOpen] = useState(false)
  const [imageEditPrompt, setImageEditPrompt] = useState("")
  // 按槽「修改」时暂存目标槽 ref + 描述，供 Modify 弹窗确认时一并带上 slotRef/description 出图；
  // 不设置（null）时走旧的整贴 mediaUrl 修改逻辑（复用同一个弹窗 UI）。
  const [modifySlot, setModifySlot] = useState<{ ref: number; description: string } | null>(null)
  const [activeVariant, setActiveVariant] = useState<Platform | null>(null)
  const [paid, setPaid] = useState<{ label: string; credits: number; run: () => void } | null>(null)
  const [showVariantsConfirm, setShowVariantsConfirm] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [showBatch, setShowBatch] = useState(false)
  const [ctaPreview, setCtaPreview] = useState<string | null>(null)
  const [scheduleMode, setScheduleMode] = useState<"now" | "later">("now")
  const [calDate, setCalDate] = useState(DAYS[2])
  const [calTime, setCalTime] = useState("09:00")

  useEffect(() => {
    if (open) {
      setStep(initialStep)
      setCreationMethod("agent")
      setScheduleMode("now")
      setGenerating(false)
      if (initialStep === 1) {
        // 二次修改直达编辑窗口：激活首个平台让 current 解析到；按已有内容推导 genModes，
        // 有配图槽则含 image，保证配图槽面板(genModes.includes("image") 才显示)可见、可继续改图。
        setActiveVariant(studio.platforms[0] ?? null)
        const hasImageSlots = studio.variants.some((v) => (v.imageSlots ?? []).length > 0)
        setGenModes(hasImageSlots ? ["copy", "image"] : ["copy"])
      } else {
        setActiveVariant(null)
      }
    }
    // studio/initialStep 只在 open 由 false→true 的那一刻读取（此时 studio 已由调用方灌好），故意不进依赖数组。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const variants = studio.variants
  const current = variants.find((v) => v.platform === activeVariant) ?? variants[0] ?? null
  const hasSchedulable = variants.some((v) => v.state === "Valid" || v.state === "Manual fallback")

  const togglePlatform = (p: Platform) =>
    setStudioPlatforms(studio.platforms.includes(p) ? studio.platforms.filter((x) => x !== p) : [...studio.platforms, p])

  const handleCtaPreview = (url?: string) => {
    if (url && url.trim()) setCtaPreview(url.trim())
    else pushToast(t("This is a mock CTA preview. Add a destination URL in Brand Profile to make it actionable.", "这是模拟的 CTA 预览。在品牌档案里填写目标链接即可让它真正可点。"), "warn")
  }

  const accountOptions = useMemo(() => {
    if (!current) return [] as { name: string; type: "manual" | "connected" }[]
    const platformAccts = accounts.filter((a) => a.platform === current.platform).map((a) => ({ name: a.name, type: a.type }))
    const opts = [...platformAccts]
    if (!opts.some((o) => o.type === "manual")) opts.push({ name: "Manual paste account", type: "manual" })
    if (!opts.some((o) => o.name === current.account)) opts.unshift({ name: current.account, type: current.accountType ?? "manual" })
    return opts
  }, [accounts, current])

  const applyEdit = (patch: Partial<PostVariant>) => {
    if (!current) return
    const merged = { ...current, ...patch }
    updateVariant(current.platform, { ...patch, publishMode: deriveMode(merged), state: deriveState(merged) })
  }

  const runGenerateVariants = async () => {
    setShowVariantsConfirm(false)
    setGenerating(true)
    setStep(1)
    try {
      // 透传用户选中的生成模式（copy/image/video），后端据此决定是否顺带起草配图槽/视频素材。
      await generateVariants(genModes)
      setActiveVariant(studio.platforms[0] ?? null)
    } finally {
      setGenerating(false)
    }
  }

  const goToCustomize = () => {
    if (creationMethod === "manual") {
      startManualVariants()
      setActiveVariant(studio.platforms[0] ?? null)
      setStep(1)
      return
    }
    if (variants.length === 0) setShowVariantsConfirm(true)
    else setStep(1)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("Create content", "创作内容")}
        className="relative z-10 flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-border bg-card shadow-xl"
      >
        {/* header + stepper */}
        <header className="flex items-center justify-between gap-4 border-b border-border px-5 py-3.5">
          <div className="flex items-center gap-4">
            <h2 className="text-base font-semibold text-foreground">{t("Create content", "创作内容")}</h2>
            <ol className="hidden items-center gap-2 md:flex">
              {WIZARD_STEPS.map((label, i) => (
                <li key={label} className="flex items-center gap-2">
                  <span
                    className={cn(
                      "flex size-5 items-center justify-center rounded-full text-[11px] font-semibold",
                      i === step
                        ? "bg-brand text-brand-foreground"
                        : i < step
                          ? "bg-brand-muted text-brand"
                          : "bg-muted text-muted-foreground",
                    )}
                  >
                    {i < step ? <CircleCheck className="size-3.5" /> : i + 1}
                  </span>
                  <span className={cn("text-xs font-medium", i === step ? "text-foreground" : "text-muted-foreground")}>{t(label, WIZARD_STEP_ZH[label])}</span>
                  {i < WIZARD_STEPS.length - 1 ? <span className="h-px w-6 bg-border" /> : null}
                </li>
              ))}
            </ol>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label={t("Close", "关闭")}>
            <X className="size-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* STEP 1 — draft */}
          {step === 0 && (
            <div className="mx-auto max-w-2xl space-y-4 p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t("Creation method", "创作方式")}>
                  <div className="grid grid-cols-2 gap-1.5">
                    {([["agent", "Agent-assisted", "AI 辅助"], ["manual", "Write manually", "手动撰写"]] as const).map(([k, en, zh]) => (
                      <button
                        key={k}
                        onClick={() => setCreationMethod(k)}
                        className={cn(
                          "rounded-md border px-2 py-2 text-xs font-medium",
                          creationMethod === k ? "border-brand bg-brand-muted text-brand-muted-foreground" : "border-border text-muted-foreground hover:bg-muted",
                        )}
                      >
                        {t(en, zh)}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label={t("Generation mode", "生成模式")} hint={t("Select one or more", "可多选")}>
                  <div className="grid grid-cols-3 gap-1.5">
                    {([["copy", "Copy", "文案"], ["image", "Image", "图片"], ["video", "Video", "视频"]] as const).map(([k, en, zh]) => {
                      const selected = genModes.includes(k) && creationMethod !== "manual"
                      return (
                        <button
                          key={k}
                          onClick={() => toggleGenMode(k)}
                          disabled={creationMethod === "manual"}
                          className={cn(
                            "rounded-md border px-2 py-2 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50",
                            selected
                              ? "border-brand bg-brand-muted text-brand-muted-foreground"
                              : "border-border text-muted-foreground hover:bg-muted",
                          )}
                        >
                          {t(en, zh)}
                        </button>
                      )
                    })}
                  </div>
                </Field>
              </div>

              <Field label={t("Topic", "主题")}>
                <TextArea
                  value={studio.topic}
                  onChange={(e) => setStudioTopic(e.target.value)}
                  disabled={creationMethod === "manual"}
                  placeholder={
                    creationMethod === "manual"
                      ? t("Manual mode — you'll write the copy for each network in the next step.", "手动模式——下一步你将为每个平台自行撰写文案。")
                      : t(
                          "So, what do you want to post? A product rave, a launch teaser, an event warm-up — the more product detail you share, the sharper the AI writes.\ne.g. Write a rave for my “quiet bladeless fan” — safe for babies and low-noise for all-night sleep — in a professional-yet-witty tone, ending with a nudge to comment.",
                          "聊聊你想发点什么？不管是单品种草、新品剧透还是活动预热，多透露一点产品细节，AI 会写得更准。\n例如：帮我的“智能静音无叶风扇”写篇种草文，主打母婴安全、低噪整夜好眠，语气专业幽默，文末引导评论。",
                        )
                  }
                  className={cn("min-h-24", creationMethod === "manual" && "cursor-not-allowed bg-muted text-muted-foreground")}
                />
              </Field>

              <Field label={t("Platforms", "平台")}>
                <div className="flex flex-wrap gap-1.5">
                  {ALL_PLATFORMS.map((p) => (
                    <PlatformChip key={p} platform={p} selected={studio.platforms.includes(p)} onClick={() => togglePlatform(p)} />
                  ))}
                </div>
              </Field>

              <p className="text-xs text-muted-foreground">
                {creationMethod === "manual"
                  ? t("You'll compose and format the copy yourself for each network. Image generation stays available in the next step.", "你将为每个平台自行撰写并排版文案；下一步仍可生成图片。")
                  : t("The agent drafts per-network copy, images, and short video assets based on your selected generation modes.", "AI 会按你选择的生成模式，为各平台起草文案、图片与短视频素材。")}
              </p>
            </div>
          )}

          {/* STEP 2 — customize per network */}
          {step === 1 && (
            <div className="p-5">
              {generating ? (
                <div className="flex flex-col items-center gap-2 py-16 text-center">
                  <Loader2 className="size-5 animate-spin text-brand" />
                  <p className="text-sm font-medium text-foreground">{t("Generating variants…", "正在生成内容变体…")}</p>
                  <p className="text-sm text-muted-foreground">{t(`Drafting per-platform copy for ${studio.platforms.length} platforms.`, `正在为 ${studio.platforms.length} 个平台起草文案。`)}</p>
                </div>
              ) : variants.length === 0 || !current ? (
                <div className="flex flex-col items-center gap-2 py-16 text-center">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-brand-muted text-brand">
                    <Sparkles className="size-4" />
                  </span>
                  <p className="text-sm font-medium text-foreground">{t("No variants yet", "还没有内容变体")}</p>
                  <p className="max-w-xs text-sm text-muted-foreground">{t("Go back and generate variants to customize each network.", "返回上一步生成变体，即可逐个平台定制。")}</p>
                </div>
              ) : (
                <div className="grid gap-5 lg:grid-cols-2">
                  {/* left — accounts + editor */}
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                      {variants.map((v) => {
                        const active = current.platform === v.platform
                        return (
                          <button
                            key={v.platform}
                            onClick={() => setActiveVariant(v.platform)}
                            className={cn(
                              "relative rounded-lg border p-1 transition-colors",
                              active ? "border-brand ring-2 ring-brand/20" : "border-border hover:bg-muted",
                            )}
                            title={v.platform}
                            aria-label={v.platform}
                          >
                            <PlatformBadge platform={v.platform} size="md" />
                            <span className={cn("absolute -right-0.5 -top-0.5 size-2 rounded-full", STATE_META[v.state].cls)} />
                          </button>
                        )
                      })}
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium", STATE_META[current.state].cls)}>
                        {(() => {
                          const Icon = STATE_META[current.state].icon
                          return <Icon className="size-3" />
                        })()}
                        {te(VARIANT_STATE_LABELS[current.state])}
                      </span>
                      <span className="text-xs font-medium text-muted-foreground">{copyTypeLabel(current)}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <Field label={t("Account", "账号")}>
                        <Select
                          value={current.account}
                          onChange={(e) => {
                            const opt = accountOptions.find((o) => o.name === e.target.value)
                            applyEdit({ account: e.target.value, accountType: opt?.type ?? "manual" })
                          }}
                        >
                          {accountOptions.map((o) => (
                            <option key={o.name} value={o.name}>
                              {o.name} {o.type === "connected" ? t("· connected", "· 已连接") : t("· manual", "· 手动")}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label={t("Format preset", "格式预设")}>
                        <Select value={current.format} onChange={(e) => applyEdit({ format: e.target.value })}>
                          {FORMAT_PRESETS[current.platform].map((f) => (
                            <option key={f} value={f}>
                              {f}
                            </option>
                          ))}
                          {!FORMAT_PRESETS[current.platform].includes(current.format) ? <option value={current.format}>{current.format}</option> : null}
                        </Select>
                      </Field>
                    </div>

                    <Field label={t("Hook / title", "钩子 / 标题")}>
                      <TextInput value={current.hook} onChange={(e) => applyEdit({ hook: e.target.value })} />
                    </Field>
                    <Field label={copyTypeLabel(current)}>
                      <TextArea
                        value={current.body}
                        onChange={(e) => applyEdit({ body: e.target.value })}
                        autoFocus={creationMethod === "manual"}
                        placeholder={
                          creationMethod === "manual"
                            ? t(`Write your ${copyTypeLabel(current).toLowerCase()} here…`, `在此撰写${copyTypeLabel(current)}…`)
                            : undefined
                        }
                      />
                    </Field>

                    {/* 配图槽面板：仅在生成模式含 image 时展示（沿用 genModes 选择，与「生成模式」一致）。 */}
                    {genModes.includes("image") && current ? (
                      <ImageSlotPanel
                        current={current}
                        onApplyEdit={applyEdit}
                        onGenerate={(ref, description) =>
                          setPaid({
                            label: t("Generate image", "生成配图"),
                            credits: 30,
                            run: () =>
                              generateImage({
                                platform: current.platform,
                                format: current.format,
                                hook: current.hook,
                                body: current.body,
                                mediaAsset: current.mediaAsset,
                                slotRef: ref,
                                description,
                              }),
                          })
                        }
                        onModify={(ref, description) => {
                          setActiveVariant(current.platform)
                          setImageEditPrompt("")
                          // 复用现有 Modify 弹窗：把目标槽 ref/描述暂存，弹窗确认时带 instruction + slotRef 出图。
                          setModifySlot({ ref, description })
                          setImageEditOpen(true)
                        }}
                      />
                    ) : null}

                    <div className="grid grid-cols-2 gap-3">
                      <Field label={t("Hashtags", "话题标签")}>
                        <TextInput value={current.hashtags} onChange={(e) => applyEdit({ hashtags: e.target.value })} />
                      </Field>
                      <Field label={t("CTA label", "CTA 文案")}>
                        <TextInput value={current.cta} onChange={(e) => applyEdit({ cta: e.target.value })} placeholder={t("Start your free trial", "开始免费试用")} />
                      </Field>
                      <Field label={t("CTA destination URL", "CTA 目标链接")}>
                        <TextInput value={current.ctaUrl ?? ""} onChange={(e) => applyEdit({ ctaUrl: e.target.value })} placeholder="https://your-product.com" />
                      </Field>
                      <Field label={t("Media asset", "媒体素材")}>
                        <Select value={current.mediaAsset ?? "No media"} onChange={(e) => applyEdit({ mediaAsset: e.target.value })}>
                          {MEDIA_OPTIONS[current.platform].map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                          {current.mediaAsset && !MEDIA_OPTIONS[current.platform].includes(current.mediaAsset) ? (
                            <option value={current.mediaAsset}>{current.mediaAsset}</option>
                          ) : null}
                        </Select>
                      </Field>
                      {/* Publish time 已移除：排期统一在 Step 3（Schedule）配置，Step 2 不再重复暴露编辑口。
                          底层 variant.suggestedTime 仍保留默认值，供批量发布确认弹窗与日历任务显示用。 */}
                    </div>
                  </div>

                  {/* right — preview */}
                  <div>
                    <SectionTitle hint={t("Mock preview", "模拟预览")}>{t("Post preview", "帖子预览")}</SectionTitle>
                    <PreviewCard
                      variant={current}
                      hasImage={studio.imageGenerated}
                      onCtaPreview={handleCtaPreview}
                      onRegenerateImage={() =>
                        setPaid({
                          label: t("Regenerate image", "重新生成图片"),
                          credits: 30,
                          run: () =>
                            generateImage({
                              platform: current.platform,
                              format: current.format,
                              hook: current.hook,
                              body: current.body,
                              mediaAsset: current.mediaAsset,
                            }),
                        })
                      }
                      onEditImage={() => {
                        setImageEditPrompt("")
                        // 整贴（非按槽）修图：清掉可能残留的 modifySlot，避免误把上一次按槽修改的 slotRef 带过来。
                        setModifySlot(null)
                        setImageEditOpen(true)
                      }}
                      onGenerateSlot={(ref) => {
                        // 正文占位卡的 Generate 按钮：与 ImageSlotPanel 的按槽出图走同一路径——
                        // 付费确认（30cr）后 generateImage 带 slotRef + description 定向出该槽的图。
                        const slot = current.imageSlots?.find((s) => s.ref === ref)
                        if (!slot) return
                        setPaid({
                          label: t("Generate image", "生成配图"),
                          credits: 30,
                          run: () =>
                            generateImage({
                              platform: current.platform,
                              format: current.format,
                              hook: current.hook,
                              body: current.body,
                              mediaAsset: current.mediaAsset,
                              slotRef: ref,
                              description: slot.description,
                            }),
                        })
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 3 — schedule */}
          {step === 2 && (
            <div className="mx-auto max-w-xl space-y-4 p-5">
              <div className="rounded-lg border border-border bg-muted/40 p-4">
                <p className="text-sm font-medium text-foreground">{studio.topic || t("Untitled topic", "未命名主题")}</p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {variants.map((v) => (
                    <span key={v.platform} className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-1.5 py-0.5 text-xs text-foreground">
                      <PlatformBadge platform={v.platform} />
                      {v.platform}
                    </span>
                  ))}
                </div>
              </div>

              <Field label={t("When", "时间")}>
                <div className="grid grid-cols-2 gap-2">
                  {([["now", "Publish now", "立即发布"], ["later", "Schedule for later", "定时发布"]] as const).map(([k, en, zh]) => (
                    <button
                      key={k}
                      onClick={() => setScheduleMode(k)}
                      className={cn(
                        "rounded-md border px-3 py-2 text-sm font-medium",
                        scheduleMode === k ? "border-brand bg-brand-muted text-brand-muted-foreground" : "border-border text-muted-foreground hover:bg-muted",
                      )}
                    >
                      {t(en, zh)}
                    </button>
                  ))}
                </div>
              </Field>

              {scheduleMode === "later" ? (
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t("Day", "日期")}>
                    <Select value={calDate} onChange={(e) => setCalDate(e.target.value)}>
                      {DAYS.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label={t("Time", "时间")}>
                    <TextInput value={calTime} onChange={(e) => setCalTime(e.target.value)} />
                  </Field>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t("Auto platforms publish immediately; manual platforms appear as a manual fallback for you to post.", "自动平台会立即发布；手动平台会进入手动兜底，供你自行发布。")}
                </p>
              )}
            </div>
          )}
        </div>

        {/* footer */}
        <footer className="flex items-center justify-between gap-2 border-t border-border px-5 py-3">
          <div>
            {step > 0 ? (
              <Button variant="outline" size="sm" onClick={() => setStep((s) => (s - 1) as 0 | 1 | 2)}>
                <ArrowLeft className="size-4" /> {t("Back", "上一步")}
              </Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={onClose}>
                {t("Cancel", "取消")}
              </Button>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {step === 0 && (
              <Button
                size="sm"
                className="bg-brand text-brand-foreground hover:bg-brand/90"
                disabled={studio.platforms.length === 0 || generating}
                onClick={goToCustomize}
              >
                {creationMethod === "manual" ? (
                  <>
                    {t("Continue to write", "继续撰写")} <ArrowRight className="size-4" />
                  </>
                ) : variants.length === 0 ? (
                  <>
                    <Wand2 className="size-4" /> {t("Generate & customize", "生成并定制")}
                  </>
                ) : (
                  <>
                    {t("Customize for each network", "逐平台定制")} <ArrowRight className="size-4" />
                  </>
                )}
              </Button>
            )}
            {step === 1 && (
              <Button
                size="sm"
                className="bg-brand text-brand-foreground hover:bg-brand/90"
                disabled={!current || generating}
                onClick={() => setStep(2)}
              >
                {t("Continue to schedule", "继续排期")} <ArrowRight className="size-4" />
              </Button>
            )}
            {step === 2 && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    await saveStudioToLibrary()
                    onClose()
                  }}
                >
                  <Save className="size-4" /> {t("Save as draft", "存为草稿")}
                </Button>
                {scheduleMode === "later" ? (
                  <Button
                    size="sm"
                    className="bg-brand text-brand-foreground hover:bg-brand/90"
                    disabled={!hasSchedulable}
                    onClick={() => {
                      addStudioToCalendar(calDate, calTime)
                      onClose()
                    }}
                  >
                    <CalendarPlus className="size-4" /> {t("Add to calendar", "加入日历")}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    className="bg-brand text-brand-foreground hover:bg-brand/90"
                    disabled={!hasSchedulable}
                    onClick={() => setShowBatch(true)}
                  >
                    <Send className="size-4" /> {t("Publish now", "立即发布")}
                  </Button>
                )}
              </>
            )}
          </div>
        </footer>
      </div>

      {/* nested confirms */}
      <Modal
        open={paid !== null}
        onClose={() => setPaid(null)}
        title={paid ? `${paid.label}?` : ""}
        description={t("This is a paid action. Estimated credits are shown below.", "这是一次计费动作，预计消耗的 credits 见下方。")}
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setPaid(null)}>
              {t("Cancel", "取消")}
            </Button>
            <Button
              size="sm"
              className="bg-brand text-brand-foreground hover:bg-brand/90"
              onClick={() => {
                paid?.run()
                setPaid(null)
              }}
            >
              {t("Confirm and run", "确认并执行")}
            </Button>
          </>
        }
      >
        {paid ? (
          <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 px-3 py-2">
            <span className="text-sm text-foreground">{paid.label}</span>
            <CreditsPill credits={paid.credits} />
          </div>
        ) : null}
      </Modal>

      <Modal
        open={showVariantsConfirm}
        onClose={() => setShowVariantsConfirm(false)}
        title={t("Generate platform variants?", "生成各平台内容变体？")}
        description={t("One draft will be generated for each selected platform. You can edit every field afterwards.", "将为每个所选平台生成一份草稿，之后每个字段都可编辑。")}
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setShowVariantsConfirm(false)}>
              {t("Cancel", "取消")}
            </Button>
            <Button size="sm" className="bg-brand text-brand-foreground hover:bg-brand/90" onClick={runGenerateVariants}>
              {t("Confirm and generate", "确认并生成")}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 px-3 py-2">
            <span className="text-sm text-foreground">
              {t(`${studio.platforms.length} platform${studio.platforms.length === 1 ? "" : "s"}`, `${studio.platforms.length} 个平台`)}
            </span>
            <CreditsPill credits={16} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {studio.platforms.map((p) => (
              <span key={p} className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-foreground">
                <PlatformBadge platform={p} />
                {p}
              </span>
            ))}
          </div>
        </div>
      </Modal>

      <Modal
        open={ctaPreview !== null}
        onClose={() => setCtaPreview(null)}
        title={t("CTA destination", "CTA 目标")}
        description={t("This is only a preview of where the post's call-to-action would send people. No navigation happens in this demo.", "这只是预览帖子的行动号召会把用户引导到哪里。演示中不会真正跳转。")}
        footer={
          <Button size="sm" className="bg-brand text-brand-foreground hover:bg-brand/90" onClick={() => setCtaPreview(null)}>
            {t("Close preview", "关闭预览")}
          </Button>
        }
      >
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">{t("Destination URL", "目标链接")}</p>
          <p className="break-all rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-foreground">{ctaPreview}</p>
        </div>
      </Modal>

      <Modal
        open={imageEditOpen}
        onClose={() => {
          setImageEditOpen(false)
          setModifySlot(null)
        }}
        title={t("Modify image", "修改图片")}
        description={t("Describe the change in your own words. The agent regenerates the image based on your notes.", "用你自己的话描述要改什么，AI 会据此重新生成图片。")}
        footer={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setImageEditOpen(false)
                setModifySlot(null)
              }}
            >
              {t("Cancel", "取消")}
            </Button>
            <Button
              size="sm"
              className="bg-brand text-brand-foreground hover:bg-brand/90"
              disabled={!imageEditPrompt.trim()}
              onClick={() => {
                if (current)
                  generateImage({
                    platform: current.platform,
                    format: current.format,
                    hook: current.hook,
                    body: current.body,
                    mediaAsset: current.mediaAsset,
                    instruction: imageEditPrompt,
                    // modifySlot 非空 = 按槽修改（面板里点「修改」进来的）；为空则走整贴 mediaUrl 修改（PreviewCard 的旧入口）。
                    slotRef: modifySlot?.ref,
                    description: modifySlot?.description,
                  })
                setImageEditOpen(false)
                setImageEditPrompt("")
                setModifySlot(null)
              }}
            >
              <Wand2 className="size-4" /> {t("Apply changes", "应用修改")}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label={t("What should change?", "要改什么？")}>
            <TextArea
              value={imageEditPrompt}
              onChange={(e) => setImageEditPrompt(e.target.value)}
              autoFocus
              placeholder={t("e.g. make the background darker, add our logo in the top-left, warmer tone", "如：把背景调暗、左上角加上我们的 logo、色调更暖一些")}
              className="min-h-24"
            />
          </Field>
          <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 px-3 py-2">
            <span className="text-sm text-foreground">{t("Regenerate with your edits", "按你的修改重新生成")}</span>
            <CreditsPill credits={20} />
          </div>
        </div>
      </Modal>

      <BatchPublishModal
        open={showBatch}
        onClose={() => setShowBatch(false)}
        topic={studio.topic || t("Untitled topic", "未命名主题")}
        variants={variants}
        onConfirm={async () => {
          const post = await saveStudioToLibrary()
          if (post) schedulePost(post)
          setShowBatch(false)
          onClose()
        }}
      />
    </div>
  )
}
