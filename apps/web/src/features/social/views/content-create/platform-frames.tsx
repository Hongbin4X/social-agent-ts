"use client"

// 平台皮肤（半仿真预览外壳）。
// 决策背景（用户拍板「半仿真平台皮肤」，2026-07-09）：
//   - 目标是让用户在内容库里点平台图标，就能看到「这条帖子发到该平台后大致长什么样」。
//   - 只抓每个平台的辨识特征（排版结构 + 互动条形态），不追像素级 100% 还原（那是过度工程化）。
//   - 互动条只画图标、不编造点赞/评论数——避免用户误以为是真实数据（铁律：不造假、不掩盖）。
// 每个 *Frame 接收同一份 PostVariant，输出该平台特征的「手机卡片」。PlatformFrame 按平台分发。
// 配图/比例复用 helpers.ratioOf 与 preview-card 已有的「真图 or 占位」逻辑，保持一致。

import type { Platform, PostVariant } from "@social/shared"
import { useLang } from "@/features/social/i18n"
import { cn } from "@/lib/utils"
import { ratioOf } from "./helpers"
import {
  ArrowBigDown,
  ArrowBigUp,
  Bookmark,
  Eye,
  Globe,
  Heart,
  ImageIcon,
  MessageCircle,
  MoreHorizontal,
  Music,
  Play,
  Repeat2,
  Send,
  Share,
  ThumbsUp,
} from "lucide-react"

/* ---------- 小工具：账号名 / 头像 / 配图 ---------- */

// account 里存的是形如 "@northstar_ai" 的 handle；展示名去掉 @，handle 保证带 @。
const handleOf = (a?: string) => (a && a.startsWith("@") ? a : `@${(a ?? "account").replace(/^@/, "")}`)
const nameOf = (a?: string) => (a ?? "account").replace(/^@/, "")

// 头像占位：没有真实头像，用账号首字母 + 品牌色块。square 用于 YouTube 频道图之外的场景可切圆/方。
function Avatar({ name, className, square = false }: { name?: string; className?: string; square?: boolean }) {
  const letter = nameOf(name).charAt(0).toUpperCase() || "•"
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center bg-gradient-to-br from-brand to-brand/60 font-semibold text-brand-foreground",
        square ? "rounded-md" : "rounded-full",
        className,
      )}
    >
      {letter}
    </div>
  )
}

// 配图块：与 preview-card 同源逻辑——有 mediaUrl 显真图，否则占位；No media 视平台决定是否显示空态。
// forceRatio 让个别平台强制固定比例（如 YouTube 缩略图恒 16:9）；缺省走 variant.format 推导。
function FrameMedia({
  variant,
  rounded = "rounded-lg",
  showEmptyState = false,
  forceRatio,
  className,
}: {
  variant: PostVariant
  rounded?: string
  showEmptyState?: boolean
  forceRatio?: string
  className?: string
}) {
  const { t } = useLang()
  const noMedia = !variant.mediaAsset || variant.mediaAsset === "No media"
  // 文本型平台（X/Reddit/Facebook）无媒体时直接不渲染图；图片型平台（IG/YT/TikTok）显示占位空态。
  if (noMedia && !showEmptyState) return null
  const ratio = (forceRatio ?? ratioOf(variant.format)).replace(":", "/")
  return (
    <div
      style={{ aspectRatio: ratio }}
      className={cn(
        "relative flex items-center justify-center overflow-hidden bg-muted text-xs text-muted-foreground",
        rounded,
        className,
      )}
    >
      {variant.mediaUrl && !noMedia ? (
        // 真实生成的图片（本地 FS 经 /media 反代）。用户内容动态 URL，用原生 img。
        // eslint-disable-next-line @next/next/no-img-element
        <img src={variant.mediaUrl} alt={t("Post image", "帖子配图")} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <span className="flex items-center gap-1.5 px-3 text-center">
          <ImageIcon className="size-4 shrink-0" />
          {noMedia ? t("No media attached", "未附带媒体") : `${variant.mediaAsset} · ${forceRatio ?? ratioOf(variant.format)}`}
        </span>
      )}
    </div>
  )
}

// 正文段：hook 作强调首句 + body 正文。空态给占位。whitespace-pre-line 保留换行。
function BodyText({ hook, body, className }: { hook?: string; body?: string; className?: string }) {
  const { t } = useLang()
  return (
    <div className={cn("space-y-1", className)}>
      {hook ? <p className="text-sm font-semibold text-foreground">{hook}</p> : null}
      <p className="whitespace-pre-line text-sm text-foreground/90">{body || (hook ? "" : t("No copy yet.", "尚无文案。"))}</p>
    </div>
  )
}

// hashtags + CTA：两者都是内容的一部分，用平台蓝强调，不做真实跳转（预览）。
function Extras({ variant }: { variant: PostVariant }) {
  return (
    <>
      {variant.hashtags ? <p className="mt-1.5 text-sm text-status-scheduled">{variant.hashtags}</p> : null}
      {variant.cta ? <p className="mt-1.5 text-sm font-medium text-status-scheduled">{variant.cta} ›</p> : null}
    </>
  )
}

