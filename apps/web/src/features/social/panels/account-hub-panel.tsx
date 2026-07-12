"use client"

import { useState } from "react"
import { useSocial, platformPublishMode } from "@/features/social/store"
import type { Account, AccountStatus, Platform } from "@social/shared"
import { ALL_PLATFORMS } from "@social/shared"
import { Card, Field, Modal, PlatformBadge, Select, TextInput } from "@/features/social/components/ui"
import { Button } from "@/components/ui/button"
import { useLang } from "@/features/social/i18n"
import { ACCOUNT_STATUS_LABELS } from "@/features/social/i18n/labels"
import { Plug, Plus, RefreshCw, AlertTriangle, CircleCheck, Unplug } from "lucide-react"

// 状态的颜色/圆点样式表。显示名不在这里取——统一走 ACCOUNT_STATUS_LABELS + te()
// （labels.ts 是枚举显示名的唯一真源）。此处 label 仅保留作英文兜底，渲染实际用 te()。
const STATUS_COPY: Record<AccountStatus, { label: string; tone: string; dot: string }> = {
  NotConnected: { label: "Not connected", tone: "text-muted-foreground", dot: "bg-status-draft" },
  Connected: { label: "Connected", tone: "text-status-published", dot: "bg-status-published" },
  Expired: { label: "Token expired", tone: "text-status-failed", dot: "bg-status-failed" },
  PermissionMissing: { label: "Permission missing", tone: "text-[oklch(0.48_0.13_55)]", dot: "bg-status-fallback" },
  UnsupportedPublishing: { label: "Manual only (P0)", tone: "text-status-manual", dot: "bg-status-manual" },
  Error: { label: "Error", tone: "text-status-failed", dot: "bg-status-failed" },
}

export function AccountHubPanel() {
  const { accounts, connectAccount, disconnectAccount, refreshAccount, addManualAccount } = useSocial()
  const { t } = useLang()
  const [manualOpen, setManualOpen] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{t("Account Hub", "账号中心")}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {t(
              "Connect platforms for auto publishing, or add manual accounts for export-only workflows.",
              "连接平台以自动发布，或添加手动账号用于仅导出的工作流。",
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* 授权连接入口：走真实 OAuth，落库 token（区别于「手动账号」仅记录展示信息）。 */}
          <Button
            size="sm"
            className="bg-brand text-brand-foreground hover:bg-brand/90"
            onClick={() => setAuthOpen(true)}
          >
            <Plug className="size-4" />
            {t("Authorize account", "添加授权账号")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setManualOpen(true)}>
            <Plus className="size-4" />
            {t("Add manual account", "添加手动账号")}
          </Button>
        </div>
      </div>

      <div className="mt-3 rounded-md border border-border bg-[oklch(0.97_0.02_70)] px-3 py-2 text-xs text-[oklch(0.45_0.1_60)]">
        {t(
          "Auto publishing is supported for X, Instagram, and Facebook. TikTok, YouTube, and Reddit are manual-only and appear as a manual fallback in the publish flow.",
          "X、Instagram 和 Facebook 支持自动发布。TikTok、YouTube 和 Reddit 仅支持手动，会在发布流程中以转手动的方式出现。",
        )}
      </div>

      <div className="mt-4 flex flex-col gap-2.5">
        {accounts.map((acc) => (
          <AccountRow
            key={acc.id}
            account={acc}
            onConnect={() => connectAccount(acc.platform)}
            onDisconnect={() => disconnectAccount(acc.id)}
            onRefresh={() => refreshAccount(acc.id)}
          />
        ))}
      </div>

      <AuthorizeAccountModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        onAuthorize={(platform) => {
          setAuthOpen(false)
          // 真实 OAuth：X 走弹窗授权 + 轮询落库（见 store.connectX）；其它平台暂未接通。
          connectAccount(platform)
        }}
      />

      <ManualAccountModal
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        onSave={(a) => {
          addManualAccount(a)
          setManualOpen(false)
        }}
      />
    </Card>
  )
}

