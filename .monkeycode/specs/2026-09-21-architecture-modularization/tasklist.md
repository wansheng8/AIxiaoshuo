# 任务清单：代码架构重组

对应规格：`.monkeycode/specs/2026-09-21-architecture-modularization/`

说明：逐阶段实施，每阶段结束执行「既有回归 + 守卫脚本 + 六页冒烟」，全部绿后再进入下一阶段；本清单仅记录阶段与子步骤进度，统一提交由用户确认。

## P1 守卫脚本与基线快照

- [x] `scripts/lib/route-scan.js`
- [x] `scripts/fixtures/api-contract.json`（73 条路由）
- [x] `scripts/fixtures/deps-lock.json`
- [x] `scripts/api-contract-test.js`（73/73）
- [x] `scripts/deps-lock-test.js`
- [x] `scripts/architecture-test.mjs`（报告模式）
- [x] `backend/src/index.js` 增加 `module.exports = app` 与 listen 守卫

## P2 目录迁移与 storage 收敛

- [x] 顶层模块迁移至 `domain/`、`data/`、`components/`
- [x] codemod 重写 17 个文件的相对导入
- [x] 新增 `frontend/src/data/storage.ts`（`STORAGE_KEYS` + 读写封装）
- [x] 替换所有 `moshu.*` 字面量（`App`/`Home`/`Studio`/`Teardown`/`TeardownDesk`/`Voice`）
- [x] `tsc --noEmit` 0；`vite build` 成功；首页/主台 0 错误

## P3 纯函数与展示组件抽取

- [x] `frontend/src/pages/studio/studio-utils.ts`（451 行）
- [x] `components/ui/IssueList.tsx`
- [x] `components/ui/AigcCard.tsx`
- [x] `components/ui/InsFold.tsx`
- [x] `components/ui/ConfigBanner.tsx`
- [x] Studio 4548 → 4018；tsc 0；build 成功；三页 0 错误

## P4 五个 hooks 抽取（完成）

- [x] `useStudioUi.ts`（121 行）：布局态 + 本地持久化副作用
- [x] `useStudioDocument.ts`（198 行）：novel/skills/chapterId/dirty/undoStack/status + patch 系列 + `applyToken`/`pushUndo`/`save`/`syncSavedRev`
- [x] `useStudioScan.ts`（195 行）：`issues`/`aigc`/`voiceInfo`/`nouns`/`ignored`/`sideText`/`sideKind`/`reportOpen`/`logsOpen` + `scanNow`/`jumpIssue`/`applyIssue`/`locateOriginal`/`replaceOriginal`/`applyPolish`/`applyEmotion`（切章扫描副作用随迁）
- [x] `useStudioAssets.ts`（197 行）：`folds`/`allSkills`/`imitBusy`/`imitRows`/`histFor`/`uploadRef`/`uploadTarget` + 资产卡/词库/仿写/上传
- [x] `useStudioPipeline.ts`（1226 行）：`busy`/`autoPipe`/`paused`/`failed`/`runningSlot`/`skippedStages`/`selectedStageId`/`streamChars`/`pipeClock`/`workName`/`workId` + `runSkill`/`fillSlot`/`continueAutoPipe`/`onStageAction`/`pipeControls`/`runSel`
- [x] 命令式接线（`novelRef`/`busyRef`/`dirtyRef`/`idRef`/`undoStackRef`/`saveRef`/`continueAutoPipeRef`/`stageNavRef`）随归属迁入各 hook，每帧刷新

### P4 进展备注

- P4 完成：Studio 3661 → 2815 行（pipeline 钩子 + P5 组件继续收口）。`stage-flow-test.mjs` 陈旧入口路径已修正为 `domain/`。
- P5-0 完成：新增 `view-types.ts` 与 `derive.ts`（44 项派生值单源），Studio 改用 `d.*`，派生逻辑不再散落。
- 已完成钩子：`useStudioUi` / `useStudioDocument` / `useStudioScan` / `useStudioAssets`，均通过完整回归。
- 耦合事实：`load` 会重置全部 hook 状态；`undoLast`/`stopWriting`/`cleanCopyPass` 触碰 pipeline refs；`runSel` 依赖 `runSkill`。故 `runSkill` 与其余运行函数应整体留在 `useStudioPipeline`，由 `useStudioPipeline({ document, scan, ui, job })` 组合；`runSel` 随之迁入。
- 每子步回归：`tsc --noEmit` 0 + `vite build` 成功 + 首页/主台/编辑态/移动页签/目录/拆书台/设置/技能/声音 9 页 0 错误。

