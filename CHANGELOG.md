# 变更记录

本文件记录墨枢的功能变更。日期为迭代日期，按时间倒序。

## 未发布

### 部署

- 后端支持托管前端构建产物，生产环境单端口（`8787`）同时提供页面与 API
- 新增多阶段 `Dockerfile`、`docker-compose.yml` 与 `.dockerignore`，数据通过卷持久化
- 新增 `start-prod.sh`（无 Docker 直连部署）与 `deploy/`（systemd 单元、nginx 示例、生产 env 示例）
- 新增 `DEPLOYMENT.md` 完整部署指南
- 修复 `Dockerfile` 未打包 `skills/builtin` 的问题：此前容器镜像缺少内置 Skill，生成时无可用 Skill
- 后端启动时自检 `skills/builtin`，缺失打印告警；启动即创建 `data/`
- 部署文档补充「获取代码」步骤：本地搭建同样需要先从 Git 仓库克隆代码与内置 Skill
- `DEPLOYMENT.md` 重写为零基础版：安装工具、下载代码、配置模型、首次使用、局域网访问、排错大全逐步说明；README 增加指引
- 新增 `backend/src/env.js`：优先调用 Node 内置 `process.loadEnvFile`（20.6+），低版本回退到内置解析器；后端启动自动读取项目根目录 `.env`，已有环境变量优先；`.dockerignore` 排除 `.env` 防止密钥进镜像
- 新增 `scripts/setup.sh`（一键装依赖并构建）、`scripts/serve.sh`（pidfile 管理启停，避免 pkill 误杀）、`scripts/check-model.js`（核对配置的模型名是否真实存在）；文档改用脚本并补充模型自检步骤
- 新增可选访问密码 `ACCESS_PASSWORD`：设置后除 `/api/health` 外所有接口都需要验证，登录状态用 HttpOnly Cookie 保存（也可用 `x-access-password` 请求头）；留空即不启用鉴权。`.env.example`、Docker Compose 与部署文档同步说明
- 修正默认模型名为接口实际提供的 `deepseek-flash`（原 `deepseek-v4-flash` 已不在 `/models` 列表中）
- 重构 `README.md` 与 `DEPLOYMENT.md`：新增顶部文档导航、独立的「系统要求」块、部署方式总览表、项目结构树；部署方式统一为「方式一 · 本机 / 方式二 · Docker Compose / 方式三 · Docker 单容器 / 方式四 · systemd」
- Docker 构建支持自定义基础镜像：`Dockerfile` 引入 `ARG NODE_IMAGE` 并移除 `# syntax` 指令，`docker-compose.yml` 透传 `NODE_IMAGE`；本地已有 `node:20-alpine` 时构建不再联网拉取，文档补充离线 / 内网构建与 `docker load` 做法
- README 新增「使用方法」：启停 / 自检命令表与界面操作对照表，逐页细节指向 `USER_GUIDE.md`
- 完善搭建教程：补充 nvm / nvm-windows 安装 Node 20、网络受限时的镜像与代理配置、安装完成自检清单、换机迁移与卸载重置、Windows 任务计划程序与 macOS launchd 开机自启，并扩充排错表
- 完善 Docker 部署教程：`DEPLOYMENT.md` 第四节重写为「直接 clone / 加速前缀 / 下载 ZIP + 拉库失败排查表」，第六节新增 compose 校验与构建失败定位（含 CentOS SELinux 权限坑），第十二节排错表补充 Docker 高频问题；`docker-compose.yml` 端口参数化（`.env` 的 `PORT` 同时控制映射与容器端口）、镜像支持 `MOSHU_TAG` 版本标签、移除重复的 compose healthcheck（改为继承 Dockerfile）；README 方式二 / 方式三补充改端口说明、PowerShell 写法与容器清理命令
- 新增 `.github/workflows/docker.yml`：main 分支 push 或打 `v*` 标签时自动构建并推送镜像到 GHCR（`ghcr.io/<owner>/moshu`）；README「部署方式」新增「方式零 · 预构建镜像」，只装 Docker 即可一条命令运行
- 重排 `README.md` 为 UI 版首页：居中 Hero 与 8 枚 shields.io 徽章、10 项能力双列卡片、页面速览、9 家供应商参数表、使用方法、部署方式矩阵、环境变量表；项目结构与数据位置改为可折叠 `<details>`；新增 `docs/architecture.svg` 系统架构示意图（用户层 → Express 服务层 → 模型层 → `data/` 数据层 + 七步写作流水线）

### 模型调用健壮性

- 四类协议（OpenAI 兼容 / Anthropic / Ollama / Gemini）逐套打通并加回归测试：
  - Gemini 的 Base URL 缺版本段时自动补 `/v1beta`（此前填裸域名会拼出错误路径）
  - 上游把错误塞在 HTTP 200 响应体里（Anthropic 的 `error` 事件、Ollama 的 `{"error":...}`、Gemini 的安全拦截）现在会被识别成可读报错，不再表现为"生成出空内容"
  - 思考片段不再混进正文：Anthropic 的 `thinking_delta`、Gemini 2.5 的 `part.thought` 只算作"有输出"
  - Anthropic 支持「思考」开关（自动带 `thinking` 预算并让 `temperature` 保持默认值）；只有 Gemini 2.5 系模型才下发 `thinkingConfig`
  - Ollama 的 `num_ctx` 压到 32768，避免把 `contextLength` 默认值 200000 直接交给本地模型吃光显存
  - Gemini 未走 `alt=sse`、把分块结果装在数组里返回时也能正确拼装
