"use client"

import { useState } from "react"
import { useSocial } from "@/features/social/store"
import { useLang } from "@/features/social/i18n"
import { CONTENT_GOAL_LABELS } from "@/features/social/i18n/labels"
import { ALL_PLATFORMS, CONTENT_GOALS, type ContentGoal, type Platform } from "@social/shared"
import { Button } from "@/components/ui/button"
import { Field, PlatformChip, Select, TextArea, TextInput } from "@/features/social/components/ui"
import { Megaphone } from "lucide-react"

export function Onboarding() {
  const { createWorkspace } = useSocial()
  const { t, te } = useLang()
  // 注：以下 useState 初值是示例内容数据（虚构品牌 Northstar 等），属于"用户内容" mock，保持英文不翻。
  const [name, setName] = useState("Northstar Launch")
  const [brand, setBrand] = useState("Northstar AI")
  const [desc, setDesc] = useState("AI productivity assistant for small teams")
  const [market, setMarket] = useState("US")
  const [platforms, setPlatforms] = useState<Platform[]>(["X", "Reddit", "Instagram", "YouTube"])
  const [goal, setGoal] = useState<ContentGoal>("Drive trial")
  const [website, setWebsite] = useState("https://northstar.ai")
  const [tone, setTone] = useState("clear, helpful, slightly bold")

  const togglePlatform = (p: Platform) =>
    setPlatforms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]))

  const canCreate = name.trim().length > 0

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-xl rounded-lg border border-border bg-card shadow-sm">
        <div className="flex items-center gap-3 border-b border-border px-6 py-5">
          <span className="flex size-10 items-center justify-center rounded-lg bg-brand-muted text-brand">
            <Megaphone className="size-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-foreground">{t("Create your first Social Workspace", "创建你的第一个社媒工作区")}</h2>
            <p className="text-sm text-muted-foreground">{t("Set up the basics now. You can complete the full brand profile later.", "先完成基础设置，稍后可以补全完整的品牌资料。")}</p>
          </div>
        </div>

        <div className="grid gap-4 px-6 py-5 md:grid-cols-2">
          <Field label={t("Workspace name", "工作区名称")} required>
            <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder={t("e.g. Northstar Launch", "如 Northstar Launch")} />
          </Field>
          <Field label={t("Brand / project name", "品牌 / 项目名称")}>
            <TextInput value={brand} onChange={(e) => setBrand(e.target.value)} placeholder={t("e.g. Northstar AI", "如 Northstar AI")} />
          </Field>
          <div className="md:col-span-2">
            <Field label={t("Product or brand description", "产品或品牌描述")}>
              <TextArea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={t("What does your product do?", "你的产品是做什么的？")} />
            </Field>
          </div>
          <Field label={t("Target market", "目标市场")}>
            {/* value 显式钉住英文枚举值（存进 workspace 的是它），只翻可见文本，避免中文切换改变数据 */}
            <Select value={market} onChange={(e) => setMarket(e.target.value)}>
              <option value="US">{t("US", "美国")}</option>
              <option value="Europe">{t("Europe", "欧洲")}</option>
              <option value="Global English Market">{t("Global English Market", "全球英语市场")}</option>
              <option value="Custom">{t("Custom", "自定义")}</option>
            </Select>
          </Field>
          <Field label={t("Primary content goal", "主要内容目标")}>
            <Select value={goal} onChange={(e) => setGoal(e.target.value as ContentGoal)}>
              {CONTENT_GOALS.map((g) => (
                // value 钉住英文枚举 g（ContentGoal），显示用现成的双语映射
                <option key={g} value={g}>{te(CONTENT_GOAL_LABELS[g])}</option>
              ))}
            </Select>
          </Field>
          <div className="md:col-span-2">
            <Field label={t("Target platforms", "目标平台")}>
              <div className="flex flex-wrap gap-2">
                {ALL_PLATFORMS.map((p) => (
                  <PlatformChip key={p} platform={p} selected={platforms.includes(p)} onClick={() => togglePlatform(p)} />
                ))}
              </div>
            </Field>
          </div>
          <Field label={t("Website URL (optional)", "网站 URL（选填）")}>
            <TextInput value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" />
          </Field>
          <Field label={t("Brand tone (optional)", "品牌语气（选填）")}>
            <TextInput value={tone} onChange={(e) => setTone(e.target.value)} placeholder={t("e.g. clear, helpful", "如 清晰、亲切")} />
          </Field>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
          <Button
            disabled={!canCreate}
            onClick={() =>
              createWorkspace({
                name,
                brandName: brand,
                description: desc,
                targetMarket: market,
                platforms,
                primaryGoal: goal,
                websiteUrl: website,
                tone,
              })
            }
            className="bg-brand text-brand-foreground hover:bg-brand/90"
          >
            {t("Create workspace", "创建工作区")}
          </Button>
        </div>
      </div>
    </div>
  )
}
