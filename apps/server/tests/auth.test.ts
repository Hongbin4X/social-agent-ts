// 平台 JWT 验签的核心行为——这是联调鉴权的地基，必须钉死。
// 硬事实（见飞书子文档① A0）：jjwt / HS256；密钥 = jwt.secret 明文的原始 UTF-8 字节（不 base64 解码）；
// claims.userId = user.id（数字，自增非雪花）；主登录 token 无 exp（永不过期）、php 登录带 exp。
// → 验签姿势：始终验签名；带 exp 就尊重并拒过期、不带 exp 就接受为不过期。
import { describe, expect, it } from "vitest"
import { SignJWT } from "jose"
import { resolveUserId, verifyPlatformJwt } from "../src/auth"

const SECRET = "test-secret-原始UTF8字节-not-base64"
const key = new TextEncoder().encode(SECRET)

/** 用平台同款方式签一个 HS256 token（可选 exp，单位秒）。 */
async function sign(claims: Record<string, unknown>, opts: { expSec?: number } = {}): Promise<string> {
  let b = new SignJWT(claims).setProtectedHeader({ alg: "HS256" }).setIssuedAt()
  if (opts.expSec !== undefined) b = b.setExpirationTime(opts.expSec)
  return b.sign(key)
}

describe("verifyPlatformJwt", () => {
  it("有效 token（含 userId、无 exp 主登录）→ 返回 userId 字符串", async () => {
    const token = await sign({ userId: 1380001, channel: "web" })
    expect(await verifyPlatformJwt(token, SECRET)).toBe("1380001")
  })

  it("签名无效（密钥不符）→ null（不抛）", async () => {
    const wrongKey = new TextEncoder().encode("另一个密钥")
    const token = await new SignJWT({ userId: 1 }).setProtectedHeader({ alg: "HS256" }).sign(wrongKey)
    expect(await verifyPlatformJwt(token, SECRET)).toBeNull()
  })

  it("带 exp 且已过期（php 登录路径）→ null", async () => {
    const token = await sign({ userId: 42 }, { expSec: Math.floor(Date.now() / 1000) - 10 })
    expect(await verifyPlatformJwt(token, SECRET)).toBeNull()
  })

  it("缺 userId claim → null", async () => {
    const token = await sign({ channel: "web" })
    expect(await verifyPlatformJwt(token, SECRET)).toBeNull()
  })

  it("格式非法的字符串 → null", async () => {
    expect(await verifyPlatformJwt("not-a-jwt", SECRET)).toBeNull()
  })
})

// resolveUserId：把请求头解析成 userId 的优先级逻辑（联调后中间件核心，见飞书②改造清单 #1）。
// 姿势：带 Bearer + 有密钥 → 以验签为准（失败=null→401，不回退旁路）；否则本地旁路 x-user-id > devFakeUserId。
describe("resolveUserId", () => {
  it("Bearer 有效 token + 配了密钥 → 真实鉴权取 userId（优先旁路）", async () => {
    const token = await sign({ userId: 777 })
    const got = await resolveUserId(
      { authorization: `Bearer ${token}`, xUserId: "should-be-ignored" },
      { jwtSecret: SECRET, devFakeUserId: "fake" },
    )
    expect(got).toBe("777")
  })

  it("Bearer 无效 token + 配了密钥 → null（带 token 就以验签为准、不回退 fake）", async () => {
    const wrongKey = new TextEncoder().encode("坏密钥")
    const token = await new SignJWT({ userId: 9 }).setProtectedHeader({ alg: "HS256" }).sign(wrongKey)
    const got = await resolveUserId(
      { authorization: `Bearer ${token}`, xUserId: null },
      { jwtSecret: SECRET, devFakeUserId: "fake" },
    )
    expect(got).toBeNull()
  })

  it("无 Bearer + 有 x-user-id + 开着旁路(配了 devFakeUserId) → 用 x-user-id（本地开发指定身份）", async () => {
    const got = await resolveUserId({ authorization: null, xUserId: " 123 " }, { jwtSecret: SECRET, devFakeUserId: "fake" })
    expect(got).toBe("123")
  })

  // 【P0 回归】2026-07-15 自审修复：曾经 x-user-id 是无条件后门（不看 devFakeUserId），
  // 于是生产按文档清空 DEV_FAKE_USER_ID 后旁路仍开着 —— 不带 Authorization 直接甩 x-user-id
  // 即可冒充任意用户 + 扣其真金余额。旁路必须整体由 devFakeUserId 门控，留空即彻底关闭。
  it("无 Bearer + 有 x-user-id + 关了旁路(devFakeUserId 留空) → null（不许冒充，转 401）", async () => {
    const got = await resolveUserId({ authorization: null, xUserId: "2000208" }, { jwtSecret: SECRET })
    expect(got).toBeNull()
  })

  it("无 Bearer + 无 x-user-id + 有 devFakeUserId → 用 fake（本地旁路）", async () => {
    const got = await resolveUserId({ authorization: null, xUserId: null }, { devFakeUserId: "1000000000000000001" })
    expect(got).toBe("1000000000000000001")
  })

  it("什么都没有 → null（转 401）", async () => {
    expect(await resolveUserId({ authorization: null, xUserId: null }, {})).toBeNull()
  })
})
