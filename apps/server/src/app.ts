// Super Social Agent 后端 BFF —— P0 脚手架。
// 定位（见架构设计文档）：这不是一个独立重后端，而是 GLBGPT 的 BFF：
//   1. 代理 GLBGPT 的登录态 / userId / 套餐权益 / 计费系统 / 模型 API Key；
//   2. 领域服务：workspace / project / brandProfile / posts / calendar / 发布任务 / ops；
//   3. agent 编排：内容生成、7 天计划、图片生成、推荐（经由 @social/agent，模型走 GLBGPT 模型层）。
// 现在只放一个健康检查 + 一个占位 API，保证结构完整、可编译、可启动。真实路由后续在 src/routes 落地。

import { Hono } from "hono"
import { serveStatic } from "@hono/node-server/serve-static"
import { CREDIT_COSTS } from "@social/shared"
import { publishRoutes } from "./routes/publish"
import { connectionRoutes } from "./routes/connections"
import { type AppEnv, authMiddleware } from "./auth"
import { serverConfigFromEnv } from "./config"
import { workspaceRoutes } from "./routes/workspace"
import { projectRoutes } from "./routes/projects"
import { accountRoutes } from "./routes/accounts"
import { postRoutes } from "./routes/posts"
import { calendarRoutes } from "./routes/calendar"
import { generateRoutes } from "./routes/generate"

export const app = new Hono<AppEnv>()

app.get("/health", (c) => c.json({ ok: true, service: "super-social-agent-server", stage: "P0-scaffold" }))

// 本地媒体静态服务（LocalFsMediaStorage 落盘的图片，公开、无需鉴权）。落盘根 = cwd/.media。
// /media/<proj>/<id>.jpg → 读 .media/<proj>/<id>.jpg。前端经 Next /media 反代同源访问。
app.use(
  "/media/*",
  serveStatic({ root: "./.media", rewriteRequestPath: (path) => path.replace(/^\/media/, "") }),
)

// 占位：把共享的计费表暴露出来，证明 @social/shared 在前后端间已打通。真实计费预扣/回写接 GLBGPT 后再实现。
app.get("/api/billing/credit-costs", (c) => c.json(CREDIT_COSTS))

// 发布层：批量发布 + 平台能力矩阵（spec §11）。发布编排走 @social/publisher，可切直连/聚合两种实现。
app.route("/api/publish", publishRoutes)
// 账号连接（OAuth）脚手架：暴露每平台所需权限，授权起始待联调（spec §9 Connections）。
app.route("/api/connections", connectionRoutes)

// ── 领域路由（前端全部操作的接口）。鉴权中间件解析 userId（本地走 DEV_FAKE_USER_ID）。──
const auth = authMiddleware(serverConfigFromEnv().devFakeUserId)
for (const base of ["/api/workspace", "/api/projects", "/api/accounts", "/api/posts", "/api/calendar", "/api/generate"]) {
  app.use(base, auth)
  app.use(`${base}/*`, auth)
}
app.route("/api/workspace", workspaceRoutes)
app.route("/api/projects", projectRoutes)
app.route("/api/accounts", accountRoutes)
app.route("/api/posts", postRoutes)
app.route("/api/calendar", calendarRoutes)
app.route("/api/generate", generateRoutes)

export type AppType = typeof app
