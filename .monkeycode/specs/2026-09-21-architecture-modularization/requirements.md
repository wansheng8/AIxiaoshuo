# 代码架构重组 — 需求文档

- 特性编号：2026-09-21-architecture-modularization
- 状态：已完成（2026-09-22 验收）
- 关联文档：`2026-09-18-skill-pipeline`、`2026-09-18-studio-flow-redesign`、`2026-09-19-studio-workbench`

## 1. 背景

墨枢的功能已覆盖开书、设定、大纲、正文、审校、拆书、文风、资产等完整链路，能力面在上一轮主台重设计后趋于稳定。功能增长集中堆进了少数几个文件，结构开始拦住下一轮开发：

- `frontend/src/pages/Studio.tsx` 4570 行、56 个 `useState`、24 个 `useEffect`，把稿本数据、流水线运行、正文读写、资产编辑、扫描审稿、历史与预览、移动端布局全部装在一个组件里；
- `frontend/src/styles.css` 3602 行、799 个选择器块，无 token 分层、无分区注释，响应式规则分散在 5 个媒体块、3 个断点；
- `backend/src/index.js` 1127 行、74 条路由全部内联，路由、业务编排、LLM 调用、存储读写混在一起；
- `backend/src/skills.js` 1444 行，覆盖 CRUD、历史、排序、导入导出、提示词、Spark、工厂覆盖、正文变换八类职责；
- 流水线阶段到界面面板的映射分散在 `shared/pipeline.json`、`frontend/src/pipeline.ts`、`Studio.tsx` 的 `TABS`/`RAIL_EXTRAS`、`teardown-run.ts` 四处。

本轮只做**内部结构重组**：把职责归位、把映射收成单源、把巨型文件拆成有边界的小模块，用户可见行为、接口契约、数据格式、外部依赖全部保持不变。

## 2. 术语

- **层（Layer）**：前端依赖方向为 `ui → data → domain`；后端为 `routes → services → repositories/domain`。上层可依赖下层，下层不得反向依赖上层。
- **domain 模块**：纯类型与纯逻辑模块，不导入 React、不触碰 DOM、不发网络请求。
- **data 模块**：请求封装（`api.ts`）、客户端存储（`storage.ts`）、进程级状态仓库（`jobs.ts`）。
- **ui 模块**：页面、组件、样式。
- **状态归属（State Ownership）**：每个 `useState` 由一个明确的 hook 或组件持有，其他模块只能通过显式入参或返回值访问。
- **命令式接线（Imperative Wiring）**：每帧刷新 ref 的赋值，例如 `saveRef.current = save`。
- **契约快照（Contract Snapshot）**：对路由清单、存储键、CSS 拼接结果等可机械比对的事实记录基线，供守卫测试比对。

## 3. 需求

### 3.1 前端巨型组件拆分

**R1** 系统应把 `frontend/src/pages/Studio.tsx` 拆分为一个编排层组件与一组按职责划分的模块，编排层保留路由接线、hooks 组合与布局骨架。

**R2** 拆分后 `Studio.tsx` 行数应不超过 400 行。

**R3** 系统应把 `Studio.tsx` 中的纯函数与常量（章名解析、beat/card/prop 解析、数字转换、`readJson`、「短」字快捷键判定等）迁入独立模块，该模块不得导入 React。

**R4** 系统应把 `Studio.tsx` 中的展示组件（`IssueList`、`AigcCard`、`InsFold`、`ConfigBanner`、`assetCard` 渲染）迁入独立组件文件，组件通过 props 接收数据与回调。

**R5** 系统应把稿本数据与保存职责（novel/chapter/skills 加载、`patchNovel`、`updateChapter`、`patchChapterById`、`patchCraft`、`patchLexicon`、`patchThread`、`save`、`mustRefresh`/冲突处理、`pushUndo`/`undoLast`）收进一个文档 hook。

**R6** 系统应把流水线运行职责（`runSkill`、`cleanCopyPass`、`enforceChapterWordMax`、`fillSlot`、`runNextPipe`、`continueAutoPipe`、`startAutoPipe`、`pauseAutoPipe`、`resumeAutoPipe`、`skipStep`、`rerunStep`、`retryFailed`、`onStageAction`、`pipeControls`）收进一个流水线 hook。

**R7** 系统应把扫描与审校职责（issues/aigc 状态、`scanNow`、`jumpIssue`、`applyIssue`、`locateOriginal`、`replaceOriginal`、`applyPolish`、`applyEmotion`）收进一个扫描 hook。

