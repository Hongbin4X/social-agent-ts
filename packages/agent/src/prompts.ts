// 平台 prompt 模板（数据驱动、可被后台覆盖）。
//
// 设计（铁律2 别过度工程 + 铁律7 第一性原理）：
//   "按平台定制"这件事的本质 = 每个平台有自己的语气/格式/媒体规则。把这份"平台人格"抽成可编辑的
//   模板字符串（system 指令），而不是散在代码分支里——这样后台运营能直接改各平台 prompt（注入 DB 版
//   PromptTemplateProvider 覆盖内置），无需改代码。
//   模板里可用 {{brandName}} / {{topic}} 等占位符，buildVariantPrompt 会做注入；内置模板以静态平台
//   人格为主，品牌与 topic 主要落在 user 消息里（system=平台角色，user=本次品牌上下文+主题+输出契约）。

import type { BillingActionType, GenerateVariantsInput, Platform } from "@social/shared"
import type { PromptMessages, PromptTemplateProvider } from "./ports"

// ── 6 个平台各一套「生成 variants 用」的 system 模板（平台人格 + 定制规则）──
// 只写平台差异；通用的"输出结构化 JSON"契约由 buildVariantPrompt 统一追加，保证各平台一致。
export const VARIANT_SYSTEM_TEMPLATES: Record<Platform, string> = {
  X: [
    "You write posts for X (Twitter).",
    "Voice: punchy, concise, one sharp idea. Hard limit ~280 characters for the body.",
    "Include 1-2 relevant hashtags. A single inline link is fine. No thread markers unless asked.",
  ].join(" "),
  Instagram: [
    "You write captions for Instagram feed posts.",
    "Voice: visual-first, warm, save-worthy. Open with a scroll-stopping hook line.",
    "Encourage saves/shares and 'tap to learn more'. Group hashtags at the end.",
  ].join(" "),
  TikTok: [
    "You write ONLY the on-screen caption / hook for a TikTok video.",
    "Do NOT write a full script or voiceover — those are added by the editor.",
    "Voice: native, casual, hook in the first 3 words. Keep it short and punchy.",
  ].join(" "),
  YouTube: [
    "You write the title and description for a YouTube video (the video itself is uploaded manually).",
    "Voice: clear, searchable, benefit-led title in the hook; the body is the description with room for chapters and links.",
  ].join(" "),
  Reddit: [
    "You write an honest, no-hype post for a relevant subreddit community.",
    "Voice: authentic, first-person, value-first, community-appropriate. NO hashtags, NO marketing speak.",
    "Lead with a plain, non-clickbait title in the hook; the body is a genuine writeup.",
  ].join(" "),
  Facebook: [
    "You write a post for a Facebook Page audience.",
    "Voice: friendly, conversational, a little longer-form than X. Invite comments and reactions.",
    "A single inline link is fine; light hashtag use only.",
  ].join(" "),
}

/** 内置默认实现：从上面的 Map 取模板；仅 generateVariants 走模板，其它动作返回 null（adapter 用内联 prompt）。 */
export class DefaultPromptTemplateProvider implements PromptTemplateProvider {
  async getTemplate(platform: Platform, actionType: BillingActionType): Promise<string | null> {
    if (actionType === "generateVariants") return VARIANT_SYSTEM_TEMPLATES[platform] ?? null
    return null
  }
}

// 简单 {{key}} 占位符替换（供 DB 版动态模板用；内置模板一般不带占位符也没关系）。
function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key: string) => vars[key] ?? "")
}

/**
 * 纯函数：把「平台模板 + 品牌上下文 + topic」组装成最终 chat 消息 { system, user }。
 * system = 平台人格模板（占位符注入后）；user = 本次品牌上下文 + 主题 + 结构化输出契约。
 * 输出契约要求模型只回一个 JSON 对象（hook/body/hashtags/cta/format/mediaAsset），便于稳定解析。
 */
export function buildVariantPrompt(
  platform: Platform,
  input: GenerateVariantsInput,
  template: string,
): PromptMessages {
  const b = input.brand
  const topic = input.topic || "New social topic"
  const system = renderTemplate(template, {
    platform,
    brandName: b.brandName ?? "",
    description: b.description ?? "",
    tone: b.tone ?? "",
    topic,
  })

  // user 消息：喂给模型的"当前品牌档案 + 本次主题 + 输出格式契约"。只放非空字段，避免噪声。
  const context: string[] = [
    `Platform: ${platform}`,
    `Brand: ${b.brandName}`,
    `Description: ${b.description}`,
    b.tone ? `Tone: ${b.tone}` : "",
    b.targetAudience ? `Audience: ${b.targetAudience}` : "",
    b.targetMarket ? `Market: ${b.targetMarket}` : "",
    b.defaultCta ? `Preferred CTA: ${b.defaultCta}` : "",
    b.hashtags ? `Brand hashtags: ${b.hashtags}` : "",
    b.forbiddenTopics ? `Avoid these topics: ${b.forbiddenTopics}` : "",
  ].filter((l) => l !== "")

  const user = [
    context.join("\n"),
    `Write one ${platform} post about this topic: ${topic}`,
    [
      "Return ONLY a JSON object (no prose, no code fences) with exactly these string fields:",
      '  "hook": short attention-grabbing first line / title',
      '  "body": the main post copy for this platform',
      '  "hashtags": space-separated hashtags ("" if the platform should have none)',
      '  "cta": the call to action',
      '  "format": e.g. "Landscape 16:9", "Feed 1:1", "Text post · No media"',
      '  "mediaAsset": short label of the media, e.g. "Generated image" / "No media"',
    ].join("\n"),
  ].join("\n\n")
  return { system, user }
}
