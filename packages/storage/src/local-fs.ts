// 本地文件系统媒体存储（dev 默认）。写到 baseDir，暴露为 `${publicBaseUrl}/<key>`。
// 后端把 baseDir 作为静态目录挂在 publicBaseUrl 下即可访问。

import { mkdir, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import type { MediaStorage, PutObjectInput, StoredObject } from "./ports"

export interface LocalFsConfig {
  /** 落盘根目录，如 <repo>/apps/server/.media */
  baseDir: string
  /** 对外访问前缀，如 http://localhost:8091/media */
  publicBaseUrl: string
}

export class LocalFsMediaStorage implements MediaStorage {
  readonly kind = "local-fs" as const
  constructor(private readonly config: LocalFsConfig) {}

  private resolve(key: string): string {
    // 防目录穿越：规范化后必须仍在 baseDir 下。
    const safe = path.normalize(key).replace(/^(\.\.(\/|\\|$))+/, "")
    return path.join(this.config.baseDir, safe)
  }

  async put(input: PutObjectInput): Promise<StoredObject> {
    const filePath = this.resolve(input.key)
    await mkdir(path.dirname(filePath), { recursive: true })
    await writeFile(filePath, input.body)
    return { key: input.key, url: await this.getUrl(input.key) }
  }

  async getUrl(key: string): Promise<string> {
    const base = this.config.publicBaseUrl.replace(/\/$/, "")
    return `${base}/${key.replace(/^\//, "")}`
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true })
  }
}
