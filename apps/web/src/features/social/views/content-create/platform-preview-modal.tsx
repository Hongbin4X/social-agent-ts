"use client"

// 平台发布预览弹窗。
// 场景（用户需求，2026-07-09）：内容库里每条帖子点某平台图标 → 弹出「这条帖子发到该平台后长什么样」。
// 结构：复用通用 Modal 外壳；顶部一排该帖子涉及的平台切换 tab（方便对比同一帖子的各平台差异）；
//       主体用 PlatformFrame 渲染当前平台的半仿真皮肤；某平台缺 variant 时显示空态（不造假）。

import { useState } from "react"
import type { Platform, SocialPost } from "@social/shared"
import { Modal, PlatformBadge } from "@/features/social/components/ui"
import { useLang } from "@/features/social/i18n"
import { cn } from "@/lib/utils"
import { PlatformFrame } from "./platform-frames"

export function PlatformPreviewModal({
  post,
  initialPlatform,
  onClose,
}: {
  post: SocialPost | null
  initialPlatform: Platform | null
  onClose: () => void
}) {
  const { t } = useLang()
  // active 初始化为被点击的平台。父层用 key（post.id+平台）在每次打开时重挂载本组件，
  // 从而天然重置到被点击平台——避免用 effect 同步 props 到 state 的反模式。
  const [active, setActive] = useState<Platform | null>(initialPlatform)

  if (!post) return null

  // tab 用帖子声明的目标平台，与内容库行里显示的图标一致；去重保序。
  const platforms = post.platforms.filter((p, i) => post.platforms.indexOf(p) === i)
  const current = active ?? platforms[0] ?? null
  const variant = current ? post.variants.find((v) => v.platform === current) ?? null : null

  return (
    <Modal open={!!post} onClose={onClose} title={t("Platform preview", "平台预览")} description={post.title} wide>
      {/* 平台切换 tab */}
      <div className="flex flex-wrap items-center gap-2">
        {platforms.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setActive(p)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
              p === current
                ? "border-brand bg-brand-muted text-foreground"
                : "border-border bg-background text-muted-foreground hover:bg-muted",
            )}
          >
            <PlatformBadge platform={p} />
            {p}
          </button>
        ))}
      </div>

      {/* 当前平台预览 */}
      <div className="mt-4">
        {variant ? (
          <PlatformFrame variant={variant} />
        ) : (
          <div className="rounded-md border border-dashed border-border px-5 py-12 text-center text-sm text-muted-foreground">
            {t("No content generated for this platform yet.", "该平台的内容尚未生成。")}
          </div>
        )}
      </div>

      {/* 免责：预览用途说明，沿用创作页的口径 */}
      <p className="mt-4 text-xs text-muted-foreground">
        {t(
          "Approximate preview to compare how this post reads on each platform — not a pixel-perfect replica, and engagement counts are illustrative.",
          "近似预览，用于对比这条帖子在各平台的呈现差异 — 并非像素级还原，互动图标仅为示意、非真实数据。",
        )}
      </p>
    </Modal>
  )
}
