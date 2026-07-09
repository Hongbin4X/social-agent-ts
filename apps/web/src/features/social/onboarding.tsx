"use client"

import { useState } from "react"
import { useSocial } from "@/features/social/store"
import { ALL_PLATFORMS, CONTENT_GOALS, type ContentGoal, type Platform } from "@social/shared"
import { Button } from "@/components/ui/button"
import { Field, PlatformChip, Select, TextArea, TextInput } from "@/features/social/components/ui"
import { Megaphone } from "lucide-react"

export function Onboarding() {
  const { createWorkspace } = useSocial()
  const [name, setName] = useState("Northstar Launch")
  const [brand, setBrand] = useState("Northstar AI")
  const [desc, setDesc] = useState("AI productivity assistant for small teams")
  const [market, setMarket] = useState("US")
  const [platforms, setPlatforms] = useState<Platform[]>(["X", "Reddit", "Instagram", "YouTube"])
  const [goal, setGoal] = useState<ContentGoal>("Drive trial")
  const [website, setWebsite] = useState("https://northstar.ai")
  const [tone, setTone] = useState("clear, helpful, slightly bold")

  const togglePlatform = (p: Platform) =>
    setPlatforms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]))

  const canCreate = name.trim().length > 0

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-xl rounded-lg border border-border bg-card shadow-sm">
        <div className="flex items-center gap-3 border-b border-border px-6 py-5">
          <span className="flex size-10 items-center justify-center rounded-lg bg-brand-muted text-brand">
            <Megaphone className="size-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Create your first Social Workspace</h2>
            <p className="text-sm text-muted-foreground">Set up the basics now. You can complete the full brand profile later.</p>
          </div>
        </div>

        <div className="grid gap-4 px-6 py-5 md:grid-cols-2">
          <Field label="Workspace name" required>
            <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Northstar Launch" />
          </Field>
          <Field label="Brand / project name">
            <TextInput value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="e.g. Northstar AI" />
          </Field>
          <div className="md:col-span-2">
            <Field label="Product or brand description">
              <TextArea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What does your product do?" />
            </Field>
          </div>
          <Field label="Target market">
            <Select value={market} onChange={(e) => setMarket(e.target.value)}>
              <option>US</option>
              <option>Europe</option>
              <option>Global English Market</option>
              <option>Custom</option>
            </Select>
          </Field>
          <Field label="Primary content goal">
            <Select value={goal} onChange={(e) => setGoal(e.target.value as ContentGoal)}>
              {CONTENT_GOALS.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </Select>
          </Field>
          <div className="md:col-span-2">
            <Field label="Target platforms">
              <div className="flex flex-wrap gap-2">
                {ALL_PLATFORMS.map((p) => (
                  <PlatformChip key={p} platform={p} selected={platforms.includes(p)} onClick={() => togglePlatform(p)} />
                ))}
              </div>
            </Field>
          </div>
          <Field label="Website URL (optional)">
            <TextInput value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" />
          </Field>
          <Field label="Brand tone (optional)">
            <TextInput value={tone} onChange={(e) => setTone(e.target.value)} placeholder="e.g. clear, helpful" />
          </Field>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
          <Button
            disabled={!canCreate}
            onClick={() =>
              createWorkspace({
                name,
                brandName: brand,
                description: desc,
                targetMarket: market,
                platforms,
                primaryGoal: goal,
                websiteUrl: website,
                tone,
              })
            }
            className="bg-brand text-brand-foreground hover:bg-brand/90"
          >
            Create workspace
          </Button>
        </div>
      </div>
    </div>
  )
}
