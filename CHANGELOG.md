# 变更记录

本文件记录墨枢的功能变更。日期为迭代日期，按时间倒序。

## 未发布

### 代码架构重组（前端三层 / 后端分层）

- 前端收敛为 `ui → data → domain` 三层：顶层模块迁入 `frontend/src/domain/`、`data/`、`components/`；新增 `data/storage.ts` 统一 `moshu.*` 存储键
- 主台按职责拆分：`pages/studio/studio-utils.ts`（纯函数/常量）、五个 hooks（`useStudioUi`/`useStudioDocument`/`useStudioScan`/`useStudioAssets`/`useStudioPipeline`）、派生单源 `derive.ts`、纯工厂 `canvas-act.tsx` / `file-acts.ts`、`useStudioPage.ts`；视图组件拆到 `pages/studio/views/{StudioToc,StudioCanvas,StudioInspector,StudioModals,AssetCard}.tsx`，`Studio.tsx` 由 1031 行收敛到 333 行
- 样式拆分：`frontend/src/styles.css`（3602 行）拆为 `styles/00-tokens`…`16-prompt-preview` 共 17 个文件 + `styles/index.css` 作为唯一入口；补齐 `--fg`/`--accent`/`--bg-soft`/`--dim` 变量；新增 `scripts/css-order-test.mjs` 与基线 `scripts/fixtures/styles-baseline.css` 守住按入口顺序拼接的层叠结果不变
- 后端分层：`index.js` 由 1131 行收敛到 78 行（env → 中间件 → 8 个 router 挂载 → 静态/SPA → 404 → 错误中间件 → listen）；新增 `http/{async-handler,sse,text}.js`、`middleware/auth.js`、`routes/*.js`（8 个，≤300 行）与 `services/*.js`（9 个，含生成 / 拆书生成 / 导入 / 提示词 / 抽卡 / 文风 / 校对 / 设置）
- `backend/src/skills.js`（1444 行）拆为 `skills/{core,history,io,order,factory,craft,author,index}.js` 八个模块（≤400 行），`index.js` 为唯一对外 barrel，导出与旧模块一致；依赖方向 `core → history → io → order`、`factory`、`craft`、`author`，无环
- 契约与守卫：新增 `scripts/api-contract-test.js`（73 路由）、`scripts/deps-lock-test.js`、`scripts/architecture-test.mjs`（行数预算 / 层方向 / 存储键收敛 / 映射单源）；`frontend/src/pages/studio/studio-tabs.ts` 由 `domain/pipeline` 派生 `TABS`/`RAIL_EXTRAS`，架构守卫零违规
- 回归：`api-contract` 73/73、`pipeline` 34/34、`apply` 16/16、`spark-deck` 26/26、`llm-mock` 68/68、`css-order` 全通过、`stage-flow` 29/29、`tsc` 0、`vite build` 成功（CSS 65.11 kB）；jsdom harness 九页 0 错误且页面根节点长度与重组前逐字节一致

### 主台升级（双栏持久工作台）

