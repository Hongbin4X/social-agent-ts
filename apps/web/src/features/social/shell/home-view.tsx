"use client"

import { useState } from "react"
import { useSocial } from "@/features/social/store"
import { useLang } from "@/features/social/i18n"
import { cn } from "@/lib/utils"
import {
  AlignLeft,
  ArrowUp,
  BarChart3,
  ChevronDown,
  Code,
  Megaphone,
  MessageSquare,
  Mic,
  PenLine,
  Plus,
  Search,
  Image as ImageIcon,
  Sparkles,
  Video,
} from "lucide-react"

// 注：Yukie 是智能体产品名（专有名词），中文保持原样不翻。其余为界面文案，带 labelZh 供 t() 就地切换。
const TABS = [
  { key: "chat", label: "Chat", labelZh: "对话", icon: MessageSquare },
  { key: "yukie", label: "Yukie", labelZh: "Yukie", icon: Sparkles, badge: "Newest Agent" },
  { key: "search", label: "Search", labelZh: "搜索", icon: Search },
  { key: "image", label: "Image", labelZh: "图像", icon: ImageIcon },
  { key: "video", label: "Video", labelZh: "视频", icon: Video },
  { key: "audio", label: "Audio", labelZh: "音频", icon: Mic },
]

const QUICK = [
  { label: "Summarize", labelZh: "总结", icon: AlignLeft },
  { label: "Help me write", labelZh: "帮我写作", icon: PenLine },
  { label: "Analyze data", labelZh: "分析数据", icon: BarChart3 },
  { label: "Code", labelZh: "写代码", icon: Code },
]

export function HomeView() {
  const { goToAgent } = useSocial()
  const { t } = useLang()
  const [tab, setTab] = useState("chat")
  const [collection, setCollection] = useState<"ai" | "you">("ai")

  return (
    <div className="flex flex-1 flex-col items-center px-6 pb-16 pt-10">
      <h1 className="mt-12 text-center font-serif text-6xl tracking-tight text-foreground text-balance md:text-7xl">
        {t("All the best AI, in one place.", "最好的 AI，尽在一处。")}
      </h1>

      <div className="mt-10 inline-flex items-center gap-1 rounded-full border border-border bg-card p-1">
        <button
          onClick={() => setCollection("ai")}
          className={cn(
            "rounded-full px-4 py-1.5 text-sm font-medium",
            collection === "ai" ? "bg-muted text-foreground" : "text-muted-foreground",
          )}
        >
          {t("AI Tools", "AI 工具")}
        </button>
        <button
          onClick={() => setCollection("you")}
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-4 py-1.5 text-sm font-medium",
            collection === "you" ? "bg-muted text-foreground" : "text-muted-foreground",
          )}
        >
          <Plus className="size-3.5" /> {t("For You", "为你推荐")}
        </button>
      </div>

      <div className="mt-8 w-full max-w-3xl">
        {/* tabs */}
        <div className="flex flex-wrap items-end gap-1">
          {TABS.map((item) => (
            <button
              key={item.key}
              onClick={() => setTab(item.key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-t-lg border-x border-t px-3 py-2 text-sm font-medium",
                tab === item.key
                  ? "border-brand/40 bg-card text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <item.icon className="size-4" />
              {t(item.label, item.labelZh)}
              {item.badge ? (
                <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-semibold text-brand-foreground">
                  <Sparkles className="size-2.5" /> {t(item.badge, "最新智能体")}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {/* input */}
        <div className="-mt-px rounded-lg rounded-tl-none border border-brand/40 bg-card p-4 shadow-sm">
          <div className="min-h-16 px-1 py-2 text-lg text-muted-foreground">{t("How can I help you today?", "今天有什么可以帮你？")}</div>
          <div className="flex items-center justify-between">
            <button className="inline-flex items-center gap-2 rounded-md px-1 py-1 text-sm text-foreground">
              <span className="flex size-8 items-center justify-center rounded-full border border-border">
                <Plus className="size-4" />
              </span>
              <span className="inline-flex items-center gap-1 font-medium">
                GPT-5.5 <ChevronDown className="size-4 text-muted-foreground" />
              </span>
            </button>
            <button className="flex size-9 items-center justify-center rounded-full border border-border text-foreground hover:bg-muted" aria-label={t("Send", "发送")}>
              <ArrowUp className="size-4" />
            </button>
          </div>
        </div>

        {/* quick actions */}
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {QUICK.map((q) => (
            <button
              key={q.label}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
            >
              <q.icon className="size-4 text-muted-foreground" />
              {t(q.label, q.labelZh)}
            </button>
          ))}
        </div>

        {/* Super Social Agent shortcut */}
        <div className="mt-4 flex justify-center">
          <button
            onClick={goToAgent}
            className="inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-brand-foreground shadow-sm transition-opacity hover:opacity-90"
          >
            <Megaphone className="size-4" />
            {t("Plan social posts", "规划社媒帖子")}
            <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-semibold">{t("New", "全新")}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
