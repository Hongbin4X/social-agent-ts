/**
 * X 真机端到端验证 CLI —— 驱动**真实** stack（XApp + @social/db 仓储 + @social/publisher 编排），
 * 不 mock 任何东西。用于在服务器上手动验证「真实授权 → 落库 → 自动续期 → 真实发帖」整条链路（铁律11）。
 *
 * 复用的正是 apps/server 生产路径上的同一套件（DbTokenStore / LocalProviderCostBilling / XApp），
 * 因此这里跑通 == 后端路由跑通。
 *
 * 用法（在 worktree 根目录）：
 *   node_modules/.bin/tsx tests/x-live/cli.mts status
 *   node_modules/.bin/tsx tests/x-live/cli.mts authorize                 # ① 打印授权链接，写 pending
 *   node_modules/.bin/tsx tests/x-live/cli.mts authorize --redirect "<粘回的完整回调URL>"   # ② 换 token 落库
 *   node_modules/.bin/tsx tests/x-live/cli.mts post --text "hello from social-agent"        # 真发一条推
 *   node_modules/.bin/tsx tests/x-live/cli.mts seed-from-demo <demo/x-poster/config/accounts.json>  # 导入 demo 已授权账号
 *
 * 依赖 .env：X_CLIENT_ID/X_CLIENT_SECRET/X_REDIRECT_URI + DB_* + DEV_FAKE_USER_ID。
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

// 先加载 worktree 根 .env（X 凭证 + DB + DEV_FAKE_USER_ID）。
const ROOT = resolve(import.meta.dirname, "../..")
try {
  ;(process as unknown as { loadEnvFile: (p?: string) => void }).loadEnvFile(resolve(ROOT, ".env"))
} catch {
  /* 无 .env 用进程既有环境变量 */
}

// tests/ 不是 workspace 成员，拿不到 @social/* 符号链接 → 直接按相对源码路径导入。
// pnpm 会把 workspace 依赖解析到同一 realpath，故与 apps/server 里的 @social/publisher 是**同一模块实例**（不重复、instanceof 一致）。
const { createDb, createRepositories } = await import("../../packages/db/src/index.ts")
const {
  XApp,
  getMe,
  PublishingService,
  createPublisherRegistry,
  publisherConfigFromEnv,
} = await import("../../packages/publisher/src/index.ts")
// config.ts / token-store.ts 运行时是纯类型 + node 内置，零 workspace 运行时依赖。
const { xOAuthConfigFromEnv } = await import("../../apps/server/src/config.ts")
const { DbTokenStore, LocalProviderCostBilling } = await import("../../apps/server/src/services/token-store.ts")

const PENDING_FILE = resolve(import.meta.dirname, ".pending.json")

function buildXApp() {
  const cfg = xOAuthConfigFromEnv()
  if (!cfg) {
    throw new Error("X 未配置：请在 .env 设 X_CLIENT_ID / X_CLIENT_SECRET / X_REDIRECT_URI")
  }
  return new XApp(cfg)
}

