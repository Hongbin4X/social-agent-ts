// resolveMediaUrl —— 2026-07-15 线上故障的回归测试。
// 用户的「篮球」帖（第一篇带图的）发布失败：Failed to parse URL from /social/media/...
// 成因：媒体 url 是给浏览器的【相对路径】，而发布层要 fetch 它把图传给 X，Node 的 fetch 不吃相对路径。
import { describe, expect, it } from "vitest"
import { resolveMediaUrl } from "../src/services/media-url"

describe("resolveMediaUrl", () => {
  it("相对 url + basePath 前缀 → 剥掉前缀、拼后端回环地址（这就是当时崩的那个 case）", () => {
    expect(resolveMediaUrl("/social/media/prj_1/img_2.jpeg", "/social", 18091)).toBe(
      "http://127.0.0.1:18091/media/prj_1/img_2.jpeg",
    )
  })

  it("本地开发（PUBLIC_BASE_URL 为空）：直接拼回环地址", () => {
    expect(resolveMediaUrl("/media/a.png", "", 8091)).toBe("http://127.0.0.1:8091/media/a.png")
  })

  it("已是绝对 URL（将来的 S3 公网地址）→ 原样返回，本就能 fetch", () => {
    const s3 = "https://cdn.example.com/x/a.png"
    expect(resolveMediaUrl(s3, "/social", 18091)).toBe(s3)
  })

  it("前缀带尾斜杠 / url 不以斜杠开头 都能正确拼", () => {
    expect(resolveMediaUrl("/social/media/a.png", "/social/", 18091)).toBe("http://127.0.0.1:18091/media/a.png")
    expect(resolveMediaUrl("media/a.png", "", 18091)).toBe("http://127.0.0.1:18091/media/a.png")
  })

  it("空 url 原样返回，不造出一个假地址", () => {
    expect(resolveMediaUrl("", "/social", 18091)).toBe("")
  })
})
