"use client"

import { useEffect, useMemo, useState } from "react"
import { useSocial } from "@/features/social/store"
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
import { DAYS, FORMAT_PRESETS, MEDIA_OPTIONS, STATE_META, copyTypeLabel, deriveMode, deriveState } from "./helpers"

/* ---------- step-by-step create wizard ---------- */
const WIZARD_STEPS = ["Draft", "Customize per network", "Schedule"] as const

export function CreatePostWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
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

  const [step, setStep] = useState<0 | 1 | 2>(0)
  const [creationMethod, setCreationMethod] = useState<"agent" | "manual">("agent")
  const [genModes, setGenModes] = useState<Array<"copy" | "image" | "video">>(["copy"])
  const toggleGenMode = (k: "copy" | "image" | "video") =>
    setGenModes((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]))
  const [imageEditOpen, setImageEditOpen] = useState(false)
  const [imageEditPrompt, setImageEditPrompt] = useState("")
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
      setStep(0)
      setCreationMethod("agent")
      setActiveVariant(null)
      setScheduleMode("now")
      setGenerating(false)
    }
  }, [open])

  const variants = studio.variants
  const current = variants.find((v) => v.platform === activeVariant) ?? variants[0] ?? null
  const hasSchedulable = variants.some((v) => v.state === "Valid" || v.state === "Manual fallback")

  const togglePlatform = (p: Platform) =>
    setStudioPlatforms(studio.platforms.includes(p) ? studio.platforms.filter((x) => x !== p) : [...studio.platforms, p])

  const handleCtaPreview = (url?: string) => {
    if (url && url.trim()) setCtaPreview(url.trim())
    else pushToast("This is a mock CTA preview. Add a destination URL in Brand Profile to make it actionable.", "warn")
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

  const runGenerateVariants = () => {
    setShowVariantsConfirm(false)
    setGenerating(true)
    setStep(1)
    window.setTimeout(() => {
      generateVariants()
      setGenerating(false)
      setActiveVariant(studio.platforms[0] ?? null)
    }, 900)
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
        aria-label="Create content"
        className="relative z-10 flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-border bg-card shadow-xl"
      >
        {/* header + stepper */}
        <header className="flex items-center justify-between gap-4 border-b border-border px-5 py-3.5">
          <div className="flex items-center gap-4">
            <h2 className="text-base font-semibold text-foreground">Create content</h2>
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
                  <span className={cn("text-xs font-medium", i === step ? "text-foreground" : "text-muted-foreground")}>{label}</span>
                  {i < WIZARD_STEPS.length - 1 ? <span className="h-px w-6 bg-border" /> : null}
                </li>
              ))}
            </ol>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label="Close">
            <X className="size-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* STEP 1 — draft */}
          {step === 0 && (
            <div className="mx-auto max-w-2xl space-y-4 p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Creation method">
                  <div className="grid grid-cols-2 gap-1.5">
                    {([["agent", "Agent-assisted"], ["manual", "Write manually"]] as const).map(([k, l]) => (
                      <button
                        key={k}
                        onClick={() => setCreationMethod(k)}
                        className={cn(
                          "rounded-md border px-2 py-2 text-xs font-medium",
                          creationMethod === k ? "border-brand bg-brand-muted text-foreground" : "border-border text-muted-foreground hover:bg-muted",
                        )}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="Generation mode" hint="Select one or more">
                  <div className="grid grid-cols-3 gap-1.5">
                    {([["copy", "Copy"], ["image", "Image"], ["video", "Video"]] as const).map(([k, l]) => {
                      const selected = genModes.includes(k) && creationMethod !== "manual"
                      return (
                        <button
                          key={k}
                          onClick={() => toggleGenMode(k)}
                          disabled={creationMethod === "manual"}
                          className={cn(
                            "rounded-md border px-2 py-2 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50",
                            selected
                              ? "border-brand bg-brand-muted text-foreground"
                              : "border-border text-muted-foreground hover:bg-muted",
                          )}
                        >
                          {l}
                        </button>
                      )
                    })}
                  </div>
                </Field>
              </div>

              <Field label="Topic">
                <TextArea
                  value={studio.topic}
                  onChange={(e) => setStudioTopic(e.target.value)}
                  disabled={creationMethod === "manual"}
                  placeholder={
                    creationMethod === "manual"
                      ? "Manual mode — you'll write the copy for each network in the next step."
                      : "Describe what this post is about — the agent drafts per-network copy from it."
                  }
                  className={cn("min-h-24", creationMethod === "manual" && "cursor-not-allowed bg-muted text-muted-foreground")}
                />
              </Field>

              <Field label="Platforms">
                <div className="flex flex-wrap gap-1.5">
                  {ALL_PLATFORMS.map((p) => (
                    <PlatformChip key={p} platform={p} selected={studio.platforms.includes(p)} onClick={() => togglePlatform(p)} />
                  ))}
                </div>
              </Field>

              <p className="text-xs text-muted-foreground">
                {creationMethod === "manual"
                  ? "You'll compose and format the copy yourself for each network. Image generation stays available in the next step."
                  : "The agent drafts per-network copy, images, and short video assets based on your selected generation modes."}
              </p>
            </div>
          )}

          {/* STEP 2 — customize per network */}
          {step === 1 && (
            <div className="p-5">
              {generating ? (
                <div className="flex flex-col items-center gap-2 py-16 text-center">
                  <Loader2 className="size-5 animate-spin text-brand" />
                  <p className="text-sm font-medium text-foreground">Generating variants…</p>
                  <p className="text-sm text-muted-foreground">Drafting per-platform copy for {studio.platforms.length} platforms.</p>
                </div>
              ) : variants.length === 0 || !current ? (
                <div className="flex flex-col items-center gap-2 py-16 text-center">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-brand-muted text-brand">
                    <Sparkles className="size-4" />
                  </span>
                  <p className="text-sm font-medium text-foreground">No variants yet</p>
                  <p className="max-w-xs text-sm text-muted-foreground">Go back and generate variants to customize each network.</p>
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
                        {STATE_META[current.state].label}
                      </span>
                      <span className="text-xs font-medium text-muted-foreground">{copyTypeLabel(current)}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Account">
                        <Select
                          value={current.account}
                          onChange={(e) => {
                            const opt = accountOptions.find((o) => o.name === e.target.value)
                            applyEdit({ account: e.target.value, accountType: opt?.type ?? "manual" })
                          }}
                        >
                          {accountOptions.map((o) => (
                            <option key={o.name} value={o.name}>
                              {o.name} {o.type === "connected" ? "· connected" : "· manual"}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Format preset">
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

                    <Field label="Hook / title">
                      <TextInput value={current.hook} onChange={(e) => applyEdit({ hook: e.target.value })} />
                    </Field>
                    <Field label={copyTypeLabel(current)}>
                      <TextArea
                        value={current.body}
                        onChange={(e) => applyEdit({ body: e.target.value })}
                        autoFocus={creationMethod === "manual"}
                        placeholder={
                          creationMethod === "manual" ? `Write your ${copyTypeLabel(current).toLowerCase()} here…` : undefined
                        }
                      />
                    </Field>

                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Hashtags">
                        <TextInput value={current.hashtags} onChange={(e) => applyEdit({ hashtags: e.target.value })} />
                      </Field>
                      <Field label="CTA label">
                        <TextInput value={current.cta} onChange={(e) => applyEdit({ cta: e.target.value })} placeholder="Start your free trial" />
                      </Field>
                      <Field label="CTA destination URL">
                        <TextInput value={current.ctaUrl ?? ""} onChange={(e) => applyEdit({ ctaUrl: e.target.value })} placeholder="https://your-product.com" />
                      </Field>
                      <Field label="Media asset">
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
                    <SectionTitle hint="Mock preview">Post preview</SectionTitle>
                    <PreviewCard
                      variant={current}
                      hasImage={studio.imageGenerated}
                      onCtaPreview={handleCtaPreview}
                      onRegenerateImage={() => setPaid({ label: "Regenerate image", credits: 30, run: generateImage })}
                      onEditImage={() => {
                        setImageEditPrompt("")
                        setImageEditOpen(true)
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
                <p className="text-sm font-medium text-foreground">{studio.topic || "Untitled topic"}</p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {variants.map((v) => (
                    <span key={v.platform} className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-1.5 py-0.5 text-xs text-foreground">
                      <PlatformBadge platform={v.platform} />
                      {v.platform}
                    </span>
                  ))}
                </div>
              </div>

              <Field label="When">
                <div className="grid grid-cols-2 gap-2">
                  {([["now", "Publish now"], ["later", "Schedule for later"]] as const).map(([k, l]) => (
                    <button
                      key={k}
                      onClick={() => setScheduleMode(k)}
                      className={cn(
                        "rounded-md border px-3 py-2 text-sm font-medium",
                        scheduleMode === k ? "border-brand bg-brand-muted text-foreground" : "border-border text-muted-foreground hover:bg-muted",
                      )}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </Field>

              {scheduleMode === "later" ? (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Day">
                    <Select value={calDate} onChange={(e) => setCalDate(e.target.value)}>
                      {DAYS.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Time">
                    <TextInput value={calTime} onChange={(e) => setCalTime(e.target.value)} />
                  </Field>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Auto platforms publish immediately; manual platforms appear as a manual fallback for you to post.
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
                <ArrowLeft className="size-4" /> Back
              </Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={onClose}>
                Cancel
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
                    Continue to write <ArrowRight className="size-4" />
                  </>
                ) : variants.length === 0 ? (
                  <>
                    <Wand2 className="size-4" /> Generate &amp; customize
                  </>
                ) : (
                  <>
                    Customize for each network <ArrowRight className="size-4" />
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
                Continue to schedule <ArrowRight className="size-4" />
              </Button>
            )}
            {step === 2 && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    saveStudioToLibrary()
                    onClose()
                  }}
                >
                  <Save className="size-4" /> Save as draft
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
                    <CalendarPlus className="size-4" /> Add to calendar
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    className="bg-brand text-brand-foreground hover:bg-brand/90"
                    disabled={!hasSchedulable}
                    onClick={() => setShowBatch(true)}
                  >
                    <Send className="size-4" /> Publish now
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
        description="This is a paid action. Estimated credits are shown below."
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setPaid(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="bg-brand text-brand-foreground hover:bg-brand/90"
              onClick={() => {
                paid?.run()
                setPaid(null)
              }}
            >
              Confirm and run
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
        title="Generate platform variants?"
        description="One draft will be generated for each selected platform. You can edit every field afterwards."
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setShowVariantsConfirm(false)}>
              Cancel
            </Button>
            <Button size="sm" className="bg-brand text-brand-foreground hover:bg-brand/90" onClick={runGenerateVariants}>
              Confirm and generate
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 px-3 py-2">
            <span className="text-sm text-foreground">
              {studio.platforms.length} platform{studio.platforms.length === 1 ? "" : "s"}
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
        title="CTA destination"
        description="This is only a preview of where the post's call-to-action would send people. No navigation happens in this demo."
        footer={
          <Button size="sm" className="bg-brand text-brand-foreground hover:bg-brand/90" onClick={() => setCtaPreview(null)}>
            Close preview
          </Button>
        }
      >
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Destination URL</p>
          <p className="break-all rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-foreground">{ctaPreview}</p>
        </div>
      </Modal>

      <Modal
        open={imageEditOpen}
        onClose={() => setImageEditOpen(false)}
        title="Modify image"
        description="Describe the change in your own words. The agent regenerates the image based on your notes."
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setImageEditOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="bg-brand text-brand-foreground hover:bg-brand/90"
              disabled={!imageEditPrompt.trim()}
              onClick={() => {
                generateImage()
                setImageEditOpen(false)
                setImageEditPrompt("")
              }}
            >
              <Wand2 className="size-4" /> Apply changes
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="What should change?">
            <TextArea
              value={imageEditPrompt}
              onChange={(e) => setImageEditPrompt(e.target.value)}
              autoFocus
              placeholder="e.g. make the background darker, add our logo in the top-left, warmer tone"
              className="min-h-24"
            />
          </Field>
          <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 px-3 py-2">
            <span className="text-sm text-foreground">Regenerate with your edits</span>
            <CreditsPill credits={20} />
          </div>
        </div>
      </Modal>

      <BatchPublishModal
        open={showBatch}
        onClose={() => setShowBatch(false)}
        topic={studio.topic || "Untitled topic"}
        variants={variants}
        onConfirm={() => {
          const post = saveStudioToLibrary()
          if (post) schedulePost(post)
          setShowBatch(false)
          onClose()
        }}
      />
    </div>
  )
}
