// X（Twitter）v2 发帖客户端 —— 纯函数，只吃一个 user access_token，可注入 fetch（便于测试）。
//
// 三种发帖形态（对应前端「普通推文 / 串推 / Article」）：
//   · postTweet   ：单条推文 POST /2/tweets（保底路径，Free 档即可）。
//   · postThread  ：串推——逐条发，后条 reply 前条（reply.in_reply_to_tweet_id）串成 thread。
//                   这是 X 上把「长内容」原生排成一组的唯一方式（单条推 280 字上限）。移植自 demo/x-poster/tools/post_thread。
//   · postArticle ：X Articles 长文——两步 POST /2/articles/draft → /2/articles/{id}/publish。
//                   ⚠️ 硬门槛：发帖账号必须是 X Premium 订阅者，否则 draft 直接 403（demo 2026-07-12 实测）。
//
// 错误一律经 mapXError 映射成 PublisherError（带机器可读 code），绝不吞掉 X 的真实原因（铁律：报错不掩盖）。

import { PublisherError } from "../errors"
// 加权长度/串推分段是【前后端共用】的纯函数，真源在 @social/shared：
// 前端预览必须用同一套逻辑，否则会出现"预览 3 条、实际发 5 条"的偏差。
import { composeCtaLine, planXTweets, splitIntoThreadSegments, X_TWEET_MAX, xWeightedLength } from "@social/shared"
// 原地转出：这些历史上就从 x/client 导出，调用方（adapters/x.ts、index.ts、测试）沿用旧路径不改。
export { composeCtaLine, planXTweets, splitIntoThreadSegments, X_TWEET_MAX, xWeightedLength }

// tweet 端点 api.twitter.com 已实测可用（master 真发过 tweet）；articles/media 端点在 api.x.com。
const TWEET_BASE = "https://api.twitter.com"
const ARTICLE_BASE = "https://api.x.com"
const MEDIA_URL = "https://api.x.com/2/media/upload" // demo 用 @ChenR292518 实测可传图（需 media.write）

export interface UploadMediaParams {
  accessToken: string
  /** 图片字节（Uint8Array；Buffer 也是 Uint8Array 子类，可直接传）。 */
  bytes: Uint8Array
  /** 正确 MIME（image/jpeg | image/png | ...）；X v2 传图不认 application/octet-stream。 */
  mimeType: string
  /** 媒体类别，默认 tweet_image。 */
  category?: string
  fetchImpl?: typeof fetch
}

/**
 * v2 传图 → 返回 media_id。**需 media.write scope + 账号所在档位支持**（Free 档常 403）。
 * 失败直接抛（映射 PublisherError），不降级不掩盖。移植自 demo/x-poster uploadMedia。
 */
