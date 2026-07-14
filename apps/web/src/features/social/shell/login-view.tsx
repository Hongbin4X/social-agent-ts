"use client"

// 登录页 —— chatpal 邮箱验证码两步登录（经后端代理 /bff/auth/*）。
// 拿到 JWT 后 api.emailLogin 已写 localStorage，这里只需 onLoggedIn() 让上层切进主界面。
// 设计取向：与 onboarding 同款居中卡片；凡等待（发码/登录）都给过程态文案（铁律2.5：AI/网络等待必有友好反馈）。
// 门禁策略见 page.tsx：仅当 NEXT_PUBLIC_REQUIRE_LOGIN=true 且无 token 才拦到这里，本地开发默认直接进、不受影响。
import { useState } from "react"
import { api } from "@/features/social/data/api"
import { useLang } from "@/features/social/i18n"
import { Button } from "@/components/ui/button"
import { Field, TextInput } from "@/features/social/components/ui"
import { Loader2, Megaphone } from "lucide-react"

/** 把 req() 抛出的 "/auth/email/login: 真正的错误" 前缀剥掉，只给用户看后端 message。 */
function cleanMsg(raw: string): string {
  return raw.replace(/^\/auth\/[^:]+:\s*/, "")
}

export function LoginView({ onLoggedIn }: { onLoggedIn: () => void }) {
  const { t } = useLang()
  const [step, setStep] = useState<"email" | "code">("email")
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState<null | "sending" | "logging">(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const emailValid = /^\S+@\S+\.\S+$/.test(email.trim())
  const codeValid = code.trim().length >= 4

  async function sendCode() {
    if (!emailValid || busy) return
    setError(null)
    setNotice(null)
    setBusy("sending")
    try {
      await api.sendEmailCode(email.trim())
      setStep("code")
      setNotice(t("Verification code sent — check your inbox (and spam).", "验证码已发送，请查收邮箱（含垃圾箱）。"))
    } catch (e) {
      setError(cleanMsg(e instanceof Error ? e.message : String(e)))
    } finally {
      setBusy(null)
    }
  }

  async function login() {
    if (!codeValid || busy) return
    setError(null)
    setBusy("logging")
    try {
      await api.emailLogin(email.trim(), code.trim())
      onLoggedIn()
    } catch (e) {
      setError(cleanMsg(e instanceof Error ? e.message : String(e)))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-lg border border-border bg-card shadow-sm">
        <div className="flex items-center gap-3 border-b border-border px-6 py-5">
          <span className="flex size-10 items-center justify-center rounded-lg bg-brand-muted text-brand">
            <Megaphone className="size-5" />
          </span>
          <div>
            <h1 className="text-lg font-semibold text-foreground">{t("Sign in to Social Agent", "登录 Social Agent")}</h1>
            <p className="text-sm text-muted-foreground">
              {step === "email"
                ? t("Enter your email to receive a verification code.", "输入邮箱以接收验证码。")
                : t("Enter the 6-digit code we emailed you.", "输入邮件里收到的验证码。")}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-4 px-6 py-5">
          <Field label={t("Email", "邮箱")} required>
            <TextInput
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              disabled={step === "code"}
              onKeyDown={(e) => e.key === "Enter" && step === "email" && sendCode()}
            />
          </Field>

          {step === "code" && (
            <Field label={t("Verification code", "验证码")} required>
              <TextInput
                inputMode="numeric"
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={t("6-digit code", "6 位验证码")}
                onKeyDown={(e) => e.key === "Enter" && login()}
              />
            </Field>
          )}

          {notice && <p className="text-sm text-brand">{notice}</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}

          {step === "email" ? (
            <Button size="lg" className="w-full" disabled={!emailValid || busy !== null} onClick={sendCode}>
              {busy === "sending" ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {t("Sending code…", "正在发送验证码…")}
                </>
              ) : (
                t("Send verification code", "发送验证码")
              )}
            </Button>
          ) : (
            <div className="flex flex-col gap-2">
              <Button size="lg" className="w-full" disabled={!codeValid || busy !== null} onClick={login}>
                {busy === "logging" ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    {t("Signing in…", "正在登录…")}
                  </>
                ) : (
                  t("Sign in", "登录")
                )}
              </Button>
              <div className="flex items-center justify-between text-sm">
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setStep("email")
                    setCode("")
                    setError(null)
                    setNotice(null)
                  }}
                >
                  {t("Change email", "换个邮箱")}
                </button>
                <button
                  type="button"
                  className="text-brand hover:underline disabled:opacity-50"
                  disabled={busy !== null}
                  onClick={sendCode}
                >
                  {t("Resend code", "重新发送")}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
