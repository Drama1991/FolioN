# Lessons

## 2026-05-22 · 不要相信 compact 摘要里的事实声明

**情境：** Timeline 状态筛选 dropdown hint 里我写了"看过 · 读过 · 听过 · 玩过"。用户问"没有游戏类目，是否要'玩过'？"。compact 摘要里写过 "ALL_UI_MEDIUMS does include game"，差点据此回答"游戏是支持的类目"。

**事实：** `lib/neodb/mediumMap.ts` 里 `ALL_UI_MEDIUMS = ["movie", "series", "book", "music", "podcast"]` —— 没有 game。`UiMedium` 类型有 game 一项，但运行时被排除在外。首页 cell、timeline chip、archive 路由全部以 `ALL_UI_MEDIUMS` 为源。

**规则：** compact 摘要可能有错。任何"我之前写过 X 存在"的回忆，在落地为代码或答用户之前，先 grep 源码确认。CLAUDE.md 第 7 条（Verify Before Claiming Facts）适用于自己的记忆，不只是外部资料。

**how to apply：** 看到摘要里"X has Y"的具体技术断言（变量内容、文件存在、API 形状），先 grep / Read 一遍再用。

## 2026-05-23 · 回应"要不要做 X"前必须读 X 现状

**情境：** P2 全部跑完后我问用户"要不要顺手把 P1-11 CSP 也补上？那是 P2 里实际更值钱的一项。"用户答"好的"。开工 Read 才发现 `next.config.ts` 早就实现了完整 CSP + security headers 套件，注释甚至明写 "P1-11"。我答得太快、太确定。

**事实：** review 文档（2026-05-22）说 "next.config.ts 空，没设 `headers()`"。但 git status 显示 next.config.ts 是 M（modified），有未提交改动——P1-11 已在 review 之后某次本地编辑里做完。

**规则：** 提议「补做某条 review 项」之前，先 Read 相关文件确认当前状态。**review 文档 ≠ 当前状态**——review 是某个时间点的快照，工作可能已经在更新但未提交。尤其当 git status 显示文件 M、且改动未推上 PR 时，review 的描述天然过时。

**how to apply：** 任何形如"P{N}-{M} 还没做，要不要补"的提议——开口前先 `Read` 那个文件 / `grep` 那个函数。同样适用于代码审查里的「这里漏了 X」断言：先看现状。

## 2026-05-24 · 不要把"代码分支存在"等同于"用户体验已具备"

**情境：** 第三批·下半 AIPanel mobile 化，我看到 DraggableWindow 里有 `if (mobile) setBox({x:0, y:0, w: innerWidth, h: innerHeight})` 这个全屏分支，加上 `border: isMobile ? "none" : ...`，就报告"DraggableWindow 已原生支持 mobile 全屏，本批只需补内部按钮触控目标"。用户直接反问"AIPanel 你不是说点击之后从右侧滑出吗？没有做？"

**事实：** 全屏分支是有的，但**进入动画依然是 `scale(0.55) → scale(1)`**（从触发点缩放），不是 sheet 滑入；**也没有顶部 handle**。这跟同期已落地的 RecordModal 在 mobile 的 sheet 形态（slide-up + handle）有明显差距。从用户视角看，AIPanel 跟"右滑入面板"或"底部 sheet"完全不是一回事——只是变大了。

**规则：** 当声称"X 已经支持 Y"时，**Y 必须是用户能看见/感知的形态**，不是代码里某个 if 分支。对于 UI 组件，"已支持 mobile" 至少要包括：①布局填屏 ②进入/退出动画符合该形态（sheet=slide-up，drawer=slide-in） ③该形态的视觉惯例（sheet handle、drawer 蒙层、modal 居中）。少一项就不算"已支持"，只算"代码骨架在"。