function argOf(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

async function main() {
  const cmd = process.argv[2]
  const { db, pool } = createDb()
  const repos = createRepositories(db)

  const uid = process.env.DEV_FAKE_USER_ID
  if (!uid) throw new Error("需要 DEV_FAKE_USER_ID（定位工作区）")
  const ws = await repos.workspaces.getByUserId(uid)
  if (!ws) throw new Error(`用户 ${uid} 无工作区（先跑 db:seed）`)

  try {
    switch (cmd) {
      case "status":
        await cmdStatus(repos, ws.id)
        break
      case "authorize":
        await cmdAuthorize(repos, ws.id)
        break
      case "post":
        await cmdPost(repos, ws)
        break
      case "seed-from-demo":
        await cmdSeedFromDemo(repos, ws.id)
        break
      default:
        console.log("命令：status | authorize [--redirect <url>] | post [--text <文本>] [--account <id|username>] | seed-from-demo <accounts.json>")
    }
  } finally {
    await pool.end()
  }
}

async function cmdStatus(repos: Awaited<ReturnType<typeof createRepositories>>, workspaceId: string) {
  const accounts = await repos.accounts.listByWorkspace(workspaceId)
  const xs = accounts.filter((a) => a.platform === "X")
  if (xs.length === 0) {
    console.log("（该工作区暂无 X 账号，先 authorize 或 seed-from-demo）")
    return
  }
  for (const a of xs) {
    const snap = await repos.accounts.getTokens(a.id)
    const exp = snap?.tokenExpiresAt ? new Date(snap.tokenExpiresAt * 1000).toISOString() : "—"
    const hasRefresh = snap?.refreshToken ? "有" : "无"
    console.log(`· ${a.id}  ${a.name}  status=${a.status}  external=${snap?.externalAccountId ?? "—"}  expires=${exp}  refresh=${hasRefresh}`)
  }
}

async function cmdAuthorize(repos: Awaited<ReturnType<typeof createRepositories>>, workspaceId: string) {
  const xapp = buildXApp()
  const redirect = argOf("redirect")

  if (!redirect) {
    // ① 生成授权链接，把 state→verifier 落文件（跨两次进程调用）。
    const { url, state, codeVerifier } = xapp.startAuthorization()
    writeFileSync(PENDING_FILE, JSON.stringify({ state, codeVerifier, workspaceId }, null, 2))
    console.log("\n① 在你自己的浏览器打开下面链接，用要授权的 X 账号登录并点 Authorize：\n")
    console.log(url)
    console.log("\n② 授权后浏览器会跳到 http://127.0.0.1:8765/callback?code=...&state=...（页面打不开是正常的）。")
    console.log("   复制地址栏里跳转后的**完整 URL**，再跑：")
    console.log(`   node_modules/.bin/tsx tests/x-live/cli.mts authorize --redirect "<粘回的完整URL>"\n`)
    return
  }

  // ② 用 pending 里的 verifier 换 token 并落库。
  if (!existsSync(PENDING_FILE)) throw new Error("没有找到 pending 记录，请先不带 --redirect 跑一次 authorize")
  const pending = JSON.parse(readFileSync(PENDING_FILE, "utf8")) as { state: string; codeVerifier: string; workspaceId: string }

  const token = await xapp.finishAuthorization({
    code: redirect,
    codeVerifier: pending.codeVerifier,
    expectedState: pending.state,
  })
  const me = await getMe(token.access_token, xapp.config.fetchImpl)
  if (!me?.id) throw new Error("换到 token 但拉不到账号信息（/2/users/me 失败）")

  const tokenExpiresAt = Math.floor(Date.now() / 1000) + (token.expires_in ?? 7200)
  const account = await repos.accounts.upsertConnectedAccount(pending.workspaceId || workspaceId, {
    platform: "X",
    externalAccountId: me.id,
    username: me.username ?? null,
    displayName: me.username ? `@${me.username}` : me.name ?? me.id,
    url: me.username ? `https://x.com/${me.username}` : null,
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? null,
    scope: token.scope ?? null,
    tokenExpiresAt,
  })
  rmSync(PENDING_FILE, { force: true })
  console.log(`✅ 授权成功并落库：account=${account.id}  @${me.username ?? me.id}  refresh_token=${token.refresh_token ? "有" : "无(!)"}  scope=${token.scope ?? "?"}`)
}

async function cmdPost(
  repos: Awaited<ReturnType<typeof createRepositories>>,
  ws: { id: string; activeProjectId?: string | null },
) {
  const text = argOf("text") ?? "hello from social-agent-ts (real X integration test)"
  const accountSel = argOf("account")
  // 图文：--image <公网可达 URL>（adapter 会 fetch 它取字节 → uploadMedia）。本地文件先经 /media 暴露成 URL。
  const image = argOf("image")
  // 发帖形态：--type tweet|thread|article，缺省 tweet。
  const postType = (argOf("type") as "tweet" | "thread" | "article" | undefined) ?? "tweet"

  const accounts = await repos.accounts.listByWorkspace(ws.id)
  let target = accounts.find((a) => a.platform === "X" && (accountSel ? a.id === accountSel || a.name === accountSel || a.name === `@${accountSel}` : a.status === "Connected"))
  if (!target) throw new Error("找不到已连接的 X 账号（先 authorize 或 seed-from-demo；或用 --account 指定）")

  const projectId = ws.activeProjectId
  if (!projectId) throw new Error("工作区无 active project，无法构造发布请求")

  const xapp = buildXApp()
  const tokenStore = new DbTokenStore({ accounts: repos.accounts, xapp, logger: console })
  const billing = new LocalProviderCostBilling(repos.billingRecords, console)
  const registry = createPublisherRegistry(publisherConfigFromEnv())
  const service = new PublishingService({ registry, tokenStore, billing, logger: console })

  console.log(`→ 用账号 ${target.id}(${target.name}) 真发一条 ${postType}${image ? "（图文）" : ""}：「${text}」`)
  const result = await service.publishBatch({
    userId: process.env.DEV_FAKE_USER_ID!,
    workspaceId: ws.id,
    projectId,
    items: [
      {
        target: { platform: "X", accountId: target.id, accountType: "connected" },
        content: {
          text,
          x: { postType },
          ...(image ? { media: [{ kind: "image" as const, url: image }] } : {}),
        },
      },
    ],
  })
  console.log(JSON.stringify(result, null, 2))
  const r = result.results[0]
  if (r.outcome === "published") console.log(`\n✅ 已发布：${(r as { remoteUrl?: string }).remoteUrl}`)
  else console.log(`\n⚠️ 未发布：outcome=${r.outcome}（详见上方 JSON）`)
}

/**
 * 把 demo/x-poster/config/accounts.json 里某个槽位的已授权 token 导入项目库（免重新授权即可验发帖路径）。
 * 用法：seed-from-demo <accounts.json> [--slot main|acct2]。默认 main。
 * access_token 已过期时，自动用 refresh_token 续一发（会轮换，接管 demo 的 token 链——之后别再用 demo 发同账号）。
 */
async function cmdSeedFromDemo(repos: Awaited<ReturnType<typeof createRepositories>>, workspaceId: string) {
  const path = process.argv[3]
  if (!path) throw new Error("用法：seed-from-demo <demo/x-poster/config/accounts.json> [--slot main|acct2]")
  const slot = argOf("slot") ?? "main"
  const data = JSON.parse(readFileSync(path, "utf8")) as {
    accounts: Record<string, Record<string, Record<string, unknown>>>
  }
  const x = data.accounts?.[slot]?.X as Record<string, unknown> | undefined
  if (!x?.oauth2AccessToken) throw new Error(`demo accounts.json 里 ${slot}.X 没有 oauth2AccessToken`)

  let accessToken = String(x.oauth2AccessToken)
  let refreshToken = x.oauth2RefreshToken ? String(x.oauth2RefreshToken) : null
  let scope = x.oauth2Scopes ? String(x.oauth2Scopes) : null
  let expiresAt = Number(x.oauth2ExpiresAt ?? Math.floor(Date.now() / 1000) + 7200)

  let me = await getMe(accessToken)
  if (!me?.id) {
    // access_token 过期 → 用 refresh_token 续期（轮换，头号翻车点：新 refresh 覆盖旧的）。
    if (!refreshToken) throw new Error(`${slot} 的 access_token 失效且无 refresh_token，请改用 authorize 真实授权`)
    console.log(`· ${slot} access_token 已过期，用 refresh_token 续期中…`)
    const xapp = buildXApp()
    const t = await xapp.refresh(refreshToken)
    accessToken = t.access_token
    refreshToken = t.refresh_token ?? refreshToken
    scope = t.scope ?? scope
    expiresAt = Math.floor(Date.now() / 1000) + (t.expires_in ?? 7200)
    me = await getMe(accessToken, xapp.config.fetchImpl)
    if (!me?.id) throw new Error("续期后仍 getMe 失败（refresh_token 可能也失效，请改用 authorize）")
  }

  const account = await repos.accounts.upsertConnectedAccount(workspaceId, {
    platform: "X",
    externalAccountId: me.id,
    username: me.username ?? String(x.oauth2Username ?? "") ?? null,
    displayName: me.username ? `@${me.username}` : me.id,
    url: me.username ? `https://x.com/${me.username}` : null,
    accessToken,
    refreshToken,
    scope,
    tokenExpiresAt: expiresAt,
  })
  console.log(`✅ 已导入 demo 账号(${slot})：account=${account.id}  @${me.username ?? me.id}  scope=${scope ?? "?"}`)
}

main().catch((err: unknown) => {
  console.error("❌", err instanceof Error ? err.message : err)
  process.exit(1)
})
