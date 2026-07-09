// drizzle-kit 配置：从 schema.ts 生成/推送迁移到 dev MySQL。
// 连接参数从仓库根 .env 读取（Node 22 的 process.loadEnvFile）。
import { defineConfig } from "drizzle-kit"
import { dbConfigFromEnv } from "./src/config"

// 加载根 .env（drizzle-kit 不会自动加载）。缺文件时忽略，回退到 dbConfigFromEnv 的默认值。
try {
  ;(process as unknown as { loadEnvFile: (p?: string) => void }).loadEnvFile("../../.env")
} catch {
  /* .env 不存在则用默认（本地 dev MySQL） */
}

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