**how to apply：** 凡是要写"X 已经/原生支持 Y"的措辞——先在脑子里跑一遍：用户打开 X 时**眼睛会看到什么**？跟同项目里已落地的标准形态（RecordModal sheet / Drawer / Modal）比一下，差哪几样就老实承认差哪几样，要么补上、要么写明留作下轮。绝不用"代码存在分支"打包成"功能已具备"来糊弄过去。

## 2026-05-24 · TS 类型声明"必填"≠ 运行时一定有值

**情境：** 用户报告 `/profile/[handle]/reviews` 移动端进入报 500。第一动作是按用户的 lesson #4「先 dump 响应」去翻 listMyReviews，发现它已经有 try/catch 兜底。再往下定位到 `reviewToUi(review.item)` —— `review.item: NeoDBItemBase`（TS 上是 required），但运行时 NeoDB **会返回 `item: null`**（关联 item 已被删除但 review 还在），mapper 直接 NPE 把整页打爆。

**事实：** TS 类型 `interface NeoDBReview { ... item: NeoDBItemBase; ... }` 把 item 标成必填，所以全 codebase 没人加防御，map 时直接解构 `review.item.uuid` 之类。但外部 API 的"必填"只是文档上的契约，运行时随时可能被破坏（数据修复、删除级联、灰度发版、字段含义重定义）。

**规则：** 凡是 mapper 函数把外部 API DTO 转成 UI 模型，**默认假设嵌套对象可能 null/undefined**，跟 TS 声明说什么无关。两种处理：①在调用方 `.filter(r => r && r.item)` 跳掉，②mapper 自己防御并 return null + 调用方 filter Boolean。配合 `console.warn` 输出"跳了 N 条"，让 Vercel logs 能看到现场。

**how to apply：** 写或审 `xxxToUi(dto.nested)` 这类代码时，先想"如果 dto.nested 是 null 会怎样"。SSR 路由层的 `await fetcher()` 一旦冒泡未捕获异常就是整页 500——比客户端 hook 错误严重得多。新写的 SSR page 默认外层包 try/catch + 内层对 nested 字段 filter。

## 2026-05-24 · 用户给的"X 页"术语含糊时，先 verify 再动手

**情境：** 用户报告"长评页在 vercel 真实手机端点击显示 500"。我立刻把"长评页"映射到 `/profile/[handle]/reviews`（长评归档列表）并在那一页堆 defensive try/catch，commit、push、部署。用户下一轮发来 Vercel runtime log，page 字段是 `/review/78tRHpmT5VEaSlMs7qWuN1`——单篇长评详情，跟我改的页面**完全不是一个**。整一轮工作都打在错的文件上。

**事实：** "长评 X" 在这个产品里至少对应两个页面：①列表 `/profile/[handle]/reviews` ②详情 `/review/[uuid]`，再加上编辑 `/review/edit/[uuid]` 共三个候选。用户说"长评页点击进入后报错"，从他视角是「点了一篇长评进去」，所以是详情页；但我读成了「打开长评(列表)页就报错」。歧义本来一开始就该问。

**规则：** 用户用「X 页」「Y 界面」这类**有多个合理对应**的措辞描述 bug 时，**禁止猜测后直接动手**。先做以下一项再开工：
1. 列出候选页面 + AskUserQuestion 让用户点
2. 拿到真实 URL、Vercel runtime log 的 `page` 字段、或浏览器 Network 里的请求路径
3. 让用户复述具体操作路径（"我点了 X，然后 Y，然后 Z"）

**how to apply：** 看到"X 页报错"立刻自查：「这个项目里几个页面能配上'X 页'？」**≥ 2 个就必须 verify**。这跟 [[feedback-dump-api-response-before-theorizing]] 同根——证据优先于推测。代价对比：问一句话 vs. 把一整轮 commit/push/部署/验证打在错文件上还要回头返工，前者便宜得离谱。

