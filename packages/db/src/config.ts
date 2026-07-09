// DB 连接配置：只从环境变量读，不硬编码任何地址/凭证。
// 本地默认指向 docker-compose.dev.yml 的 dev MySQL；联调/上线改 .env 即可直连远端 yanfa MySQL。

export interface DbConfig {
  host: string
  port: number
  user: string
  password: string
  database: string
  poolSize: number
}

export function dbConfigFromEnv(env = process.env): DbConfig {
  return {
    host: env.DB_HOST ?? "127.0.0.1",
    port: Number(env.DB_PORT ?? 3307),
    user: env.DB_USER ?? "social_agent",
    password: env.DB_PASSWORD ?? "dev_pw",
    database: env.DB_NAME ?? "social_agent",
    poolSize: Number(env.DB_POOL_SIZE ?? 10),
  }
}