// 互动条单个图标（只作平台辨识，不带计数）。
const barIcon = "size-[18px]"

/* ---------- 卡片外壳 ---------- */
// 统一手机卡片宽度；底色/边框交给各 frame（TikTok 是深色，其余浅色）。
function Card({ dark = false, className, children }: { dark?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-[400px] overflow-hidden rounded-2xl border shadow-sm",
        dark ? "border-white/10 bg-black text-white" : "border-border bg-background text-foreground",
        className,
      )}
    >
      {children}
    </div>
  )
}

/* ---------- X（Twitter）：推文流 ---------- */
function XFrame({ variant }: { variant: PostVariant }) {
  return (
    <Card>
      <div className="flex gap-3 p-4">
        <Avatar name={variant.account} className="h-10 w-10 text-sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 text-sm">
            <span className="font-semibold text-foreground">{nameOf(variant.account)}</span>
            <span className="truncate text-muted-foreground">{handleOf(variant.account)} · now</span>
            <MoreHorizontal className="ml-auto size-4 shrink-0 text-muted-foreground" />
          </div>
          <BodyText hook={variant.hook} body={variant.body} className="mt-1" />
          <Extras variant={variant} />
          <div className="mt-3">
            <FrameMedia variant={variant} rounded="rounded-2xl border border-border" />
          </div>
          {/* X 底部互动条：评论 / 转推 / 点赞 / 查看 / 分享 */}
          <div className="mt-3 flex items-center justify-between pr-2 text-muted-foreground">
            <MessageCircle className={barIcon} />
            <Repeat2 className={barIcon} />
            <Heart className={barIcon} />
            <Eye className={barIcon} />
            <Share className={barIcon} />
          </div>
        </div>
      </div>
    </Card>
  )
}

/* ---------- Instagram：顶栏 + 方图 + 爱心互动条 + caption ---------- */
function InstagramFrame({ variant }: { variant: PostVariant }) {
  return (
    <Card>
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <Avatar name={variant.account} className="h-8 w-8 text-xs" />
        <span className="text-sm font-semibold text-foreground">{nameOf(variant.account)}</span>
        <MoreHorizontal className="ml-auto size-4 text-muted-foreground" />
      </div>
      {/* IG 本质要图：无媒体也显示占位空态 */}
      <FrameMedia variant={variant} rounded="rounded-none" showEmptyState className="border-y border-border" />
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-4 text-foreground">
          <Heart className={barIcon} />
          <MessageCircle className={barIcon} />
          <Send className={barIcon} />
          <Bookmark className={cn(barIcon, "ml-auto")} />
        </div>
        {/* caption：粗体用户名 + 文案 */}
        <div className="mt-2 text-sm">
          <span className="font-semibold text-foreground">{nameOf(variant.account)} </span>
          <span className="text-foreground/90">{variant.hook || variant.body}</span>
        </div>
        {variant.hook && variant.body ? <p className="mt-1 whitespace-pre-line text-sm text-foreground/80">{variant.body}</p> : null}
        <Extras variant={variant} />
      </div>
    </Card>
  )
}

