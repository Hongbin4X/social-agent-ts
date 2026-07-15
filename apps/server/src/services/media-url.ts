// 媒体 URL 解析 —— 把「浏览器视角的 URL」翻译成「后端自己够得着的绝对 URL」。
//
// 2026-07-15 线上故障（用户的「篮球」帖发布失败）：
//   Failed to parse URL from /social/media/prj_xxx/img_yyy.jpeg
//
// 成因是两个视角的冲突：
//   · 浏览器视角：PUBLIC_BASE_URL=/social → 媒体 url = "/social/media/<key>"，
//     同源相对路径，<img src> 正常工作（这正是我们要的，免跨域、免暴露后端端口）。
//   · 后端视角：发布层要 fetch(url) 把图取回来再传给 X，而【Node 的 fetch 不接受相对路径】
//     —— 没有 origin 可参照，直接抛 "Failed to parse URL"。
//
// 解法：发布前把相对 url 解析成后端自己的绝对地址。
// 路径映射：PUBLIC_BASE_URL 是给【浏览器】看的前缀（经 nginx→Next→后端），
//          后端自己的静态服务挂在裸 /media/*（见 app.ts serveStatic），所以要把该前缀剥掉。
//   "/social/media/a.jpg"  →  "http://127.0.0.1:18091/media/a.jpg"
//
// 已是绝对 URL（http/https，如将来的 S3 公网地址）则原样返回——那本就能 fetch。

/** 后端自己的回环基址：发布层用它把本地存储的图取回来。 */
export function internalBaseUrl(port: number): string {
  return `http://127.0.0.1:${port}`
}

/**
 * 把媒体 url 解析成后端可 fetch 的绝对 URL。
 * @param url            存储层给出的 url（可能是相对的 "/social/media/x"，也可能是绝对的 S3 地址）
 * @param publicBaseUrl  给浏览器看的前缀（如 "/social"；本地开发可能为空）
 * @param port           后端端口
 */
export function resolveMediaUrl(url: string, publicBaseUrl: string, port: number): string {
  const u = url.trim()
  if (!u) return u
  // 绝对 URL（S3 / 公网）：本就能 fetch，不动。
  if (/^https?:\/\//i.test(u)) return u
  // 剥掉浏览器前缀：后端静态服务在裸 /media/*，不认 /social 这层（那是 nginx+Next 的事）。
  const prefix = publicBaseUrl.replace(/\/+$/, "")
  const path = prefix && u.startsWith(prefix) ? u.slice(prefix.length) : u
  return `${internalBaseUrl(port)}${path.startsWith("/") ? path : `/${path}`}`
}
