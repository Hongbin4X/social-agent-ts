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

export function BrandProfilePanel() {
  const { profile, updateProfile, profileCompletion, generateProfileDraft, pushToast } = useSocial()
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
            <h3 className="text-sm font-semibold text-foreground">Brand Profile</h3>
            <span className="rounded-full bg-brand-muted px-2 py-0.5 text-xs font-medium text-brand">{pct}% complete</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Context for planning, copy, and images. {missing} fields missing. Does not block plan generation.
          </p>
        </div>
        <button
          onClick={() => setOpen((o) => !o)}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted"
          aria-expanded={open}
        >
          {open ? "Collapse" : "Expand"}
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
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Basics</p>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              <Field label="Brand / project name">
                <TextInput value={profile.brandName} onChange={(e) => updateProfile({ brandName: e.target.value })} />
              </Field>
              <Field label="Website URL">
                <TextInput value={profile.websiteUrl} onChange={(e) => updateProfile({ websiteUrl: e.target.value })} placeholder="https://" />
              </Field>
              <Field label="Product URL">
                <TextInput value={profile.productUrl} onChange={(e) => updateProfile({ productUrl: e.target.value })} placeholder="https://" />
              </Field>
              <Field label="Target market">
                <Select value={profile.targetMarket} onChange={(e) => updateProfile({ targetMarket: e.target.value })}>
                  <option>US</option>
                  <option>Europe</option>
                  <option>Global English Market</option>
                  <option>Custom</option>
                </Select>
              </Field>
              <div className="md:col-span-2">
                <Field label="Product or brand description">
                  <TextArea value={profile.description} onChange={(e) => updateProfile({ description: e.target.value })} />
                </Field>
              </div>
            </div>
          </div>

          {/* Audience & goals */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Audience &amp; goals</p>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              <Field label="Weekly posting frequency">
                <Select value={String(profile.weeklyFrequency)} onChange={(e) => updateProfile({ weeklyFrequency: Number(e.target.value) })}>
                  {[3, 4, 5, 6, 7].map((n) => (
                    <option key={n} value={n}>{n} posts / week</option>
                  ))}
                </Select>
              </Field>
              <Field label="Target audience">
                <TextInput value={profile.targetAudience} onChange={(e) => updateProfile({ targetAudience: e.target.value })} />
              </Field>
              <div className="md:col-span-2">
                <Field label="Content goals">
                  <div className="flex flex-wrap gap-2">
                    {CONTENT_GOALS.map((g) => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => toggleGoal(g)}
                        className={cn(
                          "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                          profile.contentGoals.includes(g)
                            ? "border-brand bg-brand-muted text-foreground"
                            : "border-border bg-background text-muted-foreground hover:bg-muted",
                        )}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </Field>
              </div>
              <div className="md:col-span-2">
                <Field label="Target platforms">
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
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Voice &amp; rules</p>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              <Field label="Brand tone">
                <TextInput value={profile.tone} onChange={(e) => updateProfile({ tone: e.target.value })} />
              </Field>
              <Field label="Default CTA">
                <TextInput value={profile.defaultCta} onChange={(e) => updateProfile({ defaultCta: e.target.value })} />
              </Field>
              <Field label="Brand hashtags">
                <TextInput value={profile.hashtags} onChange={(e) => updateProfile({ hashtags: e.target.value })} />
              </Field>
              <Field label="Forbidden topics">
                <TextInput value={profile.forbiddenTopics} onChange={(e) => updateProfile({ forbiddenTopics: e.target.value })} placeholder="e.g. competitor names" />
              </Field>
            </div>
          </div>

          {/* Visual identity */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Visual identity</p>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              <Field label="Logo">
                <div className="flex h-20 items-center justify-center rounded-md border border-dashed border-border bg-muted/40 text-sm text-muted-foreground">
                  <ImagePlus className="mr-2 size-4" /> Upload logo
                </div>
              </Field>
              <div className="flex flex-col gap-4">
                <Field label="Brand colors">
                  <TextInput value={profile.brandColors} onChange={(e) => updateProfile({ brandColors: e.target.value })} placeholder="#7C5CFC, #111111" />
                </Field>
                <Field label="Visual style">
                  <TextInput value={profile.visualStyle} onChange={(e) => updateProfile({ visualStyle: e.target.value })} placeholder="e.g. clean, modern" />
                </Field>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
            {profile.websiteUrl ? (
              <Button variant="outline" size="sm" onClick={() => setConfirmDraft(true)}>
                <Wand2 className="size-4" /> Generate profile draft from URL
              </Button>
            ) : null}
            <Button
              size="sm"
              className="ml-auto bg-brand text-brand-foreground hover:bg-brand/90"
              onClick={() => pushToast("Brand profile saved", "success")}
            >
              Save profile
            </Button>
          </div>
        </div>
      )}

      <Modal
        open={confirmDraft}
        onClose={() => setConfirmDraft(false)}
        title="Generate brand profile draft?"
        description="This uses your website URL to draft missing fields. Existing entries are kept."
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setConfirmDraft(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="bg-brand text-brand-foreground hover:bg-brand/90"
              onClick={() => {
                generateProfileDraft()
                setConfirmDraft(false)
              }}
            >
              Confirm and generate
            </Button>
          </>
        }
      >
        <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 px-3 py-2">
          <span className="text-sm text-foreground">Source: {profile.websiteUrl}</span>
          <CreditsPill credits={12} />
        </div>
      </Modal>
    </Card>
  )
}
