# 主台流程重设计 — 实施任务清单

- 特性编号：2026-09-18-studio-flow-redesign
- 状态：进行中

## 已完成

- [x] T1 `shared/pipeline.json` 升级 schema v2：新增 `scope/field/mode/deps/refs/editable/variant`。
- [x] T2 修正 P0-3：`td-imitate` target 与 `td-craft` 解耦，分别落 `imitate` / `recipes`。
- [x] T3 修正 P0-1：`suggest` 独立字段 `advice`，不再覆盖 `reviewReport`；后端 `index.js` 去掉 `skipApply(suggest)`。
- [x] T4 修正 P0-2：`chapter-prose` 整章 replace，`continue` 续写 append（前后端读 stage.mode）。
- [x] T5 修正 P2-9：`continue` 补 `artifact: "content"`。
- [x] T6 `pipeline.js` 新增访问器与重复 target 校验（含 variant 例外）。
- [x] T7 `apply.js` 改为按 stage 派发（scope/field/mode）。
- [x] T8 `teardown.js` 的 `TAB_FIELDS` / `SKILL_FIELD` 改为 pipeline 派生（P2-10 后端）。
- [x] T9 `skills.js` 写作类判定改用 `pipeline.isWritingSkill`（P2-8）。
- [x] T10 P1-4/5：`kickoff.md` 自动流程补「道具」；内置 Skill `order` 对齐流水线。
- [x] T11 新增 `scripts/apply-test.js`（16/16）。
- [x] T12 新增 `frontend/src/stage-flow.ts`（纯函数构建卡片模型）。
- [x] T13 新增 `frontend/src/components/StageFlow.tsx` + 样式。
- [x] T14 `Studio.tsx` 写作线接入纵向阶段卡片流，替换水平进度条；删除 `STEPS`/`QUICK_STAGES` 死代码（P2-7）。
- [x] T15 `teardown-run.ts` 的 `TEAR_TABS` 改为 pipeline 派生（P2-10 前端）。
- [x] T16 回归：pipeline-test 34/34、apply-test 16/16、spark-deck-test 26/26、llm-mock-test 68/68、tsc 0、vite build 成功、接口冒烟通过。
- [x] T17 拆书台（TeardownDesk）接入同一阶段卡片流：移除水平 `tear-tabs` 与 `TabIcon`/`tabCount`，卡片操作映射到 `runTeardownTab`/`runTeardownCraft`；`buildStageFlow` 新增 `record` 数据源与 `filled` 覆盖。
- [x] T18 补 `scripts/stage-flow-test.mjs`（esbuild 打包 TS 后在 Node 断言；25/25：状态推导、active/failed/skipped 优先级、依赖满足、refs 计数、拆书线）。
- [x] T18b failed 状态优先级高于 done（本次 rerun 失败要盖过旧产出），active > failed > done > skipped。

## 待办

- [x] T19 跳过状态持久化：主台按阶段 `scope` 分桶写入 `moshu.skip.novel.{novelId}` / `moshu.skip.chapter.{novelId}.{chapterId}`，拆书写 `moshu.tdskip.{teardownId}`；章节切换时重载，重新运行阶段时清除对应跳过。
- [x] T20 侧栏「卡壳建议」独立视图：`sideKind="advice"`，顶部动作区新增入口（有建议直接打开，无建议调 `suggest`），面板内可编辑并「保存建议」/「重新生成」，落 `chapter.advice`；加载时审稿优先、建议次之。
- [x] T21 清理遗留 `step`/`setStep` 状态与未用 `.pipe` / `.pipe-step*` / `.pipe-line*` 样式；`.pipe-item` 一并移除。
- [x] T22 移动端视觉复核：`@media (max-width: 860px)` 下卡片流放宽高度、卡片内边距与操作按钮换行，拆书卡片流单独限高。