**附加教训（依赖兼容）：** 本轮真实 bug 是 `isomorphic-dompurify → jsdom → html-encoding-sniffer → @exodus/bytes` 这条 ESM/CJS 互导链在 Vercel lambda 上炸（`ERR_REQUIRE_ESM`），localhost dev 不复现是因为 next dev 用 webpack/turbopack 转译统一了模块系统、prod build 输出原生 CommonJS。**dev 跑通 ≠ prod 跑通**，依赖兼容性问题必须 `next build` + Vercel 真机部署才算验证完。修法：换 `sanitize-html`（纯 Node CJS，无 jsdom）。

## 2026-06-01 · 删 .gitignore 规则前先看磁盘上有没有那个文件（尤其含 secret）

**情境：** 品牌改名 Folio→folion 顺手清理时，我以为 `.folio-apps.json` 是死规则——读 `apps-cache.ts` 看到当前实现是 `InMemoryAppCache`（line 28/44，不落盘），就把它从 `.gitignore` 删了。最后一轮 `git status` 复查时跳出 `?? .folio-apps.json`：文件实存于磁盘（May 19，旧 `FsAppCache` 时代遗留），里头是 neodb.social 的 `client_id` + `client_secret`。删规则 = 让 OAuth secret 进 public repo（`github.com/Drama1991/Folio`）。已恢复规则 + 加注释；`git log --all -- .folio-apps.json` 确认从未提交过，secret 安全、无需轮换。

**事实：** 代码现状（InMemory 不写文件）只决定"以后还会不会生成"，**不决定"现在磁盘上有没有"**。`.gitignore` 的职责是兜住任何匹配该模式的文件——历史遗留的、别的分支生成的、未来 swap 回落盘实现生成的。`apps-cache.ts:42` 注释本就预留 `VercelKvAppCache` / 可插拔 cache，将来换回 FsAppCache 完全可能。

**规则：** **删任何 `.gitignore` 规则前，先 `git check-ignore <pattern>` + `ls` 看磁盘上是否真有匹配文件**。命中 secret 语义文件（`secret`/`token`/`credential`/`client_secret`/`.env`/`*-apps.json`）时**默认保留规则**——保留成本为零，删除成本是 secret 泄漏。"代码不再生成它"不是删忽略规则的充分理由。

**how to apply：** 一冒出"这条 ignore 规则好像没用了"的念头，先 `git check-ignore` + `ls` 确认磁盘现状，文件在就别删。若文件含凭证，再 `git log --all -- <file>` 查是否已泄漏到历史（泄漏过则提示用户轮换 secret）。跟 [[feedback-dump-api-response-before-theorizing]] 同根：以磁盘/git 历史的实证为准，不以"读代码推断它是死的"为准。

## 2026-06-11 · 加分类（枚举值）时，全仓扫描要覆盖"派生词汇"，不只是标识符

**情境：** 启用 game 分类时，我做了三轮全仓扫描：`"podcast"` 字面量、`repeat(5`、`电影.*剧集` 标签连排——自认覆盖了所有硬编码。用户随后发现 timeline 状态筛选 dropdown 的 hint（"看过 · 读过 · 听过"）缺"玩过"。这行文案里**既没有分类标识符也没有数字 5**，三轮 grep 全部漏网。补查后又在 `WishlistContent.tsx:129` 抓到同款漏网（"想看 · 想读 · 想听"）。

**事实：** 一个枚举值（分类）在 codebase 里有两类落点：①**标识符层**——类型、常量数组、Record key、URL 段、CSS 列数，TS strict + grep 标识符能兜住；②**派生词汇层**——由它衍生的 UI 文案：动词（看过/玩过）、提示语 hint、空态描述、骨架屏格数。第②类用自然语言写成，跟标识符零字面重叠，按标识符 grep 必然漏。

**规则：** 扩枚举（加分类/状态/类型）时，检查清单必须含派生词汇维度：每个枚举值有哪些**衍生的中文词**（动词、形容词、举例文案）？用这些词的**已有成员**当 grep 关键词（如搜 `想看|想读|想听` 找出所有动词枚举处），看哪些枚举式文案需要补新成员。同时区分两种文案：**闭集枚举**（` · ` 分隔、意图穷举，如 dropdown hint）必须补全；**举例性散文**（带"任意/…"、本就不穷举，如搜索占位符）刻意保留不动。

