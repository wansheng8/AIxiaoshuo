# 墨枢 · 开发说明

本文面向在本仓库上继续开发的工程师，覆盖目录结构、架构数据流、模块地图、数据模型与开发约定。

## 技术栈

- 后端：Node.js + Express 4，纯 CommonJS，无构建步骤
- 前端：React 18 + TypeScript + Vite 5 + react-router-dom 6
- 存储：本地 JSON 文件（`data/`），无数据库
- 模型：作者自备，支持 OpenAI 兼容 / Anthropic / Ollama / Gemini

## 目录结构

```
.
├── backend/
│   ├── src/                后端源码（见下方模块地图）
│   └── package.json        start: node src/index.js
├── frontend/
│   ├── src/                前端源码
│   └── vite.config.ts      端口 5173，/api 反代 127.0.0.1:8787
├── skills/builtin/         21 个内置 Skill 的 Markdown 源文件
├── scripts/                一次性写作 / 缝合脚本（历史脚本，非服务运行时）
├── data/                   运行时数据（多数已 gitignore）
└── start.sh                同时拉起后端与前端 dev server
```

## 架构与数据流

一次生成请求的完整链路：

```
前端 Studio/Voice
  └─ POST /api/generate (body: projectId, skillId, chapterId, include, focusName, mode...)
       ├─ getNovel(projectId)               读取并迁移工程
       ├─ buildPrompt({novel, skill, ...})  拼装 system + user
       ├─ streamChat(...)                   调用模型，SSE 回传 token
       └─ 流结束后 applyGenerated(merged)    把输出写回工程字段
            └─ saveNovel(merged)            乐观锁写入
                 └─ SSE {type:"saved", rev} 把新版本号通知前端
```

前端用 `fetch` + `ReadableStream` 读取 SSE（`api.ts` 的 `readSse()`）：`meta` / `token` / `done` / `saved` / `error` 五类事件。`saved` 事件用于让前端本地 `rev` 与服务端对齐，避免生成后自动保存触发冲突。

## 后端模块地图

| 文件 | 职责 |
| --- | --- |
| `index.js` | Express 服务与全部路由（设置、工程、Skill、元素、文风、提示词预览、生成、拆书） |
| `store.js` | 小说工程存储：列表、读取、创建、保存、归档、复制；settings 读写 |
| `schema.js` | `schemaVersion` 版本表与 `migrate()` / `stamp()` |
| `fileio.js` | `atomicWriteJson` / `atomicWriteText`，临时文件 + rename，可选备份与保留份数 |
| `prompt.js` | `buildPrompt()` 统一拼装、`estimateTokens()`、`stubNovel()`、预算裁剪 |
| `baseline.js` | 运行时基线块（`BASELINE_VERSION` / `buildBaselineBlock`） |
| `skills.js` | 内置 + 自定义 Skill 读写、Markdown 序列化、导入导出、历史 diff 与回退 |
| `context.js` | `buildContext()` 工程上下文、`isWritingSkill` / `isFastSkill` |
| `craft.js` | 写作手艺、风格、伏笔线程（`defaultCraft` / `parseThreads` / `buildCraftBlock`） |
| `genre.js` | 流派 / 平台规则与文本度量（`buildGenreBlock` / `textMetrics`） |
| `elements.js` | 写作元素（新增、覆盖、重置）与注入渲染 |
| `quality.js` | 校对与扫描：`scanText` / `scanTypos` / `scanNameDrift` / `extractNouns` / `proofText` |
| `aigc.js` | 本地 AIGC 统计（`detectAigc`） |
| `emotion.js` | 情绪衔接提示行 |
| `review.js` | 审稿标尺与结论解析 |
| `beats.js` | 细纲解析、目录编目、合并 |
| `apply.js` | `applyGenerated()` 把生成结果写回正文 / 设定 / 线程 |
| `imitate.js` | 仿写：文本分析、维度合并、骨架生成 |
| `importers.js` | 拆书导入 `parseManuscript()` 与 `countWords()` |
| `teardown.js` / `teardown-context.js` | 拆书工程存储与提示上下文 |
| `voice.js` | 个人文风：样本、说明书生成 / 迭代、提示块、试笔 |
| `providers.js` | 供应商协议、默认值、字段夹取（含重试参数） |
| `llm.js` | 模型调用、错误分类、退避重试、流式解析 |

## 前端模块地图

| 文件 | 职责 |
| --- | --- |
| `App.tsx` | 整体布局、侧栏导航、顶部栏、路由、全局任务 dock |
| `api.ts` | 全部后端调用封装、`request()`、`ConflictError`、SSE 读取 |
| `types.ts` | 共享类型（`Novel` / `Settings` / `Skill` / `PromptPreview` 等） |
| `app-state.tsx` | 全局状态（配置状态、字数、文件动作等） |
| `pages/Home.tsx` | 稿本列表、新建 / 导入 / 灵感开书 |
| `pages/Studio.tsx` | 稿本工作台（体量最大，含保存、自动保存、生成编排） |
| `pages/Skills.tsx` | 资产页：Skill 阅读 / 编辑 / 导入导出 / 历史 / 元素 / 提示词预览 |
| `pages/Voice.tsx` | 文风页 |
| `pages/Settings.tsx` | 模型设置与重试参数 |
| `pages/Teardown.tsx` / `TeardownDesk.tsx` | 拆书列表与工作台 |
| `PromptPreview.tsx` | 提示词预览弹窗（分段 / token 统计 / 超预算告警） |
| `jobs.ts` / `Meter.tsx` | 后台任务状态与进度显示 |
| `spark.ts` | 灵感开书的前端预处理 |

