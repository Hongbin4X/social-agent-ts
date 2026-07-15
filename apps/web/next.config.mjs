import path from "node:path"
import { loadEnv } from "../../scripts/load-env.mjs"

// 加载仓库根 env（多环境 profile：APP_ENV=local|test|prod）。
// ⚠️ 必须在此显式加载：Next 只会自动读 apps/web/.env*，【不会】读 monorepo 根的 .env——
// 此前根 .env 里的 NEXT_PUBLIC_* 因此静默不生效（改了没反应的坑，2026-07-15 修）。
// 后端也读同一份根 env，前后端配置从此单一真相源，不会各持一半打架。
const APP_ENV = loadEnv()

// 部署在【共享域名的路径前缀】下时用（如 testtapi2.broly.ai/social/ —— 那台测试服上
// ai-api/user-api/oms-api 全按路径前缀分流，我们沿用同一套路，免加 DNS 子域）。
// 留空 = 应用在根路径（本地开发、独立域名部署）。取值形如 "/social"（前有斜杠、后无斜杠）。
const BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/$/, "")

/** @type {import('next').NextConfig} */
const nextConfig = {
  // 应用整体挂到 BASE_PATH 下：页面 /social/*、静态资源 /social/_next/*、rewrites 的 source 也自动带前缀。
  // ⚠️ basePath 【不会】自动改写代码里写死的 fetch("/bff/...")——那是从站点根发的绝对路径，
  // 会打到 /bff 而非 /social/bff 直接 404。故 api.ts 用 NEXT_PUBLIC_BASE_PATH 自行拼前缀（见该文件）。
  ...(BASE_PATH ? { basePath: BASE_PATH } : {}),
  // ⚠️ Next 16 默认只允许 localhost 访问 dev 资源（/_next/*、HMR websocket），其它来源一律拦截。
  // 后果极具迷惑性：页面 HTTP 200、JS chunk 也 200、控制台【无报错】，但 dev 运行时起不来 →
  // React 不水合 → 整页【白屏】。2026-07-15 实测：同一个服务，localhost:3001 渲染出登录框，
  // 127.0.0.1:3001 完全空白。我们是【服务器上的 dev server + nginx 反代给公网】，来源永远不是
  // localhost，所以必须显式放行，否则用户从公网访问只能看到白屏。
  // 只影响 dev（next dev）；生产 next build/start 无此机制。
  allowedDevOrigins: ["127.0.0.1", "52.54.122.204", "x.broly.ai"],
  // 显式把用到的 NEXT_PUBLIC_* 注入客户端包。
  // 不靠 Next 对 process.env.NEXT_PUBLIC_* 的自动内联——那套只认它自己加载的 .env 文件，
  // 我们的值是上面 loadEnv() 塞进 process.env 的，必须经这里显式过一道才会进浏览器包。
  env: {
    // 登录门禁：test/prod profile 置 true → 无平台 token 时先过 chatpal 邮箱验证码登录。
    NEXT_PUBLIC_REQUIRE_LOGIN: process.env.NEXT_PUBLIC_REQUIRE_LOGIN ?? "",
    // 本地开发身份（须与后端 DEV_FAKE_USER_ID 一致）；关旁路的环境下它发出去也会被后端 401。
    NEXT_PUBLIC_DEV_USER_ID: process.env.NEXT_PUBLIC_DEV_USER_ID ?? "",
    // 仅用于页面上标明当前连的是哪套环境，避免对着测试环境以为在本地（或反之）。
    NEXT_PUBLIC_APP_ENV: APP_ENV,
    // 路径前缀，供 api.ts 拼 fetch 基址（见上方 basePath 注释）。
    NEXT_PUBLIC_BASE_PATH: BASE_PATH,
  },
  // 显式锁定 workspace 根，避免 Next 误把 /home/ec2-user 下的父 lockfile 当根。
  turbopack: {
    root: path.resolve(import.meta.dirname, "../.."),
  },
  // @social/shared 以 TS 源码形式暴露（无构建步骤），交给 Next 编译。
  transpilePackages: ["@social/shared"],
  // 反代后端：浏览器只碰 3001 的 /bff/*，由 Next 服务端转发到后端 8091 的 /api/*。
  // 同源，免 CORS、不暴露后端端口；联调改 SSA_BACKEND_URL 即可。
  async rewrites() {
    const backend = process.env.SSA_BACKEND_URL ?? "http://localhost:8091"
    return [
      { source: "/bff/:path*", destination: `${backend}/api/:path*` },
      // 媒体（本地 FS 落盘的图片）同源反代到后端静态服务。
      { source: "/media/:path*", destination: `${backend}/media/:path*` },
    ]
  },
  images: {
    // 原型阶段不走 Next 图片优化（大量 mock 图 + 占位图）。
    unoptimized: true,
  },
  // 注意：原型里开了 typescript.ignoreBuildErrors=true。这里刻意去掉——
  // monorepo 重构后要靠 next build 的真实类型检查兜住迁移过程中的 import/类型错误（铁律11）。
}

export default nextConfig