- 主台改为「阶段轨 + 画布」双栏：左栏常驻阶段轨按四组（立项 / 设定 / 大纲 / 正文审校）列出写作线全部阶段与状态点，右栏画布随选中阶段切换；移除水平 `DESKS` 标签行，导航由阶段轨承担，大纲板作为「大纲」组额外入口保留
- 阶段轨分组定义在 `frontend/src/pipeline.ts` 的 `WRITING_GROUPS`，模块加载时校验写作线阶段无遗漏、无越线；新增 `stagesOfGroup`/`panelOfStage`，变体阶段（润色 / 续写 / 审稿 / 卡壳建议）统一映射到正文面板，伏笔映射到伏笔面板
- 画布顶部改为「选中阶段动作卡」（复用抽出的 `StageCard`）+ 进度条；`activeStageId` 取运行阶段优先、其次用户选中，并用 `[desk, tab]` 同步钩子反推，保证点章节 / 点阶段 / 运行三路径一致
- 新增 `frontend/src/components/StageRail.tsx`；`StageFlow.tsx` 抽出具名 `StageCard` 与 `STATUS_LABEL`/`ACTION_LABEL`
- 布局：四栏网格（目录 / 阶段轨 / 画布 / 检查器），支持 `wide` / `zen` / `rail-off` 变体、`1180–961px` 收起常驻轨、移动端新增「阶段」页签全屏抽屉；阶段轨收起状态存 `localStorage: moshu.railCollapsed`
- `scripts/stage-flow-test.mjs` 增补阶段轨分组与 `panelOfStage` 断言，29/29 通过
- 阶段轨深化：分组可折叠并显示完成计数（`localStorage: moshu.railFolded`）；当前运行阶段在轨上直接显示百分比进度；`Alt+↑/↓` 在写作线阶段间切换并打开对应面板，`Cmd/Ctrl+Enter` 运行/重跑选中阶段（输入框内不拦截回车）；画布显示「下一步：阶段 · 提示」引导
- 阶段轨顶部新增搜索框：按阶段名与额外入口名过滤，搜索期间自动展开全部命中分组，无命中显示空态；运行中阶段的轨上指示由百分比文本改为细进度条（`.stage-rail-bar`，宽度随进度变化）
- 画布动作卡支持内联展开产出全文：切换「展开产出 / 收起产出」直接显示该项产出并可就地编辑，保存按阶段 `scope + field` 走 `patchChapterById` / `patchNovel`，提供还原与字数提示，无需跳转侧栏面板；展开状态按阶段 id 记忆，切换阶段自动收起
- 修正主台 hooks 顺序：`stageNavRef` 刷新与全局快捷键两处 `useEffect` 上移至 `!novel || !chapter` 提前返回之前，消除提前返回导致的 hooks 数量不一致风险
- 手机端适配：手机点阶段后自动切到「主台」页签（此前点阶段只更新画布、画面看似无变化）；阶段轨搜索框改为吸附顶部、输入字号 16px 防止 iOS 聚焦缩放，分组标题 / 阶段项最小高度提升到 40 / 44px 并加大清除按钮，底部留安全区；画布内联产出编辑在手机上放大到 40–60vh、去手动 resize，保存 / 还原与主操作按钮改为触屏友好高度并允许换行；移动端隐藏无意义的「收起阶段」开关，页签栏吸附顶部
- 修复白屏：章节切换时的 `readerShellRef.current.scrollTo` 在缺少 `Element.scrollTo` 的移动端 / 旧 WebView 上抛 `TypeError`，又因没有错误边界导致 React 卸载整棵树而整页空白；改为 `scrollTo?.(...)` / `scrollIntoView?.(...)` 可选调用（`Studio.tsx`、`TeardownDesk.tsx`、`components/StageFlow.tsx`），并给词库复制加 `navigator.clipboard` 兜底
- 新增 `frontend/src/ErrorBoundary.tsx` 并在 `main.tsx` 最外层包裹：未捕获错误改为显示错误信息与「重新加载 / 返回首页」，不再白屏；排查记录见 `.monkeycode/reports/white-screen-2026-09-20.md`

### 正文读写框架排版

- 正文读写区加纸张化容器：阅读态与编辑态统一包在 `.reader-paper`（浅色 `#fdfaf2` 纸色 + 细边框 + 圆角 + 柔和投影 + 上下留白），夜间态 `.reader-shell.night .reader-paper` 切换为深纸色；阅读态与编辑态由 `.reader-edit-page` 区分
- `.reader-shell` 重做：径向渐变纸感背景 + 顶部吸附工具栏 `backdrop-filter` 模糊 + 最小高度 `calc(100dvh - 230px)`，滚动区与工具栏层次分离
- `.reader-bar` 改为可换行工具栏（`flex-wrap` + `sticky`），`.reader-modes` 阅读 / 编辑切换做成圆角分组；`.reader-title-input` 改为居中无边框下划线标题，字号随正文字号缩放
- `.ms.reader-edit` 编辑区去边框、继承纸面排版（行高 2 / 字距 0.06em），最小高度 `min(60vh, 820px)`、可纵向拉伸；手机端（`max-width: 960px`）纸面改为自适应留白与圆角
- 回归：`tsc --noEmit` 0、`vite build` 成功；jsdom harness 在移除 `scrollTo` polyfill 的环境下分别验证阅读态与编辑态，均 0 运行时错误