**R8** 系统应把资产编辑职责（`folds`、`allSkills`、词库、人物/场景/道具卡增删改、历史恢复、头像上传、仿写分析/合并/对比）收进一个资产 hook。

**R9** 系统应把界面布局职责（`tab`、`desk`、`mobile`、`split`、`railCollapsed`、`railFoldedGroups`、`paletteOpen`、`previewOpen`、`focusOpenFor`、`nameHint` 等）收进一个界面 hook。

**R10** 系统应把画布、检查器、目录、弹层四块 JSX 迁入独立组件文件，各组件通过显式 props 接收数据与回调。

**R11** 当拆分 hooks 时，系统应保证全部 hook 调用在任何提前返回与条件渲染之前无条件执行。

**R12** 当拆分 hooks 时，系统应保证每帧刷新的命令式接线（`novelRef`、`busyRef`、`dirtyRef`、`idRef`、`undoStackRef`、`saveRef`、`continueAutoPipeRef`、`stageNavRef`）继续每帧刷新。

### 3.2 前端状态分层与数据流

**R13** 系统应保证前端依赖方向为 `ui → data → domain`，且不存在反向导入。

**R14** 系统应把 `jobs.ts` 这类进程级状态仓库归入 data 层，页面只通过其导出函数访问。

**R15** 系统应在 data 层提供统一的客户端存储模块，集中定义全部 `moshu.*` 键名与读写封装，页面不得直接书写 `localStorage` 字符串键。

**R16** 系统应保持 `app-state.tsx` 的对外字段（`info`、`configured`、`fileActions`、`zen`、`failCount`、`doneCount`）与调用方语义不变。

### 3.3 前端样式拆分

**R17** 系统应把 `frontend/src/styles.css` 按选择器族拆分为多个样式文件，并保留单一入口。

**R18** 系统应保证样式文件按入口声明顺序拼接后的规则序列与原文件一致，除本次明确修复的缺陷外不得改变层叠结果。

**R19** 系统应在拆分后的 token 文件中提供当前缺失的变量定义（`--fg`、`--accent`、`--bg-soft`、`--dim`），或把引用统一改到已定义变量。

**R20** 系统应把游离在媒体查询之外的 `.trio` 规则归位到 `max-width: 960px` 媒体块，并修复 `styles.css` 中单行双规则与异常缩进。

**R21** 系统应保证任意单个样式文件不超过 500 行。

### 3.4 流水线界面映射单源

**R22** 系统应把「阶段 → 工作面（desk/tab）」与「阶段分组」的映射集中到 `frontend/src/pipeline.ts`（或同层单一模块），`Studio.tsx` 与 `teardown-run.ts` 只消费该模块。

**R23** 系统应保证界面映射模块在模块加载期校验写作线阶段无遗漏、无重复、无越线，校验失败时抛出可读错误。

**R24** 系统应保证 `shared/pipeline.json` 的阶段定义、字段语义与落盘行为不变。

### 3.5 后端路由拆分

**R25** 系统应把 `backend/src/index.js` 中的路由按域拆分到 `backend/src/routes/`，`index.js` 只保留中间件装配、路由挂载、静态兜底、404 与错误处理、启动逻辑。

**R26** 拆分后 `index.js` 行数应不超过 200 行，单个路由文件不超过 300 行。

**R27** 系统应提供统一的异步处理器包装与 `ApiError`，替换各路由中重复的 `try/catch + res.status(...).json({error})` 样板。

**R28** 系统应保留每个接口现有的响应形态，包括 `{ok:false}`、`{error, code}`、409 冲突的 `{error, conflict, currentRev}` 等特例。

**R29** 系统应保留 `/api` 鉴权中间件的挂载范围与放行名单（`/api/login`、`/api/health` 放行），拆分后不得出现鉴权覆盖缺口。

### 3.6 后端服务层

**R30** 系统应把路由中的业务编排迁入 `backend/src/services/`，至少覆盖：手稿导入、Spark 抽卡与偏好合并、扫描与校对、项目更新与冲突处理、文风构建/预览/修订、提示词预览、正文生成（SSE）、拆书生成（SSE）。

**R31** 当迁入服务层时，系统应保证 SSE 的 header 发送顺序、`writableEnded` 判定、`res.on("close")` 中止语义不变。

