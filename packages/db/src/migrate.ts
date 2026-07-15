// 迁移执行脚本：把 ./drizzle 下由 drizzle-kit generate 产出的 SQL 迁移应用到目标库。
// 用法：pnpm --filter @social/db db:migrate（tsx src/migrate.ts）。
//
// 注意：迁移文件由 `pnpm db:generate` 从 schema.ts 生成到 ./drizzle。首次跑前先 generate。

import { migrate } from "drizzle-orm/mysql2/migrator"
import { loadEnv } from "../../../scripts/load-env.mjs"
import { createDb } from "./client"

// env 加载统一走 scripts/load-env.mjs。⚠️ 目标库随 APP_ENV 走（APP_ENV=test → .env.test 的库）。
loadEnv()

async function main(): Promise<void> {
  const { db, pool } = createDb()
  await migrate(db, { migrationsFolder: "./drizzle" })
  console.log("✅ [db] migrations applied")
  await pool.end()
  process.exit(0)
}

main().catch((err: unknown) => {
  console.error("❌ [db] migration failed:", err)
  process.exit(1)
})
