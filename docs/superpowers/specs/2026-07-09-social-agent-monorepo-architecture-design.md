# Super Social Agent —— 全栈 monorepo 架构设计

日期：2026-07-09
状态：前端已落地（本文档记录选型与结构，供后续后端/agent 阶段参照）
需求来源：`docs/super-social-agent-requirement-spec-p0.zh.md`
原型来源：`references/super-social-agent`（Next.js 16 + React 19 + Tailwind v4 纯前端原型）

## 1. 背景与目标

Super Social Agent 是 **嵌在 GLBGPT 里的社媒 Agent 工具**（复用 GLBGPT 的登录、userId、套餐权益、计费系统、模型 API Key）。
本阶段目标：**基于产品原型，先快速搭出可确认的前端展示与交互**；同时把项目骨架设成能容纳「TS 全栈 + 未来 agent 框架」的形态。

## 2. 关键决策

### 2.1 项目结构：pnpm monorepo（用户 2026-07-09 拍板）

```
social-agent-ts/
├─ apps/
│  ├─ web/        ★ Next.js 16 前端（本次交付，完整可跑）
│  └─ server/     ○ 后端 BFF —— 仅脚手架占位（Hono 空壳），逻辑后续做
├─ packages/
│  ├─ shared/     ★ 跨前后端共享：领域类型 + 枚举常量 + 计费表（已落地真类型）
│  └─ agent/      ○ agent 编排层占位包
├─ docs/  references/
├─ pnpm-workspace.yaml · turbo.json · tsconfig.base.json
```

选型理由：前后端彻底分离、可独立部署/扩缩容、agent 服务可独立；共享包保证前后端同一份数据契约。
备选（单 Next.js 全栈）被否：用户明确要「前后端 + agent 框架」，monorepo 边界更清晰。

### 2.2 前端形态：忠实还原原型，重构落到干净结构

- 技术栈原样保留：Next.js 16（Turbopack）+ React 19 + Tailwind v4（oklch 设计令牌）+ base-ui + lucide。
- 目录：`app/`（外壳）+ `features/social/`（产品域：store / shell / views / wizards / panels / components / data）+ `components/ui`（通用原语）+ `lib` + `@social/shared`（类型）。
- **拆分巨文件**：原型 `content-create.tsx`(1299 行) 拆成 `content-create/{index,create-content-wizard,plan-wizard,content-library,preview-card,helpers}`。
- **类型上移**：原型 `lib/social/types.ts` → `@social/shared`，前后端共用。
- **计费表下沉共享**：`CREDIT_COSTS` / `AUTO_PLATFORMS` / `platformPublishMode` 移到 `@social/shared`（spec §16 的唯一真源），store 导入后 re-export，调用方零改动。
- 去掉 `@vercel/analytics`；关掉原型的 `typescript.ignoreBuildErrors`，用 `next build` 的真实类型检查兜住重构。

### 2.3 已定的技术取舍

| 点 | 决策 | 理由 |
|---|---|---|
| 状态层 | 保留原型的 React Context store（`features/social/store`），单文件忠实迁移 | 它是原型的「大脑」，856 行跨 tab 共享状态；P0 阶段切片重写风险 > 收益，标记为后续清理 |
| 数据源 | 保留内存 mock（`features/social/data/mock.ts`），放在可替换位置 | 将来换真 API client 只改 store 的数据来源，UI 不动 |
| 导航 | 保留原型的状态驱动 tab 切换（非真路由） | 向导 studio 草稿跨 tab 共享，状态驱动最省事；要 deep-link 再上真路由 |
| 后端/agent | 只搭空壳（`apps/server` Hono 健康检查、`packages/agent` 接口占位） | 本阶段只要前端可确认；保证全仓可编译 |

## 3. 数据库/后端约束（后续阶段，勿提前动）

- 本项目要存自有数据：品牌信息、帖子/素材等。
- **扣费相关的 DB 设计必须先读 `references/yanfa-chatpal-api` 的库结构再联调，避免冲突**（用户 2026-07-09 强调）。
- 模型调用一律走 GLBGPT 模型层；付费动作对应 `@social/shared` 的 `BillingActionType` / `CREDIT_COSTS`，由后端向 GLBGPT 计费系统预扣、回写。

## 4. 运行方式

```bash
pnpm install
pnpm dev:web        # 前端，http://localhost:4100
pnpm build          # 全仓构建（含 server/agent 空壳），带真实类型检查
pnpm dev:server     # 后端空壳，http://localhost:8091/health
```

端口：web=4100、server=8091（本机 3000/5173/8090 已被其它服务占用，故避开）。

## 5. 验证结果（2026-07-09）

- `pnpm --filter web build`：✅ 通过（Turbopack 编译 + 完整 TypeScript 类型检查）。
- 真实浏览器（Chromium）驱动全流程截图 10 屏：GLBGPT 首页 → Onboarding → Agent Home → Brand Profile → Account Hub → Content Create → Create 向导 → Calendar 周/月 → Operations Data，均忠实还原原型、交互可点通。

## 6. 后续（未做，非本次范围）

- store 切片 / 引入数据获取 seam（换真 API）。
- `apps/server` 领域服务 + GLBGPT 集成（登录/计费/模型代理）。
- `packages/agent` 接入 agent 框架（内容/计划/图片/推荐生成）。
- DB schema（先对齐 `references/yanfa-chatpal-api`）。
