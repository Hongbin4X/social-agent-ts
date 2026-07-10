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

/** X（Twitter）开发者应用凭证（授权路由 + token 续期共用）。 */
export interface XOAuthConfig {
  clientId: string
  /** confidential client（Web/Automated App）才有；public client 留空。只在后端，绝不下发前端。 */
  clientSecret?: string
  /** 送用户回来的回调地址，必须与 X 后台登记的**完全一致**。paste-back 流程下无需可达、只需已注册。 */
  redirectUri: string
  scopes?: string
}

/**
 * 从 env 读 X 应用凭证。未配 X_CLIENT_ID → 返回 null（授权路由据此如实 501「未接通」，不假装）。
 * redirectUri 缺省用 demo 已注册的 127.0.0.1:8765/callback（复用 demo 应用时正好对上）。
 */
export function xOAuthConfigFromEnv(env = process.env): XOAuthConfig | null {
  const clientId = env.X_CLIENT_ID?.trim()
  if (!clientId) return null
  return {
    clientId,
    clientSecret: env.X_CLIENT_SECRET?.trim() || undefined,
    redirectUri: env.X_REDIRECT_URI?.trim() || "http://127.0.0.1:8765/callback",
    scopes: env.X_OAUTH_SCOPES?.trim() || undefined,
  }
}
