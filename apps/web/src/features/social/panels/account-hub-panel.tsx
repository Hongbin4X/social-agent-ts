"use client"

import { useState } from "react"
import { useSocial, platformPublishMode } from "@/features/social/store"
import type { Account, AccountStatus, Platform } from "@social/shared"
import { ALL_PLATFORMS } from "@social/shared"
import { Card, Field, Modal, PlatformBadge, Select, TextInput } from "@/features/social/components/ui"
import { Button } from "@/components/ui/button"
import { Plug, Plus, RefreshCw, AlertTriangle, CircleCheck, Unplug } from "lucide-react"

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
  const [manualOpen, setManualOpen] = useState(false)

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Account Hub</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Connect platforms for auto publishing, or add manual accounts for export-only workflows.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setManualOpen(true)}>
          <Plus className="size-4" />
          Add manual account
        </Button>
      </div>

      <div className="mt-3 rounded-md border border-border bg-[oklch(0.97_0.02_70)] px-3 py-2 text-xs text-[oklch(0.45_0.1_60)]">
        Auto publishing is supported for X, Instagram, and Facebook. TikTok, YouTube, and Reddit are manual-only and
        appear as a manual fallback in the publish flow.
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
            {s.label}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {account.capabilities}
          {account.expiresAt ? ` · Expires ${account.expiresAt}` : ""}
        </p>
      </div>
      <div className="flex items-center gap-1.5">
        {account.status === "Connected" ? (
          <>
            <Button size="sm" variant="ghost" onClick={onRefresh}>
              <RefreshCw className="size-3.5" />
              Refresh
            </Button>
            <Button size="sm" variant="ghost" onClick={onDisconnect}>
              <Unplug className="size-3.5" />
              Disconnect
            </Button>
          </>
        ) : account.status === "Expired" || account.status === "PermissionMissing" ? (
          <Button size="sm" variant="outline" onClick={onConnect}>
            <AlertTriangle className="size-3.5" />
            Reconnect
          </Button>
        ) : account.type === "manual" || account.status === "UnsupportedPublishing" ? (
          <span className="inline-flex items-center gap-1 text-xs text-status-manual">
            <CircleCheck className="size-3.5" />
            Export ready
          </span>
        ) : isAuto ? (
          <Button size="sm" className="bg-brand text-brand-foreground hover:bg-brand/90" onClick={onConnect}>
            <Plug className="size-3.5" />
            Connect
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">Manual only</span>
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
  const [platform, setPlatform] = useState<Platform>("TikTok")
  const [name, setName] = useState("")
  const [url, setUrl] = useState("")

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add manual account"
      description="Manual accounts are export-only. The agent prepares content; you publish on the platform."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="bg-brand text-brand-foreground hover:bg-brand/90"
            disabled={!name.trim()}
            onClick={() => onSave({ platform, name: name.trim(), url: url.trim(), capabilities: "Manual export only" })}
          >
            Add account
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Platform">
          <Select value={platform} onChange={(e) => setPlatform(e.target.value as Platform)}>
            {ALL_PLATFORMS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Account name / handle">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="@northstar.ai" />
        </Field>
        <Field label="Profile URL" hint="Optional. Helps the agent reference the right destination.">
          <TextInput value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://tiktok.com/@northstar.ai" />
        </Field>
      </div>
    </Modal>
  )
}
