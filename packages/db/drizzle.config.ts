// drizzle-kit 配置：从 schema.ts 生成/推送迁移到目标库。
// 连接参数从 env 读，加载走全仓统一的 scripts/load-env.mjs。
// ⚠️ 迁移的目标库随 APP_ENV 走：`APP_ENV=test pnpm db:migrate` 会迁到 .env.test 指定的库。
//    执行前务必确认 DB_HOST/DB_NAME 是你以为的那个（别把测试迁移打到生产库上）。
import { defineConfig } from "drizzle-kit"
import { loadEnv } from "../../scripts/load-env.mjs"
import { dbConfigFromEnv } from "./src/config"

loadEnv()

const c = dbConfigFromEnv()

export default defineConfig({
  dialect: "mysql",
  schema: "./src/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    host: c.host,
    port: c.port,
    user: c.user,
    password: c.password,
    database: c.database,
  },
})
