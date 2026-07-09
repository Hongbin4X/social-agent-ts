"use client"

import { useMemo, useState } from "react"
import { useSocial } from "@/features/social/store"
import { type PostStatus, type SocialPost } from "@social/shared"
import { Button } from "@/components/ui/button"
import { Card, PlatformBadge, StatusBadge } from "@/features/social/components/ui"
import { BatchPublishModal } from "@/features/social/components/batch-publish"
import { cn } from "@/lib/utils"
import { Archive, CheckSquare, CircleCheck, ListFilter, RefreshCw, Send, Square } from "lucide-react"

/* ---------- content library ---------- */
const FILTERS: { label: string; value: PostStatus | "All" }[] = [
  { label: "All", value: "All" },
  { label: "Ready", value: "Ready" },
  { label: "Scheduled", value: "Scheduled" },
  { label: "Manual fallback", value: "ManualFallback" },
  { label: "Failed", value: "Failed" },
  { label: "Published", value: "Published" },
]

export function ContentLibrary() {
  const { posts, markManuallyPublished, retryFailed, archivePost, schedulePost } = useSocial()
  const [filter, setFilter] = useState<PostStatus | "All">("All")
  const [selected, setSelected] = useState<string[]>([])
  const [batchOpen, setBatchOpen] = useState(false)

  const visible = useMemo(
    () => posts.filter((p) => p.status !== "Archived" && (filter === "All" || p.status === filter)),
    [posts, filter],
  )
  const selectedPosts = posts.filter((p) => selected.includes(p.id))
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Content Library</h3>
          <p className="mt-1 text-xs text-muted-foreground">Every generated post and its per-platform publish state.</p>
        </div>
        <Button onClick={() => setBatchOpen(true)} disabled={selected.length === 0} size="sm" className="bg-brand text-brand-foreground hover:bg-brand/90">
          <Send className="size-4" />
          Batch publish{selected.length > 0 ? ` (${selected.length})` : ""}
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <ListFilter className="size-4 text-muted-foreground" />
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              filter === f.value ? "bg-foreground text-background" : "border border-border bg-background text-muted-foreground hover:bg-muted",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {visible.length === 0 ? (
          <div className="rounded-md border border-border px-5 py-12 text-center text-sm text-muted-foreground">No posts in this view.</div>
        ) : (
          visible.map((post) => (
            <LibraryRow
              key={post.id}
              post={post}
              checked={selected.includes(post.id)}
              onToggle={() => toggle(post.id)}
              onMarkPublished={() => markManuallyPublished(post.id)}
              onRetry={() => retryFailed(post.id)}
              onArchive={() => archivePost(post.id)}
              onSchedule={() => schedulePost(post)}
            />
          ))
        )}
      </div>

      <BatchPublishModal
        open={batchOpen}
        onClose={() => setBatchOpen(false)}
        topic={selectedPosts.length === 1 ? selectedPosts[0].title : `${selectedPosts.length} posts selected`}
        variants={selectedPosts.flatMap((p) => p.variants)}
        onConfirm={() => {
          selectedPosts.forEach((p) => schedulePost(p))
          setSelected([])
          setBatchOpen(false)
        }}
      />
    </Card>
  )
}

function LibraryRow({
  post,
  checked,
  onToggle,
  onMarkPublished,
  onRetry,
  onArchive,
  onSchedule,
}: {
  post: SocialPost
  checked: boolean
  onToggle: () => void
  onMarkPublished: () => void
  onRetry: () => void
  onArchive: () => void
  onSchedule: () => void
}) {
  const hasManual = post.variants.some((v) => v.publishMode === "manual")
  return (
    <div className="rounded-md border border-border px-4 py-3.5">
      <div className="flex items-start gap-3">
        <button onClick={onToggle} className="mt-0.5 text-muted-foreground hover:text-foreground" aria-label="Select post">
          {checked ? <CheckSquare className="size-5 text-brand" /> : <Square className="size-5" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium text-foreground">{post.title}</span>
            <StatusBadge status={post.status} />
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              {post.platforms.map((p) => (
                <PlatformBadge key={p} platform={p} />
              ))}
            </span>
            <span>·</span>
            <span>{post.assetType}</span>
            <span>·</span>
            <span>Updated {post.updatedAt}</span>
          </div>
          {post.status === "Failed" && post.failureReason ? (
            <p className="mt-2 rounded-md bg-[oklch(0.96_0.03_27)] px-2.5 py-1.5 text-xs text-status-failed">{post.failureReason}</p>
          ) : null}
          {hasManual && post.status === "ManualFallback" ? (
            <p className="mt-2 rounded-md bg-[oklch(0.97_0.03_70)] px-2.5 py-1.5 text-xs text-[oklch(0.48_0.13_55)]">
              Some platforms require manual publishing in this version. Use the platform export, then mark as published.
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {post.status === "Ready" ? (
            <Button size="sm" variant="outline" onClick={onSchedule}>
              <Send className="size-3.5" />
              Schedule
            </Button>
          ) : null}
          {post.status === "Failed" ? (
            <Button size="sm" variant="outline" onClick={onRetry}>
              <RefreshCw className="size-3.5" />
              Retry
            </Button>
          ) : null}
          {(post.status === "ManualFallback" || post.status === "Scheduled") && hasManual ? (
            <Button size="sm" variant="outline" onClick={onMarkPublished}>
              <CircleCheck className="size-3.5" />
              Mark published
            </Button>
          ) : null}
          <button onClick={onArchive} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted">
            <Archive className="size-3.5" />
            Archive
          </button>
        </div>
      </div>
    </div>
  )
}