**R32** 系统应保持 `store.js` 的 `rev` 乐观锁与 `data/conflicts` 快照行为不变，schema 迁移链与原子写路径不变。

### 3.7 后端技能模块拆分

**R33** 系统应把 `backend/src/skills.js` 按职责拆分为若干模块，覆盖：读取与投影、CRUD、版本历史、排序、导入导出、作者提示词、Spark、工厂覆盖。

**R34** 系统应保持 `skills.js` 现有导出符号可被等价访问，或同步更新全部调用点，且不引入 `skills ↔ elements` 新循环依赖。

**R35** 拆分后单个技能模块文件不超过 400 行。

### 3.8 依赖与契约冻结

**R36** 系统应保持 `frontend/package.json` 与 `backend/package.json` 的依赖清单不变。

**R37** 系统应保持全部 `moshu.*` 存储键名不变。

**R38** 系统应保持全部 HTTP 路由的方法、路径与响应字段不变。

**R39** 系统应保持 `shared/pipeline.json`、`shared/spark-dims.json`、`shared/spark-deck.json` 的文件格式与字段不变。

### 3.9 质量门禁与回归

**R40** 系统应新增架构守卫脚本，检查：文件行数预算、层依赖方向、存储键常量收敛、重复映射清单、依赖清单未变。

**R41** 系统应新增契约快照脚本，比对路由清单与 CSS 拼接结果。

**R42** 系统应在重组后保持既有回归全绿：`pipeline-test`、`apply-test`、`stage-flow-test`、`spark-deck-test`、`llm-mock-test`、`tsc --noEmit`、`vite build`。

**R43** 系统应使用 jsdom harness 对首页、主台（阅读态与编辑态）、拆书台、文风、资产、设置逐页冒烟，页面渲染无运行时错误。

**R44** 系统应按阶段提交，每个阶段独立可回归，任一阶段失败时可单独回退。

## 4. 非目标

- 不改变界面视觉与交互设计，仅做结构归位。
- 不改变 `pipeline.json` 的阶段语义、`ui` 字段定义与落盘行为。
- 不引入新的运行时依赖、状态库、路由库或构建工具。
- 不改变后端存储格式、目录结构、schema 版本与迁移链。
- 不改变鉴权方式与访问密码逻辑。
- 不新增功能、不修复与本轮无关的既有缺陷（发现后记录，另行处理）。
- 不调整端口、脚本与部署方式。

## 5. 验收清单

1. `Studio.tsx` ≤ 400 行，全部单文件 ≤ 500 行（样式）/ 400 行（技能模块）/ 300 行（路由文件）。
2. 架构守卫脚本通过：行数预算、层方向、存储键收敛、映射单源、依赖未变。
3. 契约快照脚本通过：路由清单与基线一致，CSS 拼接与基线一致（含 R19/R20 的显式修复）。
4. 既有五套回归测试全绿，`tsc --noEmit` 为 0 错误，`vite build` 成功。
5. jsdom harness 六页冒烟无运行时错误，主台阅读态与编辑态均渲染成功。
6. `git diff` 中不出现 `package.json` 依赖变更、不出现 `shared/*.json` 变更、不出现 `moshu.*` 键名变更。

## 6. 验收记录（2026-09-22）

| 项 | 结果 |
|---|---|
| 1 行数预算 | `Studio.tsx` 333；样式 17 文件全 ≤500；`skills/*` 全 ≤400；`routes/*` 全 ≤300；`index.js` 78 |
| 2 架构守卫 | `node scripts/architecture-test.mjs` 全部通过（0 违规） |
| 3 契约快照 | `api-contract-test` 73/73；`css-order-test` 全部通过（含 R19/R20 显式修复白名单） |
| 4 回归 | `pipeline-test` 34/34、`apply-test` 16/16、`stage-flow-test` 29/29、`spark-deck-test` 26/26、`llm-mock-test` 68/68、`deps-lock-test` 一致；`tsc --noEmit` 0；`vite build` 成功（CSS 65.11 kB） |
| 5 冒烟 | jsdom 九页 0 错误：首页 3521、主台阅读 18605、编辑 18425、阶段页签 16194、目录 18605、拆书台 6170、设置 6374、技能 16240、声音 87898，与重组前逐字节一致 |
| 6 冻结 | 无 `package.json` 依赖变更、无 `shared/*.json` 变更、无 `moshu.*` 键名变更 |

