import { describe, it, expect } from "vitest"
import {
  parseImageRefs,
  stripImageTokens,
  nextImageRef,
  insertImageToken,
  splitBodyByImageTokens,
} from "../src/image-slots"
// ImageSlot 归 types.ts（image-slots.ts 只管位置、不管描述），从真源导入避免 tsconfig 纳入 tests 后编译报错。
import type { ImageSlot } from "../src/types"

const slot = (ref: number): ImageSlot => ({ ref, description: `d${ref}`, status: "empty" })

describe("image-slots 纯工具", () => {
  it("parseImageRefs 按出现顺序去重取 ref", () => {
    expect(parseImageRefs("a [[img:2]] b [[img:1]] c [[img:2]]")).toEqual([2, 1])
    expect(parseImageRefs("no token")).toEqual([])
  })

  it("stripImageTokens 去掉 token 并收敛多余空行", () => {
    expect(stripImageTokens("hi\n\n[[img:1]]\n\nbye")).toBe("hi\n\nbye")
    expect(stripImageTokens("[[img:1]]")).toBe("")
  })

  it("nextImageRef = 最大 ref + 1（空槽从 1 起）", () => {
    expect(nextImageRef([])).toBe(1)
    expect(nextImageRef([slot(1), slot(3)])).toBe(4)
  })

  it("insertImageToken 末尾插入独占一行", () => {
    expect(insertImageToken("body", 2)).toBe("body\n\n[[img:2]]\n")
  })

  it("insertImageToken 指定位置插入", () => {
    expect(insertImageToken("abcd", 1, 2)).toBe("ab\n[[img:1]]\ncd")
  })

  it("splitBodyByImageTokens 切成有序文本/图片段", () => {
    expect(splitBodyByImageTokens("x[[img:1]]y[[img:2]]")).toEqual([
      { type: "text", text: "x" },
      { type: "image", ref: 1 },
      { type: "text", text: "y" },
      { type: "image", ref: 2 },
    ])
  })
})