/* ---------- YouTube：横版缩略图 + 标题 + 频道行 ---------- */
function YouTubeFrame({ variant }: { variant: PostVariant }) {
  const { t } = useLang()
  return (
    <Card>
      {/* 缩略图恒 16:9，右下角时长角标；无媒体显示占位 */}
      <div className="relative">
        <FrameMedia variant={variant} rounded="rounded-none" showEmptyState forceRatio="16:9" />
        <span className="absolute bottom-2 right-2 rounded bg-black/80 px-1.5 py-0.5 text-[11px] font-medium text-white">0:30</span>
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex size-11 items-center justify-center rounded-full bg-black/55 text-white">
            <Play className="size-5 translate-x-[1px]" fill="currentColor" />
          </span>
        </span>
      </div>
      <div className="flex gap-3 p-3">
        <Avatar name={variant.account} className="h-9 w-9 text-sm" />
        <div className="min-w-0 flex-1">
          {/* YouTube 有标题：hook 当视频标题，两行截断 */}
          <p className="line-clamp-2 text-sm font-semibold text-foreground">{variant.hook || t("Untitled video", "未命名视频")}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {nameOf(variant.account)} · {t("1.2K views · now", "1.2K 次观看 · 刚刚")}
          </p>
          {variant.body ? <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">{variant.body}</p> : null}
          <Extras variant={variant} />
        </div>
      </div>
    </Card>
  )
}

/* ---------- TikTok：竖屏大图 + 右侧图标柱 + 底部账号/文案/音乐 ---------- */
function TikTokFrame({ variant }: { variant: PostVariant }) {
  return (
    <Card dark className="max-w-[300px]">
      <div className="relative">
        {/* 竖屏 9:16；深色底 */}
        <FrameMedia variant={variant} rounded="rounded-none" showEmptyState forceRatio="9:16" className="bg-neutral-900 text-white/70" />
        {/* 右侧竖排互动图标柱 */}
        <div className="absolute bottom-20 right-2 flex flex-col items-center gap-4 text-white">
          <Avatar name={variant.account} className="h-9 w-9 border-2 border-white text-sm" />
          <Heart className="size-7" />
          <MessageCircle className="size-7" />
          <Bookmark className="size-7" />
          <Share className="size-7" />
        </div>
        {/* 底部账号 + 文案 + 音乐条 */}
        <div className="absolute inset-x-0 bottom-0 space-y-1.5 bg-gradient-to-t from-black/80 to-transparent p-3 pr-14 text-white">
          <p className="text-sm font-semibold">{handleOf(variant.account)}</p>
          <p className="line-clamp-2 text-sm text-white/90">{variant.hook || variant.body}</p>
          {variant.hashtags ? <p className="line-clamp-1 text-sm text-white/90">{variant.hashtags}</p> : null}
          <p className="flex items-center gap-1.5 text-xs text-white/80">
            <Music className="size-3.5" /> {nameOf(variant.account)} · original sound
          </p>
        </div>
      </div>
    </Card>
  )
}

/* ---------- Reddit：子版块头 + 标题 + 正文 + 投票条 ---------- */
function RedditFrame({ variant }: { variant: PostVariant }) {
  const { t } = useLang()
  // account 当作作者，子版块用品牌名派生一个 r/ 占位。
  const sub = `r/${nameOf(variant.account).replace(/[^a-zA-Z0-9]/g, "") || "community"}`
  return (
    <Card>
      <div className="p-3.5">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Avatar name={variant.account} className="h-5 w-5 text-[10px]" />
          <span className="font-semibold text-foreground">{sub}</span>
          <span>· {t("Posted by", "发布者")} u/{nameOf(variant.account)} · now</span>
        </div>
        {/* Reddit 有标题：hook 作大号粗体标题 */}
        <p className="mt-2 text-base font-semibold leading-snug text-foreground">{variant.hook || t("Untitled post", "未命名帖子")}</p>
        {variant.body ? <p className="mt-1.5 whitespace-pre-line text-sm text-foreground/90">{variant.body}</p> : null}
        <Extras variant={variant} />
        <div className="mt-3">
          <FrameMedia variant={variant} rounded="rounded-md border border-border" />
        </div>
        {/* 投票 + 评论 + 分享 */}
        <div className="mt-3 flex items-center gap-4 text-xs font-medium text-muted-foreground">
          <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-1">
            <ArrowBigUp className="size-4" /> {t("Vote", "投票")} <ArrowBigDown className="size-4" />
          </span>
          <span className="flex items-center gap-1">
            <MessageCircle className="size-4" /> {t("Comments", "评论")}
          </span>
          <span className="flex items-center gap-1">
            <Share className="size-4" /> {t("Share", "分享")}
          </span>
        </div>
      </div>
    </Card>
  )
}

/* ---------- Facebook：信息流 ---------- */
function FacebookFrame({ variant }: { variant: PostVariant }) {
  const { t } = useLang()
  return (
    <Card>
      <div className="flex items-center gap-2.5 p-3">
        <Avatar name={variant.account} className="h-10 w-10 text-sm" />
        <div>
          <p className="text-sm font-semibold text-foreground">{nameOf(variant.account)}</p>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            now · <Globe className="size-3" />
          </p>
        </div>
        <MoreHorizontal className="ml-auto size-4 text-muted-foreground" />
      </div>
      <div className="px-3 pb-2">
        <BodyText hook={variant.hook} body={variant.body} />
        <Extras variant={variant} />
      </div>
      <FrameMedia variant={variant} rounded="rounded-none" forceRatio="1.91:1" />
      {/* 点赞/评论/分享条 */}
      <div className="flex items-center justify-around border-t border-border py-1.5 text-sm font-medium text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <ThumbsUp className="size-[18px]" /> {t("Like", "赞")}
        </span>
        <span className="flex items-center gap-1.5">
          <MessageCircle className="size-[18px]" /> {t("Comment", "评论")}
        </span>
        <span className="flex items-center gap-1.5">
          <Share className="size-[18px]" /> {t("Share", "分享")}
        </span>
      </div>
    </Card>
  )
}

/* ---------- 分发 ---------- */
const FRAMES: Record<Platform, (props: { variant: PostVariant }) => React.ReactElement> = {
  X: XFrame,
  Instagram: InstagramFrame,
  YouTube: YouTubeFrame,
  TikTok: TikTokFrame,
  Reddit: RedditFrame,
  Facebook: FacebookFrame,
}

export function PlatformFrame({ variant }: { variant: PostVariant }) {
  const Frame = FRAMES[variant.platform]
  return <Frame variant={variant} />
}
