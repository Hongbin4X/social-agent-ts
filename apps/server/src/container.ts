// 依赖装配（DI 容器）—— 懒加载单例，与 services/publishing.ts 相同的装配风格。
// 把 @social/db 仓储、@social/agent 生成服务、@social/storage、本地 credits 计费拼在一起，供路由取用。

import { GenerationService, createGeneratorFromEnv } from "@social/agent"
import { type Database, type Repositories, createDb, createRepositories, newId } from "@social/db"
import type { CreditBillingContext, CreditBillingGateway, CreditReservation, GenerationUsage } from "@social/shared"
import { type MediaStorage, mediaStorageFromEnv } from "@social/storage"
import { serverConfigFromEnv } from "./config"

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

export interface Container {
  db: Database
  repos: Repositories
  generation: GenerationService
  media: MediaStorage
  config: ReturnType<typeof serverConfigFromEnv>
  newId: typeof newId
}

let singleton: Container | null = null

export function getContainer(): Container {
  if (singleton) return singleton
  const config = serverConfigFromEnv()
  const { db } = createDb()
  const repos = createRepositories(db)
  const generator = createGeneratorFromEnv()
  const billing = new LocalCreditBilling(repos)
  const generation = new GenerationService({ generator, billing, logger: console })
  const media = mediaStorageFromEnv()
  singleton = { db, repos, generation, media, config, newId }
  return singleton
}
