// 后端应用级配置：只从 env 读。加载仓库根 .env（Node 22 process.loadEnvFile）。
// 各子系统（DB / 生成 / 存储 / 发布）各自有 xxxFromEnv，这里只放 server 自身的。

import path from "node:path"

// 稳定加载仓库根 .env（相对本文件定位，不受启动 cwd 影响）：apps/server/src → 上溯 3 级到根。
try {
  const rootEnv = path.resolve(import.meta.dirname, "../../../.env")
  ;(process as unknown as { loadEnvFile: (p?: string) => void }).loadEnvFile(rootEnv)
} catch {
  /* 无 .env 时用进程已有环境变量 */
}

export interface ServerConfig {
  port: number
  publicBaseUrl: string
  /** 本地开发旁路：无 GLBGPT JWT 时用它当 userId。生产留空 = 关闭旁路，必须走真实鉴权。 */
  devFakeUserId?: string
  /** 本地媒体落盘目录（LocalFsMediaStorage）。 */
  mediaLocalDir?: string
}

export function serverConfigFromEnv(env = process.env): ServerConfig {
  return {
    port: Number(env.PORT ?? 8091),
    publicBaseUrl: env.PUBLIC_BASE_URL ?? "http://localhost:8091",
    devFakeUserId: env.DEV_FAKE_USER_ID || undefined,
    mediaLocalDir: env.MEDIA_LOCAL_DIR || undefined,
  }
}
