// 后端入口。P0 脚手架：仅启动 Hono，监听内部端口。
// 端口后续要对外须先让运维在安全组放行、再配 systemd 常驻——现在只是本地可跑的占位。
import { serve } from "@hono/node-server"
import { app } from "./app"

const port = Number(process.env.PORT ?? 8091)

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[super-social-agent] server listening on http://localhost:${info.port}`)
})
