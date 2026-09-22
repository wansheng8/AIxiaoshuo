# 主台升级（双栏持久工作台）— 技术设计

- 特性编号：2026-09-19-studio-workbench
- 关联：`2026-09-18-studio-flow-redesign`（阶段卡片流）、`2026-09-18-skill-pipeline`（pipeline 单一数据源）

## 1. 现状与问题

主台 `frontend/src/pages/Studio.tsx` 的导航是两层：

- `DESKS`（`write/board/cast/threads/lore`）水平标签行（`.stage-bar .desk-tabs`）；
- 各 desk 内再切 `TABS`（`brief/characters/world/props/outline/beats/content`）。

上一轮加入的 `StageFlow` 只挂在 `.pipe-wrap` 作为状态带，点击阶段并不切画布，用户观感是「全流程没变」。

## 2. 目标形态

```
┌────────┬─────────┬──────────────────────────┬──────────┐
│ 目录   │ 阶段轨  │ 画布（选中阶段工作面）    │ 检查器   │
│ ep     │ rail    │ stage                    │ inspector│
│ 232px  │ 188px   │ 1fr                      │ 300px    │
└────────┴─────────┴──────────────────────────┴──────────┘
```

- 阶段轨常驻、独立滚动，不随画布滚动；
- 画布顶部是「选中阶段动作卡」（状态/产出/依赖/参考/运行/跳过/查看编辑），下方沿用既有面板；
- 水平 `DESKS` 行移除，导航由阶段轨承担；`board`（大纲板）作为「大纲」分组的额外入口保留。

## 3. 数据与状态

### 3.1 分组（展示层，不新增阶段清单）

在 `frontend/src/pipeline.ts` 增加：

```ts
export type StageGroup = { id: string; label: string; stageIds: string[] };
export const WRITING_GROUPS: StageGroup[] = [
  { id: "brief",   label: "立项",     stageIds: ["brief"] },
  { id: "setting", label: "设定",     stageIds: ["characters", "world", "props"] },
  { id: "outline", label: "大纲",     stageIds: ["outline", "beats"] },
  { id: "draft",   label: "正文审校", stageIds: ["content", "continue", "polish", "review", "suggest", "threads"] },
];
```

模块加载时校验：所有 `stageIds` 必须命中 `STAGES` 且属于 `writing` 线，且写作线阶段无遗漏；否则抛错（与 pipeline 校验一致，便于发现漂移）。

### 3.2 选中阶段

`Studio.tsx` 新增 `selectedStageId` 状态。统一的 `activeStageId` 推导：

```
activeStageId =
  liveSlot ? 运行阶段（由 runningSlot/job 推导）
  : selectedStageId
  || STAGES 中 desk/tab 命中的写作线阶段
  || ""（threads→threads，board→outline 兜底）
```

`buildStageFlow` 仍以 `activeStageId` 标记 `active`。

同步规则：

- 点击阶段轨 → `setSelectedStageId(id)` + `onStageAction("edit", card)`（复用既有 desk/tab 兜底）；
- 点章节目录、卡片操作、自动流水线推进 → 由 `desk/tab` 或 `liveSlot` 反推。

### 3.3 画布顶部动作卡

复用单卡渲染：把 `StageFlow` 的 `<li>` 抽成 `StageCard`（具名导出），`StageFlow` 内部改为 map `StageCard`。画布顶部渲染 `activeCard`（`stageCards` 中命中 `activeStageId` 的卡，缺省取 `nextPipe` 对应阶段），并配进度 `Meter`。

## 4. 组件

### 4.1 `StageRail`（新增 `frontend/src/components/StageRail.tsx`）

```
props: {
  groups: StageGroup[];
  cards: StageCardModel[];        // 已有状态
  activeStageId?: string;
  busy?: boolean;
  extras?: { id: string; label: string; groupId: string }[];
  onSelect: (card: StageCardModel) => void;
  onExtra?: (id: string) => void;
}
```

渲染 `nav.stage-rail > section.stage-rail-group`，组头 + 组内按钮。按钮内容：状态点（`.dot`，按 status 着色）+ 阶段名；`active` 高亮，`failed`/`skipped` 加类。组内额外入口（大纲板）渲染为次级按钮。

### 4.2 `StageFlow`（`frontend/src/components/StageFlow.tsx`）

抽出具名导出 `StageCard`；`StageFlow` 行为不变（保持拆书台兼容）。

### 4.3 `Studio.tsx`

- 移除 `.stage-bar .desk-tabs` 中 `DESKS` 渲染；
- `.workspace` 内新增 `<StageRail .../>`；
- `.pipe-wrap` 内的整条 `StageFlow` 改为「单张动作卡 + 进度」；
- 保留 `openDesk`，`onStageAction` 不变（阶段轨点击走 `edit`）；
- 新增阶段轨收起开关（`localStorage: moshu.railCollapsed`）。

## 5. 布局与响应式

- `.workspace` → `grid-template-columns: 232px 188px 1fr 300px`；
- `.workspace.wide`（board/threads）→ 隐藏 inspector；
- `.workspace.zen` → 隐藏 `ep`/`stage-rail`/`inspector`；
- `.workspace.rail-off` → 隐藏 `stage-rail`；
- `@media (max-width: 1100px)` → 隐藏常驻 `stage-rail`；
- 移动端（沿用 `.mobile-tabs`）：新增 `rail` 页签，`mobile === "rail"` 时全屏显示阶段轨。

## 6. 风险与回归

- 风险：`Studio.tsx` 内联面板多，移除 `DESKS` 行后个别入口（大纲板）需保留 → 用阶段轨额外入口兜底。
- 回归：`stage-flow-test`、`pipeline-test`、`apply-test`、`spark-deck-test`、`llm-mock-test`、`tsc --noEmit`、`vite build`；接口冒烟不变。
- 数据无迁移：新增状态仅前端会话 + `localStorage`。

## 7. 非目标

- 不改 `pipeline.json`；不重写拆书台；不新增后端接口。
