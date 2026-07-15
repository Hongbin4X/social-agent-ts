"use client"

// 平台皮肤（半仿真预览外壳）。
// 决策背景（用户拍板「半仿真平台皮肤」，2026-07-09）：
//   - 目标是让用户在内容库里点平台图标，就能看到「这条帖子发到该平台后大致长什么样」。
//   - 只抓每个平台的辨识特征（排版结构 + 互动条形态），不追像素级 100% 还原（那是过度工程化）。
//   - 互动条只画图标、不编造点赞/评论数——避免用户误以为是真实数据（铁律：不造假、不掩盖）。
// 每个 *Frame 接收同一份 PostVariant，输出该平台特征的「手机卡片」。PlatformFrame 按平台分发。
// 配图/比例复用 helpers.ratioOf 与 preview-card 已有的「真图 or 占位」逻辑，保持一致。

import type { Platform, PostVariant } from "@social/shared"
import { planXTweets, splitBodyByImageTokens, stripImageTokens, X_TWEET_MAX, xWeightedLength } from "@social/shared"
// 取图口径的唯一真源在 store —— 发布时送的就是它返回的这批图。
// 预览与发布共用同一个函数，杜绝"两份实现慢慢漂移"导致的预览失真。
import { variantFullText, variantImageUrls } from "@/features/social/store"
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

// account 存的是真实已授权账号的显示名（如 "@ChenR292518"）；展示名去掉 @，handle 保证带 @。
// 空 = 该平台没有已授权账号（见 store 的 resolveVariantAccount）——如实显示「未绑定账号」，
// 不要退回一个看起来像账号名的字面量，那正是从前 @northstar_ai 骗过所有人的方式。
const NO_ACCOUNT = "未绑定账号"
const handleOf = (a?: string) => (!a ? NO_ACCOUNT : a.startsWith("@") ? a : `@${a.replace(/^@/, "")}`)
const nameOf = (a?: string) => (!a ? NO_ACCOUNT : a.replace(/^@/, ""))

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

