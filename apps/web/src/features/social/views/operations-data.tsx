"use client"

import { useState } from "react"
import { ArrowDownRight, ArrowUpRight, Minus, Sparkles, TrendingUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CreditsPill, Modal, PlatformBadge, SectionTitle } from "@/features/social/components/ui"
import { useSocial } from "@/features/social/store"
import { opsMetrics, opsPlatformRows, opsSeries, opsTopPosts } from "@/features/social/data/mock"
import type { OpsMetric, Platform } from "@social/shared"

type Range = "7d" | "30d"

const PLATFORMS: Platform[] = ["X", "Instagram", "Facebook", "Reddit", "TikTok", "YouTube"]

export function OperationsDataTab() {
  const { suggestions, suggestionsGenerated, generateSuggestions } = useSocial()
  const [range, setRange] = useState<Range>("7d")
  const [platform, setPlatform] = useState<Platform | "All">("All")
  const [confirmGen, setConfirmGen] = useState(false)

  const metrics = opsMetrics[range]
  const series = opsSeries[range]
  const maxImpr = Math.max(...series.map((s) => s.impressions))
  const rows = platform === "All" ? opsPlatformRows : opsPlatformRows.filter((r) => r.platform === platform)
  const topPosts = platform === "All" ? opsTopPosts : opsTopPosts.filter((p) => p.platform === platform)

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 px-6 py-8">
      {/* Header + filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Operations data</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cross-platform performance for this workspace. Metrics are illustrative.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-md border border-border p-0.5">
            {(["7d", "30d"] as Range[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
                  range === r ? "bg-brand text-brand-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {r === "7d" ? "Last 7 days" : "Last 30 days"}
              </button>
            ))}
          </div>
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value as Platform | "All")}
            className="cursor-pointer rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
          >
            <option value="All">All platforms</option>
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {metrics.map((m) => (
          <MetricCard key={m.key} metric={m} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Trend chart */}
        <Card className="p-4 lg:col-span-2">
          <SectionTitle hint={range === "7d" ? "Daily" : "Weekly"}>Impressions & posts published</SectionTitle>
          <div className="mt-4 flex h-48 items-end gap-3">
            {series.map((s) => (
              <div key={s.label} className="flex flex-1 flex-col items-center gap-2">
                <div className="flex w-full flex-1 items-end justify-center">
                  <div
                    className="w-full max-w-10 rounded-t bg-brand/80"
                    style={{ height: `${Math.max(6, (s.impressions / maxImpr) * 100)}%` }}
                    title={`${s.impressions.toLocaleString()} impressions`}
                  />
                </div>
                <span className="text-[11px] font-medium tabular-nums text-foreground">{s.published}</span>
                <span className="text-[11px] text-muted-foreground">{s.label}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-4 border-t border-border pt-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-brand/80" /> Impressions (bar height)
            </span>
            <span>Number below each bar = posts published</span>
          </div>
        </Card>

        {/* AI recommendations */}
        <Card className="flex flex-col p-4">
          <SectionTitle hint="AI">Recommendations</SectionTitle>
          {!suggestionsGenerated ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 py-6 text-center">
              <div className="flex size-10 items-center justify-center rounded-full bg-brand-muted">
                <Sparkles className="size-5 text-brand" />
              </div>
              <p className="text-sm text-muted-foreground">
                Analyze this period&apos;s performance and get prioritized suggestions.
              </p>
              <Button
                size="sm"
                className="bg-brand text-brand-foreground hover:bg-brand/90"
                onClick={() => setConfirmGen(true)}
              >
                <Sparkles className="size-4" /> Generate recommendations
              </Button>
            </div>
          ) : (
            <div className="mt-3 space-y-2.5">
              {suggestions.map((s) => (
                <div key={s.id} className="rounded-lg border border-border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-foreground">{s.title}</p>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        s.impact === "High"
                          ? "bg-[oklch(0.95_0.05_150)] text-status-published"
                          : s.impact === "Medium"
                            ? "bg-[oklch(0.96_0.04_70)] text-status-fallback"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {s.impact}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{s.detail}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Platform performance table */}
      <Card className="overflow-hidden">
        <div className="border-b border-border px-4 py-3">
          <SectionTitle>Platform performance</SectionTitle>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-2 font-medium">Platform</th>
                <th className="px-4 py-2 font-medium">Posts</th>
                <th className="px-4 py-2 font-medium">Impressions</th>
                <th className="px-4 py-2 font-medium">Engagement rate</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.platform} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-2">
                      <PlatformBadge platform={r.platform} />
                      <span className="font-medium text-foreground">{r.platform}</span>
                    </span>
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-foreground">{r.posts}</td>
                  <td className={`px-4 py-2.5 tabular-nums ${r.available ? "text-foreground" : "text-muted-foreground"}`}>
                    {r.impressions}
                  </td>
                  <td className={`px-4 py-2.5 tabular-nums ${r.available ? "text-foreground" : "text-muted-foreground"}`}>
                    {r.engagementRate}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
          TikTok and YouTube analytics are unavailable in P0 (video metrics out of scope).
        </p>
      </Card>

      {/* Top posts */}
      <Card className="overflow-hidden">
        <div className="border-b border-border px-4 py-3">
          <SectionTitle hint="This period">Top performing posts</SectionTitle>
        </div>
        <div className="divide-y divide-border">
          {topPosts.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">No posts for this platform.</p>
          ) : (
            topPosts.map((p, i) => (
              <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                <span className="w-5 text-center text-sm font-semibold tabular-nums text-muted-foreground">
                  {i + 1}
                </span>
                <PlatformBadge platform={p.platform} size="md" />
                <p className="flex-1 truncate text-sm font-medium text-foreground">{p.title}</p>
                <div className="text-right">
                  <p className="text-sm font-semibold tabular-nums text-foreground">{p.value}</p>
                  <p className="text-[11px] text-muted-foreground">{p.metric}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      {/* Recommendation generation confirmation */}
      <Modal
        open={confirmGen}
        onClose={() => setConfirmGen(false)}
        title="Generate AI recommendations?"
        description="The agent will analyze this period's metrics and produce prioritized actions."
        footer={
          <>
            <div className="mr-auto flex items-center gap-2 text-xs text-muted-foreground">
              <CreditsPill credits={18} />
            </div>
            <Button variant="outline" size="sm" onClick={() => setConfirmGen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="bg-brand text-brand-foreground hover:bg-brand/90"
              onClick={() => {
                generateSuggestions()
                setConfirmGen(false)
              }}
            >
              Confirm and analyze
            </Button>
          </>
        }
      >
        <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          <TrendingUp className="size-5 shrink-0 text-brand" />
          Recommendations are based on illustrative mock analytics for this demo.
        </div>
      </Modal>
    </div>
  )
}

function MetricCard({ metric }: { metric: OpsMetric }) {
  const TrendIcon = metric.trend === "up" ? ArrowUpRight : metric.trend === "down" ? ArrowDownRight : Minus
  const trendColor =
    metric.trend === "up" ? "text-status-published" : metric.trend === "down" ? "text-status-failed" : "text-muted-foreground"

  return (
    <Card className="p-4">
      <p className="text-xs text-muted-foreground">{metric.label}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${metric.available ? "text-foreground" : "text-muted-foreground"}`}>
        {metric.value}
      </p>
      {metric.available && metric.delta ? (
        <p className={`mt-1 flex items-center gap-0.5 text-xs font-medium ${trendColor}`}>
          <TrendIcon className="size-3.5" />
          {metric.delta}
        </p>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">Video out of scope</p>
      )}
    </Card>
  )
}
