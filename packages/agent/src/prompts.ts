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

// ── 通用防编造约束（grounding）──
// 问题：主题只给品类/卖点、没给具体产品时（如「推荐一款自律数码好物」），模型会凭空造一个
//   带假名字/假参数/假价格的 SKU，把虚构当事实——对种草文案是致命的。
// 解法：给一段硬约束，要求「只依据已知事实、缺具体就留占位符、绝不编造」。
// 关键：由 buildVariantPrompt 统一追加到 system 末尾，所以即使后台用 DB 模板覆盖了平台人格，
//   这条底线依然生效（不可被业务模板绕过）。
export const GROUNDING_RULES = [
  "Grounding rules (do NOT fabricate):",
  "- Treat the brand context and the topic above as your ONLY source of truth. Do not add facts that are not there.",
  "- Never invent specifics that were not provided: no made-up product or model names, prices, discounts, spec numbers, release dates, statistics, study results, awards, or customer quotes.",
  "- If the topic gives only a category or a selling point (e.g. 'a focus-boosting gadget, barely-there to wear') without a specific product, write at THAT level: sell the benefit, the use-case and the feeling, and refer to the product only by the real brand name from the context. Do not invent a specific model, sub-brand, or feature list.",
  "- If a concrete detail is genuinely required by the copy but missing, insert a short bracketed placeholder such as [product name] or [key spec] instead of making one up, so the user can fill it in. Use placeholders sparingly.",
  "- When unsure, stay a little more general rather than stating anything that could be false. Honest and slightly vague beats specific and fabricated.",
  "- Write the post in the same language as the topic.",
].join("\n")

// ── image 模式追加规则（Task 2：文字+图片占位符）──
// 背景：当 input.modes 含 "image" 时，前端要在正文里渲染出对应的图片占位块，并需要一段可读的
//   图片描述用于后续「一键生成图片」。约定 token 语法固定为 [[img:N]]（与 @social/shared 的
//   parseImageRefs/stripImageTokens 等纯函数约定一致，N 从 1 起）。
// 只在 image 模式开启时追加这段规则，避免非 image 场景里污染 prompt、也避免模型无意义地强插图片。
export const IMAGE_PLACEHOLDER_RULES = [
  "Image placeholders (only because image mode is ON):",
  "- Decide where 1-3 images genuinely help this specific post. Insert a marker [[img:1]], [[img:2]] ... on its own line at each spot in the body.",
  "- Also return an \"imageSlots\" array; each item = { \"ref\": <the number used in the body marker>, \"description\": \"<a concrete, shootable image description: subject, composition, style, mood, colors>\" }.",
  "- The description must stay grounded in the brand context — do NOT depict invented products, logos, prices, or specs. Describe the scene/benefit/feeling.",
  "- ref numbers in imageSlots must match the [[img:N]] markers in the body exactly. Use as few images as the content truly needs.",
].join("\n")

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
  // image 模式开关：只有 modes 显式含 "image" 才在契约里加 imageSlots 字段与占位规则，
  // 保持 copy-only 场景的 prompt 干净、不引入无关约束。
  const wantsImage = (input.modes ?? []).includes("image")
  // system = 平台人格模板（占位符注入后） + 通用防编造底线。
  // grounding 放最后，作为不可被平台/DB 模板绕过的硬约束。
  const system =
    renderTemplate(template, {
      platform,
      brandName: b.brandName ?? "",
      description: b.description ?? "",
      tone: b.tone ?? "",
      topic,
    }) +
    "\n\n" +
    GROUNDING_RULES

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

  // 输出契约：copy 字段固定不变；image 模式追加 imageSlots 字段说明 + 独立的占位符规则段，
  // 二者都用 filter 剔除空串挂载，保证 copy-only 时 user 消息里完全不出现 image 相关文案。
  const contractLines = [
    "Return ONLY a JSON object (no prose, no code fences) with exactly these string fields:",
    '  "hook": short attention-grabbing first line / title',
    '  "body": the main post copy for this platform',
    '  "hashtags": space-separated hashtags ("" if the platform should have none)',
    '  "cta": the call to action',
    '  "format": e.g. "Landscape 16:9", "Feed 1:1", "Text post · No media"',
    '  "mediaAsset": short label of the media, e.g. "Generated image" / "No media"',
  ]
  if (wantsImage) {
    contractLines.push(
      '  "imageSlots": array of { "ref": <int>, "description": "<detailed image description>" } (place matching [[img:<ref>]] markers inside "body")',
    )
  }

  const user = [
    context.join("\n"),
    `Write one ${platform} post about this topic: ${topic}`,
    contractLines.join("\n"),
    wantsImage ? IMAGE_PLACEHOLDER_RULES : "",
  ]
    .filter((l) => l !== "")
    .join("\n\n")
  return { system, user }
}
