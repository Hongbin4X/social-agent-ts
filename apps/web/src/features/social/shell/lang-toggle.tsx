"use client"

import { cn } from "@/lib/utils"
import { useLang, type Lang } from "@/features/social/i18n"

// 中英切换开关（放在顶栏）。EN / 中 两段式，点选即切、写入 localStorage 持久化。
export function LangToggle() {
  const { lang, setLang } = useLang()
  const options: Array<{ value: Lang; label: string }> = [
    { value: "en", label: "EN" },
    { value: "zh", label: "中" },
  ]
  return (
    <div
      className="inline-flex items-center rounded-full border border-border bg-background p-0.5 text-xs font-semibold"
      role="group"
      aria-label="Language / 语言"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => setLang(o.value)}
          aria-pressed={lang === o.value}
          className={cn(
            "rounded-full px-2.5 py-1 transition-colors",
            lang === o.value
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
