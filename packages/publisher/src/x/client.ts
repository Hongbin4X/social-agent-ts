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

// tweet 端点 api.twitter.com 已实测可用（master 真发过 tweet）；articles 端点在 api.x.com。
const TWEET_BASE = "https://api.twitter.com"
const ARTICLE_BASE = "https://api.x.com"

export interface PostedTweet {
  id: string
  url: string
}

/** X 单条字符上限（发串推自动分段时用）。 */
export const X_TWEET_MAX = 280

export interface PostTweetParams {
  accessToken: string
  text: string
  /** 串推：传上一条 id，则本条作为其回复发出。 */
  replyToTweetId?: string
  /** 传了就拼更友好的帖子链接。 */
  username?: string
  fetchImpl?: typeof fetch
  /** 覆盖 tweet 端点基址（默认 api.twitter.com）。 */
  apiBaseUrl?: string
}

/** 发单条推文（可作为串推的一环）。 */
export async function postTweet(params: PostTweetParams): Promise<PostedTweet> {
  const fetchImpl = params.fetchImpl ?? fetch
  const base = (params.apiBaseUrl ?? TWEET_BASE).replace(/\/+$/, "")
  const body: Record<string, unknown> = { text: params.text }
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
  const overflow = segs.find((s) => s.length > X_TWEET_MAX)
  if (overflow) {
    throw new PublisherError("content_invalid", `串推某条 ${overflow.length} 字超过单条上限 ${X_TWEET_MAX}`)
  }

  const ids: string[] = []
  let prevId: string | undefined
  for (let i = 0; i < segs.length; i++) {
    try {
      const tweet = await postTweet({
        accessToken: params.accessToken,
        text: segs[i]!,
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

/**
 * 把一段正文自动切成 ≤maxLen 的串推分段。
 * 优先按段落（空行）切；单段仍超长再按句子/空格切；避免硬切单词。
 */
export function splitIntoThreadSegments(text: string, maxLen = X_TWEET_MAX): string[] {
  const clean = (text ?? "").trim()
  if (!clean) return []
  const out: string[] = []
  for (const para of clean.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)) {
    if (para.length <= maxLen) {
      out.push(para)
      continue
    }
    // 段落超长：按句末/空格滚动拼，尽量不硬切词。
    let buf = ""
    for (const word of para.split(/\s+/)) {
      if (word.length > maxLen) {
        // 单个超长 token（如长 URL）：先冲掉 buf，再硬切它。
        if (buf) {
          out.push(buf)
          buf = ""
        }
        for (let i = 0; i < word.length; i += maxLen) out.push(word.slice(i, i + maxLen))
        continue
      }
      const next = buf ? `${buf} ${word}` : word
      if (next.length > maxLen) {
        out.push(buf)
        buf = word
      } else {
        buf = next
      }
    }
    if (buf) out.push(buf)
  }
  return out
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
  if (res.status === 429) return new PublisherError("rate_limited", `X 触发限流（429）：${bodyText}`)
  if (res.status === 401) return new PublisherError("token_expired", `X 授权失效，请重新连接账号（401）：${bodyText}`)
  if (res.status === 403) return new PublisherError("permission_missing", `X 权限不足（403）：${bodyText}`)
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
  if (res.status === 429) return new PublisherError("rate_limited", `X Article 触发限流（429）：${bodyText}`)
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
