"use client"

// 「发布成功」弹窗 —— 发完把【平台侧真实帖子链接】给用户。
//
// 为什么必须有：发布成功后用户第一件想做的事就是"点开看看发成什么样"。
// 此前 remoteUrl 一路从 X API → 后端 → 前端传回来，然后被【丢掉】，只弹一句
// "已发布到 1 个平台" 的 toast（2026-07-15 用户反馈）。链接是发布这个动作最有价值的产出物。
//
// 设计取向：成功/失败同屏如实呈现——部分平台成功、部分失败时不能只报喜。
import { useState } from "react"
import { CheckCircle2, Copy, ExternalLink, TriangleAlert } from "lucide-react"
import type { PublishOutcome } from "@/features/social/store"
import { Modal, PlatformBadge } from "@/features/social/components/ui"
import { Button } from "@/components/ui/button"
import { useLang } from "@/features/social/i18n"

export function PublishResultModal({ result, onClose }: { result: PublishOutcome | null; onClose: () => void }) {
  const { t } = useLang()
  const [copied, setCopied] = useState<string | null>(null)

  if (!result) return null
  const ok = result.links.length
  const bad = result.failed.length

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(url)
      setTimeout(() => setCopied(null), 1600)
    } catch {
      // 剪贴板在非 https / 无权限时会抛——不弹错误打断用户，链接本来就可见可手选。
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={bad === 0 ? t("Published", "发布成功") : t("Published with issues", "部分发布成功")}
      description={
        bad === 0
          ? t(`"${result.postTitle}" is live. Open it to check.`, `「${result.postTitle}」已发布，点开看看效果。`)
          : t(
              `${ok} platform(s) published, ${bad} failed.`,
              `${ok} 个平台已发布，${bad} 个失败。`,
            )
      }
      footer={
        <Button variant="outline" onClick={onClose}>
          {t("Done", "完成")}
        </Button>
      }
    >
      <div className="flex flex-col gap-2.5">
        {result.links.map((l) => (
          <div key={`${l.platform}-${l.remoteId}`} className="flex items-center gap-3 rounded-md border border-border px-3 py-2.5">
            <PlatformBadge platform={l.platform} size="md" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-sm font-medium text-status-published">
                <CheckCircle2 className="size-3.5" />
                {t("Published", "已发布")}
              </div>
              {/* 链接可见可选中：即使剪贴板不可用（非 https 环境），用户也能手动复制。 */}
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{l.url ?? t("(no link returned)", "（平台未返回链接）")}</p>
            </div>
            {l.url ? (
              <div className="flex shrink-0 items-center gap-1.5">
                <Button size="sm" variant="ghost" onClick={() => copy(l.url!)}>
                  <Copy className="size-3.5" />
                  {copied === l.url ? t("Copied", "已复制") : t("Copy", "复制")}
                </Button>
                {/* 这个 Button 不支持 asChild，直接用 <a> 自带样式；
                    noopener/noreferrer 必带——新开外站页不能让对方拿到 window.opener。 */}
                <a
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium text-foreground hover:bg-muted"
                >
                  <ExternalLink className="size-3.5" />
                  {t("View post", "查看帖子")}
                </a>
              </div>
            ) : null}
          </div>
        ))}

        {result.failed.map((f) => (
          <div key={f.platform} className="flex items-start gap-3 rounded-md border border-status-failed/30 bg-[oklch(0.97_0.02_27)] px-3 py-2.5">
            <PlatformBadge platform={f.platform} size="md" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-sm font-medium text-status-failed">
                <TriangleAlert className="size-3.5" />
                {t("Failed", "发布失败")}
              </div>
              {/* 如实透传平台原话，不美化成"稍后重试"——用户需要知道到底为什么失败。 */}
              <p className="mt-0.5 text-xs text-status-failed">{f.message}</p>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  )
}