### 主台流程重设计（纵向阶段卡片流）

- 主台写作线改为纵向阶段卡片流：每个阶段一张卡，展示状态（未开始 / 进行中 / 已完成 / 失败 / 已跳过）、产出摘要、前置依赖（是否满足）、关联资产（人物 / 道具 / 伏笔 / 细节拍）与操作按钮（开始 / 重跑 / 跳过 / 查看 / 编辑）；当前阶段自动滚入视口。卡片模型由新模块 `frontend/src/stage-flow.ts` 从 `shared/pipeline.json` + 小说数据纯函数推导，`frontend/src/components/StageFlow.tsx` 只负责渲染
- `shared/pipeline.json` 升级到 schema v2：阶段新增 `scope`（novel/chapter/teardown）、`field`（产出落点）、`mode`（replace/append）、`deps`（前置阶段）、`refs`（关联资产类型）、`editable`、`variant`（同 target 变体标记）；新增 `version: 2`
- 修复 P0-1：`suggest`（卡壳建议）与 `review`（章节审稿）分字段，建议落 `chapter.advice`，不再覆盖 `reviewReport`；后端 `POST /api/projects/:id/generate` 去掉对 `suggest` 的 `skipApply`
- 修复 P0-2：`chapter-prose` 固定整章替换，`continue` 固定续写追加；前后端统一读阶段定义的 `mode`（前端 `modeFor()` 走 `stageOf(skill).mode`）
- 修复 P0-3：拆书线 `td-imitate`（仿写骨架）与 `td-craft`（提炼技法）target 解耦，分别落 `imitate` 与 `recipes`；`pipeline.js` 启动校验同一台内 target 重复（`variant` 例外），防止回归
- 修复 P2-9：`continue` 阶段补 `artifact: content`
- 收敛单一数据源：`backend/src/teardown.js` 的 `TAB_FIELDS` / `SKILL_FIELD`、`backend/src/skills.js` 的写作类清单、前端 `teardown-run.ts` 的 `TEAR_TABS` 全部改为从 `pipeline` 派生；删除 `frontend/src/pipeline.ts` 中不再使用的 `STEPS` / `QUICK_STAGES`
- 对齐文档与顺序：`skills/builtin/kickoff.md` 自动流程补「道具」阶段；内置 Skill frontmatter `order` 与流水线顺序一致（人物 2 / 世界 3 / 道具 9 / 审稿 10 / 仿写 57 / 提炼 58）
- 新增 `scripts/apply-test.js`：覆盖建议与审稿分字段、整章替换、续写追加、拆书字段解耦、阶段 mode/field 派生，16 项全通过
- 拆书台（TeardownDesk）接入同一阶段卡片流：移除原水平 `tear-tabs`（含 `TabIcon` / `tabCount`），卡片操作映射到 `runTeardownTab` / `runTeardownCraft`；`buildStageFlow` 新增 `record` 数据源与 `filled` 覆盖，拆书 `beats` 等特殊填充判定复用 `skillFilled`
- 新增 `scripts/stage-flow-test.mjs`：用 esbuild 打包 TS 后在 Node 断言，25 项覆盖状态推导、active/failed/skipped 优先级（failed > done，本次重跑失败盖过旧产出）、依赖满足、refs 计数与拆书线
- 跳过状态持久化：主台按阶段 `scope` 写入 `moshu.skip.novel.{novelId}` / `moshu.skip.chapter.{novelId}.{chapterId}`，拆书写 `moshu.tdskip.{teardownId}`，章节切换重载、重新运行阶段时清除
- 侧栏新增「卡壳建议」独立视图（`sideKind="advice"`）：顶部动作区入口（有建议直接打开，无建议调 `suggest`），面板内可编辑并保存到 `chapter.advice`，也可一键重新生成；章节加载时审稿优先、建议次之
- 清理遗留 `step`/`setStep` 会话状态与未使用的 `.pipe` / `.pipe-step*` / `.pipe-line*` / `.pipe-item` 样式；移动端（`max-width: 860px`）放宽卡片流高度、调整卡片内边距与操作按钮换行

### Skill 流水线重构

