// @social/agent —— agent 编排层占位（P0 未实现）。
// 未来集成 agent 框架时，这里定义"生成能力"的统一入口：内容变体、7 天计划、图片生成/修改、运营推荐。
// 铁律：模型调用一律走 GLBGPT 模型层；每个付费动作对应 @social/shared 的 BillingActionType / CREDIT_COSTS，
// 由后端在执行前向 GLBGPT 计费系统预扣、执行后回写 actual credits。

import type { BillingActionType } from "@social/shared"

/** 一次 agent 生成任务的通用信封。actionType 决定计费口径。具体实现待接入 agent 框架后补。 */
export interface AgentTask<TInput = unknown, TOutput = unknown> {
  actionType: BillingActionType
  input: TInput
  run(): Promise<TOutput>
}

/** 占位：后续由具体 agent 框架实现。现在返回未实现错误，避免静默降级（项目铁律：遇问题直接报错）。 */
export function createAgentRunner(): never {
  throw new Error("@social/agent 尚未实现：P0 阶段仅占位，接入 agent 框架后再实现")
}
