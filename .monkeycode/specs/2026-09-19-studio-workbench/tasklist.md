# 主台升级（双栏持久工作台）— 实施任务

- 特性编号：2026-09-19-studio-workbench
- 依赖：`shared/pipeline.json` v2、`frontend/src/stage-flow.ts`、`frontend/src/components/StageFlow.tsx`

## 阶段一：分组与组件

- [x] T1 `frontend/src/pipeline.ts` 增加 `StageGroup` 类型、`WRITING_GROUPS` 与 `stagesOfGroup`/`panelOfStage`，模块加载时校验写作线阶段无遗漏、无越线。
- [x] T2 `frontend/src/components/StageFlow.tsx` 抽出具名 `StageCard`，`StageFlow` 改为复用；导出 `STATUS_LABEL`/`ACTION_LABEL` 供阶段轨使用。
- [x] T3 新增 `frontend/src/components/StageRail.tsx`：分组渲染、状态点、选中高亮、组内额外入口。

## 阶段二：主台接入

- [x] T4 `Studio.tsx` 新增 `selectedStageId` 与 `activeStageId` 推导（运行 > 选中），并用 `[desk,tab]` 同步钩子反推阶段；`activeCard` 取选中卡、兜底 `nextPipe`。
- [x] T5 阶段轨挂在 `.workspace` 中，点击 → `onStageAction("edit")`；`board` 作为大纲组额外入口（`RAIL_EXTRAS`）。
- [x] T6 画布顶部 `.pipe-wrap` 改为「选中阶段动作卡（`StageCard`）+ 进度」，移除整条 `StageFlow`；加「收起阶段」开关。
- [x] T7 移除水平 `DESKS` 标签行与 `DESKS` 常量；`onStageAction` 编辑分支改用 `panelOfStage`。

## 阶段三：布局与响应式

- [x] T8 `styles.css`：四栏网格、`.wide`/`.zen`/`.rail-off` 变体、阶段轨样式（`.stage-rail*`、`.stage-focus`）。
- [x] T9 移动端：`mobile-tabs` 增 `rail` 页签，`.workspace.rail-mobile` 全屏显示阶段轨；`1180–961px` 区间收起常驻轨。
- [x] T10 阶段轨收起开关 + `localStorage: moshu.railCollapsed`。

## 阶段四：验证与文档

- [x] T11 回归：`pipeline-test` 34/34、`apply-test` 16/16、`stage-flow-test` 29/29、`spark-deck-test` 26/26、`llm-mock-test` 68/68、`tsc --noEmit` 0、`vite build` 成功。
- [x] T12 HMR 无报错；预览链接可访问；点章节/点阶段/运行阶段三条路径经代码路径核验（`selectedStageId` 同步钩子 + `panelOfStage`）。
- [x] T13 同步 `CHANGELOG.md`、`.monkeycode/MEMORY.md`、勾选本 tasklist。

## 阶段五：阶段轨深化

- [x] T14 分组可折叠 + 完成计数，折叠状态存 `localStorage: moshu.railFolded`。
- [x] T15 当前运行阶段在轨上显示百分比进度（`StageRailProgress`）。
- [x] T16 快捷键：`Alt+↑/↓` 切换合成并打开面板；`Cmd/Ctrl+Enter` 运行/重跑选中阶段；输入框内不拦截。
- [x] T17 画布显示「下一步：阶段 · 提示」引导文案（`.pipe-hint`）。

## 阶段六：画布内联产出与轨上细进度

- [x] T18 阶段轨顶部搜索框（`.stage-rail-search`）：按阶段名/额外入口名过滤，搜索时自动展开分组，无命中显示 `.stage-rail-empty`。
- [x] T19 运行中阶段轨上改显细进度条（`.stage-rail-bar > i`，宽度按百分比），替代纯百分比文本。
- [x] T20 画布动作卡内联展开产出全文：`focusOpenFor`/`focusDraft` 状态，「展开产出/收起产出」切换、`focus-edit` textarea、保存/还原/字数（`.focus-edit-actions`）；保存按 `scope+field` 走 `patchChapterById`/`patchNovel`。
- [x] T21 修正 hooks 顺序：`stageNavRef`/快捷键两处 `useEffect` 移至 `!novel || !chapter` 提前返回之前；内联编辑改由 `focusOpenFor` 阶段 id 驱动，移除依赖 `activeStageId` 的关闭副作用。
- [x] T22 回归复跑：`stage-flow-test` 29/29、`pipeline-test` 34/34、`apply-test` 16/16、`spark-deck-test` 26/26、`llm-mock-test` 68/68、`tsc --noEmit` 0、`vite build` 成功。

## 阶段七：手机端适配

- [x] T23 手机端点阶段后自动切到「主台」页签：`onStageAction` 对 `edit`/`view`/`run`/`rerun` 调 `setMobile("paper")`，修复原先点阶段画面无变化的问题。
- [x] T24 阶段轨触屏化：搜索框 sticky + 输入字号 16px（避免 iOS 聚焦缩放）、清除按钮加大、分组标题与阶段项最小高度 40/44px、名称字号上调、底部留安全区。
- [x] T25 画布触屏化：内联产出编辑 `min-height: 40vh`/`max-height: 60vh`、去 resize、字号 16px，保存/还原按钮 `min-height: 38px` 并允许换行；主操作按钮 `min-height: 42px`；`stage-card-actions` 允许换行。
- [x] T26 移动端隐藏无意义的「收起阶段」开关（`.rail-toggle`）；页签栏 sticky + 顶部安全区。

## 阶段八：白屏排查与容错

- [x] T27 用 Node + jsdom 复现并定位白屏：`readerShellRef.current.scrollTo` 在缺少 `Element.scrollTo` 的环境抛错，无错误边界导致整页卸载；四处滚动调用改可选调用（`Studio.tsx`/`TeardownDesk.tsx`/`StageFlow.tsx`），词库复制加 `navigator.clipboard` 兜底。
- [x] T28 新增 `frontend/src/ErrorBoundary.tsx` 并包裹 `main.tsx`，错误改为可读提示 + 重新加载；排查记录写入 `.monkeycode/reports/white-screen-2026-09-20.md`；在移除 `scrollTo` polyfill 的 jsdom 环境复跑（0 错误）验证修复。

## 阶段九：正文读写框架排版

- [x] T29 纸张化容器：阅读态与编辑态统一包 `.reader-paper`（纸色 + 细边框 + 圆角 + 柔和投影 + 上下留白），夜间态 `.reader-shell.night .reader-paper` 换深纸色；编辑态加 `.reader-edit-page`。
- [x] T30 `.reader-shell` 重做（径向渐变纸感 + 最小高度）、`.reader-bar` 可换行吸附工具栏、`.reader-modes` 圆角分组；`.reader-title-input` 居中下划线标题；`.ms.reader-edit` 去边框继承纸面排版、可纵向拉伸。
- [x] T31 手机端（`max-width: 960px`）纸面自适应留白与圆角。
- [x] T32 回归：`tsc --noEmit` 0、`vite build` 成功；jsdom harness（移除 `scrollTo` polyfill）分别验证阅读态与编辑态，0 运行时错误；同步 `CHANGELOG.md`。
