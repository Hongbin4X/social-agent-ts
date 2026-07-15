// 后端应用级配置：只从 env 读。
// 各子系统（DB / 生成 / 存储 / 发布）各自有 xxxFromEnv，这里只放 server 自身的。

// env 加载统一走 scripts/load-env.mjs（多环境 profile：APP_ENV=local|test|prod，见该文件注释）。
// 别在这里再自己 loadEnvFile —— 那样 .env.<profile> 覆盖会失效。
import { loadEnv } from "../../../scripts/load-env.mjs"

loadEnv()

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
  /**
   * 图片计费档（robot 的 once 按次计价行；是「规格内嵌的计费键」，不是模型名）。
   * 必须与 GENERATION_IMAGE_MODEL 配套，换出图模型/规格就要换它，否则扣错档。见 glbgpt-billing.ts 顶部契约注释。
   */
  imageBillingModel: string
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
    // 默认 nano_banana_2_1k：出图模型 gemini-3.1-flash-image-preview 在平台侧【就是】nano_banana_2
    // （GenerationAPI.java:3780 视为同一模型），我们不传 resolution → 平台默认 1K（:3833）→ 键为 nano_banana_2_1k。
    // 其余规格键：nano_banana_2_{0.5k,2k,4k}（:3826-3830）。换出图模型/规格必须同步改。
    imageBillingModel: env.IMAGE_BILLING_MODEL?.trim() || "nano_banana_2_1k",
    chatpalBaseUrl: env.CHATPAL_BASE_URL?.trim() || undefined,
    // ⚠️ glbgpt，不是 chatpal（2026-07-15 实机纠正）：channel 指【产品】不是服务名。
    // 平台按 (email + channel) 区分用户（UserAPI 注释原文「区分不同channel用户」），
    // 且 loginOrSignupByEmailChannel 找不到就【新建】—— channel 填错不会报错，
    // 而是悄悄给用户开一个空账号（余额 0），比报错更难查。
    // 实证：测试环境 2000163/2000208/1999999/15 四个账号的 channel 全是 glbgpt。
    platformChannel: env.PLATFORM_CHANNEL?.trim() || "glbgpt",
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
