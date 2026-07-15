// 社媒账号仓储：工作区级（跨品牌共享），按 workspaceId 隔离。

import { and, asc, eq, isNull } from "drizzle-orm"
import type { Account, AccountStatus, AccountType, Platform } from "@social/shared"
import type { Database } from "../client"
import { newId } from "../id"
import { ssaSocialAccount } from "../schema"

/** 创建账号入参：不含 id（自动生成）。 */
export type AccountInput = Omit<Account, "id">
export type AccountPatch = Partial<Omit<Account, "id">>

/**
 * X 连接的 OAuth token 快照 —— **仅 server 内部流转**，绝不并入 Account 领域类型/下发前端。
 * token 列直接读自 ssa_social_account（详见 schema.ts §OAuth 连接凭证）。
 */
export interface XTokenSnapshot {
  accountId: string
  workspaceId: string
  platform: Platform
  externalAccountId: string | null
  username: string | null
  accessToken: string | null
  refreshToken: string | null
  scope: string | null
  /** epoch 秒；null=未知过期时间。 */
  tokenExpiresAt: number | null
  status: AccountStatus
}

/** upsert 一个「已授权」的连接账号（按 workspace+platform+externalAccountId 去重）。 */
export interface UpsertConnectedInput {
  platform: Platform
  externalAccountId: string
  username?: string | null
  /** 账号展示名（Account.name）。 */
  displayName: string
  url?: string | null
  accessToken: string
  refreshToken?: string | null
  scope?: string | null
  /** epoch 秒。 */
  tokenExpiresAt: number
}

/** 续期后回写的 token（只覆盖会变的字段；refreshToken 只在 X 返回新的时才传）。 */
export interface UpdateTokensInput {
  accessToken: string
  refreshToken?: string | null
  scope?: string | null
  tokenExpiresAt: number
}

export interface AccountRepo {
  listByWorkspace(workspaceId: string): Promise<Account[]>
  getById(id: string): Promise<Account | null>
  create(workspaceId: string, input: AccountInput): Promise<Account>
  update(id: string, patch: AccountPatch): Promise<void>
  // ── OAuth 连接凭证（server 内部）──
  /** 读某账号的 token 快照（含 status）；无此账号返回 null。 */
  getTokens(accountId: string): Promise<XTokenSnapshot | null>
  /** 按外部账号查已存在的连接账号（用于 upsert 去重）。 */
  findByExternal(workspaceId: string, platform: Platform, externalAccountId: string): Promise<Account | null>
  /** 授权成功：按 (workspace,platform,external) upsert 连接账号并写入 token，status=Connected。 */
  upsertConnectedAccount(workspaceId: string, input: UpsertConnectedInput): Promise<Account>
  /** 续期后覆盖写回新 token（含轮换的 refresh_token）。 */
  updateTokens(accountId: string, input: UpdateTokensInput): Promise<void>
  /** 只改连接状态（如 refresh 失败标 PermissionMissing / Expired）。 */
  setStatus(accountId: string, status: AccountStatus): Promise<void>
  /** 断开连接：清空所有 token 列，status=NotConnected。注意保留 external_account_id（重新授权时按它认回同一账号）。 */
  clearTokens(accountId: string): Promise<void>
  /**
   * 彻底删除账号行（不同于 clearTokens 的"断开"——那只是清 token、行还在列表里显示）。
   * 用于用户在账号页主动移除不想要的账号。删前请确认归属（见 routes/accounts.ts 的隔离校验）。
   */
  remove(accountId: string): Promise<void>
}

type AccountRow = typeof ssaSocialAccount.$inferSelect

export class DrizzleAccountRepo implements AccountRepo {
  constructor(private readonly db: Database) {}

  async listByWorkspace(workspaceId: string): Promise<Account[]> {
    const rows = await this.db
      .select()
      .from(ssaSocialAccount)
      .where(eq(ssaSocialAccount.workspaceId, workspaceId))
      .orderBy(asc(ssaSocialAccount.createdAt))
    return rows.map(rowToAccount)
  }