// 配图块：与 preview-card 同源逻辑——有真图显真图，否则占位；No media 视平台决定是否显示空态。
// forceRatio 让个别平台强制固定比例（如 YouTube 缩略图恒 16:9）；缺省走 variant.format 推导。
// FIX 1（内容库预览隐藏配图槽真图）：image 模式生成的帖子，真图落在 variant.imageSlots[].url（status "ready"），
// 从不写回 variant.mediaUrl——旧逻辑只认 mediaUrl，会把已出图的帖子误判成"无媒体"从而不渲染/显示占位。
/** 多图画廊：X 上 1/2/3/4 张图的排布。 */
function XMediaGrid({ urls }: { urls: string[] }) {
  if (urls.length === 0) return null
  const grid = urls.length === 1 ? "grid-cols-1" : "grid-cols-2"
  return (
    <div className={cn("mt-3 grid gap-0.5 overflow-hidden rounded-2xl border border-border", grid)}>
      {urls.slice(0, 4).map((u, i) => (
        // eslint-disable-next-line @next/next/no-img-element -- 预览用真实 URL，无需 Next 图片优化（已 unoptimized）
        <img
          key={i}
          src={u}
          alt=""
          className={cn("w-full object-cover", urls.length === 3 && i === 0 ? "row-span-2 h-full" : "aspect-video")}
        />
      ))}
    </div>
  )
}

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
  // 只取第一张 ready 配图槽做代表图：这里是单槽 mini 预览卡片，不是多图画廊，多图场景不归它管。
  const readyImages = (variant.imageSlots ?? []).filter((s) => s.status === "ready" && s.url)
  const representativeUrl = readyImages[0]?.url
  const legacyNoMedia = !variant.mediaAsset || variant.mediaAsset === "No media"
  // 有配图槽真图时视为"有媒体"，即便 mediaAsset 仍是旧字段的 "No media" 兜底值（image 模式帖子不写 mediaAsset）。
  const noMedia = legacyNoMedia && !representativeUrl
  // 文本型平台（X/Reddit/Facebook）无媒体时直接不渲染图；图片型平台（IG/YT/TikTok）显示占位空态。
  if (noMedia && !showEmptyState) return null
  const ratio = (forceRatio ?? ratioOf(variant.format)).replace(":", "/")
  // 优先配图槽真图（image 模式帖子的实际配图来源），否则退回旧的 mediaUrl（legacy/非 image 模式帖子）。
  const imageUrl = representativeUrl ?? (variant.mediaUrl && !legacyNoMedia ? variant.mediaUrl : undefined)
  return (
    <div
      style={{ aspectRatio: ratio }}
      className={cn(
        "relative flex items-center justify-center overflow-hidden bg-muted text-xs text-muted-foreground",
        rounded,
        className,
      )}
    >
      {imageUrl ? (
        // 真实生成的图片（配图槽 url，或本地 FS 经 /media 反代的 mediaUrl）。用户内容动态 URL，用原生 img。
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt={t("Post image", "帖子配图")} className="absolute inset-0 h-full w-full object-cover" />
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
// FIX 1（内容库预览 token 泄漏）：这是纯文本展示位，不逐槽渲染配图，所以要把 [[img:N]] 占位 token
// 剥离掉，否则会作为字面文案显示给用户；复用与 preview-card 同源的 stripImageTokens，口径一致。
function BodyText({ hook, body, className }: { hook?: string; body?: string; className?: string }) {
  const { t } = useLang()
  const displayBody = stripImageTokens(body ?? "")
  return (
    <div className={cn("space-y-1", className)}>
      {hook ? <p className="text-sm font-semibold text-foreground">{hook}</p> : null}
      <p className="whitespace-pre-line text-sm text-foreground/90">{displayBody || (hook ? "" : t("No copy yet.", "尚无文案。"))}</p>
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
/**
 * X 预览 —— 【跟随用户选的发帖形态真实渲染】（2026-07-15 用户需求）。
 * 此前无论选普通推/串推/Article，右边永远画一条推文，用户看不出串推会被切成几条。
 *
 * 关键：串推分段用的是 @social/shared 的 splitIntoThreadSegments —— 和发布层【同一个函数】。
 * 所以"预览几条"就是"实际发几条"，不会出现预览 3 条、实际发 5 条的偏差。
 */
function XFrame({ variant }: { variant: PostVariant }) {
  const postType = variant.xPostType ?? "tweet"
  if (postType === "article") return <XArticleFrame variant={variant} />
  return <XTweetSequence variant={variant} mode={postType === "thread" ? "thread" : "tweet"} />
}

/**
 * 推文序列渲染 —— 普通推与串推共用。
 * 条数/配图分配全部来自 planXTweets（与发布层同一份规划），所以预览就是实际会发出去的样子。
 */
function XTweetSequence({ variant, mode }: { variant: PostVariant; mode: "tweet" | "thread" }) {
  const { t } = useLang()
  const planned = planXTweets(variantFullText(variant), variantImageUrls(variant), mode)
  // 正文里标了几个内联图槽：>1 个说明用户在用"图文相间"的心智写文案，而 X 做不到——如实提示。
  const inlineSlotCount = splitBodyByImageTokens(variant.body ?? "").filter((x) => x.type === "image").length
  if (planned.length === 0) {
    return (
      <Card>
        <p className="p-4 text-sm text-muted-foreground">{t("No copy yet.", "尚无文案。")}</p>
      </Card>
    )
  }
  const multi = planned.length > 1
  return (
    <div className="flex flex-col gap-1.5">
      {/* ⚠️ 内联图落差提示（2026-07-15 实测确认）：X 的推文【没有内联图】——
          不管 [[img:N]] 写在正文哪个位置，图片一律作为附件渲染在正文【下方】。
          用户写文案时的心理预期是"图出现在这一段后面"，不提示的话会到发完才发现落差。
          实测依据：4 张图成功、5 张被 X 拒（400 "maximum of 4 items"）。 */}
      {inlineSlotCount > 1 ? (
        <p className="rounded-md bg-[oklch(0.97_0.03_70)] px-2.5 py-1.5 text-xs text-[oklch(0.48_0.13_55)]">
          {t(
            "X has no inline images — all images are attached below the text, regardless of where you put them. Use a thread if you want each image to follow its own paragraph.",
            "X 不支持内联图：无论你把图放在正文哪里，都会统一附在文字下方。想让每张图跟在对应段落后面，请改用串推。",
          )}
        </p>
      ) : null}
      {/* 一眼看出会发成几条——这是用户最关心的"真实效果"。 */}
      {multi ? (
        <p className="text-xs font-medium text-muted-foreground">
          {mode === "thread"
            ? t(`Thread · ${planned.length} tweets`, `串推 · 1 条 + ${planned.length - 1} 条回复`)
            : t(`${planned.length} tweets (4-image limit per tweet)`, `将发 ${planned.length} 条（单条最多 4 张图）`)}
        </p>
      ) : null}
      {planned.map((tw, i) => {
        const w = xWeightedLength(tw.text)
        return (
          <Card key={i}>
            <div className="flex gap-3 p-4">
              <div className="flex flex-col items-center">
                <Avatar name={variant.account} className="h-10 w-10 text-sm" />
                {/* 串起来的竖线：视觉上体现"这几条是一串"，和 X 上的真实观感一致。 */}
                {multi && i < planned.length - 1 ? <div className="mt-1 w-px flex-1 bg-border" /> : null}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1 text-sm">
                  <span className="font-semibold text-foreground">{nameOf(variant.account)}</span>
                  <span className="truncate text-muted-foreground">{handleOf(variant.account)}{i === 0 ? " · now" : ""}</span>
                  {multi ? (
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">{i + 1}/{planned.length}</span>
                  ) : (
                    <MoreHorizontal className="ml-auto size-4 shrink-0 text-muted-foreground" />
                  )}
                </div>
                {tw.text ? (
                  <p className="mt-1 whitespace-pre-line text-sm text-foreground/90">{tw.text}</p>
                ) : (
                  <p className="mt-1 text-xs italic text-muted-foreground">{t("(images only)", "（仅图片）")}</p>
                )}
                {/* 加权长度：中日韩每字算 2，用户很容易以为"才 200 字没超"，其实已 400。 */}
                {tw.text ? (
                  <p className={cn("mt-1.5 text-xs", w > X_TWEET_MAX ? "font-medium text-status-failed" : "text-muted-foreground")}>
                    {w}/{X_TWEET_MAX}
                    {w > X_TWEET_MAX ? t(" — too long", " 超长") : ""}
                  </p>
                ) : null}
                <XMediaGrid urls={tw.imageUrls} />
                {i === 0 && !multi ? (
                  <div className="mt-3 flex items-center justify-between pr-2 text-muted-foreground">
                    <MessageCircle className={barIcon} />
                    <Repeat2 className={barIcon} />
                    <Heart className={barIcon} />
                    <Eye className={barIcon} />
                    <Share className={barIcon} />
                  </div>
                ) : null}
              </div>
            </div>
          </Card>
        )
      })}
    </div>
  )
}

/** Article 里的一张内联图：按槽的状态如实呈现（未出图/生成中/失败都不假装有图）。 */
function ArticleImage({ slot }: { slot?: { status: string; url?: string; description?: string; failureReason?: string } }) {
  const { t } = useLang()
  if (slot?.status === "ready" && slot.url) {
    // eslint-disable-next-line @next/next/no-img-element -- 预览真实 URL，Next 图片优化已关（unoptimized）
    return <img src={slot.url} alt={slot.description ?? ""} className="w-full rounded-lg border border-border object-cover" />
  }
  return (
    <div className="flex min-h-24 items-center justify-center rounded-lg border border-dashed border-border bg-muted/40 px-3 py-4 text-center text-xs text-muted-foreground">
      {slot?.status === "generating"
        ? t("Generating image…", "正在生成配图…")
        : slot?.status === "failed"
          ? t(`Image failed: ${slot.failureReason ?? ""}`, `配图生成失败：${slot.failureReason ?? ""}`)
          : t(slot?.description || "Image slot — not generated yet", slot?.description || "图片槽位 — 尚未生成")}
    </div>
  )
}

/**
 * Article（长文）预览 —— X Articles 的形态：大标题 + 正文段落，不是推文卡片。
 * ⚠️ 硬门槛：发帖账号必须是 X Premium 订阅者，否则 X 会 403。预览里如实标出，别让用户白写一篇。
 */
function XArticleFrame({ variant }: { variant: PostVariant }) {
  const { t } = useLang()
  // 按 [[img:N]] 切成「文本段 / 图片段」的有序序列——图片就渲染在它在正文里的位置。
  const segments = splitBodyByImageTokens(variant.body ?? "").filter((x) => x.type === "image" || x.text.trim())
  const slotOf = (ref: number) => (variant.imageSlots ?? []).find((sl) => sl.ref === ref)
  return (
    <Card>
      <div className="p-5">
        <div className="flex items-center gap-2 text-sm">
          <Avatar name={variant.account} className="h-8 w-8 text-xs" />
          <span className="font-semibold text-foreground">{nameOf(variant.account)}</span>
          <span className="text-muted-foreground">· {t("Article", "长文")}</span>
        </div>
        <h1 className="mt-3 text-xl font-bold leading-snug text-foreground">
          {variant.hook || t("Untitled article", "未命名长文")}
        </h1>
        {/* 图文相间：按正文里 [[img:N]] 的【实际位置】插图，这才是 Article 的真实排版
            （用户 2026-07-15："article 类型对应一整篇图文相间的文章的预览形式"）。 */}
        <div className="mt-3 space-y-3">
          {segments.length > 0 ? (
            segments.map((seg, i) =>
              seg.type === "text" ? (
                <p key={i} className="whitespace-pre-line text-sm leading-relaxed text-foreground/90">
                  {seg.text.trim()}
                </p>
              ) : (
                <ArticleImage key={i} slot={slotOf(seg.ref)} />
              ),
            )
          ) : (
            <p className="text-sm text-muted-foreground">{t("No copy yet.", "尚无文案。")}</p>
          )}
        </div>
        <Extras variant={variant} />
        <p className="mt-3 rounded-md bg-[oklch(0.97_0.03_70)] px-2.5 py-1.5 text-xs text-[oklch(0.48_0.13_55)]">
          {t(
            "X Articles requires a Premium account — publishing will fail (403) otherwise.",
            "X Articles 需要发帖账号是 Premium 订阅者，否则发布会被 X 拒绝（403）。",
          )}
        </p>
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
          <span className="text-foreground/90">{variant.hook || stripImageTokens(variant.body)}</span>
        </div>
        {variant.hook && variant.body ? <p className="mt-1 whitespace-pre-line text-sm text-foreground/80">{stripImageTokens(variant.body)}</p> : null}
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
          {variant.body ? <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">{stripImageTokens(variant.body)}</p> : null}
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
          <p className="line-clamp-2 text-sm text-white/90">{variant.hook || stripImageTokens(variant.body)}</p>
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
        {variant.body ? <p className="mt-1.5 whitespace-pre-line text-sm text-foreground/90">{stripImageTokens(variant.body)}</p> : null}
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
