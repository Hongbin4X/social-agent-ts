// X 授权握手的两块共享件：XApp 单例（授权路由 + DbTokenStore 续期共用一份凭证）+ 授权握手临时态存储。
//
// PendingAuthStore：paste-back 授权流程里，从「发起授权」到「用户粘回回调 URL」之间，需要把
//   state → codeVerifier（+ 归属 workspace）暂存在后端。**codeVerifier 绝不下发前端**（PKCE 防授权码被盗用）。
//   这些临时态只活几分钟，放内存 + TTL 过期即可（demo 授权流程文档明确：别进账号表）。
//   单机本地够用；将来多实例部署换成 Redis，接口不变。

import { XApp } from "@social/publisher"
import { xOAuthConfigFromEnv } from "../config"

let xappSingleton: XApp | null | undefined

/** 取 XApp 单例；X 未配置（无 X_CLIENT_ID）时返回 null，调用方据此如实报「未接通」。 */
export function getXApp(): XApp | null {
  if (xappSingleton === undefined) {
    const cfg = xOAuthConfigFromEnv()
    xappSingleton = cfg ? new XApp(cfg) : null
  }
  return xappSingleton
}

interface PendingAuth {
  codeVerifier: string
  workspaceId: string
  createdAt: number
}

export class PendingAuthStore {
  private readonly map = new Map<string, PendingAuth>()

  constructor(private readonly ttlMs = 10 * 60_000) {}

  /** 发起授权时存 state → {codeVerifier, workspaceId}。 */
  put(state: string, codeVerifier: string, workspaceId: string): void {
    this.gc()
    this.map.set(state, { codeVerifier, workspaceId, createdAt: Date.now() })
  }

  /** 回调时按 state 取出并移除（一次性）。过期/不存在返回 null。 */
  take(state: string): PendingAuth | null {
    this.gc()
    const v = this.map.get(state)
    if (!v) return null
    this.map.delete(state)
    return v
  }

  private gc(): void {
    const now = Date.now()
    for (const [k, v] of this.map) {
      if (now - v.createdAt > this.ttlMs) this.map.delete(k)
    }
  }
}

/** 进程级单例（单机本地 OK；多实例换共享缓存）。 */
export const pendingAuthStore = new PendingAuthStore()
