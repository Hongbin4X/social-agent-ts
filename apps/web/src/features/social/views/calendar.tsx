"use client"

import { useMemo, useState } from "react"
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Send,
  Ban,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, Modal, PlatformBadge, StatusBadge, Field, Select } from "@/features/social/components/ui"
import { useSocial } from "@/features/social/store"
import { useLang } from "@/features/social/i18n"
import type { CalendarItem } from "@social/shared"
import { currentWeekDays } from "@/features/social/lib/schedule-time"

// 周视图列头 = 【真实的本周】。曾经写死 2026-07-06~12 那一周（原型遗留），
// 后果是用户今天排的期在周视图里【根本看不到】——任务确实存在于 calendar 数组，只是没有对应的列。
// 放在组件外会在模块加载时求值一次；这里用 useMemo 保证每次挂载都按"今天"重算。
const TIME_SLOTS = ["08:00", "09:00", "10:00", "11:30", "13:00", "15:00", "16:00", "18:00"]

function dayShort(day: string) {
  const [wd, , d] = day.split(" ")
  return { wd, d }
}

export function CalendarTab() {
  const {
    calendar,
    rescheduleCalendarItem,
    cancelCalendarItem,
    publishCalendarItemNow,
    schedulePost,
    posts,
    setAgentTab,
  } = useSocial()
  const { t } = useLang()

  const [view, setView] = useState<"week" | "month">("week")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [reschedule, setReschedule] = useState<{ id: string; date: string; time: string } | null>(null)

  // 本周 7 天（周一→周日），按"今天"算。取代原型里写死的那一周。
  const WEEK_DAYS = useMemo(() => currentWeekDays(), [])

  const selected = calendar.find((c) => c.id === selectedId) ?? null

  const byDay = useMemo(() => {
    const map: Record<string, CalendarItem[]> = {}
    for (const day of WEEK_DAYS) map[day] = []
    for (const item of calendar) {
      if (map[item.date]) map[item.date].push(item)
      else map[item.date] = [item]
    }
    for (const day of Object.keys(map)) map[day].sort((a, b) => a.time.localeCompare(b.time))
    return map
  }, [calendar, WEEK_DAYS])

  const needsAttention = calendar.filter((c) => c.status === "Failed")

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 px-6 py-8">
      {/* Header controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{t("Calendar & scheduling", "日历与排期")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("Publishing jobs for the week of Jul 6 – Jul 12", "Jul 6 – Jul 12 当周的发布任务")}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-md border border-border p-0.5">
            <button
              type="button"
              onClick={() => setView("week")}
              className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
                view === "week" ? "bg-brand text-brand-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t("Week", "周")}
            </button>
            <button
              type="button"
              onClick={() => setView("month")}
              className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
                view === "month" ? "bg-brand text-brand-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t("Month", "月")}
            </button>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="size-8" aria-label={t("Previous", "上一周")}>
              <ChevronLeft className="size-4" />
            </Button>
            <span className="min-w-24 text-center text-sm font-medium text-foreground">Jul 6 – 12</span>
            <Button variant="outline" size="icon" className="size-8" aria-label={t("Next", "下一周")}>
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Needs attention strip */}
      {needsAttention.length > 0 ? (
        <div className="flex items-center gap-3 rounded-lg border border-status-fallback/30 bg-[oklch(0.97_0.03_70)] px-4 py-2.5">
          <AlertTriangle className="size-4 shrink-0 text-status-fallback" />
          <p className="text-sm text-foreground">
            {t(
              `${needsAttention.length} job${needsAttention.length === 1 ? "" : "s"} need attention — failed.`,
              `${needsAttention.length} 个任务需要关注 —— 发布失败。`,
            )}
          </p>
        </div>
      ) : null}

      {view === "week" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
          {WEEK_DAYS.map((day) => {
            const { wd, d } = dayShort(day)
            const items = byDay[day] ?? []
            return (
              <div key={day} className="flex flex-col rounded-lg border border-border bg-card">
                <div className="flex items-center justify-between border-b border-border px-3 py-2">
                  <span className="text-xs font-semibold text-foreground">{wd}</span>
                  <span className="text-xs text-muted-foreground">Jul {d}</span>
                </div>
                <div className="flex flex-1 flex-col gap-2 p-2">
                  {items.length === 0 ? (
                    <p className="px-1 py-3 text-center text-xs text-muted-foreground">{t("No jobs", "暂无任务")}</p>
                  ) : (
                    items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setSelectedId(item.id)}
                        className="rounded-md border border-border bg-background p-2 text-left transition-colors hover:border-brand"
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-medium tabular-nums text-muted-foreground">{item.time}</span>
                          <div className="flex -space-x-1">
                            {item.variants.map((v) => (
                              <PlatformBadge key={v.platform} platform={v.platform} />
                            ))}
                          </div>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs font-medium text-foreground">{item.topic}</p>
                        <div className="mt-1.5">
                          <StatusBadge status={item.status} />
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <MonthView items={calendar} onSelect={setSelectedId} />
      )}

      {/* Detail drawer */}
      <JobDrawer
        item={selected}
        onClose={() => setSelectedId(null)}
        onReschedule={(item) => setReschedule({ id: item.id, date: item.date, time: item.time })}
        onCancel={(id) => {
          cancelCalendarItem(id)
          setSelectedId(null)
        }}
        onPublishNow={(id) => publishCalendarItemNow(id)}
        onRetry={(item) => {
          const post = posts.find((p) => p.id === item.postId)
          if (post) schedulePost(post)
          publishCalendarItemNow(item.id)
        }}
        onGoToLibrary={() => {
          setSelectedId(null)
          setAgentTab("Content Create")
        }}
      />

      {/* Reschedule confirmation modal */}
      <Modal
        open={reschedule !== null}
        onClose={() => setReschedule(null)}
        title={t("Reschedule job", "重新排期")}
        description={t(
          "Pick a new day and time. Auto platforms will re-queue.",
          "选择新的日期与时间。自动平台将重新排队。",
        )}
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setReschedule(null)}>
              {t("Cancel", "取消")}
            </Button>
            <Button
              size="sm"
              className="bg-brand text-brand-foreground hover:bg-brand/90"
              onClick={() => {
                if (reschedule) rescheduleCalendarItem(reschedule.id, reschedule.date, reschedule.time)
                setReschedule(null)
              }}
            >
              {t("Confirm reschedule", "确认重新排期")}
            </Button>
          </>
        }
      >
        {reschedule ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("Day", "日期")}>
              <Select value={reschedule.date} onChange={(e) => setReschedule({ ...reschedule, date: e.target.value })}>
                {WEEK_DAYS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("Time", "时间")}>
              <Select value={reschedule.time} onChange={(e) => setReschedule({ ...reschedule, time: e.target.value })}>
                {TIME_SLOTS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}

function MonthView({ items, onSelect }: { items: CalendarItem[]; onSelect: (id: string) => void }) {
  // A simple July grid; Jul 1 falls mid-week in this mock month.
  const firstWeekOffset = 2 // start grid with two empty cells
  const cells: { day: number | null }[] = []
  for (let i = 0; i < firstWeekOffset; i++) cells.push({ day: null })
  for (let d = 1; d <= 31; d++) cells.push({ day: d })
  while (cells.length % 7 !== 0) cells.push({ day: null })

  const byDate: Record<number, CalendarItem[]> = {}
  for (const item of items) {
    const d = Number(item.date.split(" ")[2])
    if (!byDate[d]) byDate[d] = []
    byDate[d].push(item)
  }

  return (
    <Card className="overflow-hidden">
      <div className="grid grid-cols-7 border-b border-border bg-muted/40">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="px-3 py-2 text-center text-xs font-semibold text-muted-foreground">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((cell, i) => {
          const dayItems = cell.day ? byDate[cell.day] ?? [] : []
          return (
            <div
              key={i}
              className="min-h-24 border-b border-r border-border p-1.5 [&:nth-child(7n)]:border-r-0"
            >
              {cell.day ? (
                <>
                  <span className="text-xs font-medium text-muted-foreground">{cell.day}</span>
                  <div className="mt-1 flex flex-col gap-1">
                    {dayItems.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onSelect(item.id)}
                        className="flex items-center gap-1 rounded bg-brand-muted px-1.5 py-1 text-left text-[10px] font-medium text-brand-muted-foreground hover:bg-brand/20"
                      >
                        <span className="tabular-nums">{item.time}</span>
                        <span className="line-clamp-1">{item.topic}</span>
                      </button>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          )
        })}
      </div>
    </Card>
  )
}

function JobDrawer({
  item,
  onClose,
  onReschedule,
  onCancel,
  onPublishNow,
  onRetry,
  onGoToLibrary,
}: {
  item: CalendarItem | null
  onClose: () => void
  onReschedule: (item: CalendarItem) => void
  onCancel: (id: string) => void
  onPublishNow: (id: string) => void
  onRetry: (item: CalendarItem) => void
  onGoToLibrary: () => void
}) {
  const { t } = useLang()
  if (!item) return null

  const hasAuto = item.variants.some((v) => v.publishMode === "auto")
  const hasManual = item.variants.some((v) => v.publishMode === "manual")
  const hasFailed = item.variants.some((v) => v.status === "Failed") || item.status === "Failed"
  const isDone = item.status === "Published" || item.status === "Cancelled"

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={t("Job detail", "任务详情")}
        className="relative z-10 flex h-full w-full max-w-md flex-col overflow-hidden border-l border-border bg-card shadow-xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <CalendarClock className="size-4 text-muted-foreground" />
              <span className="text-sm font-medium tabular-nums text-muted-foreground">
                {item.date} · {item.time}
              </span>
            </div>
            <h2 className="mt-1 text-base font-semibold text-foreground">{item.topic}</h2>
            <div className="mt-2">
              <StatusBadge status={item.status} />
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted"
            aria-label={t("Close", "关闭")}
          >
            <ChevronRight className="size-4" />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("Per-platform jobs", "各平台任务")} ({item.variants.length})
          </h3>
          {item.variants.map((v) => (
            <div key={v.platform} className="rounded-lg border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <PlatformBadge platform={v.platform} size="md" />
                  <div>
                    <p className="text-sm font-medium text-foreground">{v.platform}</p>
                    <p className="text-xs text-muted-foreground">{v.account}</p>
                  </div>
                </div>
                <StatusBadge status={v.status} />
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                <span className="tabular-nums">{t("Fires at", "触发于")} {v.time}</span>
                <span className={v.publishMode === "auto" ? "text-status-published" : "text-status-fallback"}>
                  {v.publishMode === "auto" ? t("Auto publish", "自动发布") : t("Manual publish", "手动发布")}
                </span>
              </div>
              {v.reason ? (
                <p className="mt-2 rounded bg-muted px-2 py-1.5 text-xs text-muted-foreground">{v.reason}</p>
              ) : null}
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="space-y-2 border-t border-border px-5 py-4">
          {hasFailed ? (
            <Button
              size="sm"
              className="w-full justify-center bg-brand text-brand-foreground hover:bg-brand/90"
              onClick={() => onRetry(item)}
            >
              <RefreshCw className="size-4" /> {t("Retry failed auto jobs", "重试失败的自动任务")}
            </Button>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm" disabled={isDone} onClick={() => onReschedule(item)}>
              <CalendarClock className="size-4" /> {t("Reschedule", "重新排期")}
            </Button>
            <Button variant="outline" size="sm" disabled={isDone || !hasAuto} onClick={() => onPublishNow(item.id)}>
              <Send className="size-4" /> {t("Publish now", "立即发布")}
            </Button>
            <Button variant="outline" size="sm" disabled={isDone} onClick={() => onCancel(item.id)}>
              <Ban className="size-4" /> {t("Cancel job", "取消任务")}
            </Button>
          </div>
          {hasManual ? (
            <button
              type="button"
              onClick={onGoToLibrary}
              className="flex w-full items-center justify-center gap-1.5 py-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <CheckCircle2 className="size-3.5" /> {t("Open in Content Create to export manual copy", "在内容创作中打开以导出手动文案")}
            </button>
          ) : null}
        </div>
      </aside>
    </div>
  )
}
