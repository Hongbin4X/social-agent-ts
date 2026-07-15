"use client"

import { FolderOpen, History, Sparkles, Crown } from "lucide-react"
import { useLang } from "@/features/social/i18n"
import { LangToggle } from "@/features/social/shell/lang-toggle"
import { UserMenu } from "@/features/social/shell/user-menu"

function TopButton({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <button className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3.5 py-2 text-sm font-medium text-foreground hover:bg-muted">
      <Icon className="size-4 text-muted-foreground" />
      {label}
    </button>
  )
}

export function Topbar() {
  const { t } = useLang()
  return (
    <header className="flex items-center justify-end gap-2 px-6 py-3">
      <LangToggle />
      <TopButton icon={FolderOpen} label={t("Projects", "项目")} />
      <TopButton icon={History} label={t("Chat History", "历史记录")} />
      <TopButton icon={Sparkles} label={t("My Creations", "我的创作")} />
      <button className="inline-flex items-center gap-1.5 rounded-full bg-upgrade px-3.5 py-2 text-sm font-semibold text-upgrade-foreground hover:opacity-90">
        <Crown className="size-4" />
        {t("Upgrade Plan", "升级套餐")}
      </button>
      {/* 头像 → 点开有「退出登录」。此前这里是个纯装饰的 span，登录后完全没有出口。 */}
      <UserMenu />
    </header>
  )
}
