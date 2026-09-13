# 墨枢

单人 AI 小说工坊。作者按章节写作，系统用 Markdown Skill 说明书编排大模型，完成开书策划、世界观、人物、大纲、分章细纲、正文、续写、润色、审稿，以及参考小说的拆书。

墨枢把「怎么写」沉淀成可读、可改、可导入导出的 Skill 文件，模型只负责按说明书落笔。数据全部落在本地 `data/`，作者自备模型接口。

**文档导航**：[核心能力](#核心能力) · [页面](#页面) · [系统要求](#系统要求) · [快速开始](#快速开始) · [配置模型](#配置模型) · [部署方式](#部署方式) · [项目结构](#项目结构) · [建议写法](#建议写法) · [数据位置](#数据位置) · [文档索引](#文档索引)

## 核心能力

- **21 个内置 Skill**：12 个写作类 + 9 个拆书类，可在「资产」页阅读全文、克隆、微调
- **自定义 Skill**：自己写说明书，指定写入立项 / 世界 / 人物 / 大纲 / 细纲 / 正文
- **Skill 四层结构**：运行时基线、条件注入（按流程 / 平台 / 文风触发）、Markdown 单份导入导出、历史行级 diff 与回退
- **提示词组装引擎**：`buildPrompt()` 统一拼装，带 token 预算与超预算优先级裁剪，可在保存前预览
- **模型错误重试**：仅对 429 / 5xx / 网络错误在首包前指数退避重试，可配次数与退避上限
- **个人文风（底味）**：导入作者原文样本，逆向出个人文风说明书，压过平台通用家规
- **拆书工作台**：导入作者自备 TXT / Markdown，按章拆章纲、角色、黄金三章、事件、大纲、细纲、技法、仿写骨架
- **章节审稿**：按番茄标尺给出钩子、爽点密度、人设反差、合规与可执行改稿建议
- **三栏工作台**：目录与设定、稿纸、手艺面板；流式生成，随时停笔
- **数据加固**：schema 版本与迁移、原子写与备份、乐观锁并发写保护

## 页面

| 路径 | 页面 | 说明 |
| --- | --- | --- |
| `/` | 首页 | 稿本列表、新建 / 导入 / 灵感开书 |
| `/studio/:id` | 稿本工作台 | 设定、细纲、逐章正文与生成 |
| `/teardown` | 拆书 | 拆书工程列表与导入 |
| `/teardown/:id` | 拆书工作台 | 按章节切片做技法拆解 |
| `/skills` | 资产 | Skill 阅读、编辑、导入导出、历史回退、元素与提示词预览 |
| `/voice` | 文风 | 个人文风样本、说明书生成、迭代与试笔 |
| `/settings` | 设置 | 模型供应商、重试参数 |

## 系统要求

| 项目 | 要求 | 说明 |
| --- | --- | --- |
| Node.js | 20 LTS（最低 18） | 运行后端、构建前端；[nodejs.org](https://nodejs.org) |
| npm | 10.x（随 Node 安装） | 安装依赖 |
| Git | 2.x | 下载与更新代码；也可在 GitHub 页面下载 ZIP 代替 |
| Docker | 24+ 与 Compose 插件 | 仅容器方式需要；[docker.com](https://www.docker.com/products/docker-desktop) |
| 磁盘 | 200 MB 以上 | 代码与依赖约 200 MB，作品数据体积很小 |
| 网络 | 后端能出网 | 需访问你在设置页配置的模型接口 |
| 模型接口 | 自备 API Key | 墨枢不内置模型，Key 只存本机 |

浏览器使用较新版本的 Chrome / Edge / Safari / Firefox 均可。

## 快速开始

三条命令即可在本机跑起来，全程复制、回车；需要逐步照做时看 [DEPLOYMENT.md](./DEPLOYMENT.md)。

```bash
# 1. 下载代码与 21 个内置 Skill
git clone https://github.com/wansheng8/AIxiaoshuo.git
cd AIxiaoshuo

# 2. 检查环境、安装依赖、构建前端
bash scripts/setup.sh

# 3. 后台启动服务
bash scripts/serve.sh start
```

浏览器打开 `http://127.0.0.1:8787`，进入「设置」页填好模型接口，即可开始写作。更多启动方式见 [部署方式](#部署方式)。

## 配置模型

打开「设置」页，填写协议、Base URL、模型名与 API Key 即可。支持 OpenAI 兼容 Chat Completions、Anthropic、Ollama、Gemini；可保存多个供应商并切换。

配置完成后，建议核对模型名是否真实可用（避免凭名字猜）：

```bash
node scripts/check-model.js
```

Key 只保存在本机 `data/settings.json`，不要写进脚本，也不要提交到仓库。各供应商的 Base URL 与模型示例见 [DEPLOYMENT.md 第七节](./DEPLOYMENT.md)。`.env.example` 与 `deploy/moshu.env.example` 提供生产环境变量示例，模型接口以设置页配置为准。

## 部署方式

墨枢生产模式为单端口：后端在 `8787` 同时提供页面与 API，数据落在 `data/`。按场景选一种方式即可。

零基础用户请看 **[DEPLOYMENT.md](./DEPLOYMENT.md)（零基础版）**：从安装 Git / Node.js / Docker、下载代码，到配置模型、写出第一章，逐步照做即可。

| 方式 | 适用场景 | 访问地址 |
| --- | --- | --- |
| 方式一 · 本机开发模式 | 本地开发调试 | `http://127.0.0.1:5173` |
| 方式一 · 本机生产模式 | 个人电脑长期使用 | `http://127.0.0.1:8787` |
| 方式二 · Docker Compose | 服务器部署（推荐） | `http://服务器IP:8787` |
| 方式三 · Docker 单容器 | 不想用 Compose | `http://服务器IP:8787` |
| 方式四 · systemd | Linux 服务器常驻 | `http://服务器IP:8787` |

### 获取代码

代码与 21 个内置 Skill 都在 Git 仓库里，先把仓库克隆到目标机器（本地搭建同样需要这一步）：

```bash
git clone https://github.com/wansheng8/AIxiaoshuo.git
cd AIxiaoshuo
```

如果是自己的 Fork，把地址换成你的仓库。已经克隆过的，升级时在项目根目录执行 `git pull` 即可。下文所有命令都在项目根目录执行。

### 方式一：本机直接部署

开发模式（Vite 热更新，前端 `5173` 反代后端 `8787`）：

```bash
cd backend
npm install

cd ../frontend
npm install

cd ..
bash start.sh
```

浏览器打开 `http://127.0.0.1:5173`。

生产模式（构建前端，后端单端口托管）：

```bash
cd frontend
npm ci
npm run build

cd ../backend
npm ci --omit=dev
```

```bash
cd backend
node src/index.js
```

浏览器打开 `http://127.0.0.1:8787`。

也可以用脚本一条龙完成，新手推荐：

```bash
# 安装依赖 + 构建前端
bash scripts/setup.sh

# 后台启动 / 停止 / 重启 / 查看状态
bash scripts/serve.sh start
bash scripts/serve.sh stop
bash scripts/serve.sh restart
bash scripts/serve.sh status
```

配置好模型后，核对模型名是否真实可用：

```bash
node scripts/check-model.js
```

Windows 在 PowerShell 中按相同顺序执行，使用 `npm ci`、`npm run build`，最后 `node src/index.js`。

### 方式二：Docker Compose（推荐）

前置：安装 Docker 与 Compose 插件。在项目根目录执行：

```bash
mkdir -p data
sudo chown -R 1000:1000 data
docker compose up -d --build
```

浏览器打开 `http://服务器IP:8787`。

常用命令：

```bash
docker compose logs -f
docker compose ps
docker compose restart
docker compose down
```

容器以非 root 的 `node` 用户运行，Linux 首次部署需把宿主 `data/` 目录归属改为 `1000:1000`；macOS / Windows 的 Docker Desktop 通常无需处理。

### 方式三：Docker 单容器

构建镜像：

```bash
docker build -t moshu:latest .
```

运行容器：

```bash
docker run -d \
  --name moshu \
  --restart unless-stopped \
  -p 8787:8787 \
  -e PORT=8787 \
  -v "$(pwd)/data:/app/data" \
  moshu:latest
```

浏览器打开 `http://服务器IP:8787`。查看日志：

```bash
docker logs -f moshu
```

### 方式四：systemd 常驻（Linux 服务器）

1. 部署代码到 `/opt/moshu`，并按「本机生产模式」完成前端构建与后端依赖安装。
2. 创建专用用户、准备数据目录与环境变量文件：

```bash
sudo useradd -r -s /usr/sbin/nologin moshu
sudo mkdir -p /opt/moshu/data
sudo chown -R moshu:moshu /opt/moshu/data
sudo cp /opt/moshu/deploy/moshu.env.example /opt/moshu/deploy/moshu.env
```

3. 安装并启动服务：

```bash
sudo cp /opt/moshu/deploy/moshu.service /etc/systemd/system/moshu.service
sudo systemctl daemon-reload
sudo systemctl enable --now moshu
```

4. 查看状态与日志：

```bash
systemctl status moshu
journalctl -u moshu -f
```

### 反向代理与 HTTPS

后端已同时提供页面与接口，需要绑定域名时前接 nginx。复制 `deploy/nginx.conf`，把 `server_name` 换成你的域名，然后：

```bash
sudo cp deploy/nginx.conf /etc/nginx/conf.d/moshu.conf
sudo nginx -t
sudo systemctl reload nginx
```

签发证书：

```bash
sudo certbot --nginx -d moshu.example.com
```

生成接口是 SSE 流式响应，nginx 需关闭 `proxy_buffering` 并放宽超时，`deploy/nginx.conf` 已配置好。

### 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `8787` | 服务端口 |
| `PROMPT_TOKEN_BUDGET` | `40000` | 提示词 token 预算 |
| `LLM_RETRY_ATTEMPTS` | `3` | 生成失败重试次数（1-8） |
| `LLM_RETRY_BASE_MS` | `800` | 退避基数毫秒 |
| `LLM_RETRY_MAX_MS` | `15000` | 退避上限毫秒 |
| `ACCESS_PASSWORD` | 空 | 可选访问密码；留空表示不启用鉴权，公网部署建议设置 |

模型接口（Base URL、模型名、API Key）在应用「设置」页填写，保存在 `data/settings.json`，不通过环境变量注入。

### 数据持久化与备份

所有用户数据都在 `data/`，备份即打包该目录：

```bash
tar -czf moshu-backup-$(date +%Y%m%d).tar.gz data/
```

恢复时先停止服务，把备份解回 `data/`，再重启服务。

### 升级

```bash
git pull
```

Docker Compose：

```bash
docker compose up -d --build
```

直接部署或 systemd：

```bash
cd frontend
npm ci
npm run build

cd ../backend
npm ci --omit=dev
sudo systemctl restart moshu
```

数据带 `schemaVersion`，旧工程首次打开会自动迁移，并在 `data/novels/backups/` 留迁移前快照，无需手工处理。

### 部署排错

- 页面打不开但接口正常：确认已执行前端构建，且存在 `frontend/dist/index.html`；后端只在检测到该文件时托管页面。
- 「资产」页没有内置 Skill、生成时报无可用 Skill：确认部署时带上了 `skills/builtin` 目录；后端启动日志会打印对应告警。
- 模型名报错或输出空白：执行 `node scripts/check-model.js`，按列出的实际模型名修改设置页。
- Docker 容器反复重启：Linux 下执行 `sudo chown -R 1000:1000 data`。
- 生成长时间无响应：模型较慢时属正常；经 nginx 时确认已关闭缓冲（见 `deploy/nginx.conf`）。
- 修改端口后访问不到：同时修改 `PORT` 与端口映射，例如 `PORT=9000` 配 `docker run -p 9000:9000`。

更完整的说明（Windows 细节、健康检查、回滚流程）见 [DEPLOYMENT.md](./DEPLOYMENT.md)。

## 项目结构

```
AIxiaoshuo/
├── backend/              后端（Express 单端口，同时提供 API 与页面）
│   └── src/
│       ├── index.js      入口：路由、静态托管、可选访问密码
│       ├── prompt.js     提示词组装引擎
│       ├── llm.js        模型调用、流式输出与重试
│       ├── providers.js  供应商协议目录
│       ├── store.js      数据读写、迁移与乐观锁
│       ├── schema.js     版本与迁移链
│       ├── fileio.js     原子写与备份
│       └── skills.js     内置与自定义 Skill 管理
├── frontend/             前端（React + Vite）
│   └── src/
│       ├── pages/        首页 / 稿本 / 拆书 / 资产 / 文风 / 设置
│       ├── api.ts        接口封装
│       └── app-state.tsx 全局状态
├── skills/
│   └── builtin/          21 个内置 Skill（12 写作 + 9 拆书，勿删）
├── scripts/
│   ├── setup.sh          一键安装依赖并构建前端
│   ├── serve.sh          后台启动 / 停止 / 重启 / 状态
│   └── check-model.js    核对模型名是否真实可用
├── deploy/               systemd 单元、nginx 示例、生产 env 示例
├── data/                 作品、文风、设置（首次启动自动创建）
├── Dockerfile            多阶段镜像构建
├── docker-compose.yml    Compose 部署
├── start.sh              开发模式（Vite 热更新）
├── start-prod.sh         生产模式（单端口直连）
├── DEPLOYMENT.md         零基础部署指南
├── USER_GUIDE.md         使用说明
├── DEVELOPMENT.md        开发与架构
└── CHANGELOG.md          变更记录
```

## 建议写法

1. 新开一部，写一句灵感
2. 依次执行：开书策划 → 世界观 → 人物小传 → 全书大纲 → 分章细纲
3. 点「按细纲拆入目录」
4. 逐章执行「章节正文」，卡住时用续写，定稿前用审稿
5. 在「文风」页导入自己的原文，让代笔贴近个人笔感

## 数据位置

```
data/
├── novels/            小说工程（每部一个 JSON）
├── teardowns/         拆书工程
├── skills/            自定义 Skill 与覆盖层
├── skill-history/     Skill 历史快照
├── backups/           原子写备份
├── conflicts/         并发写冲突副本
├── elements.json      写作元素
├── voice.json         个人文风
└── settings.json      模型设置
```

## 文档索引

- [DEPLOYMENT.md](./DEPLOYMENT.md)：零基础部署指南（Docker / 本机 / systemd / 反向代理）
- [USER_GUIDE.md](./USER_GUIDE.md)：使用说明
- [DEVELOPMENT.md](./DEVELOPMENT.md)：开发与架构
- [CHANGELOG.md](./CHANGELOG.md)：变更记录
