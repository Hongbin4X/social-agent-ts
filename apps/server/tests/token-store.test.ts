// DbTokenStore 的核心行为：读时自动续期 + 轮换 refresh_token 写回 + 失败标 needs-reauth。
// 这是「代用户长期发帖」最容易翻车的一环（refresh 轮换不写回=用户掉线），必须钉死。
// 用假 accounts 网关 + 注入 fetch 的 XApp，完全脱离真实 DB/网络。

import { describe, expect, it, vi } from "vitest"
import { XApp } from "@social/publisher"
import type { XTokenSnapshot } from "@social/db"
import { DbTokenStore, type AccountTokenGateway } from "../src/services/token-store"

const NOW = Math.floor(Date.now() / 1000)

function snapshot(over: Partial<XTokenSnapshot> = {}): XTokenSnapshot {
  return {
    accountId: "acc-x",
    workspaceId: "w1",
    platform: "X",
    externalAccountId: "x-user-1",
    username: "acme",
    accessToken: "AT",
    refreshToken: "RT",
    scope: "tweet.write offline.access",
    tokenExpiresAt: NOW + 3600,
    status: "Connected",
    ...over,
  }
}

/** 假 accounts 网关：内存持有一份快照，记录 updateTokens/setStatus 调用。 */
function fakeAccounts(initial: XTokenSnapshot | null) {
  let snap = initial
  const gw = {
    getTokens: vi.fn(async () => snap),
    updateTokens: vi.fn(async (_id: string, input: { accessToken: string; refreshToken?: string | null; scope?: string | null; tokenExpiresAt: number }) => {
      if (!snap) return
      snap = {
        ...snap,
        accessToken: input.accessToken,
        tokenExpiresAt: input.tokenExpiresAt,
        refreshToken: input.refreshToken ?? snap.refreshToken,
        scope: input.scope ?? snap.scope,
      }
    }),
    setStatus: vi.fn(async (_id: string, status: XTokenSnapshot["status"]) => {
      if (snap) snap = { ...snap, status }
    }),
    peek: () => snap,
  }
  return gw satisfies AccountTokenGateway & { peek: () => XTokenSnapshot | null }
}

/** 注入式 fetch：token 端点返回给定续期结果。 */
function refreshFetch(body: unknown, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })) as unknown as typeof fetch
}

function makeXApp(fetchImpl: typeof fetch) {
  return new XApp({ clientId: "cid", clientSecret: "sec", redirectUri: "http://127.0.0.1:8765/callback", fetchImpl })
}

describe("DbTokenStore.getConnection", () => {
  it("账号不存在 → null", async () => {
    const accounts = fakeAccounts(null)
    const store = new DbTokenStore({ accounts, xapp: makeXApp(refreshFetch({})) })
    expect(await store.getConnection("acc-x", "X")).toBeNull()
  })

  it("账号存在但从未授权（无 accessToken）→ null，不改状态", async () => {
    const accounts = fakeAccounts(snapshot({ accessToken: null, refreshToken: null }))
    const store = new DbTokenStore({ accounts, xapp: makeXApp(refreshFetch({})) })
    expect(await store.getConnection("acc-x", "X")).toBeNull()
    expect(accounts.setStatus).not.toHaveBeenCalled()
  })

  it("token 未过期 → 直接返回，不打网络", async () => {
    const fetchImpl = refreshFetch({})
    const accounts = fakeAccounts(snapshot({ tokenExpiresAt: NOW + 3600 }))
    const store = new DbTokenStore({ accounts, xapp: makeXApp(fetchImpl) })
    const conn = await store.getConnection("acc-x", "X")
    expect(conn?.accessToken).toBe("AT")
    expect(conn?.externalAccountId).toBe("x-user-1")
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it("token 将过期 + 有 refresh_token → 续期、轮换写回、返回新 token", async () => {
    const fetchImpl = refreshFetch({ token_type: "bearer", access_token: "NEW_AT", refresh_token: "NEW_RT", expires_in: 7200 })
    const accounts = fakeAccounts(snapshot({ tokenExpiresAt: NOW + 5 })) // 5s 内到期，触发续期
    const store = new DbTokenStore({ accounts, xapp: makeXApp(fetchImpl) })

    const conn = await store.getConnection("acc-x", "X")

    expect(conn?.accessToken).toBe("NEW_AT")
    expect(fetchImpl).toHaveBeenCalledOnce()
    // 轮换后的 refresh_token 必须写回（否则下次用旧的续 → 用户掉线）
    expect(accounts.updateTokens).toHaveBeenCalledOnce()
    expect(accounts.peek()?.refreshToken).toBe("NEW_RT")
    expect(accounts.peek()?.accessToken).toBe("NEW_AT")
    // 新过期时刻应落在未来（约 now+7200）
    expect(accounts.peek()!.tokenExpiresAt!).toBeGreaterThan(NOW + 7000)
  })

  it("token 已过期 + refresh 失败 → 标 PermissionMissing 且返回 null（不抛、不假装）", async () => {
    const fetchImpl = refreshFetch({ error: "invalid_grant" }, 400)
    const accounts = fakeAccounts(snapshot({ tokenExpiresAt: NOW - 10 }))
    const store = new DbTokenStore({ accounts, xapp: makeXApp(fetchImpl) })

    const conn = await store.getConnection("acc-x", "X")

    expect(conn).toBeNull()
    expect(accounts.setStatus).toHaveBeenCalledWith("acc-x", "PermissionMissing")
  })

  it("token 已过期 + 没有 refresh_token → 标 Expired 且返回 null", async () => {
    const fetchImpl = refreshFetch({})
    const accounts = fakeAccounts(snapshot({ tokenExpiresAt: NOW - 10, refreshToken: null }))
    const store = new DbTokenStore({ accounts, xapp: makeXApp(fetchImpl) })

    const conn = await store.getConnection("acc-x", "X")

    expect(conn).toBeNull()
    expect(accounts.setStatus).toHaveBeenCalledWith("acc-x", "Expired")
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
