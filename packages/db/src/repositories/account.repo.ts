// 社媒账号仓储：工作区级（跨品牌共享），按 workspaceId 隔离。

import { asc, eq } from "drizzle-orm"
import type { Account, AccountStatus, AccountType, Platform } from "@social/shared"
import type { Database } from "../client"
import { newId } from "../id"
import { ssaSocialAccount } from "../schema"

/** 创建账号入参：不含 id（自动生成）。 */
export type AccountInput = Omit<Account, "id">
export type AccountPatch = Partial<Omit<Account, "id">>

export interface AccountRepo {
  listByWorkspace(workspaceId: string): Promise<Account[]>
  getById(id: string): Promise<Account | null>
  create(workspaceId: string, input: AccountInput): Promise<Account>
  update(id: string, patch: AccountPatch): Promise<void>
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
