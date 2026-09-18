# User Instruction Memory

This file records user instructions, preferences, and teachings for reference in future interactions.

## Format

### User Instruction Entry
[User Instruction Summary]
- Date: [YYYY-MM-DD]
- Context: [Mentioned scenario or time]
- Instructions:
  - [Content of user teaching or instruction, described line by line]

### Project Knowledge Entry
[Project Knowledge Summary]
- Date: [YYYY-MM-DD]
- Context: Discovered by Agent while performing [specific task description]
- Category: [Operations & Deployment|Build Methods|Testing Methods|Troubleshooting & Debugging|Workflow & Collaboration|Environment Configuration]
- Instructions:
  - [Specific knowledge points, described line by line]

## Deduplication Strategy
- Before adding a new entry, check for similar or identical instructions.
- If a duplicate is found, skip the new entry or merge it with the existing one.
- When merging, update the context or date information.
- This helps avoid redundant entries and keeps the memory file tidy.

## Entries

[Project Knowledge Summary]
- Date: 2026-09-10
- Context: Discovered by Agent while adding the personal writing-style (voice) skill to 墨枢工坊
- Category: Build Methods / Troubleshooting & Debugging / Operations & Deployment
- Instructions:
  - 前端生产构建用 `npx vite build`，只做 esbuild 转译，不做类型检查。
  - `npx tsc --noEmit` 在仓库里有大量既有类型错误（Studio.tsx / api.ts / spark.ts 等历史遗留），不能当作本次改动失败的依据。
  - 独立启动后端：`cd /workspace/backend && node src/index.js`，端口 8787；`start.sh` 同拉 5173 + 8787。
  - 数据都落在 `data/`：`novels/`、`teardowns/`、`skills/`（覆盖层与 `.factory` 备份）、`voice.json`（个人文风）。

[User Instruction Summary]
- Date: 2026-09-10
- Context: 校对把作者样本里的明喻报成「空比喻」，用户裁定优先级
- Instructions:
  - 个人文风（底味）优先级最高：voice 启用且已有说明书时，作者的写法压过平台通用家规，包括明喻（像／仿佛／宛如／好似／如同／似的）。
  - 实现上：`isVoiceActive()` 为真时，`scanText` 传 `{ allowSimile: true }` 跳过 `scanEmptyFig`；生成文风的提示词与 `voiceBlock()` 都不得限制作者使用明喻。
  - 平台只保留最低限度阅读格式（全角标点、系统输出用【】）。

[User Instruction Summary]
- Date: 2026-09-11
- Context: 用户要求标准化报错处理流程
- Instructions:
  - 任务过程中一旦出现报错，必须先把报错记录到文件（如 `/tmp/*-report.txt`、终端日志或项目日志），再动手修复。
  - 修复后必须二次复查同一份报错记录，确认无遗留并再次修复，形成两轮闭环。
  - 此后所有任务都按此流程执行。

[User Instruction Summary]
- Date: 2026-09-13
- Context: 用户对写作产出提出用字硬要求
- Instructions:
  - 正文与审稿产出中不得存在错别字、同音字或别字、多字漏字、生造词，也不得中英混用标点或全半角混排。
  - 人名、地名、功法等专名前后写法必须一致。
  - 该要求是硬底线，任何写法与文风下都不得放宽。

[Project Knowledge Summary]
- Date: 2026-09-13
- Context: Discovered by Agent while adding prompt preview and LLM retry
- Category: Environment Configuration / Troubleshooting & Debugging
- Instructions:
  - 提示词拼装以 `backend/src/prompt.js` 的 `buildPrompt()` 为唯一入口，`/api/generate` 已切到它；`POST /api/prompt/preview` 走同一函数，不调模型，无 projectId 时用桩工程。
  - 提示词 token 预算默认 40000，可用环境变量 `PROMPT_TOKEN_BUDGET` 或请求体 `tokenBudget` 覆盖；超预算按优先级省略注入区并写进 warnings，中文字符按 0.7 token/字估算。
  - 模型调用失败分类与退避重试在 `backend/src/llm.js`：设置页可配「失败重试次数 / 退避基数 / 退避上限」，也可用环境变量 `LLM_RETRY_ATTEMPTS`（默认 3）、`LLM_RETRY_BASE_MS`（默认 800）、`LLM_RETRY_MAX_MS`（默认 15000）覆盖；仅 429/5xx/网络错误重试，401/403、安全拦截、普通 400 不重试，重试只发生在首个 token 之前。
  - 原子写与备份统一在 `backend/src/fileio.js`：`atomicWriteJson` 写临时文件再 rename，`{backup:true}` 会在 `data/backups/<文件名>/` 留一份快照并只保留最近 10 份；已接入 settings.json、voice.json、elements.json（novels/teardowns 原本就是原子写）。

