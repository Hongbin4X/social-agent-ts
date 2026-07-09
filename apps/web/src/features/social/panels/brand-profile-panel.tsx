"use client"

import { useState } from "react"
import { useSocial } from "@/features/social/store"
import { ALL_PLATFORMS, CONTENT_GOALS, type ContentGoal, type Platform } from "@social/shared"
import { Button } from "@/components/ui/button"
import {
  Card,
  CreditsPill,
  Field,
  Modal,
  PlatformChip,
  Select,
  TextArea,
  TextInput,
} from "@/features/social/components/ui"
import { ChevronDown, ImagePlus, Wand2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { useLang } from "@/features/social/i18n"
import { CONTENT_GOAL_LABELS } from "@/features/social/i18n/labels"

export function BrandProfilePanel() {
  const { profile, updateProfile, saveProfile, profileCompletion, generateProfileDraft } = useSocial()
  const { t, te } = useLang()
  const [confirmDraft, setConfirmDraft] = useState(false)
  const [open, setOpen] = useState(true)
  const { pct, missing } = profileCompletion()

  const togglePlatform = (p: Platform) =>
    updateProfile({
      platforms: profile.platforms.includes(p)
        ? profile.platforms.filter((x) => x !== p)
        : [...profile.platforms, p],
    })

  const toggleGoal = (g: ContentGoal) =>
    updateProfile({
      contentGoals: profile.contentGoals.includes(g)
        ? profile.contentGoals.filter((x) => x !== g)
        : [...profile.contentGoals, g],
    })

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">{t("Brand Profile", "品牌资料")}</h3>
            <span className="rounded-full bg-brand-muted px-2 py-0.5 text-xs font-medium text-brand">{pct}% {t("complete", "完成")}</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("Context for planning, copy, and images.", "用于策划、文案与配图的上下文。")}{" "}
            {t(`${missing} fields missing.`, `还有 ${missing} 个字段待填。`)}{" "}
            {t("Does not block plan generation.", "不影响计划生成。")}
          </p>
        </div>
        <button
          onClick={() => setOpen((o) => !o)}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted"
          aria-expanded={open}
        >
          {open ? t("Collapse", "收起") : t("Expand", "展开")}
          <ChevronDown className={cn("size-3.5 transition-transform", open ? "rotate-180" : "")} />
        </button>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${pct}%` }} />
      </div>

      {open && (
        <div className="mt-4 space-y-5">
          {/* Basics */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("Basics", "基础信息")}</p>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              <Field label={t("Brand / project name", "品牌 / 项目名称")}>
                <TextInput value={profile.brandName} onChange={(e) => updateProfile({ brandName: e.target.value })} />
              </Field>
              <Field label={t("Website URL", "网站链接")}>
                <TextInput value={profile.websiteUrl} onChange={(e) => updateProfile({ websiteUrl: e.target.value })} placeholder="https://" />
              </Field>
              <Field label={t("Product URL", "产品链接")}>
                <TextInput value={profile.productUrl} onChange={(e) => updateProfile({ productUrl: e.target.value })} placeholder="https://" />
              </Field>
              <Field label={t("Target market", "目标市场")}>
                {/* value 显式写英文规范值，保证切换语言时 profile.targetMarket 存的键不变，只翻显示文案 */}
                <Select value={profile.targetMarket} onChange={(e) => updateProfile({ targetMarket: e.target.value })}>
                  <option value="US">{t("US", "美国")}</option>
                  <option value="Europe">{t("Europe", "欧洲")}</option>
                  <option value="Global English Market">{t("Global English Market", "全球英语市场")}</option>
                  <option value="Custom">{t("Custom", "自定义")}</option>
                </Select>
              </Field>
              <div className="md:col-span-2">
                <Field label={t("Product or brand description", "产品或品牌描述")}>
                  <TextArea value={profile.description} onChange={(e) => updateProfile({ description: e.target.value })} />
                </Field>
              </div>
            </div>
          </div>

          {/* Audience & goals */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("Audience & goals", "受众与目标")}</p>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              <Field label={t("Weekly posting frequency", "每周发帖频率")}>
                <Select value={String(profile.weeklyFrequency)} onChange={(e) => updateProfile({ weeklyFrequency: Number(e.target.value) })}>
                  {[3, 4, 5, 6, 7].map((n) => (
                    <option key={n} value={n}>{t(`${n} posts / week`, `${n} 帖 / 周`)}</option>
                  ))}
                </Select>
              </Field>
              <Field label={t("Target audience", "目标受众")}>
                <TextInput value={profile.targetAudience} onChange={(e) => updateProfile({ targetAudience: e.target.value })} />
              </Field>
              <div className="md:col-span-2">
                <Field label={t("Content goals", "内容目标")}>
                  <div className="flex flex-wrap gap-2">
                    {CONTENT_GOALS.map((g) => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => toggleGoal(g)}
                        className={cn(
                          "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                          profile.contentGoals.includes(g)
                            ? "border-brand bg-brand-muted text-brand-muted-foreground"
                            : "border-border bg-background text-muted-foreground hover:bg-muted",
                        )}
                      >
                        {te(CONTENT_GOAL_LABELS[g])}
                      </button>
                    ))}
                  </div>
                </Field>
              </div>
              <div className="md:col-span-2">
                <Field label={t("Target platforms", "目标平台")}>
                  <div className="flex flex-wrap gap-2">
                    {ALL_PLATFORMS.map((p) => (
                      <PlatformChip key={p} platform={p} selected={profile.platforms.includes(p)} onClick={() => togglePlatform(p)} />
                    ))}
                  </div>
                </Field>
              </div>
            </div>
          </div>

          {/* Voice & rules */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("Voice & rules", "语气与规则")}</p>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              <Field label={t("Brand tone", "品牌语气")}>
                <TextInput value={profile.tone} onChange={(e) => updateProfile({ tone: e.target.value })} />
              </Field>
              <Field label={t("Default CTA", "默认 CTA")}>
                <TextInput value={profile.defaultCta} onChange={(e) => updateProfile({ defaultCta: e.target.value })} />
              </Field>
              <Field label={t("Brand hashtags", "品牌话题标签")}>
                <TextInput value={profile.hashtags} onChange={(e) => updateProfile({ hashtags: e.target.value })} />
              </Field>
              <Field label={t("Forbidden topics", "禁用话题")}>
                <TextInput value={profile.forbiddenTopics} onChange={(e) => updateProfile({ forbiddenTopics: e.target.value })} placeholder={t("e.g. competitor names", "如：竞品名称")} />
              </Field>
            </div>
          </div>

          {/* Visual identity */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("Visual identity", "视觉识别")}</p>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              <Field label={t("Logo", "Logo")}>
                <div className="flex h-20 items-center justify-center rounded-md border border-dashed border-border bg-muted/40 text-sm text-muted-foreground">
                  <ImagePlus className="mr-2 size-4" /> {t("Upload logo", "上传 Logo")}
                </div>
              </Field>
              <div className="flex flex-col gap-4">
                <Field label={t("Brand colors", "品牌色")}>
                  <TextInput value={profile.brandColors} onChange={(e) => updateProfile({ brandColors: e.target.value })} placeholder="#7C5CFC, #111111" />
                </Field>
                <Field label={t("Visual style", "视觉风格")}>
                  <TextInput value={profile.visualStyle} onChange={(e) => updateProfile({ visualStyle: e.target.value })} placeholder={t("e.g. clean, modern", "如：简洁、现代")} />
                </Field>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
            {profile.websiteUrl ? (
              <Button variant="outline" size="sm" onClick={() => setConfirmDraft(true)}>
                <Wand2 className="size-4" /> {t("Generate profile draft from URL", "从链接生成资料草稿")}
              </Button>
            ) : null}
            <Button
              size="sm"
              className="ml-auto bg-brand text-brand-foreground hover:bg-brand/90"
              onClick={() => saveProfile()}
            >
              {t("Save profile", "保存资料")}
            </Button>
          </div>
        </div>
      )}

      <Modal
        open={confirmDraft}
        onClose={() => setConfirmDraft(false)}
        title={t("Generate brand profile draft?", "生成品牌资料草稿？")}
        description={t(
          "This uses your website URL to draft missing fields. Existing entries are kept.",
          "将根据你的网站链接草拟缺失字段，已填写的内容会保留。",
        )}
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setConfirmDraft(false)}>
              {t("Cancel", "取消")}
            </Button>
            <Button
              size="sm"
              className="bg-brand text-brand-foreground hover:bg-brand/90"
              onClick={() => {
                generateProfileDraft()
                setConfirmDraft(false)
              }}
            >
              {t("Confirm and generate", "确认并生成")}
            </Button>
          </>
        }
      >
        <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 px-3 py-2">
          <span className="text-sm text-foreground">{t("Source", "来源")}: {profile.websiteUrl}</span>
          <CreditsPill credits={12} />
        </div>
      </Modal>
    </Card>
  )
}
