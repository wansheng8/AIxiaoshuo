# 四类协议打通记录（openai-chat / anthropic / ollama / gemini）

- 日期：2026-09-16
- 触发：用户要求「llm 模型调用全部功能解锁」，经确认为「四套协议全部打通并实机验证」
- 状态：已修复并两轮闭环

## 修复前的问题

| 协议 | 问题 | 影响 |
| --- | --- | --- |
| Gemini | `normalizeBaseUrl` 对 gemini 直接原样返回，裸域名不补版本段 | 用户填 `https://generativelanguage.googleapis.com` 会拼出 `/models/xxx:streamGenerateContent`，缺 `/v1beta`，直接 404 |
| Gemini | 安全拦截（HTTP 200 + `promptFeedback.blockReason` / `finishReason: SAFETY`）没有任何识别 | 正文为空 → 触发非流式兜底 → 仍为空 → 用户看到「空生成」，不知道是被安全策略拦了 |
| Gemini | `candidates[0].content.parts` 全量拼进正文 | 2.5 系模型把思考过程作为 `part.thought` 下发，会被当成正文写进章节 |
| Gemini | 未走 `alt=sse` 时分块结果是 JSON 数组 | `extractComplete` 按对象解析，数组取不到 `candidates`，正文丢失 |
| Gemini | `thinking` 开关完全被忽略 | 开思考对 Gemini 无效 |
| Anthropic | `thinking` 开关完全被忽略 | 开思考对 Claude 无效 |
| Anthropic | 200 响应体里的 `event: error`（如 `overloaded_error`）被当作无关行丢弃 | 报「空生成」，看不出是上游过载 |
| Ollama | `options.num_ctx` 直接用 `contextLength`（默认 200000） | 本地模型按此分配 KV 缓存，显存/内存被吃光甚至加载失败 |
| Ollama | 200 响应体里的 `{"error":"model 'x' not found"}` 被丢弃 | 报「空生成」，看不出是模型名不对 |
| 通用 | `makeLineHandler` 用 try/catch 包住 JSON.parse 与取值 | 上游错误没有出口，只能表现为空输出 |

## 处置

- `normalizeBaseUrl`：gemini 分支缺版本段时补 `/v1beta`
- 新增 `guardPayload(json, protocol)`：识别 200 里内嵌的 `error`（含过载判定）与 Gemini 安全拦截，抛可读错误；安全拦截标记 `kind="safety"`，在流式分支被排除出兜底，不重试不重复请求
- `extractDelta` / `extractComplete`：Gemini 按 `part.thought` 分流，思考进 `reasoning`，正文只取非 thought 片段；Anthropic 的 `thinking_delta` 同样只算输出不算正文
- Anthropic：开思考时下发 `thinking.budget_tokens`（预算 < `max_tokens`，两者同步抬高），且不再传 `temperature`
- Gemini：仅在模型名匹配 `2.5|thinking` 时下发 `thinkingConfig.includeThoughts`，其余模型不下发以免 400
- Ollama：新增 `ollamaContext()`，`num_ctx` 与提示词裁剪统一压到 32768
- `readWholeBody`：支持 JSON 数组分块；`makeLineHandler` 拆开解析与取值，让 `guardPayload` 的错误能抛出去

## 验证

第一轮 · mock 上游（`scripts/llm-mock-test.js`，50/50 通过）

- 四类协议 × 流式拼装 / 上游整体返回 JSON / 拒绝流式退回 / 上游不响应超时 / 模型列表 / 无 `/models` 端点
- Anthropic：`x-api-key` + `anthropic-version` 头、system 拆顶层、开思考带 budget 且不传 temperature、200 内 error 事件
- Ollama：NDJSON 流式、`num_ctx` 压到 32768、200 内嵌 error
- Gemini：thought 片段不进正文、非 2.5 不下发 thinkingConfig、2.5 下发、数组分块拼装、安全拦截不兜底不重试
- 全部错误消息不含 API Key

第二轮 · 实机（`/tmp/opencode/real-check.js`，13 项 + 1 跳过）

- 四类协议请求构造：URL / 鉴权头 / body 结构全部符合
- Anthropic 真实端点 `https://api.anthropic.com/v1/messages` 可达（未带密钥返回 401 `authentication_error`，说明路径正确而非 404）
- 真实流式调用：`api.deepseek.com/v1` · `deepseek-flash` 成功（688ms / 4 片 / 「墨枢已接通」）
- 真实模型列表：返回 2 个；真实探测（设置页「测试」同一条路径）成功
- 后端 8899 冒烟：启动正常、登录与探测 200

跳过项：本环境无法访问 `generativelanguage.googleapis.com`（`curl` 返回 000），Gemini 真实端点连通性无法在此验证，需作者在有外网的环境点一次「测试」。

## 遗留

- 未在本机验证真实 Ollama 与真实 Gemini / Anthropic 的出稿效果：本机无 ollama 守护进程、无对应密钥、且无法访问 Google 域名
- 复现路径：`node scripts/llm-mock-test.js`（不联网、不花额度）；作者侧可用设置页「测试」按钮逐家确认