**how to apply：** 加完枚举值后，跑两轮 grep：①标识符轮——既有成员的字面量、`repeat(N`、`length: N`；②词汇轮——既有成员的动词/标签（`看过|读过|听过`、`想看|想读|想听`），逐条判断"这是闭集枚举还是举例散文"。骨架屏（loading.tsx）单独过一遍，它最容易跟真实组件脱节。

## 2026-06-15 · 诊断数据到手，先拿它对照"用户期望的正确状态 vs 现状"，别钻枝节现象

**情境：** 用户报"首页音乐/播客 cell 没显示封面，其他 cell 正常，里面是有内容的"。我放 SSR 探针 dump，数据是 `groupSizes: { music:1, podcast:1 }`、封面 URL 有效、category 映射正确。我据此判"数据正常"，转去修"那 1 张真封面被补位占位渐变盖在 z 底层、只露一条边"的渲染问题，改了 `CategoryCells.tsx` 的 z 轴叠放。给用户看，用户怒："我说的是其他 cell 三张，音乐播客没完全显示，为什么不是 3 张，你在改什么？"第二次才定位真因。

**事实：** 探针里 `music:1 / podcast:1` 与"其他 cell 都是 3 张"并列，差距 `1 vs 3` 本身就是根因指针。真因是分页——`home/page.tsx` 首页只拉每个 shelf 第一页（共 56 条），音乐/播客被大量电影/剧集挤出"最近一页"窗口，各只剩 1 条，凑不出 3 张。**这恰是我一开始就列出的三个候选根因（映射 undefined / cover null / 分页）里的第三个**，dump 排除了前两个，逻辑上该直接落到分页，我却被 dump 里"那 1 张有效封面"的细节吸引、跑去渲染层，把候选清单丢了。z-index 那个改动本身没错，但它解决的是次要现象，文不对题。

**规则：** 拿到诊断数据（dump / 探针 / log）后，**第一动作是用它回答"用户期望的正确状态 vs 当前状态，差距在哪"**，不是解释数据里某个抓眼球的局部现象。报"显示不完整 / 不正常"的 bug，先用**同类正常项**锚定"完整"的定义（这里其他 cell = 3 张 → 完整 = 3 张），再让数据对照这个定义量化差距（数量 1 ≠ 3）。差距指向的根因（数据量不足 → 分页）优先于局部现象（单张 z 序）。**若自己一开始已列出候选根因清单，dump 排除一部分后要显式回到清单、落到剩下那个**，别让 dump 里的细节把你带去清单外的新方向。"数据本身没错"绝不等于"可以转去改渲染/样式"——先确认没错的数据**量够不够**支撑用户要的结果。

**how to apply：** 诊断数据到手先跑三连：①用户期望的正确状态是什么（拿同类正常项锚定）？②现状和它差在哪（量化：3 vs 1）？③这个差距对应我之前列的哪个候选根因？——答完再决定改什么。跟 [[feedback-dump-api-response-before-theorizing]]、[[feedback-ambiguous-page-term-verify]] 同根：证据要用来逼近根因，不是用来解释枝节。

**附加（语义一致性）：** 首页缩影（封面墙 / 概览）与详情 / 列表页展示**同一概念**时，数据口径（状态过滤、排序）必须一致。本例首页封面墙按"跨状态标记顺序"拉，archive 默认按"complete + 时间"，导致首页一个样、点进去另一个样——所有 cell 都错位，只是音乐/播客数量少才把它暴露出来。改同类展示前，先对齐两处的数据口径（最终修法：6 个 cell 统一拉 `listShelf({type:"complete", category, page:1})` 取前 3，对齐 archive 默认视图）。


