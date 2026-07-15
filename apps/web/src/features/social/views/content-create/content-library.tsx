"use client"

import { useEffect, useMemo, useState } from "react"
import { useSocial } from "@/features/social/store"
import { type Platform, type PostStatus, type SocialPost } from "@social/shared"
import { Button } from "@/components/ui/button"
import { Card, Modal, PlatformBadge, StatusBadge } from "@/features/social/components/ui"
import { BatchPublishModal } from "@/features/social/components/batch-publish"
import { PlatformPreviewModal } from "./platform-preview-modal"
import { useLang } from "@/features/social/i18n"
import { STATUS_LABELS } from "@/features/social/i18n/labels"
import { cn } from "@/lib/utils"
import { CheckSquare, ListFilter, PencilLine, RefreshCw, Send, Square, Trash2 } from "lucide-react"

/* ---------- content library ---------- */
// 可二次修改 / 可删除的作用面：未发表草稿(Draft/Ready) + 已排期(Scheduled)。
// 已发布(Published)、发布中(Publishing)、失败/取消不在其中。
// 已排期帖子的删除会级联清日历项；二次修改会先撤回排期(回 Ready 草稿)——见 store.startStudioFromPost。
const EDITABLE_STATUSES: PostStatus[] = ["Draft", "Ready", "Scheduled"]
const isEditableDraft = (s: PostStatus) => EDITABLE_STATUSES.includes(s)
const isScheduledStatus = (s: PostStatus) => s === "Scheduled"
const FILTERS: { label: string; value: PostStatus | "All" }[] = [
  { label: "All", value: "All" },
  { label: "Ready", value: "Ready" },
  { label: "Scheduled", value: "Scheduled" },
  { label: "Failed", value: "Failed" },
  { label: "Published", value: "Published" },
]

export function ContentLibrary({ onEditPost }: { onEditPost: (post: SocialPost) => void }) {
  const { posts, retryFailed, deletePost, schedulePost, publishPostNow } = useSocial()
  const { t, te } = useLang()
  const [filter, setFilter] = useState<PostStatus | "All">("All")
  const [selected, setSelected] = useState<string[]>([])
  const [batchOpen, setBatchOpen] = useState(false)
  // 平台预览弹窗：点击某行某平台图标时，记下 {帖子, 平台} 打开预览。
  const [preview, setPreview] = useState<{ post: SocialPost; platform: Platform } | null>(null)
  // 删除二次确认：记下待删的帖子，确认后才真删（硬删不可逆）。
  const [confirmDelete, setConfirmDelete] = useState<SocialPost | null>(null)

  const visible = useMemo(
    () => posts.filter((p) => filter === "All" || p.status === filter),
    [posts, filter],
  )
  const selectedPosts = posts.filter((p) => selected.includes(p.id))
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{t("Content Library", "内容库")}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{t("Every generated post and its per-platform publish state.", "每一条生成的帖子及其在各平台的发布状态。")}</p>
        </div>
        <Button onClick={() => setBatchOpen(true)} disabled={selected.length === 0} size="sm" className="bg-brand text-brand-foreground hover:bg-brand/90">
          <Send className="size-4" />
          {t("Batch publish", "批量发布")}{selected.length > 0 ? ` (${selected.length})` : ""}
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
            {f.value === "All" ? t("All", "全部") : te(STATUS_LABELS[f.value])}
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {visible.length === 0 ? (
          <div className="rounded-md border border-border px-5 py-12 text-center text-sm text-muted-foreground">{t("No posts in this view.", "该视图下暂无帖子。")}</div>
        ) : (
          visible.map((post) => (
            <LibraryRow
              key={post.id}
              post={post}
              checked={selected.includes(post.id)}
              onToggle={() => toggle(post.id)}
              onRetry={() => retryFailed(post.id)}
              onPublish={() => publishPostNow(post)}
              onSchedule={() => schedulePost(post)}
              onEdit={() => onEditPost(post)}
              onDelete={() => setConfirmDelete(post)}
              onPreview={(platform) => setPreview({ post, platform })}
            />
          ))
        )}
      </div>

      <BatchPublishModal
        open={batchOpen}
        onClose={() => setBatchOpen(false)}
        topic={selectedPosts.length === 1 ? selectedPosts[0].title : `${selectedPosts.length} posts selected`}
        variants={selectedPosts.flatMap((p) => p.variants)}
        onConfirm={async () => {
          // 批量发布 = 真实发布：逐条调发布层（串行，避免并发把计费/限流打爆），各自按结果回写状态。
          for (const p of selectedPosts) await publishPostNow(p)
          setSelected([])
          setBatchOpen(false)
        }}
      />

      <PlatformPreviewModal
        key={preview ? `${preview.post.id}:${preview.platform}` : "closed"}
        post={preview?.post ?? null}
        initialPlatform={preview?.platform ?? null}
        onClose={() => setPreview(null)}
      />

      {/* 删除二次确认：硬删不可逆，明确提示 */}
      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title={t("Delete post?", "删除帖子？")}
        description={
          confirmDelete
            ? isScheduledStatus(confirmDelete.status)
              ? t(
                  `“${confirmDelete.title}” is scheduled. Deleting it also cancels its schedule. This cannot be undone.`,
                  `“${confirmDelete.title}” 已排期，删除会一并撤销它的排期。此操作不可恢复。`,
                )
              : t(
                  `“${confirmDelete.title}” will be permanently removed. This cannot be undone.`,
                  `“${confirmDelete.title}” 将被永久删除，此操作不可恢复。`,
                )
            : undefined
        }
        footer={
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setConfirmDelete(null)}>
              {t("Cancel", "取消")}
            </Button>
            <Button
              size="sm"
              className="bg-status-failed text-white hover:bg-status-failed/90"
              onClick={() => {
                if (confirmDelete) deletePost(confirmDelete.id)
                setConfirmDelete(null)
              }}
            >
              <Trash2 className="size-3.5" />
              {t("Delete", "删除")}
            </Button>
          </div>
        }
      />
    </Card>
  )
}

