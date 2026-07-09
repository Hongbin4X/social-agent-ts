import path from "node:path"

/** @type {import('next').NextConfig} */
const nextConfig = {
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
    return [{ source: "/bff/:path*", destination: `${backend}/api/:path*` }]
  },
  images: {
    // 原型阶段不走 Next 图片优化（大量 mock 图 + 占位图）。
    unoptimized: true,
  },
  // 注意：原型里开了 typescript.ignoreBuildErrors=true。这里刻意去掉——
  // monorepo 重构后要靠 next build 的真实类型检查兜住迁移过程中的 import/类型错误（铁律11）。
}

export default nextConfig