- 新增 `shared/pipeline.json` 作为流水线唯一数据源：写作线 12 阶段 + 拆书线 9 阶段，每阶段声明 `target`/`builtin`/`inject`/`artifact`/`tab`/`craftSlot`/`auto`/`quick`/`size`/`expectMs`/`ui`；后端经 `backend/src/pipeline.js` 读取（启动校验缺字段直接报错），前端经 Vite `@shared` 别名直接 import，无需复制常量
- 收敛五处散落硬编码：`skills.js` 的 `TARGETS`/`WRITING_INJECT`/`CRAFT_SLOTS`、`prompt.js` 的 `DROP_ORDER`/`isWritingSkill`、`context.js` 的资产块顺序与独立 `isWritingSkill`
- 排序改为两级模型：阶段顺序由定义固定，阶段内按 `[sourceRank（内置 0 / 自定义 1）, order, id]`；`order` 只决定列表展示与技法注入顺序，`context.js` 叙事块语义不变
- 新增 `POST /api/skills/:id/move`：支持 `direction` 或 `beforeId`/`afterId`，单请求原子完成；用中点插值插位，空隙小于 `1e-4` 自动按 `100` 步长重分配，写盘失败按快照回滚；Skill 列表页的上下移动改调该接口
- 拆书线纳入同一模型（按台过滤显示）；自定义 Skill 只参与排序，不进自动开书流水线；新增 `GET /api/pipeline` 供观测
- 内置 Skill 文件名去掉 `NN-` 数字前缀，消除「文件名序号 vs 阶段顺序」的第二数据源
- 新增 `scripts/pipeline-test.js`：断言派生集合与迁移前常量等价、阶段归位、排序、中点插值与压缩，34 项全通过

### 脑洞二次抽卡

- 首页「脑洞开新书」的抽卡改为「模型基于作者脑洞派生三张方案」：作者先写一句脑洞或创意（Seed），选「男频 / 女频 / 通用」频道后点「抽三个脑洞」，后端调用一次模型返回恰好三张完整方案卡（一句核 + 核心冲突 + 金手指或身份抓手 + 2-4 条细节种子 + 类型标签），前端横向并列展示，三选一
- 「用这张」把选中方案合成多行中文覆盖写入「脑洞与细节」输入框，并把方案标签自动并入 genres 偏好（只增不减）；「换一批」重抽；Seed 为空时拒绝发起抽卡并给出提示
- 新增 `backend/src/spark-deck.js`：加载示例库并提供 `examplesFor(channel, count)`，本频道优先；`backend/src/skills.js` 新增 `sparkDrawMessages`（要求模型只输出 3 个对象的 JSON 数组，并嵌入 2 条按频道选取的示例）与 `parseSparkCards`（剥离围栏、兼容裸数组与 `{cards:[...]}`、逐项校验、最多 3 张、非法输入抛 502）
- 新增 `POST /api/projects/spark/draw`：校验 Seed 非空（空则 400），`channel` 非法回落 `common`，`temperature 0.95`、`timeout 120000`，返回 `{cards}`
- 原离线卡库 `frontend/src/spark-deck.json` 移入 `shared/spark-deck.json`（28 张：11 男频 + 11 女频 + 6 通用），降级为提示词 few-shot 示例来源；`frontend/src/spark-deck.ts` 收敛为 `SPARK_CHANNELS` + `composeSpark`，类型移入 `frontend/src/types.ts`
- 新增 `drawSpark` 前端 API 与 3 卡并列 / 选中态样式；抽卡进行中禁用频道切换与开书
- 抽卡交互补齐为一整套：抽卡成功与切换选中方案都会自动把该方案**全部标签**并入 genres 偏好（只增不减），方案卡上的标签仍可逐个点选取消 / 加入，并有「采纳标签」（只并入当前方案全部标签）与「用这张并开书」（以刚采纳的脑洞与偏好直接开书，不受界面状态回写影响）；标签比较前统一折叠空白并 trim，避免同一标签因空格差异重复或显示为未选中；方案卡改为可聚焦容器，标签为独立按钮，避免按钮嵌套
- 抽卡提示词升级为「大开脑洞」：三张方案必须分属三个不同题材，世界观、金手指类型、冲突层级明显分岔，优先高概念、强反差、规则型设定与跨题材混搭（如种田 + 克苏鲁、谍战 + 穿书）；`hook` 要求 25-60 字且结尾带反转，`tags` 1-3 个题材标签，调用温度由 0.95 提到 1.05 以拉开走向
- 新增 `shared/spark-dims.json` 作为 11 个偏好维度的唯一数据源（前端 `spark.ts` 经 `@shared` 读取，后端 `backend/src/spark-dims.js` 读取），卡片新增 `picks`：模型按维度给出建议（可多选 1-3、单选 1），取值经白名单 `normalizePicks` 过滤；抽卡 / 切换方案 / 用这张时按维度自动并入偏好
- 偏好板可多选维度统一封顶 3 个（`SPARK_MULTI_LIMIT`）：选满后禁用其余未选项、自定义输入与「加入」按钮，并显示「已选 x/3」；单选维度保持单选且自定义输入自动替换；提示词要求 picks 与作者已选维度保持一致；`scripts/spark-deck-test.js` 扩到 26 项断言（含 picks 白名单、多选上限 3、单选上限 1、标签上限 3）

