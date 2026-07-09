// 正文内联配图的「位置」工具（纯函数，前后端 + 生成层共用）。
//
// 设计（铁律7 第一性原理）：图片的「位置」和「描述」是两件事——
//   位置 = 正文里的轻量标记 [[img:N]]（发布时剥掉，caption 不含标记）；
//   描述 = 独立的 ImageSlot（详细、可编辑、出图 prompt 主来源）。
//   本文件只管「位置」；描述结构见 types.ts 的 ImageSlot。
// 语法固定 [[img:N]]（双方括号），刻意避开单括号 grounding 占位符 [product name]，正则可精确区分。

import type { ImageSlot } from "./types"

const TOKEN_RE = /\[\[img:(\d+)\]\]/g

/** 返回 body 中出现的所有图片 token 的 ref（按出现顺序，去重）。 */
export function parseImageRefs(body: string): number[] {
  const refs: number[] = []
  for (const m of body.matchAll(TOKEN_RE)) {
    const n = Number(m[1])
    if (!refs.includes(n)) refs.push(n)
  }
  return refs
}

/** 去掉全部图片 token（发布/纯文本预览用），收敛多余空行。 */
export function stripImageTokens(body: string): string {
  return body.replace(TOKEN_RE, "").replace(/\n{3,}/g, "\n\n").trim()
}

/** 下一个可用 ref = 现有槽最大 ref + 1（空槽从 1 起）。 */
export function nextImageRef(slots: ImageSlot[]): number {
  return slots.reduce((max, s) => Math.max(max, s.ref), 0) + 1
}

/** 把 token 插入 body 指定字符位置（默认末尾），token 独占一行。 */
export function insertImageToken(body: string, ref: number, at?: number): string {
  const token = `[[img:${ref}]]`
  if (at == null || at < 0 || at > body.length) {
    return `${body.trimEnd()}\n\n${token}\n`
  }
  return `${body.slice(0, at)}\n${token}\n${body.slice(at)}`
}

/** 把 body 切成有序的「文本段 / 图片段」，供预览按位置渲染占位/真图。 */
export type BodySegment = { type: "text"; text: string } | { type: "image"; ref: number }
export function splitBodyByImageTokens(body: string): BodySegment[] {
  const segs: BodySegment[] = []
  let last = 0
  for (const m of body.matchAll(TOKEN_RE)) {
    const idx = m.index ?? 0
    if (idx > last) segs.push({ type: "text", text: body.slice(last, idx) })
    segs.push({ type: "image", ref: Number(m[1]) })
    last = idx + m[0].length
  }
  if (last < body.length) segs.push({ type: "text", text: body.slice(last) })
  return segs
}
