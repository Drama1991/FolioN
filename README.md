# folion · 你的文化档案

> 记录看过、读过、听过、玩过的每一件事。

folion 是 [NeoDB](https://neodb.social/) 的第三方客户端，把书影音游的记录、长评、心愿与时间线，统一在一份"安静书房"质感的文学化界面里。

## 特性概览

### 记录与回顾
- **Home（NOW）**：在看 / 在读 / 在听 hero、近期活动、心情入口
- **Profile（EVER）**：年度回顾、活动热力图、长评列表、合集与标签云
- **Timeline**：按时间排布的全媒介流，支持评分 / 标签 / 媒介筛选
- **Archive · 心愿单**：按媒介分仓，统一的列表 / 海报视图与排序
- **Detail**：单作品详情，含集数追踪、社区动态、长评、AI 对话入口
- **Record Modal**：杂志化的记录抽屉，标记状态、评分、评论一气呵成
- **Review Editor**：长评的写、读、编辑全流程

### 发现与搜索
- **Discover**：按媒介浏览 trending、热门评分
- **Search**：分组结果（电影 / 剧 / 书 / 音乐 / 播客），叠加用户自身状态对照
- **AI 模糊查找**：自然语言到作品的引导

### AI 面板
- 多会话对话，sticky 历史侧栏
- 三家 Provider 三选一：聚合器（OpenAI 兼容协议）/ OpenAI 直连 / Gemini
- 可选 Brave 搜索增强，引用作为 source chips 渲染
- 模型列表自动拉取，API Key 掩码显示

### 设置
- **NeoDB**：实例、令牌、最近同步、立即同步
- **AI**：Provider 切换、模型、API Key、联网搜索
- **外观**：主题（米白 / 深色 / 跟随系统）· 字号 · 密度 · 动效偏好，全部首屏同步注入避免 FOUC
- **数据**：导出 CSV / JSON、危险区
- **资料**：内嵌的身份信息行级编辑（无独立"个人资料"页）

## 技术栈

- **Next.js 16** · App Router · Server Components + Route Handlers
- **React 19** · **TypeScript 5.7**（strict）
- **Tailwind CSS 4** + 自定义 design tokens（CSS variables）
- **Zustand 5** · 极简全局状态（AI 会话 / 通知）
- **jose 5** · Session JWT + AI 配置 JWT cookie
- **Tabler Icons** · CDN webfont
- **Noto Serif SC** · **JetBrains Mono** · system sans · 三栈分工

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量（项目根目录新建 .env.local）
cp .env.example .env.local

# 3. 启动开发服务
npm run dev                  # http://localhost:3000

# 4. 类型检查 / 构建
npm run type-check
npm run build
npm start
```

### 环境变量

| 变量 | 必填 | 说明 |
|---|---|---|
| `FOLIO_JWT_SECRET` | ✓ | Session 与 AI 配置 cookie 的签名密钥，长度 ≥ 16 |
| `FOLIO_PUBLIC_URL` | ✓ | 本站对外可访问的 URL，用于 NeoDB OAuth `redirect_uri` 拼接 |

NeoDB 实例（如 `neodb.social`）与 OAuth 应用注册由用户在登录页输入，应用凭证缓存在服务端，无需写入环境变量。

## 目录结构

```
src/
├── app/
│   ├── (auth)/login/            # 登录（脱离 shell 的居中布局）
│   ├── (shell)/                 # 主应用页面，共享顶栏 / 抽屉
│   │   ├── home/                # NOW
│   │   ├── profile/[handle]/    # EVER
│   │   ├── timeline/            # 全媒介时间线
│   │   ├── archive/[medium]/    # 按媒介档案
│   │   ├── wishlist/            # 心愿单
│   │   ├── discover/[medium]/   # 发现
│   │   ├── detail/              # 单作品
│   │   ├── review/              # 长评
│   │   ├── search/              # 搜索
│   │   ├── settings/            # 设置
│   │   └── notifications/
│   ├── api/
│   │   ├── auth/                # OAuth start / callback / logout
│   │   ├── proxy/               # NeoDB 透传：mark / review / search / item-posts
│   │   ├── ai/                  # chat / config / models
│   │   └── data/                # export / sync
│   ├── layout.tsx               # 外观偏好首屏注入
│   └── globals.css
├── components/                  # 按功能划分（home / profile / timeline / detail / …）
├── lib/
│   ├── auth/                    # session JWT、cookie、apps-cache
│   ├── neodb/                   # client / mappers / mediumMap / oauth / types
│   ├── ai/                      # providers（openai-compat / gemini）+ search（brave）
│   ├── data/                    # local-cache
│   ├── profile/                 # yearStats
│   ├── notifications/、store/、format/、appearance.ts
│   └── …
├── types/env.d.ts
└── proxy.ts                     # 全站 session 守卫，未登录重定向至 /login
```

## 设计系统

延续自原型期的"安静书房"约束，所有页面共用：

| 维度 | 值 |
|---|---|
| 容器 | `max-width: 900px` · 14px 圆角 · 0.5px 边线 |
| 主色 | 米白 `#F5F2EA` · 文本 `#1C1C1A` · 金 `#EF9F27` |
| 字体 | Noto Serif SC（标题 / 文学化正文）· JetBrains Mono（元数据）· system sans（UI） |
| 圆角 | 卡片 `--r: 10px` · 控件 `--r2: 6px` |
| 边线 | 全部 0.5px · 色 `#D8D6D0` |
| 动效 | `fadeUp 0.18s` 进入 · `slideIn 0.18s` 抽屉 |
| 标点 | 标题用句号结尾（"夜安。"）作为文学化签名 |

## 鉴权与数据流

1. 用户在 `/login` 输入 NeoDB 实例 → 后端拿到实例的 OAuth `apps` 凭证（首次注册，后续读缓存）
2. 跳转到实例授权页 → 回调 `/api/auth/callback` 换 access token
3. 用 access token 拉一次 `me`，把（instance + token + handle + display + avatar）打成 JWT 写入 HttpOnly cookie
4. `proxy.ts` 在每个非公开路由前 `verifySession`，失败一律跳 `/login?next=…`
5. 业务侧通过 `src/lib/neodb/client.ts` 以会话身份调实例 API；写操作（mark / review）走 `/api/proxy/*` 转发，保证 cookie 仅服务端可见

## 脚本

```bash
npm run dev          # next dev
npm run build        # next build --webpack
npm start            # next start
npm run type-check   # tsc --noEmit
```

## 状态

仍在快速迭代中（见 `tasks/todo.md`、`tasks/lessons.md`）。当前所有一级页面已落地为 Next.js 实现，二级流程（记录编辑、长评、集数追踪、AI 历史）已接入。