### 部署

- 后端支持托管前端构建产物，生产环境单端口（`8787`）同时提供页面与 API
- 新增多阶段 `Dockerfile`、`docker-compose.yml` 与 `.dockerignore`，数据通过卷持久化
- 新增 `start-prod.sh`（无 Docker 直连部署）与 `deploy/`（systemd 单元、nginx 示例、生产 env 示例）
- 新增 `DEPLOYMENT.md` 完整部署指南
- 修复 `Dockerfile` 未打包 `skills/builtin` 的问题：此前容器镜像缺少内置 Skill，生成时无可用 Skill
- 后端启动时自检 `skills/builtin`，缺失打印告警；启动即创建 `data/`
- 部署文档补充「获取代码」步骤：本地搭建同样需要先从 Git 仓库克隆代码与内置 Skill
- `DEPLOYMENT.md` 重写为零基础版：安装工具、下载代码、配置模型、首次使用、局域网访问、排错大全逐步说明；README 增加指引
- 新增 `backend/src/env.js`：优先调用 Node 内置 `process.loadEnvFile`（20.6+），低版本回退到内置解析器；后端启动自动读取项目根目录 `.env`，已有环境变量优先；`.dockerignore` 排除 `.env` 防止密钥进镜像
- 新增 `scripts/setup.sh`（一键装依赖并构建）、`scripts/serve.sh`（pidfile 管理启停，避免 pkill 误杀）、`scripts/check-model.js`（核对配置的模型名是否真实存在）；文档改用脚本并补充模型自检步骤
- 新增可选访问密码 `ACCESS_PASSWORD`：设置后除 `/api/health` 外所有接口都需要验证，登录状态用 HttpOnly Cookie 保存（也可用 `x-access-password` 请求头）；留空即不启用鉴权。`.env.example`、Docker Compose 与部署文档同步说明
- 修正默认模型名为接口实际提供的 `deepseek-flash`（原 `deepseek-v4-flash` 已不在 `/models` 列表中）
- 重构 `README.md` 与 `DEPLOYMENT.md`：新增顶部文档导航、独立的「系统要求」块、部署方式总览表、项目结构树；部署方式统一为「方式一 · 本机 / 方式二 · Docker Compose / 方式三 · Docker 单容器 / 方式四 · systemd」
- Docker 构建支持自定义基础镜像：`Dockerfile` 引入 `ARG NODE_IMAGE` 并移除 `# syntax` 指令，`docker-compose.yml` 透传 `NODE_IMAGE`；本地已有 `node:20-alpine` 时构建不再联网拉取，文档补充离线 / 内网构建与 `docker load` 做法
- README 新增「使用方法」：启停 / 自检命令表与界面操作对照表，逐页细节指向 `USER_GUIDE.md`
- 完善搭建教程：补充 nvm / nvm-windows 安装 Node 20、网络受限时的镜像与代理配置、安装完成自检清单、换机迁移与卸载重置、Windows 任务计划程序与 macOS launchd 开机自启，并扩充排错表
- 完善 Docker 部署教程：`DEPLOYMENT.md` 第四节重写为「直接 clone / 加速前缀 / 下载 ZIP + 拉库失败排查表」，第六节新增 compose 校验与构建失败定位（含 CentOS SELinux 权限坑），第十二节排错表补充 Docker 高频问题；`docker-compose.yml` 端口参数化（`.env` 的 `PORT` 同时控制映射与容器端口）、镜像支持 `MOSHU_TAG` 版本标签、移除重复的 compose healthcheck（改为继承 Dockerfile）；README 方式二 / 方式三补充改端口说明、PowerShell 写法与容器清理命令
- 新增 `.github/workflows/docker.yml`：main 分支 push 或打 `v*` 标签时自动构建并推送镜像到 GHCR（`ghcr.io/<owner>/moshu`）；README「部署方式」新增「方式零 · 预构建镜像」，只装 Docker 即可一条命令运行
- 重排 `README.md` 为 UI 版首页：居中 Hero 与 8 枚 shields.io 徽章、10 项能力双列卡片、页面速览、9 家供应商参数表、使用方法、部署方式矩阵、环境变量表；项目结构与数据位置改为可折叠 `<details>`；新增 `docs/architecture.svg` 系统架构示意图（用户层 → Express 服务层 → 模型层 → `data/` 数据层 + 七步写作流水线）

