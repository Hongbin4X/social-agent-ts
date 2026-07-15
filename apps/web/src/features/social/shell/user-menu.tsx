"use client"

// 右上角头像菜单 —— 当前只承载「退出登录」。
//
// 为什么需要它：此前【没有任何登出入口】，登录后就出不来了：
//  · 想换个账号测试？只能手动去 devtools 删 localStorage 的 platform_jwt；
//  · token 失效（换密钥/过期）时更糟——Gate 只看「本地有没有 token」就判已登录，
//    用户被永久关在主界面看满屏 401（api.ts 的 401 自动登出是另一半修复）。
// 放头像下拉是用户找登出的第一直觉位置，不另造入口。
import { useEffect, useRef, useState } from "react"
import { LogOut } from "lucide-react"
import { getPlatformToken, logout } from "@/features/social/data/api"
import { useLang } from "@/features/social/i18n"

export function UserMenu() {
  const { t } = useLang()
  const [open, setOpen] = useState(false)
  // 本地开发（无登录门禁）时没有 token，登出没有意义 → 不显示菜单，行为与从前一致。
  const [authed, setAuthed] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // token 读自 localStorage，必须在 useEffect 里读，避免 SSR/首帧水合不一致。
  useEffect(() => setAuthed(!!getPlatformToken()), [])

  // 点外面关掉：菜单是全局浮层，不接管点击会一直挂在那儿。
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [open])

  return (
    <div className="relative ml-1" ref={ref}>
      <button
        type="button"
        onClick={() => authed && setOpen((v) => !v)}
        aria-label={t("Account", "账号")}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-foreground text-sm font-semibold text-background hover:opacity-90"
      >
        L
      </button>
      {open && authed && (
        <div className="absolute right-0 top-11 z-50 w-44 overflow-hidden rounded-lg border border-border bg-card py-1 shadow-lg">
          <button
            type="button"
            onClick={logout}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-muted"
          >
            <LogOut className="size-4 text-muted-foreground" />
            {t("Sign out", "退出登录")}
          </button>
        </div>
      )}
    </div>
  )
}
