// 迁移执行脚本：把 ./drizzle 下由 drizzle-kit generate 产出的 SQL 迁移应用到目标库。
// 用法：pnpm --filter @social/db db:migrate（tsx src/migrate.ts）。
//
// 注意：迁移文件由 `pnpm db:generate` 从 schema.ts 生成到 ./drizzle。首次跑前先 generate。

import { migrate } from "drizzle-orm/mysql2/migrator"
import { createDb } from "./client"

// 加载仓库根 .env（tsx 不会自动加载）。缺文件时忽略，回退到 dbConfigFromEnv 默认值。
try {
  ;(process as unknown as { loadEnvFile: (p?: string) => void }).loadEnvFile("../../.env")
} catch {
  /* .env 不存在则用默认（本地 dev MySQL） */
}

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
