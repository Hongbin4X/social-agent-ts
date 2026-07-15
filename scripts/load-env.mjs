// 全仓统一的 env 加载器 —— 唯一入口。后端 config.ts / 前端 next.config.mjs / drizzle / migrate / seed
// / 探针脚本 全都用它，别再各自 loadEnvFile（此前散落 6 处、路径解析还不一致，前端更是压根没加载根 .env，
// 导致根 .env 里写 NEXT_PUBLIC_* 静默不生效 —— 2026-07-15 收口）。
//
// ── 多环境 profile（用户 2026-07-15 需求：后面要接生产，配置得分版本）──
//   APP_ENV=local(默认) | test | prod  →  叠加加载 .env.<APP_ENV> 覆盖共享的 .env。
//
// 优先级（高 → 低）：
//   1. shell 环境变量（`APP_ENV=test PORT=8092 pnpm dev`，临时压制一切，CI/运维注入也走这层）
//   2. .env.<APP_ENV>   环境专属覆盖（只写与共享默认【不同】的项）
//   3. .env             共享默认（模型网关 / X 凭证 / 端口 等各环境相同的东西）
//
// 机制（2026-07-15 实测确认，别改顺序）：`process.loadEnvFile` 对【已存在】的 key **永不覆盖**，
// 先写先赢。所以「先 profile 后 base」的加载顺序 == 上面的优先级；shell 变量在进程启动时就已存在，
// 因此天然压过两个文件。反过来写（先 base 后 profile）会让 profile 完全失效。
import path from "node:path"
import { existsSync } from "node:fs"

/** 仓库根（相对本文件定位，不受启动 cwd 影响 —— 旧代码用 "../../.env" 依赖 cwd，换个目录跑就读不到）。 */
export const REPO_ROOT = path.resolve(import.meta.dirname, "..")

/**
 * 按 APP_ENV 加载 .env.<profile> + .env 到 process.env。
 * 幂等：重复调用无副作用（已存在的 key 不会被覆盖）。文件不存在则跳过（如只有 .env 的纯本地开发）。
 * @returns {string} 生效的 profile 名
 */
export function loadEnv() {
  const profile = process.env.APP_ENV?.trim() || "local"
  // 顺序即优先级：先加载的赢。profile 在前，共享 .env 兜底。
  for (const file of [`.env.${profile}`, ".env"]) {
    const p = path.join(REPO_ROOT, file)
    if (existsSync(p)) process.loadEnvFile(p)
  }
  return profile
}
