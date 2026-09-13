# 墨枢 · 部署指南

墨枢是单人本地应用：后端 Express 在 `8787` 端口同时提供 API 与前端页面，数据以 JSON 存储在 `data/` 目录。生产部署只需要「构建前端 + 运行后端」两件事。

本文覆盖四种方式：

1. Docker Compose（推荐，最省心）
2. Docker 单容器
3. 本机 / 服务器直接部署（Node 进程）
4. systemd 常驻（Linux 服务器）

另附反向代理与 HTTPS、数据备份、升级回滚与排错。

## 架构与前置条件

```
浏览器 ──▶ 8787（Express）
              ├── /            前端静态资源（frontend/dist）
              └── /api/*       后端接口与 SSE 流式生成
                            └── 可写 data/（工程、文风、设置）
```

- 运行时需要 Node.js 18+（推荐 20 LTS）
- 后端出网访问你配置的模型接口
- 需要可写的 `data/` 目录

运行时必需的目录（缺一不可，部署时都要随代码带上）：

| 路径 | 读写 | 用途 |
| --- | --- | --- |
| `backend/src` | 只读 | 后端代码 |
| `backend/node_modules` | 只读 | 后端依赖（express、cors） |
| `frontend/dist` | 只读 | 前端页面，生产环境由后端托管 |
| `skills/builtin` | 只读 | 21 个内置 Skill，缺失则无可用 Skill、无法生成 |
| `data/` | 读写 | 全部用户数据与模型设置 |

后端启动时会自检 `skills/builtin`，缺失会打印告警；`data/` 由服务自动创建。

数据目录结构：

```
data/
├── novels/         小说工程
├── teardowns/      拆书工程
├── skills/         自定义 Skill
├── skill-history/  Skill 历史
├── backups/        原子写备份
├── conflicts/       并发冲突副本
├── elements.json
├── voice.json
└── settings.json   模型配置（含 API Key）
```

## 方式一：Docker Compose（推荐）

前置：安装 Docker 与 Docker Compose 插件。

在项目根目录执行：

```bash
mkdir -p data
sudo chown -R 1000:1000 data
docker compose up -d --build
```

访问 `http://服务器IP:8787`。

常用命令：

```bash
docker compose logs -f
docker compose ps
docker compose restart
docker compose down
docker compose up -d --build
```

`docker-compose.yml` 已配置：

- 端口映射 `8787:8787`
- 数据卷 `./data:/app/data`
- `restart: unless-stopped` 自动重启
- 容器内健康检查

说明：容器以非 root 的 `node` 用户运行，Linux 下首次需把宿主 `data/` 目录归属改成 `1000:1000`，否则容器无法写入。macOS / Windows 的 Docker Desktop 通常无需手动处理。

## 方式二：Docker 单容器

不依赖 Compose：

```bash
docker build -t moshu:latest .
```

```bash
docker run -d \
  --name moshu \
  --restart unless-stopped \
  -p 8787:8787 \
  -e PORT=8787 \
  -v "$(pwd)/data:/app/data" \
  moshu:latest
```

访问 `http://服务器IP:8787`。查看日志：

```bash
docker logs -f moshu
```

## 方式三：本机 / 服务器直接部署

### 一次性准备

```bash
cd frontend
npm ci
npm run build

cd ../backend
npm ci --omit=dev
```

### 启动

```bash
cd backend
node src/index.js
```

访问 `http://127.0.0.1:8787`。

也可以使用生产脚本，首次会自动装依赖并构建，之后直接启动：

```bash
./start-prod.sh
```

自定义端口：

```bash
PORT=9000 node backend/src/index.js
```

### Windows

用 PowerShell 或 CMD 执行同样的步骤：

```powershell
cd frontend
npm ci
npm run build

cd ..\backend
npm ci --omit=dev
node src/index.js
```

### macOS / Linux 后台运行

临时后台：

```bash
nohup node backend/src/index.js > moshu.log 2>&1 &
```

长期常驻建议用下文的 systemd（Linux）或进程管理工具。

## 方式四：systemd 常驻（Linux）

1. 部署代码到 `/opt/moshu`，构建前端并安装后端生产依赖（见方式三）。
2. 创建专用用户并准备数据目录：

```bash
sudo useradd -r -s /usr/sbin/nologin moshu
```

