"use client"

import { useEffect, useState } from "react"
import { SocialProvider, useSocial } from "@/features/social/store"
import { LanguageProvider } from "@/features/social/i18n"
import { Sidebar } from "@/features/social/shell/sidebar"
import { Topbar } from "@/features/social/shell/topbar"
import { Toaster } from "@/features/social/shell/toaster"
import { HomeView } from "@/features/social/shell/home-view"
import { Workbench } from "@/features/social/shell/workbench"
import { LoginView } from "@/features/social/shell/login-view"
import { getPlatformToken } from "@/features/social/data/api"

// 登录门禁开关：默认关（本地开发直接进主界面，靠 x-user-id 兜底，行为不变）。
// 联调/上线设 NEXT_PUBLIC_REQUIRE_LOGIN=true → 无平台 token 时先过 chatpal 邮箱登录换 JWT。
const REQUIRE_LOGIN = process.env.NEXT_PUBLIC_REQUIRE_LOGIN === "true"

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

// 登录门禁：只有开了 REQUIRE_LOGIN 且本地没 token 才拦到登录页。
// token 读自 localStorage，须在 useEffect（客户端）里读，避免 SSR/首帧水合不一致。
// SocialProvider 只包在登录之后的 Shell 外——未登录不触发 store 的 getWorkspace()（那会打需要鉴权的接口）。
function Gate() {
  const [mounted, setMounted] = useState(false)
  const [authed, setAuthed] = useState(false)

  useEffect(() => {
    setMounted(true)
    setAuthed(!REQUIRE_LOGIN || !!getPlatformToken())
  }, [])

  if (!mounted) return null
  if (!authed) return <LoginView onLoggedIn={() => setAuthed(true)} />
  return (
    <SocialProvider>
      <Shell />
    </SocialProvider>
  )
}

export default function Page() {
  return (
    <LanguageProvider>
      <Gate />
    </LanguageProvider>
  )
}