[Project Knowledge Summary]
- Date: 2026-09-13
- Context: Discovered by Agent while adding schema versioning and optimistic write locking
- Category: Troubleshooting & Debugging / Workflow & Collaboration
- Instructions:
  - 数据版本标记与迁移统一在 `backend/src/schema.js`：`migrate(kind, doc)` 按 `CURRENT_VERSIONS` 逐步升级，`stamp(kind, doc)` 只写 `schemaVersion`。当前 novel/teardown/settings/voice/elements 均为 v2。
  - novel 是惰性迁移：只有 `getNovel`/`getNovelRaw` 打开工程时才迁移并写回一次，`data/novels/backups/<id>/` 会留迁移前快照；列表接口不迁移。旧工程首次打开即自动升到 v2 并补 `rev`。
  - 并发写保护用乐观锁：小说文档带 `rev`，`saveNovel(novel, {expectedRev})` 版本不符时抛 409，并把「服务端版本」与「来件版本」两份快照落到 `data/conflicts/`。`PUT /api/projects/:id` 透传 `body.rev`。
  - SSE `/api/generate` 在服务端保存后会补发 `{type:"saved", rev}` 事件，前端 `onSaved` 用 `syncSavedRev` 同步本地 `rev`，避免生成后自动保存误报冲突。前端冲突类为 `ConflictError`（`frontend/src/api.ts`），冲突时 `Studio` 的 `conflictRef` 会暂停自动保存直到重新加载。
  - 隔离测试物理位置：把 `backend/src` 拷到 `/tmp/opencode/backend/src` 时，`store.js` 的 ROOT 会解析成 `/tmp/opencode`（上两级），测试数据落在 `/tmp/opencode/data`，不碰真实 `data/`。

[Project Knowledge Summary]
- Date: 2026-09-13
- Context: Discovered by Agent while adding production deployment (Docker / direct / systemd)
- Category: Operations & Deployment / Build Methods
- Instructions:
  - 生产为单端口：后端 `backend/src/index.js` 在检测到 `frontend/dist/index.html` 存在时用 `express.static` + SPA 通配托管页面，`/api/*` 之外的未知路径回退 `index.html`，未知 API 仍返回 JSON 404。
  - 无 Docker 的生产启动：先构建前端（`cd frontend && npm ci && npm run build`）、装后端生产依赖（`cd backend && npm ci --omit=dev`），再 `node backend/src/index.js`；或直接 `./start-prod.sh`（缺依赖/产物时自动补齐）。`start.sh` 是开发模式（Vite 5173 + 后端 8787）。
  - Docker：根目录 `Dockerfile`（多阶段）+ `docker-compose.yml`（`./data:/app/data` 持久化）。容器以非 root 的 `node` 用户运行，Linux 首次部署需 `mkdir -p data && sudo chown -R 1000:1000 data`。
  - 生产环境变量只有 `PORT`、`PROMPT_TOKEN_BUDGET`、`LLM_RETRY_ATTEMPTS/BASE_MS/MAX_MS`、`LLM_FIRST_TOKEN_MS`、`LLM_IDLE_MS`、`LLM_PROBE_MS`、`MODEL_PROBE_TTL_MS`，以及可选的 `ACCESS_PASSWORD`（留空不启用鉴权，设置后除 `/api/health` 外接口都需验证，登录态用 HttpOnly Cookie）；模型 Key 在设置页写入 `data/settings.json`，不走环境变量。
  - 辅助文件在 `deploy/`：`moshu.service`（systemd，部署路径 `/opt/moshu`）、`nginx.conf`（域名反代，SSE 需 `proxy_buffering off`）、`moshu.env.example`。完整说明见根目录 `DEPLOYMENT.md`。
  - 本环境未安装 Docker，无法实际构建镜像；Dockerfile/compose 仅做静态校验。