  async getById(id: string): Promise<Account | null> {
    const rows = await this.db.select().from(ssaSocialAccount).where(eq(ssaSocialAccount.id, id)).limit(1)
    return rows[0] ? rowToAccount(rows[0]) : null
  }

  async create(workspaceId: string, input: AccountInput): Promise<Account> {
    const id = newId("acc")
    await this.db.insert(ssaSocialAccount).values({
      id,
      workspaceId,
      platform: input.platform,
      type: input.type,
      name: input.name,
      url: input.url || null,
      status: input.status,
      expiresAt: input.expiresAt ?? null,
      capabilities: input.capabilities || null,
      notes: input.notes ?? null,
    })
    return { id, ...input }
  }

  async update(id: string, patch: AccountPatch): Promise<void> {
    if (Object.keys(patch).length === 0) return
    // Account 字段名与列名一一对应，可直接 set。
    await this.db.update(ssaSocialAccount).set(patch).where(eq(ssaSocialAccount.id, id))
  }

  // ── OAuth 连接凭证（server 内部；token 不进 Account 领域类型）──

  async getTokens(accountId: string): Promise<XTokenSnapshot | null> {
    const rows = await this.db.select().from(ssaSocialAccount).where(eq(ssaSocialAccount.id, accountId)).limit(1)
    const row = rows[0]
    if (!row) return null
    return {
      accountId: row.id,
      workspaceId: row.workspaceId,
      platform: row.platform as Platform,
      externalAccountId: row.externalAccountId ?? null,
      username: row.username ?? null,
      accessToken: row.accessToken ?? null,
      refreshToken: row.refreshToken ?? null,
      scope: row.scope ?? null,
      tokenExpiresAt: row.tokenExpiresAt ?? null,
      status: row.status as AccountStatus,
    }
  }

  async findByExternal(
    workspaceId: string,
    platform: Platform,
    externalAccountId: string,
  ): Promise<Account | null> {
    const rows = await this.db
      .select()
      .from(ssaSocialAccount)
      .where(
        and(
          eq(ssaSocialAccount.workspaceId, workspaceId),
          eq(ssaSocialAccount.platform, platform),
          eq(ssaSocialAccount.externalAccountId, externalAccountId),
        ),
      )
      .limit(1)
    return rows[0] ? rowToAccount(rows[0]) : null
  }

  /**
   * 找该工作区里【尚未连接过】的同平台占位行（external_account_id 为空）。
   *
   * 为什么需要：工作区初始化会为每个平台种一条展示用占位行（X/NotConnected、Instagram/Expired…），
   * 它们没有 external_account_id。授权成功时若只按 external 判重，就找不到它 → 另插一行 →
   * 同一平台出现【两张卡片】：一张新的 Connected、一张旧的 NotConnected。
   * 前端如实把两条都画出来，用户看到那张 NotConnected 就以为"授权失败了"
   *（2026-07-15 真实发生：库里明明是 Connected，用户看到的却是 not connected）。
   */
  private async findUnlinkedPlaceholder(workspaceId: string, platform: Platform): Promise<Account | null> {
    const rows = await this.db
      .select()
      .from(ssaSocialAccount)
      .where(
        and(
          eq(ssaSocialAccount.workspaceId, workspaceId),
          eq(ssaSocialAccount.platform, platform),
          isNull(ssaSocialAccount.externalAccountId),
        ),
      )
      .limit(1)
    return rows[0] ? rowToAccount(rows[0]) : null
  }