### 模型调用健壮性

- 四类协议（OpenAI 兼容 / Anthropic / Ollama / Gemini）逐套打通并加回归测试：
  - Gemini 的 Base URL 缺版本段时自动补 `/v1beta`（此前填裸域名会拼出错误路径）
  - 上游把错误塞在 HTTP 200 响应体里（Anthropic 的 `error` 事件、Ollama 的 `{"error":...}`、Gemini 的安全拦截）现在会被识别成可读报错，不再表现为"生成出空内容"
  - 思考片段不再混进正文：Anthropic 的 `thinking_delta`、Gemini 2.5 的 `part.thought` 只算作"有输出"
  - Anthropic 支持「思考」开关（自动带 `thinking` 预算并让 `temperature` 保持默认值）；只有 Gemini 2.5 系模型才下发 `thinkingConfig`
  - Ollama 的 `num_ctx` 压到 32768，避免把 `contextLength` 默认值 200000 直接交给本地模型吃光显存
  - Gemini 未走 `alt=sse`、把分块结果装在数组里返回时也能正确拼装
- 新增 `scripts/llm-mock-test.js`：本地 mock 上游驱动四类协议的真实代码路径，覆盖流式拼装、整体返回、拒绝流式退回、超时、断流、模型列表、错误文案与密钥不外泄，50 项断言全通过；`README.md` 与 `DEPLOYMENT.md` 同步
- `backend/src/llm.js` 重构流式调用：区分「连上了但没吐字节」与「吐了正文后中途断流」；首字（`LLM_FIRST_TOKEN_MS`）与空闲（`LLM_IDLE_MS`）时限改由环境变量控制，探测时限用 `LLM_PROBE_MS`，不再散落在调用处硬编码
- 首次请求长时间收不到任何内容时，自动退回一次非流式请求；上游拒绝流式、或把 SSE 塞进 `application/json` 响应体时同样能取到正文
- 中途断流不再被当成生成成功：已生成内容照常保存并标记为 `incomplete`，前端提示「生成中断，已保留 N 字」，续写可接上（此前会静默截断，或整段丢弃）
- 错误文案带上端点与模型名（不含 API Key），并补齐 `402` 额度不足、`404` 路径不对、`405/501` 能力不存在、模型名不存在等可读提示
- `GET /models` 不被中转站支持时返回专用错误码，`scripts/check-model.js` 自动改用一次对话请求验证配置
- `.env.example`、`deploy/moshu.env.example` 与 `DEPLOYMENT.md` 同步新增超时变量、中转站 / 自建反代的配置要求与排错条目

### 模型可用性点亮