export async function uploadMedia(params: UploadMediaParams): Promise<string> {
  const fetchImpl = params.fetchImpl ?? fetch
  const form = new FormData()
  const blob = new Blob([params.bytes], { type: params.mimeType })
  form.append("media", blob, "upload")
  form.append("media_category", params.category ?? "tweet_image")
  // 注意：FormData 自己带 multipart boundary，绝不能手写 content-type。
  const res = await fetchImpl(MEDIA_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${params.accessToken}` },
    body: form,
  })
  if (!res.ok) throw await mapXError(res, "传图")
  const json = (await res.json().catch(() => null)) as
    | { data?: { id?: string }; media_id_string?: string; media_id?: string | number }
    | null
  const mediaId = json?.data?.id ?? json?.media_id_string ?? json?.media_id
  if (!mediaId) throw new PublisherError("provider_error", "X 传图返回缺少 media_id")
  return String(mediaId)
}

export interface PostedTweet {
  id: string
  url: string
}

function tweetUrl(id: string, username?: string): string {
  return username ? `https://x.com/${username}/status/${id}` : `https://x.com/i/web/status/${id}`
}

/** 把 X 发推错误映射成 PublisherError（保留真实原因，区分重复内容/限流/授权失效/权限）。 */
async function mapXError(res: Response, action: string): Promise<PublisherError> {
  const bodyText = await safeBody(res)
  if (res.status === 403 && /duplicate content/i.test(bodyText)) {
    return new PublisherError("content_invalid", "内容重复：X 不允许发布与近期完全相同的推文，请修改文案后再发")
  }
  if (res.status === 429) {
    // X 用【同一个 429】表达两件性质完全不同的事，必须分开（2026-07-15 用户提出）：
    //  ① 月度额度耗尽：{"title":"UsageCapExceeded","period":"Monthly","scope":"Product",
    //     "detail":"Usage cap exceeded: Monthly product cap",
    //     "type":"https://api.twitter.com/2/problems/usage-capped"}
    //     → 这是【我方开发者账号】的配额用完了，等多久都没用，必须升级套餐/等下月重置。
    //  ② 短时限流（15 分钟窗口打满）→ 等几分钟重试确实有用。
    // 从前一律报"触发限流，稍后重试"——在①的情况下是让用户白等，纯误导。
    if (/UsageCapExceeded|usage-capped|usage cap exceeded/i.test(bodyText)) {
      const monthly = /monthly/i.test(bodyText)
      return new PublisherError(
        "quota_exceeded",
        `X 开发者账号的${monthly ? "【月度】" : ""}发帖额度已用完，无法再发（这是我方 API 套餐的配额，不是你账号的问题）。` +
          `等待重试无效——需要升级 X 开发者套餐，或等下个计费周期重置。原文：${bodyText}`,
      )
    }
    return new PublisherError("rate_limited", `X 触发短时限流（429），请过几分钟再试：${bodyText}`)
  }
  if (res.status === 401) return new PublisherError("token_expired", `X 授权失效，请重新连接账号（401）：${bodyText}`)
  if (res.status === 403) {
    // 「not permitted to perform this action」是个笼统的 403，实测有多种成因，按概率排序给出：
    //  ① 内容被 X 反垃圾/安全过滤器拦下（营销文案 + 多标签 + 推广链接的组合最易中招）——最常见，改文案即可；
    //  ② App 写权限掉了（X 后台 App permissions 非 Read and write，或改过权限后 token 未重新授权）；
    //  ③ 账号被 X 限流/限制。
    // 不再武断归因单一原因（曾误判成 App 权限），把可行动项都列出来。
    if (/not permitted to perform this action/i.test(bodyText)) {
      return new PublisherError(
        "content_invalid",
        "X 拒绝发帖（403 not permitted）。常见原因(按概率)：① 这条内容被 X 的反垃圾/安全过滤拦下——试着精简文案、减少话题标签、去掉可疑或推广链接后重发；② X 后台该 App 的 permissions 不是「Read and write」，或改过权限后没重新授权；③ 账号被限流。多数情况是①，先改内容试试。",
      )
    }
    return new PublisherError("permission_missing", `X 权限不足（403）：${bodyText}`)
  }
  return new PublisherError("provider_error", `X ${action}失败 ${res.status}：${bodyText}`)
}

/** Article 端点错误映射：403 大概率是账号未开通 Premium，给明确可行动的提示。 */
async function mapArticleError(res: Response): Promise<PublisherError> {
  const bodyText = await safeBody(res)
  if (res.status === 403) {
    return new PublisherError(
      "permission_missing",
      /premium/i.test(bodyText)
        ? "发布 X Article 需要发帖账号开通 X Premium 订阅，当前账号未开通。请改用「普通推文 / 串推」，或为该账号开通 Premium 后再发。"
        : `X Article 权限不足（403）：${bodyText}`,
    )
  }
  if (res.status === 429) {
    // 同 mapXError：Article 端点也用 429 表达"额度耗尽"与"短时限流"两件事，必须分开。
    if (/UsageCapExceeded|usage-capped|usage cap exceeded/i.test(bodyText)) {
      return new PublisherError(
        "quota_exceeded",
        `X 开发者账号的发帖额度已用完（我方 API 套餐配额，非你账号问题）。等待无效，需升级套餐或等下月重置：${bodyText}`,
      )
    }
    return new PublisherError("rate_limited", `X Article 触发短时限流（429），请过几分钟再试：${bodyText}`)
  }
  if (res.status === 401) return new PublisherError("token_expired", `X 授权失效，请重新连接账号（401）：${bodyText}`)
  return new PublisherError("provider_error", `X Article 失败 ${res.status}：${bodyText}`)
}

async function safeBody(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 300)
  } catch {
    return "<no body>"
  }
}

export interface PostTweetParams {
  accessToken: string
  text: string
  /** 串推：传上一条 id，则本条作为其回复发出。 */
  replyToTweetId?: string
  /** 附带的 media_id（先经 uploadMedia 拿到）；带上即图文推文。最多 4 张。 */
  mediaIds?: string[]
  /** 传了就拼更友好的帖子链接。 */
  username?: string
  fetchImpl?: typeof fetch
  /** 覆盖 tweet 端点基址（默认 api.twitter.com）。 */
  apiBaseUrl?: string
}

