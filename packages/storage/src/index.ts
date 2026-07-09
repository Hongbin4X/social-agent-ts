// @social/storage 桶文件 + 从 env 装配。
import path from "node:path"
import { LocalFsMediaStorage } from "./local-fs"
import type { MediaStorage } from "./ports"
import { S3Config, S3MediaStorage } from "./s3"

export * from "./ports"
export { LocalFsMediaStorage, type LocalFsConfig } from "./local-fs"
export { S3MediaStorage, type S3Config } from "./s3"

/**
 * 从环境变量装配 MediaStorage。默认本地 FS（dev）；MEDIA_STORAGE=s3 时用 S3（当前留桩）。
 * 本地 FS 默认落盘到 <cwd>/.media，对外 `${PUBLIC_BASE_URL}/media`。
 */
export function mediaStorageFromEnv(env = process.env): MediaStorage {
  if (env.MEDIA_STORAGE === "s3") {
    const cfg: S3Config = {
      bucket: env.S3_BUCKET ?? "",
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      publicBaseUrl: env.S3_PUBLIC_BASE_URL,
    }
    return new S3MediaStorage(cfg)
  }
  const baseDir = env.MEDIA_LOCAL_DIR ?? path.join(process.cwd(), ".media")
  const publicBase = `${(env.PUBLIC_BASE_URL ?? "http://localhost:8091").replace(/\/$/, "")}/media`
  return new LocalFsMediaStorage({ baseDir, publicBaseUrl: publicBase })
}
