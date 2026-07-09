"use client"

import { FolderOpen, History, Sparkles, Crown } from "lucide-react"

function TopButton({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <button className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3.5 py-2 text-sm font-medium text-foreground hover:bg-muted">
      <Icon className="size-4 text-muted-foreground" />
      {label}
    </button>
  )
}

export function Topbar() {
  return (
    <header className="flex items-center justify-end gap-2 px-6 py-3">
      <TopButton icon={FolderOpen} label="Projects" />
      <TopButton icon={History} label="Chat History" />
      <TopButton icon={Sparkles} label="My Creations" />
      <button className="inline-flex items-center gap-1.5 rounded-full bg-upgrade px-3.5 py-2 text-sm font-semibold text-upgrade-foreground hover:opacity-90">
        <Crown className="size-4" />
        Upgrade Plan
      </button>
      <span className="ml-1 flex h-9 w-9 items-center justify-center rounded-full bg-foreground text-sm font-semibold text-background">
        L
      </span>
    </header>
  )
}