- 新增 `scripts/llm-mock-test.js`：本地 mock 上游驱动四类协议的真实代码路径，覆盖流式拼装、整体返回、拒绝流式退回、超时、断流、模型列表、错误文案与密钥不外泄，50 项断言全通过；`README.md` 与 `DEPLOYMENT.md` 同步
- `backend/src/llm.js` 重构流式调用：区分「连上了但没吐字节」与「吐了正文后中途断流」；首字（`LLM_FIRST_TOKEN_MS`）与空闲（`LLM_IDLE_MS`）时限改由环境变量控制，探测时限用 `LLM_PROBE_MS`，不再散落在调用处硬编码
- 首次请求长时间收不到任何内容时，自动退回一次非流式请求；上游拒绝流式、或把 SSE 塞进 `application/json` 响应体时同样能取到正文
- 中途断流不再被当成生成成功：已生成内容照常保存并标记为 `incomplete`，前端提示「生成中断，已保留 N 字」，续写可接上（此前会静默截断，或整段丢弃）
- 错误文案带上端点与模型名（不含 API Key），并补齐 `402` 额度不足、`404` 路径不对、`405/501` 能力不存在、模型名不存在等可读提示
- `GET /models` 不被中转站支持时返回专用错误码，`scripts/check-model.js` 自动改用一次对话请求验证配置
- `.env.example`、`deploy/moshu.env.example` 与 `DEPLOYMENT.md` 同步新增超时变量、中转站 / 自建反代的配置要求与排错条目

### 模型可用性点亮

- 新增 `POST /api/settings/probe`：对单个模型发一条最小对话请求，返回是否可用、延时毫秒与失败原因；`testChat` 与探测共用 `llm.probeModel()` 同一实现
- 设置页模型列表与顶栏模型菜单显示可用性状态点：绿色=可用、红色=不可用（悬停看原因）、灰色空心=未测，并显示最近一次延时；探测失败时给出具体原因（额度、模型名、超时、安全拦截等）
- 支持「探测」逐条测与「全部探测」整组测（并发 2、显示进度、可停止）；结果缓存到 `data/settings.json`，刷新页面后仍在，默认 12 小时后过期，可用 `MODEL_PROBE_TTL_MS` 调整
- 客户端保存设置时保留服务端探测缓存；模型被移出候选列表后其探测记录同步清理

### 数据加固

- 新增 `backend/src/schema.js`：为小说、拆书、设置、文风、元素引入 `schemaVersion` 与迁移链，旧工程首次打开自动升级并补 `rev`，迁移前留快照到 `data/novels/backups/`
- 小说引入乐观锁：`saveNovel(novel, { expectedRev })` 版本不符返回 409，两份内容落 `data/conflicts/`；`PUT /api/projects/:id` 透传 `rev`
- 生成接口在保存后补发 `{ type: "saved", rev }` 事件，前端据此同步本地版本，避免误报冲突
- 拆书、文风、元素的读写接入统一迁移标记与原子写

## 2026-09-13

### 提示词组装引擎

- 新增 `backend/src/prompt.js`：`buildPrompt()` 统一拼装 system / user，输出分段、token 统计、超预算告警
- `/api/generate` 切换到统一引擎；新增 `POST /api/prompt/preview`（不调模型）
- token 预算默认 40000，超预算按优先级省略注入区
- 前端新增提示词预览组件，接入资产页与稿本工作台

### 模型错误重试

- 新增错误分类：鉴权、限流、超时、过载、安全、请求错误、流式不支持、未知
- 仅对限流、服务端错误、网络错误在首包前指数退避重试，可配次数与退避上限
- 重试参数进入设置页，也可用环境变量覆盖

### 原子写统一

- 新增 `backend/src/fileio.js`：临时文件 + rename，支持备份与保留份数
- 设置、文风、元素接入原子写与备份

## 2026-09-12

### Skill 四层升级

- 运行时基线 `baseline.js` 与 `BASELINE_VERSION`
- 条件注入：按 `tags` / `whenFlow` / `whenPlatform` / `whenVoice` 触发
- Markdown 单份导入导出
- 历史行级 diff 与回退
- 审稿增加「错别字与用字」检查节
- 内置 Skill 内容层保守去重

## 2026-09-11

- 标准化报错处理流程：先记录、再修复、二次复查闭环
- 字体零容忍规则落地到审稿与校对
- 类型引擎、平台规则、人类特征、去 AI、仿写骨架全链路对齐

## 2026-09-09

- 新增拆书能力：书源导入、按章切片、章纲 / 角色 / 黄金三章 / 事件 / 大纲 / 细纲 / 技法 / 仿写骨架
- 拆书与稿本分库

## 2026-09-08

- 新增章节审稿：番茄标尺下的钩子、爽点密度、人设反差、合规与可执行改稿

## 2026-09-03

- 新增校对与情绪衔接能力
- 稿本工作台形成目录 / 稿纸 / 手艺三栏结构

## 更早

- 墨枢基础版本：单机稿本管理、流式生成、内置写作 Skill、模型设置