/** 「再次发布」按钮：就地二次确认（重发对外不可逆，但不值得为它弹模态框打断流程）。 */
function RepublishButton({ onPublish }: { onPublish: () => void }) {
  const { t } = useLang()
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const timer = setTimeout(() => setArmed(false), 3000)
    return () => clearTimeout(timer)
  }, [armed])
  if (!armed) {
    return (
      <Button size="sm" variant="outline" onClick={() => setArmed(true)}>
        <Send className="size-3.5" />
        {t("Publish again", "再次发布")}
      </Button>
    )
  }
  return (
    <Button size="sm" className="bg-brand text-brand-foreground hover:bg-brand/90" onClick={onPublish}>
      <Send className="size-3.5" />
      {t("Confirm?", "确认再发?")}
    </Button>
  )
}

function LibraryRow({
  post,
  checked,
  onToggle,
  onRetry,
  onPublish,
  onSchedule,
  onEdit,
  onDelete,
  onPreview,
}: {
  post: SocialPost
  checked: boolean
  onToggle: () => void
  onRetry: () => void
  onPublish: () => void
  onSchedule: () => void
  onEdit: () => void
  onDelete: () => void
  onPreview: (platform: Platform) => void
}) {
  const { t } = useLang()
  const editable = isEditableDraft(post.status)
  return (
    <div className="rounded-md border border-border px-4 py-3.5">
      <div className="flex items-start gap-3">
        <button onClick={onToggle} className="mt-0.5 text-muted-foreground hover:text-foreground" aria-label={t("Select post", "选择帖子")}>
          {checked ? <CheckSquare className="size-5 text-brand" /> : <Square className="size-5" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium text-foreground">{post.title}</span>
            <StatusBadge status={post.status} />
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {/* 平台图标可点：点击弹出这条帖子在该平台的发布预览 */}
            <span className="flex items-center gap-1">
              {post.platforms.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => onPreview(p)}
                  className="rounded-md transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1"
                  title={t("Preview on", "预览") + ` ${p}`}
                  aria-label={t("Preview on", "预览") + ` ${p}`}
                >
                  <PlatformBadge platform={p} />
                </button>
              ))}
            </span>
            <span>·</span>
            <span>{post.assetType}</span>
            <span>·</span>
            <span>{t("Updated", "更新于")} {post.updatedAt}</span>
          </div>
          {post.status === "Failed" && post.failureReason ? (
            <p className="mt-2 rounded-md bg-[oklch(0.96_0.03_27)] px-2.5 py-1.5 text-xs text-status-failed">{post.failureReason}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {post.status === "Ready" ? (
            <Button size="sm" variant="outline" onClick={onSchedule}>
              <Send className="size-3.5" />
              {t("Schedule", "排期")}
            </Button>
          ) : null}
          {post.status === "Failed" ? (
            <Button size="sm" variant="outline" onClick={onRetry}>
              <RefreshCw className="size-3.5" />
              {t("Retry", "重试")}
            </Button>
          ) : null}
          {/* 已发布 → 仍可【再次发布】（换个账号发 / 改完再发）。
              曾经这条路被 store 一刀切封死（"已发布过就不给发"），误伤了这两个合法场景。
              重发是对外不可逆的动作，故点一次变确认、再点才真发（同账号同文案 X 会自己拒重复）。 */}
          {post.status === "Published" ? <RepublishButton onPublish={onPublish} /> : null}
          {/* 未发表草稿(Draft/Ready)：可二次修改(回到 Step 2 编辑窗口) / 硬删除。其它状态不显示。 */}
          {editable ? (
            <Button size="sm" variant="outline" onClick={onEdit}>
              <PencilLine className="size-3.5" />
              {t("Edit", "二次修改")}
            </Button>
          ) : null}
          {editable ? (
            <button onClick={onDelete} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-status-failed hover:bg-status-failed/10">
              <Trash2 className="size-3.5" />
              {t("Delete", "删除")}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
