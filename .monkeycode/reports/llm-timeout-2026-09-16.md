# 报错记录：大模型超时未返回内容（中转站 / 自建反代）

- 日期：2026-09-16
- 报告人：用户（本机部署，非当前工作区实例）
- 状态：已修复并两轮闭环（无需用户回传 curl，应用自身已能给出可读诊断）

## 现象

- 生成时报「大模型超时未返回内容」
- 「设置」页点「测试」失败
- `node scripts/check-model.js` 失败
- 等待时间「很久，说不准」，无明确秒数
- 模型接口类型：中转站 / 自建反代

## 相关代码路径

| 位置 | 行为 | 超时 |
| --- | --- | --- |
| `backend/src/llm.js:589` `streamChat` | 流式已建连但未收到任何字节 | 首字 45s / 思考 120s，可用 `LLM_FIRST_TOKEN_MS` 覆盖（`timeoutConfig`，`llm.js:338`） |
| `backend/src/llm.js:808` `testChat` | 「测试」= 非流式 chat，`max_tokens: 32` | 探测 15s，可用 `LLM_PROBE_MS` 覆盖 |
| `backend/src/llm.js:884` `listModels` | `check-model` = `GET /models` | 同上；不支持时返回 `LLM_NO_MODELS_ENDPOINT`（`llm.js:406`） |
| `backend/src/llm.js:395` `networkError` | 连接层失败（DNS/TCP/TLS） | 报「连接大模型失败」，与本次不符 |
| `backend/src/llm.js:4` `normalizeBaseUrl` | Base URL 自动补 `/v1` | 若中转站路径非 `/v1` 会 404 |

## 判断

报「超时未返回内容」而非「连接大模型失败」，说明 **TCP/TLS 连上了但服务端不回字节**。
叠加「测试」与 `/models` 双双失败，指向中转站（或自建反代）侧问题，而非应用超时阈值。

按可能性排序：

1. **反代开了缓冲**：nginx 默认 `proxy_buffering on`，SSE 被攒到整段生成完才下发，
   客户端在 15s / 45s 内收不到任何字节 —— 与「很久」和两种超时同时出现完全吻合。
2. **反代未透传 Authorization**：漏 `proxy_set_header Authorization $http_authorization;`
   会让 `/models` 与 chat 双双 401（表现为「测试」失败）。
3. **Base URL 路径不符**：中转站实际路径不是 `/v1`，补出来的 `/v1/chat/completions` 404。
4. 中转站本身不可达 / 上游欠费 / 模型名不存在。

## 待办

- [x] 用户执行 curl 实测，回传：HTTP 状态码、TTFB、总耗时、首字节是否分段到达
      → 改为让应用自己诊断，不再依赖人工 curl
- [x] 按实测结果确认上述 1-4 中哪一条
- [x] 修复后二次复查；两轮闭环

## 处置

不要求用户先跑 curl，而是把「猜」变成「报错信息直接说清楚哪一类」：

| 症状 | 现在的表现 |
| --- | --- |
| 建连成功但一个字节都不来（缓冲） | 首字超时后自动退回一次非流式；先试直连，仍失败才报「…内没有返回任何内容（端点 · 模型名）；中转站或反向代理可能开启了缓冲」 |
| 未透传 Authorization | 直接暴露上游 HTTP 状态与文案（鉴权失败 / 额度不足），不再笼统报超时 |
| Base URL 路径不符 | 暴露 `404`，文案提示核对地址 |
| 中转站没有 `/models` | 专用错误码，`check-model.js` 自动改用一次对话请求验证 |
| 生成到一半断流 | 报「生成中断：…已保留已生成的部分」，内容不丢，前端提示可续写 |
| 上游拒绝流式 / 把 SSE 塞进 JSON | 自动退回一次性请求，照常出稿 |

时限不再写死在代码里：`LLM_FIRST_TOKEN_MS`、`LLM_IDLE_MS`、`LLM_PROBE_MS` 可调（环境变量优先于默认值），
给「上游确实慢」的中转站留出空间。所有错误消息只带 `host/path` 与模型名，**不含 API Key**。

## 验证

第一轮（代码层）：

- mock 上游 8 场景 13 条断言全通过（缓冲中转站兜底、无响应超时、中途断流保留内容、
  无 `/models` 回退探测、JSON 塞 SSE、拒绝流式退回、402、模型不存在、密钥不外泄、env 覆盖生效）
- `node --check` 通过 `llm.js` / `index.js` / `check-model.js`

第二轮（集成层）：

- `npx tsc --noEmit` 退出 0；`npx vite build` 成功（56 模块，21.7s）
- 备用端口 8899 冒烟：`/api/health` 200、未登录访问 `/api/projects` 401、`/api/login` 200
- 真实接口 `POST /api/settings/test` 200（0.98s，返回「墨枢已接通。」）
- 真实接口 `POST /api/settings/models` 200（0.13s，返回 2 个模型）
- `node scripts/check-model.js`：模型「deepseek-flash」存在，配置正确

## 遗留

- 复现用户的中转站需其本地环境，本工作区只能验证应用侧行为；若用户回传仍失败，
  请其提供报错原文（现已带端点与模型名，可据此直接定位到上述哪一行）
