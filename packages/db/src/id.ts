// 领域 ID 生成器（放这里做全库唯一真源，铁律2：别在各 repo 各写一份）。
//
// 设计（用户 2026-07-09 约束）：
//  · 不依赖 nanoid 包；某些沙箱里 Math.random / Date.now 也不可信 —— 用 crypto.randomUUID() 取前段，
//    再拼一个「模块级自增计数器」保证同进程内绝不撞车（randomUUID 已足够随机，计数器兜底同毫秒并发）。
//  · 结果形如 `ws_9f3c2a1b0e4d5`，总长 ≤ 32（对齐 schema 里 varchar("id", { length: 32 })）。
//  · 前缀短、可读，便于日志里一眼认出实体类型。

import { randomUUID } from "node:crypto"

// 模块级自增计数器：进程内单调递增，避免同一 UUID 前段（截断后）+ 前缀在极端并发下重复。
let seq = 0

/**
 * 生成一个带前缀的领域 ID。
 * @param prefix 实体前缀（如 "ws" / "prj" / "post"）。请保持简短，确保总长 ≤ 32。
 */
export function newId(prefix: string): string {
  // 取 UUID 去掉连字符后的前 16 位十六进制（64 bit 随机，撞车概率可忽略）。
  const rand = randomUUID().replace(/-/g, "").slice(0, 16)
  // 计数器用 base36 压缩长度；到上限回绕不影响唯一性（有 rand 兜底）。
  const c = (seq = (seq + 1) % 0xffffffff).toString(36)
  return `${prefix}_${rand}${c}`.slice(0, 32)
}
