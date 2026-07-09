// S3 兼容媒体存储（AWS S3 / 阿里云 OSS / R2 / MinIO）——端口留桩。
// 用户 2026-07-09 决策：现在只用本地 FS 跑通，S3 端口留好；联调/上线时再填 @aws-sdk/client-s3 实现。
// 现在被实例化即抛错，绝不假成功（如实报未接通）。

import { type MediaStorage, type PutObjectInput, type StoredObject, StorageNotConfiguredError } from "./ports"

export interface S3Config {
  bucket: string
  region?: string
  /** 自定义 endpoint（OSS/R2/MinIO 用）。AWS S3 可留空。 */
  endpoint?: string
  accessKeyId?: string
  secretAccessKey?: string
  /** 公开访问/CDN 前缀（可选）。 */
  publicBaseUrl?: string
}

const TODO = "S3MediaStorage 尚未实现：联调/上线时接 @aws-sdk/client-s3（S3/OSS/R2/MinIO 通用）。当前本地开发请用 LocalFsMediaStorage。"

export class S3MediaStorage implements MediaStorage {
  readonly kind = "s3" as const
  constructor(private readonly config: S3Config) {}

  async put(_input: PutObjectInput): Promise<StoredObject> {
    throw new StorageNotConfiguredError(TODO)
  }
  async getUrl(_key: string): Promise<string> {
    throw new StorageNotConfiguredError(TODO)
  }
  async delete(_key: string): Promise<void> {
    throw new StorageNotConfiguredError(TODO)
  }
}