/** 发单条推文（可作为串推的一环；带 mediaIds 即图文）。 */
export async function postTweet(params: PostTweetParams): Promise<PostedTweet> {
  const fetchImpl = params.fetchImpl ?? fetch
  const base = (params.apiBaseUrl ?? TWEET_BASE).replace(/\/+$/, "")
  const body: Record<string, unknown> = { text: params.text }
  if (params.mediaIds && params.mediaIds.length > 0) body["media"] = { media_ids: params.mediaIds.slice(0, 4) }
  if (params.replyToTweetId) body["reply"] = { in_reply_to_tweet_id: params.replyToTweetId }

  const res = await fetchImpl(`${base}/2/tweets`, {
    method: "POST",
    headers: { authorization: `Bearer ${params.accessToken}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw await mapXError(res, "发推")
  const json = (await res.json().catch(() => null)) as { data?: { id?: string } } | null
  const id = json?.data?.id
  if (!id) throw new PublisherError("provider_error", "X 返回缺少 tweet id")
  return { id, url: tweetUrl(id, params.username) }
}

export interface PostThreadParams {
  accessToken: string
  /** 已分好的段落文本（每段 ≤280）。空数组会抛 content_invalid。 */
  segments: string[]
  /** 挂到首条推文的 media_ids（图文串推）。 */
  firstMediaIds?: string[]
  username?: string
  fetchImpl?: typeof fetch
  apiBaseUrl?: string
}

export interface PostedThread {
  /** 首条推文 id（thread 入口）。 */
  id: string
  /** 首条链接（从这条进入即可看到整串）。 */
  url: string
  /** 全部推文 id，按发布顺序。 */
  ids: string[]
}

/** 发串推：逐条发，后条 reply 前条，串成 thread。任一条失败即停、抛已发条数信息，不掩盖。 */
export async function postThread(params: PostThreadParams): Promise<PostedThread> {
  const segs = params.segments.map((s) => s.trim()).filter((s) => s.length > 0)
  if (segs.length === 0) throw new PublisherError("content_invalid", "串推内容为空")
  // ⚠️ 用加权长度判超限，不是 .length：X 对汉字按 2 计（见 xWeightedLength）。
  // 用 .length 会双向出错：中文合法内容被误拒、中文超限内容被放行然后被 X 拒。
  const overflow = segs.find((s) => xWeightedLength(s) > X_TWEET_MAX)
  if (overflow) {
    throw new PublisherError(
      "content_invalid",
      `串推某条加权长度 ${xWeightedLength(overflow)} 超过单条上限 ${X_TWEET_MAX}（中日韩字符每个算 2）`,
    )
  }

  const ids: string[] = []
  let prevId: string | undefined
  for (let i = 0; i < segs.length; i++) {
    try {
      const tweet = await postTweet({
        accessToken: params.accessToken,
        text: segs[i]!,
        // 图片只挂首条（i===0）。
        mediaIds: i === 0 ? params.firstMediaIds : undefined,
        replyToTweetId: prevId,
        username: params.username,
        fetchImpl: params.fetchImpl,
        apiBaseUrl: params.apiBaseUrl,
      })
      ids.push(tweet.id)
      prevId = tweet.id
    } catch (err) {
      // 已发出去的删不回来（对外不可逆）——把「发到第几条失败」如实带出，便于用户判断。
      const detail = err instanceof Error ? err.message : String(err)
      const code = err instanceof PublisherError ? err.code : "provider_error"
      throw new PublisherError(
        code,
        ids.length > 0
          ? `串推发到第 ${ids.length + 1}/${segs.length} 条失败（前 ${ids.length} 条已发出）：${detail}`
          : `串推发布失败：${detail}`,
      )
    }
  }
  return { id: ids[0]!, url: tweetUrl(ids[0]!, params.username), ids }
}

// ── X Articles（长文）────────────────────────────────────────────────────────
// X 用的是改造过的 DraftJS：block 只留 key/text/type/data，顶层用 entities 数组（不是 entityMap）。

interface ArticleBlock {
  key: string
  text: string
  type: "unstyled" | "header-one"
  data: Record<string, unknown>
}

export interface PostArticleParams {
  accessToken: string
  title: string
  /** 正文段落（每段一个 unstyled block）。 */
  paragraphs: string[]
  username?: string
  fetchImpl?: typeof fetch
}

export interface PostedArticle {
  articleId: string
  postId: string
  url: string
}

/** 发 X Article：建草稿 → 发布。账号非 Premium 会在建草稿这步 403（映射成 permission_missing + 清晰文案）。 */
export async function postArticle(params: PostArticleParams): Promise<PostedArticle> {
  const fetchImpl = params.fetchImpl ?? fetch
  const title = params.title.trim()
  if (!title) throw new PublisherError("content_invalid", "Article 缺少标题")
  const paras = params.paragraphs.map((p) => p.trim()).filter((p) => p.length > 0)
  if (paras.length === 0) throw new PublisherError("content_invalid", "Article 正文为空")

  const blocks: ArticleBlock[] = paras.map((text, i) => ({
    key: `b${i}`,
    text,
    type: "unstyled",
    data: {},
  }))

  // ① 建草稿
  const draftRes = await fetchImpl(`${ARTICLE_BASE}/2/articles/draft`, {
    method: "POST",
    headers: { authorization: `Bearer ${params.accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ title, content_state: { blocks, entities: [] } }),
  })
  if (!draftRes.ok) throw await mapArticleError(draftRes)
  const draftJson = (await draftRes.json().catch(() => null)) as { data?: { id?: string } } | null
  const articleId = draftJson?.data?.id
  if (!articleId) throw new PublisherError("provider_error", "X Article 草稿返回缺少 id")

  // ② 发布
  const pubRes = await fetchImpl(`${ARTICLE_BASE}/2/articles/${articleId}/publish`, {
    method: "POST",
    headers: { authorization: `Bearer ${params.accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({}),
  })
  if (!pubRes.ok) throw await mapArticleError(pubRes)
  const pubJson = (await pubRes.json().catch(() => null)) as { data?: { id?: string; post_id?: string } } | null
  const postId = pubJson?.data?.post_id ?? pubJson?.data?.id ?? articleId
  return { articleId, postId, url: tweetUrl(postId, params.username) }
}

// ── 分段/工具 ─────────────────────────────────────────────────────────────────