```bash
sudo mkdir -p /opt/moshu/data
sudo chown -R moshu:moshu /opt/moshu/data
```

3. 复制环境变量文件：

```bash
sudo cp deploy/moshu.env.example deploy/moshu.env
```

4. 安装服务（按需修改 `deploy/moshu.service` 中的路径与用户）：

```bash
sudo cp deploy/moshu.service /etc/systemd/system/moshu.service
sudo systemctl daemon-reload
sudo systemctl enable --now moshu
```

5. 查看状态与日志：

```bash
systemctl status moshu
journalctl -u moshu -f
```

## 反向代理与 HTTPS

后端已同时提供页面与接口，前接 nginx 即可绑定域名。复制 `deploy/nginx.conf`，把 `server_name` 换成你的域名，然后：

```bash
sudo cp deploy/nginx.conf /etc/nginx/conf.d/moshu.conf
sudo nginx -t
sudo systemctl reload nginx
```

签发 HTTPS 证书（示例用 certbot）：

```bash
sudo certbot --nginx -d moshu.example.com
```

要点：生成接口是 SSE 流式响应，nginx 配置里必须关闭 `proxy_buffering` 并放宽超时，`deploy/nginx.conf` 已写好。

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `8787` | 服务端口 |
| `PROMPT_TOKEN_BUDGET` | `40000` | 提示词 token 预算 |
| `LLM_RETRY_ATTEMPTS` | `3` | 生成失败重试次数（1-8） |
| `LLM_RETRY_BASE_MS` | `800` | 退避基数毫秒 |
| `LLM_RETRY_MAX_MS` | `15000` | 退避上限毫秒 |

模型接口（Base URL、模型名、API Key）在应用「设置」页填写，保存在 `data/settings.json`，不通过环境变量传入。请勿把 Key 硬编码进脚本或提交到仓库。

## 配置模型

首次打开页面后进入「设置」：

1. 选择协议（OpenAI 兼容 / Anthropic / Ollama / Gemini）
2. 填 Base URL、模型名、API Key
3. 点「测试」确认连通，点「拉取模型」可选模型
4. 需要多个供应商时，保存后在顶部切换

## 数据持久化与备份

所有用户数据都在 `data/`。备份就是复制这个目录：

```bash
tar -czf moshu-backup-$(date +%Y%m%d).tar.gz data/
```

Docker 部署的备份：

```bash
tar -czf moshu-backup-$(date +%Y%m%d).tar.gz data/
```

恢复时停掉服务，把备份解回 `data/` 再启动。

`data/backups/` 是应用自动快照，`data/conflicts/` 是并发写冲突时保留的两份副本。二者都可安全保留用于回查。

## 升级与回滚

升级（Docker Compose）：

```bash
git pull
docker compose up -d --build
```

升级（直接部署）：

```bash
git pull
cd frontend
npm ci
npm run build

cd ../backend
npm ci --omit=dev
```

然后重启进程或服务：

```bash
sudo systemctl restart moshu
```

数据格式带 `schemaVersion`，旧工程在首次打开时会自动迁移并在 `data/novels/backups/` 留快照，无需手工处理。

回滚：切回旧版本代码并重新构建即可；数据向后兼容，回滚前建议先备份 `data/`。

## 健康检查

```bash
curl http://127.0.0.1:8787/api/health
```

预期返回 `{"ok":true,"name":"moshu"}`。

Docker 内置健康检查，`docker compose ps` 会显示 `healthy`。

## 常见问题

**页面能打开但接口 404**：确认访问的是后端端口（8787），且已执行前端构建，`frontend/dist/index.html` 存在。后端只有在检测到该文件时才托管页面。

**Docker 容器反复重启 / 无法写入**：Linux 下检查宿主 `data/` 归属，执行 `sudo chown -R 1000:1000 data`。

**生成长时间无响应**：模型接口较慢时正常，nginx 需关闭缓冲并放宽超时（见 `deploy/nginx.conf`）。

**模型调用报鉴权失败**：到设置页重新填 Key 并点测试。鉴权类错误不会自动重试。

**改完端口访问不到**：同时修改 `PORT` 与端口映射，例如 `PORT=9000` 配 `-p 9000:9000`。

**数据会随容器删除丢失吗**：不会。`data/` 通过卷挂载在宿主，删除容器不影响数据。
