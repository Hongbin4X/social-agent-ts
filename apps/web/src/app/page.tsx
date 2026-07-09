"use client"

import { SocialProvider, useSocial } from "@/features/social/store"
import { LanguageProvider } from "@/features/social/i18n"
import { Sidebar } from "@/features/social/shell/sidebar"
import { Topbar } from "@/features/social/shell/topbar"
import { Toaster } from "@/features/social/shell/toaster"
import { HomeView } from "@/features/social/shell/home-view"
import { Workbench } from "@/features/social/shell/workbench"

function Shell() {
  const { view } = useSocial()
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar />
        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {view === "home" ? <HomeView /> : <Workbench />}
        </main>
      </div>
      <Toaster />
    </div>
  )
}

export default function Page() {
  return (
    <LanguageProvider>
      <SocialProvider>
        <Shell />
      </SocialProvider>
    </LanguageProvider>
  )
}