- 新增 `POST /api/settings/probe`：对单个模型发一条最小对话请求，返回是否可用、延时毫秒与失败原因；`testChat` 与探测共用 `llm.probeModel()` 同一实现
- 设置页模型列表与顶栏模型菜单显示可用性状态点：绿色=可用、红色=不可用（悬停看原因）、灰色空心=未测，并显示最近一次延时；探测失败时给出具体原因（额度、模型名、超时、安全拦截等）
- 支持「探测」逐条测与「全部探测」整组测（并发 2、显示进度、可停止）；结果缓存到 `data/settings.json`，刷新页面后仍在，默认 12 小时后过期，可用 `MODEL_PROBE_TTL_MS` 调整
- 客户端保存设置时保留服务端探测缓存；模型被移出候选列表后其探测记录同步清理

### 去 AI 检测升级

- AI 率新增 8 个叙事级维度：机制说明句、机械伏笔、爽点因果过拟合、视角滑移、信息倾倒、对白说明化、动作道具功能化、情绪直陈；按命中密度计分并计入总分，报告显示命中处数
- 突发性升级：句长过匀在原「连续 3 句接近 + 标准差小」基础上，加入相邻句长落差、段长过匀与短句成串（连续 4 句以上都在 12 字内）
- `POST /api/projects/:id/scan` 与 `/proof` 返回叙事级命中的字符位置（`kind=ai`），前端正文可高亮；报告粒度保持整章一个分数 + 位置标注
- 章节正文、文风润色、章节审稿 Skill 与写作提示词新增「叙事流畅七查」：视角锚跳切、机制句、设定堆砌、说明书对白、句长过匀、无后果动作或道具钩子、情绪直陈；命中即降档并进改稿清单

### 数据加固

- 新增 `backend/src/schema.js`：为小说、拆书、设置、文风、元素引入 `schemaVersion` 与迁移链，旧工程首次打开自动升级并补 `rev`，迁移前留快照到 `data/novels/backups/`
- 小说引入乐观锁：`saveNovel(novel, { expectedRev })` 版本不符返回 409，两份内容落 `data/conflicts/`；`PUT /api/projects/:id` 透传 `rev`
- 生成接口在保存后补发 `{ type: "saved", rev }` 事件，前端据此同步本地版本，避免误报冲突
- 拆书、文风、元素的读写接入统一迁移标记与原子写

## 2026-09-13

### 提示词组装引擎

- 新增 `backend/src/prompt.js`：`buildPrompt()` 统一拼装 system / user，输出分段、token 统计、超预算告警
- `/api/generate` 切换到统一引擎；新增 `POST /api/prompt/preview`（不调模型）
- token 预算默认 40000，超预算按优先级省略注入区
- 前端新增提示词预览组件，接入资产页与稿本工作台

### 模型错误重试

- 新增错误分类：鉴权、限流、超时、过载、安全、请求错误、流式不支持、未知
- 仅对限流、服务端错误、网络错误在首包前指数退避重试，可配次数与退避上限
- 重试参数进入设置页，也可用环境变量覆盖

### 原子写统一

- 新增 `backend/src/fileio.js`：临时文件 + rename，支持备份与保留份数
- 设置、文风、元素接入原子写与备份

## 2026-09-12

### Skill 四层升级

- 运行时基线 `baseline.js` 与 `BASELINE_VERSION`
- 条件注入：按 `tags` / `whenFlow` / `whenPlatform` / `whenVoice` 触发
- Markdown 单份导入导出
- 历史行级 diff 与回退
- 审稿增加「错别字与用字」检查节
- 内置 Skill 内容层保守去重

## 2026-09-11

- 标准化报错处理流程：先记录、再修复、二次复查闭环
- 字体零容忍规则落地到审稿与校对
- 类型引擎、平台规则、人类特征、去 AI、仿写骨架全链路对齐

## 2026-09-09

- 新增拆书能力：书源导入、按章切片、章纲 / 角色 / 黄金三章 / 事件 / 大纲 / 细纲 / 技法 / 仿写骨架
- 拆书与稿本分库

## 2026-09-08

- 新增章节审稿：番茄标尺下的钩子、爽点密度、人设反差、合规与可执行改稿

## 2026-09-03

- 新增校对与情绪衔接能力
- 稿本工作台形成目录 / 稿纸 / 手艺三栏结构

## 更早

- 墨枢基础版本：单机稿本管理、流式生成、内置写作 Skill、模型设置
