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
