# 类型检查报错记录 · 2026-09-11

## 来源
`cd /workspace/frontend && npx tsc --noEmit`

## 首轮结果（25 条，均为既有历史遗留，非本次元素功能引入）
文件分布：
- `src/api.ts` 2 条：`readSse` 里 `onMeta` / `onDone` 传参类型不匹配。
- `src/spark.ts` 1 条：`Object.fromEntries(...) as SparkPrefs` 类型重叠不足。
- `src/pages/Studio.tsx` 22 条：
  - `cnToInt` 缺返回类型标注，被递归引用推断为 any。
  - 多个函数内 `novel` 可能为 null、`chapter` 可能为 undefined（`fillSlot` / `startAutoPipe` / `applyNameHint` / `runSel` / `assetCard`）。
  - `absorbBeats` 被直接当作 `onClick`，参数类型不兼容。

## 首轮修复
1. `api.ts` `readSse`：meta / done 改为显式构造对象再回调。
2. `spark.ts`：改为 `as unknown as SparkPrefs`。
3. `Studio.tsx`：
   - `cnToInt(raw: string): number`。
   - `fillSlot` / `startAutoPipe` / `applyNameHint` / `runSel` 顶部加 `if (!novel || !chapter) return;`。
   - `assetCard` 顶部加 `if (!novel) return null;`。
   - `onClick={absorbBeats}` 改为 `onClick={() => { absorbBeats(); }}`。

## 二次复查
- 第二轮 `npx tsc --noEmit`：退出码 0，无任何 `error TS`，原 25 条全部消除。
- `npx vite build`：成功（55 modules，built in 1.92s）。
- 结论：本轮闭环完成，无遗留。
