// 媒体存储端口。字节交给它，DB 只存返回的 key/url。
// 换底层实现（本地 FS / S3 / OSS / R2 / MinIO）只改适配器，上层零改动。视频将来同一端口。

export interface PutObjectInput {
  /** 存储键，如 `media/<projectId>/<id>.png`。 */
  key: string
  body: Buffer | Uint8Array
  contentType: string
}

export interface StoredObject {
  key: string
  /** 可直接访问/播放的 URL（公开或签名）。 */
  url: string
}

export interface MediaStorage {
  readonly kind: "local-fs" | "s3"
  /** 存字节，返回可访问 URL。 */
  put(input: PutObjectInput): Promise<StoredObject>
  /** 取访问 URL（本地=静态路径；S3=公开或签名 URL）。 */
  getUrl(key: string): Promise<string>
  delete(key: string): Promise<void>
}

export class StorageNotConfiguredError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "StorageNotConfiguredError"
  }
}
