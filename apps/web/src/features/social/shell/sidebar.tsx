"use client"

import { cn } from "@/lib/utils"
import { useSocial } from "@/features/social/store"
import {
  Home,
  LayoutGrid,
  Layers,
  Megaphone,
  PanelLeftClose,
} from "lucide-react"

function ToolDot({ className }: { className?: string }) {
  return <span className={cn("h-6 w-6 shrink-0 rounded-full", className)} />
}

const MY_TOOLS = [
  { name: "GPT-5.5", color: "bg-[oklch(0.7_0.12_160)]" },
  { name: "perplexity", color: "bg-[oklch(0.6_0.1_200)]" },
  { name: "Claude Fable 5", color: "bg-[oklch(0.8_0.1_70)]" },
  { name: "Claude Opus 4.8", color: "bg-[oklch(0.8_0.1_70)]" },
  { name: "Gemini 3.5 Flash", color: "bg-[oklch(0.6_0.18_265)]" },
]

export function Logo() {
  return (
    <div className="flex items-center gap-2">
      <span
        className="flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold text-white"
        style={{ background: "linear-gradient(135deg, oklch(0.72 0.18 35), oklch(0.65 0.22 350))" }}
      >
        S
      </span>
      <span className="text-lg font-semibold tracking-tight text-foreground">GlobalGPT</span>
    </div>
  )
}

export function Sidebar() {
  const { view, agentTab, setView, goToAgent } = useSocial()

  const isAgent = view === "agent"

  const primary = [
    { key: "home", label: "Home", icon: Home, active: view === "home", onClick: () => setView("home") },
    { key: "models", label: "Models & Tools", icon: LayoutGrid, active: false, onClick: () => {} },
    { key: "multimodal", label: "Multimodal", icon: Layers, active: false, onClick: () => {} },
    {
      key: "agent",
      label: "Super Social Agent",
      icon: Megaphone,
      active: isAgent,
      onClick: () => goToAgent(),
    },
  ]

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-sidebar">
      <div className="flex items-center justify-between px-4 py-4">
        <Logo />
        <button className="rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label="Collapse sidebar">
          <PanelLeftClose className="size-4" />
        </button>
      </div>

      <nav className="flex flex-col gap-1 px-3">
        {primary.map((item) => (
          <button
            key={item.key}
            onClick={item.onClick}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              item.active
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            <item.icon className="size-[18px]" />
            <span className="truncate">{item.label}</span>
            {item.key === "agent" ? (
              <span className="ml-auto rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-semibold text-brand-foreground">
                New
              </span>
            ) : null}
          </button>
        ))}
      </nav>

      {isAgent ? (
        <div className="mt-1 px-3 text-xs text-muted-foreground">
          <span className="block rounded-md bg-brand-muted px-3 py-1.5 font-medium text-foreground">
            {agentTab}
          </span>
        </div>
      ) : null}

      <div className="mx-4 my-4 border-t border-border" />

      <div className="flex items-center gap-2 px-4 pb-2 text-sm font-semibold text-foreground">
        <span className="text-muted-foreground">≡</span> My Tools
      </div>
      <div className="flex flex-col gap-1 overflow-y-auto px-3 pb-4">
        {MY_TOOLS.map((t) => (
          <button
            key={t.name}
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          >
            <ToolDot className={t.color} />
            <span className="truncate">{t.name}</span>
          </button>
        ))}
      </div>
    </aside>
  )
}