  async upsertConnectedAccount(workspaceId: string, input: UpsertConnectedInput): Promise<Account> {
    // 判重顺序（不能只靠第 1 条）：
    //  1. 同一个 X 账号重新授权 → 按 external 命中，更新 token。
    //  2. 首次授权 → external 找不到，但工作区里有该平台的【占位行】→ 就地升级它，别另起一行。
    //  3. 都没有 → 才插新行（如同一工作区连接第二个不同的 X 账号）。
    const existing =
      (await this.findByExternal(workspaceId, input.platform, input.externalAccountId)) ??
      (await this.findUnlinkedPlaceholder(workspaceId, input.platform))
    // 展示用过期时刻（ISO）—— 与 token_expires_at(epoch) 同源，仅给前端看，续期逻辑只认 epoch。
    const expiresAtIso = new Date(input.tokenExpiresAt * 1000).toISOString()
    const tokenCols = {
      externalAccountId: input.externalAccountId,
      username: input.username ?? null,
      accessToken: input.accessToken,
      refreshToken: input.refreshToken ?? null,
      scope: input.scope ?? null,
      tokenExpiresAt: input.tokenExpiresAt,
      status: "Connected" as AccountStatus,
      name: input.displayName,
      url: input.url ?? null,
      expiresAt: expiresAtIso,
    }
    if (existing) {
      // 占位行原本 type=manual/capabilities 是展示文案，升级为真实连接账号时一并纠正，
      // 否则会留下「已连接但 type 还是 manual」的四不像行，发布链路按 type 判能力会出错。
      await this.db
        .update(ssaSocialAccount)
        .set({ ...tokenCols, type: "connected" as AccountType, capabilities: "Auto publish (X API v2)" })
        .where(eq(ssaSocialAccount.id, existing.id))
      return { ...existing, ...rowSubset(tokenCols), type: "connected", capabilities: "Auto publish (X API v2)" }
    }
    const id = newId("acc")
    await this.db.insert(ssaSocialAccount).values({
      id,
      workspaceId,
      platform: input.platform,
      type: "connected" as AccountType,
      capabilities: "Auto publish (X API v2)",
      ...tokenCols,
    })
    return {
      id,
      platform: input.platform,
      type: "connected",
      name: input.displayName,
      url: input.url ?? "",
      status: "Connected",
      expiresAt: expiresAtIso,
      capabilities: "Auto publish (X API v2)",
    }
  }

  async updateTokens(accountId: string, input: UpdateTokensInput): Promise<void> {
    const set: Record<string, unknown> = {
      accessToken: input.accessToken,
      tokenExpiresAt: input.tokenExpiresAt,
      expiresAt: new Date(input.tokenExpiresAt * 1000).toISOString(),
    }
    // 只有 X 返回了新 refresh_token 才覆盖（轮换）；没返回就保留旧的，别写 null 把用户的续卡凭证抹了。
    if (input.refreshToken != null) set.refreshToken = input.refreshToken
    if (input.scope != null) set.scope = input.scope
    await this.db.update(ssaSocialAccount).set(set).where(eq(ssaSocialAccount.id, accountId))
  }

  async setStatus(accountId: string, status: AccountStatus): Promise<void> {
    await this.db.update(ssaSocialAccount).set({ status }).where(eq(ssaSocialAccount.id, accountId))
  }

  async clearTokens(accountId: string): Promise<void> {
    await this.db
      .update(ssaSocialAccount)
      .set({
        accessToken: null,
        refreshToken: null,
        scope: null,
        tokenExpiresAt: null,
        expiresAt: null,
        status: "NotConnected" as AccountStatus,
      })
      .where(eq(ssaSocialAccount.id, accountId))
  }

  async remove(accountId: string): Promise<void> {
    await this.db.delete(ssaSocialAccount).where(eq(ssaSocialAccount.id, accountId))
  }
}

/** 从 upsert 的 token 列子集里取出属于 Account 领域类型的展示字段（name/url/status/expiresAt）。 */
function rowSubset(cols: {
  name: string
  url: string | null
  status: AccountStatus
  expiresAt: string
}): Pick<Account, "name" | "url" | "status" | "expiresAt"> {
  return { name: cols.name, url: cols.url ?? "", status: cols.status, expiresAt: cols.expiresAt }
}

function rowToAccount(row: AccountRow): Account {
  return {
    id: row.id,
    platform: row.platform as Platform,
    type: row.type as AccountType,
    name: row.name,
    url: row.url ?? "",
    status: row.status as AccountStatus,
    expiresAt: row.expiresAt ?? undefined,
    capabilities: row.capabilities ?? "",
    notes: row.notes ?? undefined,
  }
}
