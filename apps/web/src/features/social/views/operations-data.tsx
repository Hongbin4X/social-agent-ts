"use client"

import { useState } from "react"
import { ArrowDownRight, ArrowUpRight, Minus, Sparkles, TrendingUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CreditsPill, Modal, PlatformBadge, SectionTitle } from "@/features/social/components/ui"
import { useSocial } from "@/features/social/store"
import { useLang } from "@/features/social/i18n"
import { METRIC_LABELS, NOT_AVAILABLE } from "@/features/social/i18n/labels"
import { opsMetrics, opsPlatformRows, opsSeries, opsTopPosts } from "@/features/social/data/mock"
import type { OpsMetric, Platform } from "@social/shared"

type Range = "7d" | "30d"

const PLATFORMS: Platform[] = ["X", "Instagram", "Facebook", "Reddit", "TikTok", "YouTube"]

export function OperationsDataTab() {
  const { suggestions, suggestionsGenerated, generateSuggestions } = useSocial()
  const { t, te } = useLang()
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
          <h1 className="text-xl font-semibold text-foreground">{t("Operations data", "运营数据")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("Cross-platform performance for this workspace. Metrics are illustrative.", "该工作区的跨平台表现。指标仅供参考。")}
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
                {r === "7d" ? t("Last 7 days", "近 7 天") : t("Last 30 days", "近 30 天")}
              </button>
            ))}
          </div>
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value as Platform | "All")}
            className="cursor-pointer rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
          >
            <option value="All">{t("All platforms", "全部平台")}</option>
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
          <SectionTitle hint={range === "7d" ? t("Daily", "按天") : t("Weekly", "按周")}>{t("Impressions & posts published", "曝光量与发帖数")}</SectionTitle>
          <div className="mt-4 flex h-48 items-end gap-3">
            {series.map((s) => (
              <div key={s.label} className="flex flex-1 flex-col items-center gap-2">
                <div className="flex w-full flex-1 items-end justify-center">
                  <div
                    className="w-full max-w-10 rounded-t bg-brand/80"
                    style={{ height: `${Math.max(6, (s.impressions / maxImpr) * 100)}%` }}
                    title={t(`${s.impressions.toLocaleString()} impressions`, `${s.impressions.toLocaleString()} 次曝光`)}
                  />
                </div>
                <span className="text-[11px] font-medium tabular-nums text-foreground">{s.published}</span>
                <span className="text-[11px] text-muted-foreground">{s.label}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-4 border-t border-border pt-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-brand/80" /> {t("Impressions (bar height)", "曝光量（柱状高度）")}
            </span>
            <span>{t("Number below each bar = posts published", "每根柱下方数字 = 已发布帖子数")}</span>
          </div>
        </Card>

        {/* AI recommendations */}
        <Card className="flex flex-col p-4">
          <SectionTitle hint="AI">{t("Recommendations", "推荐建议")}</SectionTitle>
          {!suggestionsGenerated ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 py-6 text-center">
              <div className="flex size-10 items-center justify-center rounded-full bg-brand-muted">
                <Sparkles className="size-5 text-brand" />
              </div>
              <p className="text-sm text-muted-foreground">
                {t("Analyze this period's performance and get prioritized suggestions.", "分析本期表现，获取按优先级排序的建议。")}
              </p>
              <Button
                size="sm"
                className="bg-brand text-brand-foreground hover:bg-brand/90"
                onClick={() => setConfirmGen(true)}
              >
                <Sparkles className="size-4" /> {t("Generate recommendations", "生成推荐建议")}
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
                      {s.impact === "High" ? t("High", "高") : s.impact === "Medium" ? t("Medium", "中") : t("Low", "低")}
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
          <SectionTitle>{t("Platform performance", "平台表现")}</SectionTitle>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-2 font-medium">{t("Platform", "平台")}</th>
                <th className="px-4 py-2 font-medium">{t("Posts", "帖子数")}</th>
                <th className="px-4 py-2 font-medium">{t("Impressions", "曝光量")}</th>
                <th className="px-4 py-2 font-medium">{t("Engagement rate", "互动率")}</th>
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
                    {r.available ? r.impressions : te(NOT_AVAILABLE)}
                  </td>
                  <td className={`px-4 py-2.5 tabular-nums ${r.available ? "text-foreground" : "text-muted-foreground"}`}>
                    {r.available ? r.engagementRate : te(NOT_AVAILABLE)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
          {t("TikTok and YouTube analytics are unavailable in P0 (video metrics out of scope).", "TikTok 与 YouTube 的分析在 P0 阶段不可用（视频指标不在范围内）。")}
        </p>
      </Card>

      {/* Top posts */}
      <Card className="overflow-hidden">
        <div className="border-b border-border px-4 py-3">
          <SectionTitle hint={t("This period", "本期")}>{t("Top performing posts", "表现最佳的帖子")}</SectionTitle>
        </div>
        <div className="divide-y divide-border">
          {topPosts.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">{t("No posts for this platform.", "该平台暂无帖子。")}</p>
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
                  <p className="text-[11px] text-muted-foreground">
                    {p.metric === "Engagement"
                      ? t("Engagement", "互动")
                      : p.metric === "Impressions"
                        ? t("Impressions", "曝光量")
                        : p.metric === "Comments"
                          ? t("Comments", "评论")
                          : p.metric === "Link clicks"
                            ? t("Link clicks", "链接点击")
                            : p.metric}
                  </p>
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
        title={t("Generate AI recommendations?", "生成 AI 推荐建议？")}
        description={t("The agent will analyze this period's metrics and produce prioritized actions.", "智能体将分析本期指标并给出按优先级排序的行动建议。")}
        footer={
          <>
            <div className="mr-auto flex items-center gap-2 text-xs text-muted-foreground">
              <CreditsPill credits={18} />
            </div>
            <Button variant="outline" size="sm" onClick={() => setConfirmGen(false)}>
              {t("Cancel", "取消")}
            </Button>
            <Button
              size="sm"
              className="bg-brand text-brand-foreground hover:bg-brand/90"
              onClick={() => {
                generateSuggestions()
                setConfirmGen(false)
              }}
            >
              {t("Confirm and analyze", "确认并分析")}
            </Button>
          </>
        }
      >
        <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          <TrendingUp className="size-5 shrink-0 text-brand" />
          {t("Recommendations are based on illustrative mock analytics for this demo.", "本演示中的推荐建议基于示意性的模拟分析数据。")}
        </div>
      </Modal>
    </div>
  )
}

function MetricCard({ metric }: { metric: OpsMetric }) {
  const { t, te } = useLang()
  const TrendIcon = metric.trend === "up" ? ArrowUpRight : metric.trend === "down" ? ArrowDownRight : Minus
  const trendColor =
    metric.trend === "up" ? "text-status-published" : metric.trend === "down" ? "text-status-failed" : "text-muted-foreground"

  return (
    <Card className="p-4">
      <p className="text-xs text-muted-foreground">{te(METRIC_LABELS[metric.key])}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${metric.available ? "text-foreground" : "text-muted-foreground"}`}>
        {metric.available ? metric.value : te(NOT_AVAILABLE)}
      </p>
      {metric.available && metric.delta ? (
        <p className={`mt-1 flex items-center gap-0.5 text-xs font-medium ${trendColor}`}>
          <TrendIcon className="size-3.5" />
          {metric.delta}
        </p>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">{t("Video out of scope", "视频不在范围内")}</p>
      )}
    </Card>
  )
}
