// 连接工厂：mysql2 连接池 + drizzle 实例。
//
// 设计要点（铁律1/2/12）：
//  · 不在模块顶层建连接 —— 避免「import @social/db 即连库」的副作用（测试/脚本按需 createDb 才连）。
//  · 连接参数只从 DbConfig 来（默认走 dbConfigFromEnv），不硬编码任何地址/凭证。
//  · 连不上库直接抛错（mysql2 连接失败会 reject / 抛异常），绝不 mock/降级掩盖。

import { drizzle, type MySql2Database } from "drizzle-orm/mysql2"
import { createPool, type Pool } from "mysql2/promise"
import { dbConfigFromEnv, type DbConfig } from "./config"
import { schema } from "./schema"

// 全库统一的 Database 类型：带上 schema 泛型，让上层类型推断与（未来的）关系查询可用。
export type Database = MySql2Database<typeof schema>

/**
 * 建一个新的连接池 + drizzle 实例。
 * @param config 缺省用 dbConfigFromEnv()（读环境变量，默认指向本地 dev MySQL）。
 * @returns { db, pool } —— db 给仓储用；pool 需在脚本结束时 pool.end() 释放。
 */
export function createDb(config: DbConfig = dbConfigFromEnv()): { db: Database; pool: Pool } {
  const pool = createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    connectionLimit: config.poolSize,
    // 领域库大量 varchar/json；开启后 mysql2 会把 DECIMAL 当字符串返回（保精度），符合计费口径需求。
    decimalNumbers: false,
  })
  const db = drizzle(pool, { schema, mode: "default" })
  return { db, pool }
}