// 「添加授权账号」入口：列出支持 OAuth 授权的平台。目前仅 X 已接通真实授权（弹窗 → 回调落 token）；
// Instagram/Facebook 需 Meta App Review，暂标「即将支持」不假装可用（铁律：不掩盖、不假装）。
function AuthorizeAccountModal({
  open,
  onClose,
  onAuthorize,
}: {
  open: boolean
  onClose: () => void
  onAuthorize: (platform: Platform) => void
}) {
  const { t } = useLang()
  const AUTH_PLATFORMS: { platform: Platform; ready: boolean; note: string }[] = [
    { platform: "X", ready: true, note: t("OAuth2 + PKCE · auto publishing", "OAuth2 + PKCE · 支持自动发帖") },
    { platform: "Instagram", ready: false, note: t("Needs Meta App Review", "需 Meta 应用审核") },
    { platform: "Facebook", ready: false, note: t("Needs Meta App Review", "需 Meta 应用审核") },
  ]
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("Authorize a social account", "添加授权账号")}
      description={t(
        "Authorize via the platform's OAuth. Tokens are stored on the backend; we never store your password.",
        "通过平台 OAuth 授权连接。token 保存在后端，绝不保存你的密码。",
      )}
      footer={
        <Button variant="ghost" onClick={onClose}>
          {t("Close", "关闭")}
        </Button>
      }
    >
      <div className="flex flex-col gap-2.5">
        {AUTH_PLATFORMS.map((p) => (
          <div key={p.platform} className="flex items-center gap-3 rounded-md border border-border px-3 py-2.5">
            <PlatformBadge platform={p.platform} size="md" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-foreground">{p.platform}</div>
              <div className="text-xs text-muted-foreground">{p.note}</div>
            </div>
            {p.ready ? (
              <Button
                size="sm"
                className="bg-brand text-brand-foreground hover:bg-brand/90"
                onClick={() => onAuthorize(p.platform)}
              >
                <Plug className="size-3.5" />
                {t("Authorize", "去授权")}
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">{t("Coming soon", "即将支持")}</span>
            )}
          </div>
        ))}
      </div>
    </Modal>
  )
}

function AccountRow({
  account,
  onConnect,
  onDisconnect,
  onRefresh,
}: {
  account: Account
  onConnect: () => void
  onDisconnect: () => void
  onRefresh: () => void
}) {
  const { t, te } = useLang()
  const s = STATUS_COPY[account.status]
  const isAuto = platformPublishMode(account.platform) === "auto"
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-border px-3 py-2.5">
      <PlatformBadge platform={account.platform} size="md" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-foreground">{account.name}</span>
          <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${s.tone}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
            {te(ACCOUNT_STATUS_LABELS[account.status])}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {account.capabilities}
          {account.expiresAt ? ` · ${t("Expires", "有效期至")} ${account.expiresAt}` : ""}
        </p>
      </div>
      <div className="flex items-center gap-1.5">
        {account.status === "Connected" ? (
          <>
            <Button size="sm" variant="ghost" onClick={onRefresh}>
              <RefreshCw className="size-3.5" />
              {t("Refresh", "刷新")}
            </Button>
            <Button size="sm" variant="ghost" onClick={onDisconnect}>
              <Unplug className="size-3.5" />
              {t("Disconnect", "断开连接")}
            </Button>
          </>
        ) : account.status === "Expired" || account.status === "PermissionMissing" ? (
          <Button size="sm" variant="outline" onClick={onConnect}>
            <AlertTriangle className="size-3.5" />
            {t("Reconnect", "重新连接")}
          </Button>
        ) : account.type === "manual" || account.status === "UnsupportedPublishing" ? (
          <span className="inline-flex items-center gap-1 text-xs text-status-manual">
            <CircleCheck className="size-3.5" />
            {t("Export ready", "可导出")}
          </span>
        ) : isAuto ? (
          <Button size="sm" className="bg-brand text-brand-foreground hover:bg-brand/90" onClick={onConnect}>
            <Plug className="size-3.5" />
            {t("Connect", "连接")}
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">{t("Manual only", "仅手动")}</span>
        )}
      </div>
    </div>
  )
}

function ManualAccountModal({
  open,
  onClose,
  onSave,
}: {
  open: boolean
  onClose: () => void
  onSave: (a: { platform: Platform; name: string; url: string; capabilities: string }) => void
}) {
  const { t } = useLang()
  const [platform, setPlatform] = useState<Platform>("TikTok")
  const [name, setName] = useState("")
  const [url, setUrl] = useState("")

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("Add manual account", "添加手动账号")}
      description={t(
        "Manual accounts are export-only. The agent prepares content; you publish on the platform.",
        "手动账号仅支持导出。智能体负责准备内容，由你在平台上发布。",
      )}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("Cancel", "取消")}
          </Button>
          <Button
            className="bg-brand text-brand-foreground hover:bg-brand/90"
            disabled={!name.trim()}
            onClick={() => onSave({ platform, name: name.trim(), url: url.trim(), capabilities: "Manual export only" })}
          >
            {t("Add account", "添加账号")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={t("Platform", "平台")}>
          <Select value={platform} onChange={(e) => setPlatform(e.target.value as Platform)}>
            {ALL_PLATFORMS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("Account name / handle", "账号名称 / handle")}>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="@northstar.ai" />
        </Field>
        <Field
          label={t("Profile URL", "主页链接")}
          hint={t("Optional. Helps the agent reference the right destination.", "可选。帮助智能体引用正确的发布目标。")}
        >
          <TextInput value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://tiktok.com/@northstar.ai" />
        </Field>
      </div>
    </Modal>
  )
}
