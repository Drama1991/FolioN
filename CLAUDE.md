# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 常用命令

```bash
npm run dev          # next dev，localhost:3000
npm run build        # next build --webpack（依赖兼容问题只在这步暴露）
npm run type-check   # tsc --noEmit，提交前必跑
```

项目**没有 test runner**。验证靠 `type-check` + 浏览器实机访问（特别是移动端）。`dev 跑通 ≠ prod 跑通` —— webpack 转译会统一 ESM/CJS，依赖兼容性问题必须 `next build --webpack` + Vercel 部署才算验证完（曾踩 `isomorphic-dompurify → jsdom` ESM 链炸过 lambda）。

## 项目本质

folion 是 [NeoDB](https://neodb.social/) 的第三方客户端，**自己不存数据**：

- 所有用户数据（marks / reviews / collections / tags / notifications）由 NeoDB 实例提供
- folion 只做 SSR 渲染 + cookie 鉴权 + 写操作转发
- 多实例：登录时用户输入 NeoDB 域名，OAuth `apps` 凭证缓存在 `IAppCache`（默认 `FsAppCache`，留 KV 替换口）
- session = JWT cookie（HttpOnly，jose 5 签名），含 `{ instance, token, handle, display, avatar }`

**含义**：不能假设数据存在。任何聚合（年度回顾、Top 创作者、tag cloud）取决于用户在 NeoDB 上的行为；mapper 必须防御 API runtime null。

## 架构 big picture

- **Next.js 16 App Router**，全 SSR + Server Components；React 19；TypeScript 5.7 strict
- `src/app/(auth)/login/` — 脱离 shell 的居中布局
- `src/app/(shell)/*` — 主应用，共享顶栏 / 抽屉 / 底部 5-tab；`proxy.ts` 守卫每个非公开路由
- `src/app/api/proxy/*` — 写操作（mark / review / item-posts）转发，token 仅服务端可见
- `src/app/api/ai/chat/route.ts` — SSE 流（`event: sources / delta / done / error`）
- `src/lib/neodb/{client,mappers,types,mediumMap,oauth}.ts` — NeoDB 集成层
- `src/lib/profile/yearStats.ts` — 已聚合 `topCreator / byMedium / heatmap`，Profile 消费
- `src/lib/user-message.ts` — `USER_MESSAGE` 常量，10+ 处消费
- `src/lib/ai/` — 3 家 provider（openai-compat / openai-direct / gemini）+ Brave 搜索

数据流：login → OAuth → JWT cookie → proxy 验签 → SSR page 调 `client.ts` → mapper 转 `UiItem` → 渲染。写操作走 `/api/proxy/*`。

## 关键约束（违反过会重蹈，见 `tasks/lessons.md`）

1. **mapper 必须防御 null** —— NeoDB 文档说的 required 字段运行时可能为 null（数据修复、删除级联、灰度）。`xxxToUi(dto.nested)` 默认假设嵌套对象可能 null/undefined，与 TS 声明无关
2. **SSR 路由层包 try/catch** —— 任何 SSR `await fetcher()` 未捕获就是整页 500。`home / wishlist / timeline / archive` 都已用 `.catch(() => ({ data: [] }))` 内联兜底
3. **API bug 第一动作是 dump 响应** —— 禁止读文档推理。SSR 临时渲染 JSON 到页面比翻 terminal 更快
4. **用户"X 页"含糊时先 verify** —— "长评页"可能是列表 `/profile/[handle]/reviews` 或详情 `/review/[uuid]`；多个候选时禁止猜测，要 URL / log / 操作路径
5. **"代码分支存在" ≠ "用户体验已具备"** —— 声明"已支持 X 形态"必须验证用户能看到的全部惯例特征（sheet handle、drawer 蒙层、modal 居中）
6. **review 文档 ≠ 当前状态** —— `[x]/[ ]` 可能过期、commit 可能没勾。提议补做前先 `git log` + grep 代码现状
7. **非平凡改动先口头给方案** —— 改尺寸/栅格/版式/重写组件前必须先讨论方案，不要直接落地

## 设计系统硬约束

- 容器 `max-width: 900px`，0.5px 边线 `#D8D6D0`
- 主色 米白 `#F5F2EA` / 文本 `#1C1C1A` / 金 `#EF9F27`；dark = 暖墨非纯黑
- 字体三栈：**Noto Serif SC**（标题 / 文学化正文）/ **JetBrains Mono**（元数据 / 时间戳 / 数字）/ system sans（UI）
- 圆角 `--r: 10px` / `--r2: 6px`
- 动效 `fadeUp / slideIn 0.18s`，`data-motion="off"` 全局关停
- **标题用句号结尾**（"夜安。"）—— 文学化签名

**CTA 视觉权重底线**：米白 + 描边 + 柔影，**不要饱和填充 + 多层浮雕**。语义色只有 `--danger`，不引入 success/warning/info。

**复用现有 token**：`.chip` / `.chip.on` / `.card` / `.tag-chip` / `.stat-cell` / `.row` / `.section-label` / `.collection` 已有。改样前先 grep className，禁止 inline 重写视觉。

**图标**：用 `@tabler/icons-react`（React 组件）或 webfont CDN（layout.tsx 引）。**webfont CDN 不含 `-filled` 字符**，`ti-foo-filled` 在 webfont 路线下空白；要 filled 状态走 active 背景 / 描边，或换 React 组件。不要手画 SVG 图标。

**移动端**：< 768px 断点，底部 5-tab + 独立 AI FAB（commit `306892a` 之后的 IA v2，已替换早期"汉堡 + FAB"）。

## 错误与状态

- `app/global-error.tsx` 兜底根崩溃；`app/(shell)/error.tsx` 兜底 shell 子树（含重试）
- 用户文案集中 `src/lib/user-message.ts`，禁止零散写"出错了"
- EmptyState 走 `src/components/shared/EmptyState.tsx`；仅文本"暂无"不算合格空态（discover 页面是已知例外，待升级）

## Commit 风格

`<type>(<scope>): <中文描述>`，type ∈ {feat, fix, refactor, chore, perf}。scope 可写功能名或编号（detail / mobile / navigation / settings / p1 等）。多个改动用 ` + ` 分隔。

```
feat(ux): 错误文案收口 USER_MESSAGE + 封面占位 medium 图标
refactor(p1): 抽 StatusControl + .card token + 详情页决策信息 + a11y
fix(detail): MyRecordCard 状态 chip 复用 .chip.on + dropped 冷灰激活态
```

## 教训库

`tasks/lessons.md` 持续维护 —— 任何用户纠正后，更新对应 lesson 并写明"事实 / 规则 / how to apply"三段。这是项目记忆的源头，密度高于 commit history。