## P5 画布/检查器/目录/弹层组件抽取（完成）

- [x] `views/StudioModals.tsx`（约 210 行）：文件输入、历史/日志抽屉、命令面板（条目内建）、zen、提示词预览
- [x] `views/StudioToc.tsx`（62 行）：目录 + 移动端页签
- [x] `views/StudioCanvas.tsx`（788 行）：画布（动作条、动作卡、侧栏报告、阅读/编辑）
- [x] `views/StudioInspector.tsx`（863 行）：检查器全部折叠块
- [x] `views/AssetCard.tsx`（163 行）：资产卡独立组件
- [x] `canvas-act.tsx`（188 行）：7 个画布处理器纯工厂（无 hook，可在早退后调用）
- [x] `file-acts.ts`：导出/归档/复制/彻底删除纯工厂
- [x] `useStudioPage.ts`：14 个页面级副作用 + `load`，容器仅保留 `stageNavRef`/全局快捷键两个 effect
- [x] `moveChapter` / `addThreadRow` / `removeThreadRow` 归入 `useStudioDocument`
- [x] `Studio.tsx` 收口 1031 → 333 行（≤400 达标）

### P5 备注

- 视图 props 约定：`{ doc, ui, scan, assets, act, d }` + 组件专属 props；`d` 由 `deriveStudio` 单源产出。
- 处理器抽为**纯工厂**而非 hook：`canvas-act`/`file-acts` 在加载早退之后调用，绕开「hook 不可在早退后调用」的限制。
- 迁移用正则前缀法在字符串字面量内会误替换（已修 `"doc.chapter-prose"`、`"report-scan issues"`，另发现并修复 `log-doc.status` → `log-status`、`ThreadItem["status"]`），后续搬函数需用「字符串安全」前缀器，避免在字符串/属性名内替换。
- 每步回归：七套测试 + `tsc` + `vite build` + jsdom 九页 0 错误，首页 3521 / 主台 18605 与抽取前逐字节一致。

## P6 样式拆分与 R19/R20 修复（完成）

- [x] `styles/00-16` + `styles/index.css` 单入口
- [x] R19：补 `--fg`/`--accent`/`--bg-soft`/`--dim`
- [x] R20：`.trio` 归位 960 媒体块、修复单行双规则、修正 2764-2809 缩进
- [x] `scripts/css-order-test.mjs` + `scripts/fixtures/styles-baseline.css`

### P6 备注

- 拆分方式：先 `mv frontend/src/styles.css scripts/fixtures/styles-baseline.css` 保留基线，再按设计表区间切片并由 `styles/index.css` 按序 `@import`；`main.tsx` 改为 `import "./styles/index.css"`。
- 基线对照：`scripts/css-order-test.mjs` 用花括号感知的规则解析器比对「拼接规则序列 = 基线」，并单独白名单掉显式修复点（`:root` token、孤儿 `.trio`、空白/缩进由归一化吸收），另断言 `.trio` 恰好一条且位于 `@media (max-width: 960px)` 内。
- 行数实测（含末行）：00=66/01=73/02=388/03=89/04=150/05=377/06=115/07=182/08=144/09=436/10=264/11=276/12=335/13=246/14=198/15=186/16=69，全部 ≤500。
- 回归：七套测试全绿 + `tsc` 0 + `vite build` 成功（CSS 65.11 kB）+ 架构守卫仍为已知 2 项（P7 index.js、P10 TABS）；jsdom 九页 0 错误，首页 3521 / 主台 18605 / 阶段页签 16194 / 目录 18605 / 拆书台 6170 / 设置 6374 / 技能 16240 / 声音 87898 与 P5 逐字节一致，编辑态 18425（较 P5 记录 +20，稳定复现，与 CSS-only 改动无关）。

## P7 后端 http/ 与 middleware/auth（完成）

- [x] `http/async-handler.js`（`ApiError` + `asyncHandler`）、`http/sse.js`
- [x] `middleware/auth.js`
- [x] `routes/auth.js`（login/auth/health）、`routes/settings.js`（settings*，异步走 asyncHandler + ApiError）
- [x] `index.js` ≤200 行（由 P8/P9 收口；P7 已从 1131 → 1023，P8 实测 78 行）

