// load-env.mjs 的类型声明（供 TS 侧 config.ts / drizzle.config.ts / migrate.ts / seed*.ts 引用）。
// 加载器本体刻意写成 plain .mjs：next.config.mjs 是不经 TS 编译的原生 ESM，只能 import JS。
export declare const REPO_ROOT: string
/** 按 APP_ENV 加载 .env.<profile> + .env（先 profile 后 base，先写先赢）。返回生效的 profile 名。 */
export declare function loadEnv(): string
