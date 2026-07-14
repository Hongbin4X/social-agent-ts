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
  /** 应用对外公网入口（如 https://x.broly.ai）。X OAuth 成功回调页据此 postMessage 回前端；留空则 postMessage 到 "*"。 */
  appPublicUrl?: string
  /** 平台共享 JWT 密钥（chatpal/ai-api 同一把，原始 UTF-8 字节、不 base64）。配了才验签 Bearer；见飞书子文档① A0。 */
  jwtSecret?: string
  /** 本地开发旁路：无平台 JWT 时用它当 userId。生产/联调留空 = 关闭旁路，必须走真实鉴权（与验签同批）。 */
  devFakeUserId?: string
  /** 本地媒体落盘目录（LocalFsMediaStorage）。 */
  mediaLocalDir?: string
  /** 计费模式：stub=本地账本(不真扣) / real=接 ai-api 真扣。默认 stub。见飞书子文档②改造清单 #6。 */
  billingMode: "stub" | "real"
  /** ai-api 根地址（real 模式必需），如 http://<测试服内网>:8070；适配器自拼 /ai-api/ai/bill/*。 */
  aiApiBaseUrl?: string
  /** 账单归属 productNo（本项目复用 glbgpt）。 */
  billingProductNo: string
  /** 文本计费模型（robot 表 tokens 行，如 gpt-5.4；reserve 的 checkPermission 与 settle 的 recordBill 用）。 */
  textBillingModel: string
  /** chatpal 根地址（登录代理用），如 http://<测试服内网>:8089；后端自拼 /user-api/user/*。空=登录路由如实 501。 */
  chatpalBaseUrl?: string
  /** 平台渠道标识（chatpal emailLogin/sendEmailVerifyCode 的 channel 字段）。默认 chatpal。 */
  platformChannel: string
}

export function serverConfigFromEnv(env = process.env): ServerConfig {
  return {
    port: Number(env.PORT ?? 8091),
    publicBaseUrl: env.PUBLIC_BASE_URL ?? "http://localhost:8091",
    appPublicUrl: env.APP_PUBLIC_URL?.trim() || undefined,
    jwtSecret: env.JWT_SECRET?.trim() || undefined,
    devFakeUserId: env.DEV_FAKE_USER_ID || undefined,
    mediaLocalDir: env.MEDIA_LOCAL_DIR || undefined,
    billingMode: env.BILLING_MODE === "real" ? "real" : "stub",
    aiApiBaseUrl: env.AI_API_BASE_URL?.trim() || undefined,
    billingProductNo: env.BILLING_PRODUCT_NO?.trim() || "glbgpt",
    textBillingModel: env.TEXT_BILLING_MODEL?.trim() || "gpt-5.4",
    chatpalBaseUrl: env.CHATPAL_BASE_URL?.trim() || undefined,
    platformChannel: env.PLATFORM_CHANNEL?.trim() || "chatpal",
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
