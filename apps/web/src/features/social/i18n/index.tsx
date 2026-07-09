"use client"

// 轻量中英双语基础设施（铁律2：不上 next-intl 路由方案——本站是状态驱动 SPA、无真实路由，
// 用一个 Context + 就地 t(en,zh) 最省事、最好审、可完美并行改造，且专有名词"不 wrap 即不翻"）。
//
// 两条使用通道：
//   1) 组件里用 useLang() 拿 { lang, setLang, t, te } —— t/te 会随切换重渲染。
//   2) 非组件的命令式代码（如 store 的 toast 回调）用模块级 translate(en,zh) / tl(entry) ——
//      读模块级 activeLang，一次性取值、不参与重渲染（toast 这类即时字符串正合适）。
//
// 专有名词（TikTok/Instagram/X/YouTube/Reddit/Facebook、GlobalGPT、模型名等）一律不经过 t，保持原样。

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"

export type Lang = "en" | "zh"

/** 一条双语条目。领域枚举的显示名用它（见 ./labels）。 */
export interface LangEntry {
  en: string
  zh: string
}

const STORAGE_KEY = "ssa.lang"

// 模块级"当前语言"：给非组件代码的逃生口。组件请勿依赖它做渲染（不会触发重渲染）。
let activeLang: Lang = "en"

/** 命令式取值（非组件用）：如 store 的 toast。 */
export function translate(en: string, zh: string): string {
  return activeLang === "zh" ? zh : en
}

/** 命令式取枚举显示名（非组件用）。 */
export function tl(entry: LangEntry): string {
  return activeLang === "zh" ? entry.zh : entry.en
}

interface LangContextValue {
  lang: Lang
  setLang: (l: Lang) => void
  toggle: () => void
  /** 就地双语：t("Home","首页")。随切换重渲染。 */
  t: (en: string, zh: string) => string
  /** 枚举显示名：te(STATUS_LABELS[status])。随切换重渲染。 */
  te: (entry: LangEntry) => string
}

const LangContext = createContext<LangContextValue | null>(null)

export function LanguageProvider({ children }: { children: ReactNode }) {
  // SSR 安全：首屏一律 en，客户端挂载后再从 localStorage 纠正，避免 hydration 不一致。
  const [lang, setLangState] = useState<Lang>("en")

  useEffect(() => {
    const saved =
      typeof window !== "undefined"
        ? (window.localStorage.getItem(STORAGE_KEY) as Lang | null)
        : null
    if (saved === "en" || saved === "zh") {
      activeLang = saved
      setLangState(saved)
      document.documentElement.lang = saved === "zh" ? "zh-CN" : "en"
    }
  }, [])

  const setLang = useCallback((l: Lang) => {
    activeLang = l // 同步更新模块级，保证紧随其后的 translate() 立即拿到新语言
    setLangState(l)
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, l)
      document.documentElement.lang = l === "zh" ? "zh-CN" : "en"
    }
  }, [])

  const toggle = useCallback(() => setLang(activeLang === "zh" ? "en" : "zh"), [setLang])

  const t = useCallback((en: string, zh: string) => (lang === "zh" ? zh : en), [lang])
  const te = useCallback((entry: LangEntry) => (lang === "zh" ? entry.zh : entry.en), [lang])

  return (
    <LangContext.Provider value={{ lang, setLang, toggle, t, te }}>{children}</LangContext.Provider>
  )
}

export function useLang(): LangContextValue {
  const ctx = useContext(LangContext)
  if (!ctx) throw new Error("useLang 必须在 <LanguageProvider> 内使用")
  return ctx
}