[Project Knowledge Summary]
- Date: 2026-09-16
- Context: Discovered by Agent while hardening the LLM call path (timeouts, non-stream fallback, partial output, four-protocol support)
- Category: Testing Methods / Workflow & Collaboration
- Instructions:
  - 验证 `backend/src/llm.js` 的调用路径不要打真实接口：跑 `node scripts/llm-mock-test.js`（本地 mock 上游 + patch `store.getSettings`），覆盖四类协议的流式/非流式/错误/模型列表，不联网也不消耗作者额度，并能断言「错误消息不含 API Key」。
  - 模型的等待时限一律走环境变量（`LLM_FIRST_TOKEN_MS` / `LLM_IDLE_MS` / `LLM_PROBE_MS`，env 优先于代码默认值），不要在调用处写死毫秒数，否则作者改 env 不生效。
  - `check-model.js` 的 `/models` 失败不等于配置错：先看是否返回 `LLM_NO_MODELS_ENDPOINT`（中转站没实现该端点），此时它会自动改用一次对话请求验证。
  - 四类协议的差异集中在三处：`normalizeBaseUrl`（ollama 去 `/api`、gemini 补 `/v1beta`、其余补 `/v1`）、`requestPlan`（各家 URL / 鉴权头 / body 形状）、`extractDelta`/`extractComplete`（流式与整体解析）。改任何一处都要跑一遍 mock 回归。
  - 上游把错误塞在 HTTP 200 响应体里（Anthropic 的 `error` 事件、Ollama 的 `{"error":...}`、Gemini 的安全拦截）是常态，统一由 `guardPayload` 拦截并抛可读错误；加新协议时要一并接入，否则表现为「空生成」。
  - 本环境无法访问 `generativelanguage.googleapis.com`（curl 返回 000），Gemini 真实端点只能靠 mock 回归；`api.anthropic.com` 与 `api.deepseek.com` 可直连。
  - 模型可用性探测统一走 `llm.probeModel(draft)`（非流式最小对话请求，`completeOnce`），`POST /api/settings/test` 的 `testChat` 也改为调用它，两个入口共用同一实现；探测超时用 `LLM_PROBE_MS`，不用 `LLM_FIRST_TOKEN_MS`/`LLM_IDLE_MS`。
  - 探测结果缓存在 `data/settings.json` 的 `providers[].probes`（`{ ok, ms, reason, at }`），由 `store.recordProbe()` 写回；`providers.cleanProbes()` 按 `models` 裁剪，TTL 默认 12 小时、可用 `MODEL_PROBE_TTL_MS` 覆盖。`recordProbe` 会把被探测的模型并入 `provider.models`，否则未保存的模型探测结果会被裁掉。
  - 客户端保存设置时不回传 `probes`，`normalizeProvider` 用 `row.probes || prev.probes` 保留服务端记录；新增设置字段时要保持这个约定，否则会清空探测缓存。

[User Instruction Summary]
- Date: 2026-09-13
- Context: 用户指定搭建 / 部署教程的参考样式
- Instructions:
  - README 与部署文档中的搭建、部署教程，参考 https://github.com/wansheng8/OCNovel 与 https://github.com/wansheng8/NovelForge 两个仓库的 README 结构。
  - 借鉴点：顶部文档导航锚点、独立的「系统要求 / 前置条件」块（标注推荐版本与下载链接）、两种以上部署方式并列（源码运行 vs 容器 / 发行版）、下载后的项目结构树、分步命令 + 常见问题表。
  - 墨枢的 `README.md` 与 `DEPLOYMENT.md` 已按此结构重构。