### P7 备注

- `http/async-handler.js` 的 `ApiError.extra` 仅在全局错误中间件里合并，普通 Error 响应形态保持不变（接口冻结）。
- `http/sse.js` 统一 `openSse` / `writeSse` / `abortOnClose`，两处 SSE（写作、拆书）复用。
- `middleware/auth.js` 承载密码/令牌/cookie 解析与 `/api` 放行；`routes/auth.js` 与 `routes/settings.js` 挂在 `/api`。
- `scripts/lib/route-scan.js` 增强：支持 `const x = require("./routes/*")` 变量式挂载，契约测试仍 73/73。
- 回归：七套测试全绿、后端 8788 冒烟（health/auth/login/settings/projects + settings/test 与旧版逐字段一致）、jsdom 九页 0 错误且长度与 P6 一致。

## P8 后端 routes/ 拆分（完成）

- [x] 8 个路由文件，每个 ≤300 行；挂载顺序与契约一致
- [x] `index.js` 收口 ≤200 行（实测 78 行）

### P8 备注

- 路由：`auth.js`(35) `settings.js`(61) `projects.js`(250) `skills.js`(194) `elements.js`(42) `voice.js`(156) `generate.js`(191) `teardowns.js`(193)，全部 ≤300。
- `index.js` 仅保留：env → express/cors/json → 8 个 router 挂载（auth → requireAuth → 业务）→ 静态/SPA → 404 → ApiError 错误中间件 → `ensureDirs` → listen。
- `capText`/`MAX_TEXT_CHARS` 抽到 `http/text.js` 供 `projects.js` 复用；SSE 复用 `http/sse.js`。
- 路由内部逻辑暂原样内联，服务层留待 P9 下沉；契约 73/73、九页冒烟长度与 P7 逐字节一致、架构守卫仅剩 P10 映射 1 项。

## P9 后端 services/ 与 skills/ 拆分（完成）

- [x] 9 个 service 文件
- [x] `skills/` 8 个模块，每个 ≤400 行

### P9 备注

- services：`project-service`(38) `project-import-service`(58) `prompt-service`(50) `generation-service`(150) `teardown-generation-service`(129) `spark-service`(61) `voice-service`(78) `proof-service`(38) `settings-service`(40)，全部 ≤300。
- skills：`core`(194) `history`(113) `factory`(275) `io`(259) `order`(170) `craft`(107) `author`(367) `index`(48)，全部 ≤400；`index.js` 为唯一对外 barrel（35 项导出与旧 `skills.js` 一致）。
- 依赖方向：`core → history → io → order`、`factory`、`craft`、`author`、`index`，无环；`toPublicSkill` 落 `factory`（io 的 `importSkillMarkdown` 复用，避免 io↔index 循环）。
- 迁移方式：按旧 `skills.js` 行区间机械切片（逻辑逐字节保留），`roles` 显式 `require` 补依赖；契约 73/73、pipeline 34/34、apply 16/16、spark-deck 26/26、llm-mock 68/68、css-order 全通过、`tsc` 0、`vite build` 成功（CSS 65.11 kB）、架构守卫仍为已知 1 项（P10）。

## P10 界面映射单源收口与文档同步（完成）

- [x] `TABS`/`RAIL_EXTRAS` 改为从 `domain/pipeline` 派生
- [x] 更新 `CHANGELOG.md`、`.monkeycode/MEMORY.md`、设计文档

### P10 备注

- 新增 `frontend/src/pages/studio/studio-tabs.ts`（守卫允许的映射单源文件）：`TABS` 按固定顺序 `brief/characters/world/props/outline/beats/content` 从 `STAGES` 取 `ui.tab` 对应阶段的 `label` 派生，缺阶段即抛错；`RAIL_EXTRAS`（大纲板，非流水线阶段）保留在此文件。
- `studio-utils.ts` 删除本地 `TABS`/`RAIL_EXTRAS`/`TabId` 声明，改为从 `studio-tabs` 导入 `TabId` 并原样再导出，既有导入路径不变。
- 架构守卫 **全部通过**（0 违规，仅两条阶段 id 字面量提示）；`tsc` 0、`vite build` 成功（CSS 65.11 kB）、jsdom 九页长度与 P6/P9 逐字节一致。
