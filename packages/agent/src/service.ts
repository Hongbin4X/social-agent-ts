// GenerationService —— 生成编排入口（上层/后端路由唯一要打交道的对象）。
//
// 每个 run* 方法的三段式计费流水线（严格按 spec §16，与 @social/publisher 的 provider-cost 同构）：
//   1. 按 CREDIT_COSTS[actionType] 向 CreditBillingGateway 预扣（reserveCredits）
//   2. 调 generator.generateX 执行
//   3a. 成功 → settleCredits(reservationId, actualCredits, usage)，返回 { ok:true, data, ... }
//   3b. 失败/异常 → refundCredits(reservationId)，把错误收敛成 { ok:false, code, message }（不向上抛、不掩盖）
//
// 铁律：绝不假成功。本地无真实 credit 计量：actualCredits = estimated（真计费在 GLBGPT 侧按 usage 重算，
//   settle 时把 usage 一并回写）。usage 从实现了 UsageReporting 的 generator（LLM）drain 出来；桩无 usage。
//
// 本包不碰 DB / storage（解耦）：返回结构带 reservationId / actualCredits / usage，供 apps/server 落
//   ssa_generation_job 等表。

import type {
  BillingActionType,
  CreditBillingGateway,
  GenerateImageInput,
  GenerateImageOutput,
  GeneratePlanInput,
  GeneratePlanOutput,
  GenerateProfileDraftInput,
  GenerateProfileDraftOutput,
  GenerateRecommendationsInput,
  GenerateRecommendationsOutput,
  GenerateVariantsInput,
  GenerateVariantsOutput,
  GenerationErrorCode,
  GenerationUsage,
} from "@social/shared"
import { CREDIT_COSTS } from "@social/shared"
import type { ContentGenerator } from "./ports"
import { isUsageReporting } from "./ports"
import { GeneratorError } from "./errors"

/** 一次生成动作的计费/租户上下文（actionType 由具体 run* 方法决定）。 */
export interface GenerationContext {
  userId: string
  workspaceId: string
  projectId: string
}

export interface GenerationServiceDeps {
  generator: ContentGenerator
  billing: CreditBillingGateway
  logger?: Pick<Console, "info" | "warn" | "error">
}

/** 可辨识结果：成功带 data + 计费元数据；失败带 code/message（service 不向上抛，让路由据 code 映射响应）。 */
export type GenerationResult<T> =
  | {
      ok: true
      data: T
      reservationId: string
      actualCredits: number
      usage?: GenerationUsage
    }
  | {
      ok: false
      code: GenerationErrorCode
      message: string
      /** 预扣成功后才失败的，带上已退款的 reservationId，便于审计。 */
      reservationId?: string
    }

export class GenerationService {
  constructor(private readonly deps: GenerationServiceDeps) {}

  runGenerateVariants(
    ctx: GenerationContext,
    input: GenerateVariantsInput,
  ): Promise<GenerationResult<GenerateVariantsOutput>> {
    return this.run("generateVariants", ctx, () => this.deps.generator.generateVariants(input))
  }

  runGeneratePlan(
    ctx: GenerationContext,
    input: GeneratePlanInput,
  ): Promise<GenerationResult<GeneratePlanOutput>> {
    return this.run("generatePlan", ctx, () => this.deps.generator.generatePlan(input))
  }

  runGenerateImage(
    ctx: GenerationContext,
    input: GenerateImageInput,
  ): Promise<GenerationResult<GenerateImageOutput>> {
    // 有 instruction = Modify（20 credits），否则 Regenerate（30 credits）——口径与 CREDIT_COSTS 对齐。
    const actionType: BillingActionType = input.instruction ? "modifyImage" : "regenerateImage"
    return this.run(actionType, ctx, () => this.deps.generator.generateImage(input))
  }

  runGenerateRecommendations(
    ctx: GenerationContext,
    input: GenerateRecommendationsInput,
  ): Promise<GenerationResult<GenerateRecommendationsOutput>> {
    return this.run("generateRecommendations", ctx, () =>
      this.deps.generator.generateRecommendations(input),
    )
  }

  runGenerateProfileDraft(
    ctx: GenerationContext,
    input: GenerateProfileDraftInput,
  ): Promise<GenerationResult<GenerateProfileDraftOutput>> {
    return this.run("generateProfileDraft", ctx, () =>
      this.deps.generator.generateProfileDraft(input),
    )
  }

  /** 三段式计费的统一执行器：reserve → exec → settle / refund。 */
  private async run<T>(
    actionType: BillingActionType,
    ctx: GenerationContext,
    exec: () => Promise<T>,
  ): Promise<GenerationResult<T>> {
    const estimatedCredits = CREDIT_COSTS[actionType]
    const reservation = await this.deps.billing.reserveCredits({
      userId: ctx.userId,
      workspaceId: ctx.workspaceId,
      projectId: ctx.projectId,
      actionType,
      estimatedCredits,
    })

    try {
      const data = await exec()
      // 真实 token 用量只有 LLM generator 有（实现 UsageReporting）；桩返回 undefined。
      const usage = isUsageReporting(this.deps.generator)
        ? this.deps.generator.drainUsage()
        : undefined
      // 本地无真实计量：actual = estimated；真计费由 GLBGPT 在 settle 时按 usage 重算。
      const actualCredits = estimatedCredits
      await this.deps.billing.settleCredits(reservation.reservationId, actualCredits, usage)
      return { ok: true, data, reservationId: reservation.reservationId, actualCredits, usage }
    } catch (err) {
      // 执行失败：退款，绝不假扣、绝不假成功。
      await this.deps.billing.refundCredits(reservation.reservationId)
      const code: GenerationErrorCode = err instanceof GeneratorError ? err.code : "model_error"
      const message = err instanceof Error ? err.message : String(err)
      this.deps.logger?.error(`[generation] ${actionType} 失败(${code}): ${message}`)
      return { ok: false, code, message, reservationId: reservation.reservationId }
    }
  }
}