## 数据模型

### 小说工程 `data/novels/<id>.json`

关键字段：`id`、`title`、`logline`、`genre`、`status`、`rev`、`schemaVersion`、`brief`、`world`、`characters`、`outline`、`props`、`media`、`style`、`theme`、`pov`、`threads`、`craft`、`lexicon`、`chapters[]`、`logs[]`、`history[]`。

`rev` 是乐观锁版本号，每次成功保存自增；`schemaVersion` 记录数据版本。

### 其他文件

| 文件 | 内容 |
| --- | --- |
| `data/settings.json` | 供应商列表、`activeId`、重试参数、`schemaVersion` |
| `data/voice.json` | 文风样本、说明书正文、迭代历史、`schemaVersion` |
| `data/elements.json` | 内置元素覆盖层与自定义元素、`schemaVersion` |
| `data/teardowns/<id>.json` | 拆书工程与章节切片 |
| `data/skills/` | 自定义 Skill 与内置覆盖层（`.md` + front matter） |
| `data/skill-history/` | Skill 修改历史快照 |
| `data/backups/` | 原子写备份（每份默认保留 10 个） |
| `data/conflicts/` | 并发写冲突的双份快照 |

## schemaVersion 与迁移

- 定义在 `backend/src/schema.js`：`CURRENT_VERSIONS` 声明各数据类型的当前版本，`MIGRATIONS` 按 `旧版本 + 1` 逐级升级。
- `migrate(kind, doc)` 返回 `{ doc, changed }`；`stamp(kind, doc)` 只补充 `schemaVersion`。
- 小说是**惰性迁移**：`getNovel` / `getNovelRaw` 打开工程时才迁移并写回一次，迁移前快照进 `data/novels/backups/<id>/`。列表接口不迁移。
- 新增字段时，在 `MIGRATIONS[kind][新版本]` 里补一段纯函数，旧文件首次打开即自动升级。

## 并发写保护（乐观锁）

- 工程文档带 `rev`。
- `saveNovel(novel, { expectedRev })`：当传入版本号与服务端不一致时抛 409，并把「服务端版本」和「来件版本」两份快照落到 `data/conflicts/`。
- `PUT /api/projects/:id` 透传请求体 `body.rev`；不带版本号时保持旧客户端兼容。
- 前端 `ConflictError`（`api.ts`）识别 409；`Studio.tsx` 的 `conflictRef` 在冲突后暂停自动保存，直到重新加载工程。

## 提示词引擎与 token 预算

- 唯一入口 `prompt.js` 的 `buildPrompt()`，`/api/generate` 与 `POST /api/prompt/preview` 共用。
- 输出 `{ system, user, parts, metrics, warnings, dropped }`，`parts` 便于前端分段展示。
- 默认预算 40000 token（中文按 0.7 token/字估算），可用环境变量 `PROMPT_TOKEN_BUDGET` 或请求体 `tokenBudget` 覆盖。
- 超预算时按优先级省略注入区：写作类先省省略项 / 人物，设定类先省道具 / 世界观 / 人物，并记录到 `warnings` / `dropped`。

## 模型调用与重试

- `llm.js` 的 `classifyLlmError()` 把错误归类为 `auth` / `rate_limit` / `timeout` / `overloaded` / `safety` / `bad_request` / `stream_unsupported` / `unknown`。
- 仅 `429` / `5xx` / 网络错误在**首个 token 之前**退避重试；`401` / `403`、安全拦截、普通 `400` 不重试。
- 参数优先级：设置页 > 环境变量 > 默认值。环境变量 `LLM_RETRY_ATTEMPTS`（默认 3）、`LLM_RETRY_BASE_MS`（默认 800）、`LLM_RETRY_MAX_MS`（默认 15000）。

## Skill 结构

内置 Skill 是 `skills/builtin/*.md`，front matter 定义 `id` / `name` / `scene` / `target` / `order` / `enabled`，正文是说明书。可用的条件字段：

- `tags`：元素与分类
- `whenFlow`：按流派触发
- `whenPlatform`：按平台触发
- `whenVoice`：按文风启用状态触发

自定义 Skill 与内置覆盖层写入 `data/skills/`。Skill id 保持稳定，重排只动 `order`。

## 开发命令

后端语法检查（逐个文件）：

```bash
cd backend
node --check src/index.js
```

前端类型检查与生产构建：

```bash
cd frontend
npx tsc --noEmit
npx vite build
```

启动开发环境：

```bash
bash start.sh
```

## 测试约定

仓库没有引入测试框架。改动后端逻辑时，推荐：

1. 用 `node --check` 过一遍改到的文件。
2. 把 `backend/src` 拷到 `/tmp/opencode/backend/src` 做隔离验证：此时 `store.js` 的 `ROOT` 解析为 `/tmp/opencode`，测试数据落在 `/tmp/opencode/data`，不会污染真实 `data/`。
3. 前端跑 `npx tsc --noEmit && npx vite build`。
4. 重启后端并通过 `curl http://localhost:8787/api/health` 确认存活。

## 约定

- 所有面向用户的文本使用简体中文。
- 系统输出统一用【】；正文标点用全角。
- 数据写入统一走 `fileio.js` 的原子写，需要留痕时加 `{ backup: true }`。
- 提交前不要遗留调试输出与死代码。
