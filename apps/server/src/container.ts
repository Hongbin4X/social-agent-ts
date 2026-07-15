// 依赖装配（DI 容器）—— 懒加载单例，与 services/publishing.ts 相同的装配风格。
// 把 @social/db 仓储、@social/agent 生成服务、@social/storage、本地 credits 计费拼在一起，供路由取用。

import { GenerationService, createGeneratorFromEnv } from "@social/agent"
import { type Database, type Repositories, createDb, createRepositories, newId } from "@social/db"
import type { BillingActionType, CreditBillingContext, CreditBillingGateway, CreditReservation, GenerationUsage } from "@social/shared"
import { type MediaStorage, mediaStorageFromEnv } from "@social/storage"
import { serverConfigFromEnv } from "./config"
import { type BillingLedger, GlbgptCreditBilling } from "./services/glbgpt-billing"
import { ChatpalAuthClient } from "./services/chatpal-auth"

// 本地 credits 计费：把预扣/结算/退款如实记进 ssa_billing_usage_record（本地账本，真实行为，不假称对接 GLBGPT）。
// 本地不做真实余额扣减（那是 GLBGPT 的事，联调时换成调 GLBGPT 的适配器即可，端口不变）。
class LocalCreditBilling implements CreditBillingGateway {
  constructor(private readonly repos: Repositories) {}

  async reserveCredits(input: CreditBillingContext & { estimatedCredits: number }): Promise<CreditReservation> {
    const { id } = await this.repos.billingRecords.create({
      userId: input.userId,
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      actionType: input.actionType,
      estimatedCredits: input.estimatedCredits,
      status: "reserved",
    })
    return { reservationId: id, estimatedCredits: input.estimatedCredits }
  }

  async settleCredits(reservationId: string, actualCredits: number, usage?: GenerationUsage): Promise<void> {
    await this.repos.billingRecords.update(reservationId, {
      status: "settled",
      actualCredits,
      model: usage?.model,
    })
  }

  async refundCredits(reservationId: string): Promise<void> {
    await this.repos.billingRecords.update(reservationId, { status: "refunded" })
  }
}

// BILLING_MODE 工厂：stub→本地账本（不真扣）/ real→GlbgptCreditBilling（接 ai-api 真扣）。
// real 模式把 repos.billingRecords 适配成适配器的窄 BillingLedger 端口（依赖倒置，见 glbgpt-billing.ts）。
function makeCreditBilling(
  config: ReturnType<typeof serverConfigFromEnv>,
  repos: Repositories,
): CreditBillingGateway {
  if (config.billingMode !== "real") return new LocalCreditBilling(repos)
  if (!config.jwtSecret || !config.aiApiBaseUrl) {
    throw new Error("BILLING_MODE=real 需要配置 JWT_SECRET 与 AI_API_BASE_URL（缺一不可）")
  }
  // 账本状态机见 glbgpt-billing.ts BillingLedger 注释：
  // reserved → settled / refunded / rejected(余额不足没生成) / settle_failed(已交付但漏扣，待补偿)。
  const ledger: BillingLedger = {
    async create(input) {
      const { id } = await repos.billingRecords.create({ ...input, actionType: input.actionType as BillingActionType, status: "reserved" })
      return { reservationId: id }
    },
    markSettled: (id, patch) => repos.billingRecords.update(id, { status: "settled", ...patch }),
    markRefunded: (id) => repos.billingRecords.update(id, { status: "refunded" }),
    markRejected: (id) => repos.billingRecords.update(id, { status: "rejected" }),
    markSettleFailed: (id) => repos.billingRecords.update(id, { status: "settle_failed" }),
    async getContext(id) {
      const row = await repos.billingRecords.getById(id)
      return row ? { userId: row.userId, actionType: row.actionType } : null
    },
  }
  return new GlbgptCreditBilling({
    baseUrl: config.aiApiBaseUrl,
    jwtSecret: config.jwtSecret,
    productNo: config.billingProductNo,
    textBillingModel: config.textBillingModel,
    // 图片计费档（once 按次，规格内嵌键）。与文本档分流，绝不能让图片套用文本 token 档（≈免费）。
    imageBillingModel: config.imageBillingModel,
    ledger,
    logger: console,
  })
}

export interface Container {
  db: Database
  repos: Repositories
  generation: GenerationService
  media: MediaStorage
  config: ReturnType<typeof serverConfigFromEnv>
  /** 登录代理：配了 CHATPAL_BASE_URL 才有；否则 null（登录路由据此如实 501）。 */
  chatpalAuth: ChatpalAuthClient | null
  newId: typeof newId
}

let singleton: Container | null = null

export function getContainer(): Container {
  if (singleton) return singleton
  const config = serverConfigFromEnv()
  const { db } = createDb()
  const repos = createRepositories(db)
  const generator = createGeneratorFromEnv()
  const billing = makeCreditBilling(config, repos)
  const generation = new GenerationService({ generator, billing, logger: console })
  const media = mediaStorageFromEnv()
  // 登录代理：配了 chatpal 根地址才实例化；缺则 null（路由如实 501「未接通」，不假装）。
  const chatpalAuth = config.chatpalBaseUrl
    ? new ChatpalAuthClient({ baseUrl: config.chatpalBaseUrl, channel: config.platformChannel })
    : null
  singleton = { db, repos, generation, media, config, chatpalAuth, newId }
  return singleton
}
