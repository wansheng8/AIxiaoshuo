# 模型可用性点亮与探测延时

日期：2026-09-18
需求：`.monkeycode/specs/2026-09-18-model-health/requirements.md`
设计：`.monkeycode/specs/2026-09-18-model-health/design.md`

## 做了什么

1. 新增 `POST /api/settings/probe`：对单个模型发一条最小对话请求，返回 `{ ok, ms, reason, at, model, providerId }`。
2. `llm.probeModel(draft)`：复用 `resolveSettings` 与 `completeOnce`，量取耗时；配置缺失抛 400 且不发网络请求。`testChat` 改为调用 `probeModel`，两个入口共用同一实现。
3. 探测结果落 `data/settings.json` 的 `providers[].probes`，由 `store.recordProbe()` 原子写回；被探测的模型同时并入 `provider.models`。
4. `providers.cleanProbes()` / `probeTtlMs()`：缓存按模型列表裁剪，有效期默认 12 小时，可用 `MODEL_PROBE_TTL_MS` 覆盖。
5. `publicSettings()` 返回 `probes`（含 `stale`）与顶层 `probeTtlMs`；`normalizeProvider` 在客户端保存设置时保留服务端 `probes`。
6. 前端新增 `useProbe`（并发上限 2、可中止、逐条回填）、`ProbeBadge`（绿/红/灰空心/琥珀过期，三态都不使用纯黑）；设置页模型列表与顶栏模型菜单都显示状态点与延时，各带「全部探测」。

## 验证

- mock 回归 `node scripts/llm-mock-test.js`：**68/68 通过**，新增 18 条探测用例（四协议成功带延时、四协议超时判失败、402 归类、缺模型名 400 且零请求、testChat 复用、probes 裁剪、保存不覆盖、TTL 默认与 env 覆盖、错误不含 Token）。
- 前端 `npx tsc --noEmit` 通过，`npx vite build` 通过。
- 实机（服务端 8787，真实 DeepSeek）：
  - `deepseek-flash` → `{"ok":true,"ms":730,"reply":"墨枢已接通。"}`，落库 `stale:false`。
  - `no-such-model-xyz` → `{"ok":false,"ms":382,"reason":"请求被上游拒绝（400），检查模型名或参数"}`，并按预期并入候选列表。
  - 用 `PUT /api/settings` 复原候选列表后，`probes` 同步裁剪，`configured:true` 与 Token 掩码保持不变。
- 凭据检查：所有探测失败原因只含主机名与路径，不含 API Token。

## 两轮闭环

- 第一轮：mock 超时用例误用 `LLM_FIRST_TOKEN_MS`/`LLM_IDLE_MS`，而探测走 `probeMs()`（`LLM_PROBE_MS`），导致每条等满 15 秒且断言口径不符。改为 `LLM_PROBE_MS: 500`，单条降到约 1 秒。
- 第二轮：实机发现「探测未保存的模型时缓存被 `cleanProbes` 裁掉」的持久化缺口。`recordProbe` 改为把被探测模型并入 `provider.models` 后再裁剪，实机复验通过，并恢复了原始候选列表。
- 复查：后端四文件 `node --check` 通过；mock 68/68；`tsc --noEmit` 与 `vite build` 均通过。

## 遗留

- 探测走非流式最小请求（`completeOnce`，`stream:false`），延时是整轮往返；如需「首字延时」可改为流式探测。
- 未做按流程分别绑定模型（本轮明确不做）。
- 探测有效性只反映最近一次结果，代理层缓存可能让上游状态滞后；`stale` 仅按时间判定。
