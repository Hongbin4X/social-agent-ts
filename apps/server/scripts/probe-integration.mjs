// 联调探针 —— 手动烟测 ai-api 计费联调，不依赖前端/DB。
//   运行：cd apps/server && node scripts/probe-integration.mjs [userId]
//   userId 缺省取 .env 的 DEV_FAKE_USER_ID；真实联调请传测试账号自增 id。
//
// 干三件事（每步打印 HTTP 状态 + body，判成功看 code===1/null）：
//   1) 可达性：TCP/HTTP 探 ai-api(8079)、chatpal(8089)——超时=安全组还没放行本机。
//   2) checkPermission：用 JWT_SECRET 自签 token（userId+共享密钥），验证「有没有权限调用模型」。
//   3) recordBill：上报文本计费档 TEXT_BILLING_MODEL(gpt-5.4)——验证真实扣费链路。
// 注意：这脚本要在 apps/server 目录下跑，jose 才能从本包 node_modules 解析（踩过的坑）。
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { SignJWT } from "jose"

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, "../../..") // apps/server/scripts → 仓库根

/** 极简 .env 解析（避开 dotenv 版本/依赖问题）。 */
function loadEnv() {
  const out = {}
  let text = ""
  try {
    text = readFileSync(resolve(repoRoot, ".env"), "utf8")
  } catch {
    console.error("读不到仓库根 .env，改从 process.env 取")
    return process.env
  }
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !line.trimStart().startsWith("#")) out[m[1]] = m[2]
  }
  return { ...out, ...process.env }
}

const env = loadEnv()
const AI_BASE = (env.AI_API_BASE_URL || "").replace(/\/$/, "")
// chatpal 根地址：优先取 env（域名方案下与 ai-api 同域、靠 /user-api 前缀分流）；缺省退回端口推导。
const CHATPAL_BASE = (env.CHATPAL_BASE_URL || AI_BASE.replace(/:\d+$/, ":8089")).replace(/\/$/, "")
const SECRET = env.JWT_SECRET || ""
const PRODUCT_NO = env.BILLING_PRODUCT_NO || "glbgpt"
const BILLING_MODEL = env.TEXT_BILLING_MODEL || "gpt-5.4"
const userId = process.argv[2] || env.DEV_FAKE_USER_ID || ""

const OK = "\x1b[32m✅\x1b[0m"
const NO = "\x1b[31m❌\x1b[0m"

async function sign(uid) {
  return new SignJWT({ userId: uid, channel: "web" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .sign(new TextEncoder().encode(SECRET))
}

async function reach(name, base, path) {
  try {
    const res = await fetch(base + path, { method: "GET", signal: AbortSignal.timeout(8000) })
    console.log(`${OK} ${name} 可达 (${base}${path}) http=${res.status}`)
    return true
  } catch (e) {
    console.log(`${NO} ${name} 连不上 (${base}${path}) — ${e.name === "TimeoutError" ? "超时(安全组/网络)" : e.message}`)
    return false
  }
}

async function post(path, body, token) {
  const res = await fetch(AI_BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  })
  const text = await res.text()
  let json = null
  try { json = text ? JSON.parse(text) : null } catch { /* 保留原文 */ }
  return { status: res.status, json, text }
}

async function main() {
  console.log("=== 联调探针 ===")
  console.log(`ai-api  = ${AI_BASE || "(未配置 AI_API_BASE_URL)"}`)
  console.log(`chatpal = ${CHATPAL_BASE}`)
  console.log(`userId  = ${userId || "(未提供)"}  productNo=${PRODUCT_NO}  billingModel=${BILLING_MODEL}`)
  console.log(`JWT_SECRET = ${SECRET ? "已配(" + SECRET.length + "字)" : "(空!)"}\n`)

  console.log("--- 1) 可达性 ---")
  const aiUp = await reach("ai-api ", AI_BASE, "/ai-api/ai/projects")
  await reach("chatpal", CHATPAL_BASE, "/user-api/api/user/info")
  if (!aiUp) {
    console.log("\nai-api 不可达，后续鉴权/扣费探测跳过。放行安全组后重跑。")
    return
  }
  if (!SECRET) { console.log("\nJWT_SECRET 为空，无法自签 token。"); return }
  if (!userId) { console.log("\n未提供 userId，传参：node scripts/probe-integration.mjs <userId>"); return }

  const token = await sign(userId)

  console.log("\n--- 2) checkPermission（有没有权限调用模型） ---")
  const perm = await post("/ai-api/ai/bill/checkPermission", { productNo: PRODUCT_NO, model: BILLING_MODEL, agentId: null }, token)
  const permOk = perm.status >= 200 && perm.status < 300 && (perm.json?.code === 1 || perm.json?.code == null)
  console.log(`${permOk ? OK : NO} status=${perm.status} body=${perm.text?.slice(0, 400)}`)

  console.log("\n--- 3) recordBill（真实扣费上报） ---")
  const bill = await post("/ai-api/ai/bill/recordBill", { productNo: PRODUCT_NO, model: BILLING_MODEL, promptTokens: 100, completionTokens: 50, device: { deviceType: "web" } }, token)
  const billOk = bill.status >= 200 && bill.status < 300 && (bill.json?.code === 1 || bill.json?.code == null)
  console.log(`${billOk ? OK : NO} status=${bill.status} body=${bill.text?.slice(0, 400)}`)

  console.log("\n=== 小结 ===")
  console.log(`checkPermission: ${permOk ? "通过" : "未通过（看 body.subCode：4002需充值/4003·4004订阅余额不足/4009需PRO...）"}`)
  console.log(`recordBill:      ${billOk ? "扣费成功" : "扣费失败（no_robot_row=计费档在robot表无价 / 其他见body）"}`)
}

main().catch((e) => { console.error("探针异常:", e); process.exit(1) })
