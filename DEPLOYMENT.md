# 墨枢 · 部署指南（零基础版）

墨枢是单人使用的 AI 小说工坊：后端在 `8787` 端口同时提供网页和接口，作品、文风、模型设置都以 JSON 存在 `data/` 目录。

跟着本文做完，你会在浏览器里打开一个能直接写小说的页面。全程就是复制命令、按回车，不需要编程基础。

## 一、先选一条路线

| 你的情况 | 推荐路线 | 难度 | 大概耗时 |
| --- | --- | --- | --- |
| 只在自己电脑上用 | 路线 A：本机直接部署 | 最简单 | 10 分钟 |
| 有服务器，想省心、方便迁移 | 路线 B：Docker Compose | 简单 | 15 分钟 |
| Linux 服务器要长期常驻 | 路线 C：systemd | 中等 | 20 分钟 |

不确定就选路线 A。三条路线都要先完成下面的第二、三、四步。

## 二、准备：先认识三样东西

- 终端（又叫命令行、终端窗口）：一个可以输入命令的窗口。本文里带灰底的代码块，都是要你复制到终端里、按回车执行的。
- Node.js：运行墨枢的程序，必须安装。
- Git：用来把代码下载到本机、以后更新，必须安装。
- Docker：只有路线 B / C（服务器）才需要。

小提示：命令执行后打印一大段文字是正常的，只要最后没有出现 `error` 字样即可继续。命令区分大小写，请原样复制。

## 三、安装必备工具

### 3.1 安装 Git

Windows：打开 https://git-scm.com/download/win ，下载安装包，双击后一路点「下一步」。

macOS：打开「终端」，输入 `git --version`。如果弹出安装提示，按提示点「安装」。

Linux（Ubuntu / Debian）：

```bash
sudo apt-get update
sudo apt-get install -y git
```

三平台统一验证：

```bash
git --version
```

看到类似 `git version 2.x.x` 就成功了。

### 3.2 安装 Node.js 20 LTS

Windows / macOS：打开 https://nodejs.org ，下载标注 LTS（20.x）的安装包，双击后一路「下一步」。

Linux（Ubuntu / Debian）：

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

验证（三平台通用）：

```bash
node -v
npm -v
```

应分别显示 `v20.x.x` 和 `10.x.x` 左右。版本低于 18 请重新安装 20 LTS。

国内网络建议切换 npm 镜像，安装依赖会快很多：

```bash
npm config set registry https://registry.npmmirror.com
```

### 3.3 安装 Docker（只有路线 B / C 需要）

Windows / macOS：打开 https://www.docker.com/products/docker-desktop 下载 Docker Desktop，安装后启动它，等右下角鲸鱼图标变绿。

Linux：

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
```

执行完注销并重新登录（或重启机器），然后验证：

```bash
docker --version
docker compose version
```

两条都能显示版本号即可。

### 3.4 学会进入项目目录

下载代码后会得到一个文件夹（例如 `AIxiaoshuo`）。本文后面所有命令都要在这个文件夹里执行。

进入方法：

- Windows：用文件管理器打开该文件夹，在顶部地址栏输入 `cmd` 回车，就会在当前目录打开终端。
- macOS：在文件夹上点右键，选「服务」→「新建位于文件夹位置的终端窗口」。
- 通用：在终端里用 `cd 路径` 切换，例如 `cd ~/Downloads/AIxiaoshuo`。

确认自己在不在正确目录：输入 `ls`（Windows 用 `dir`），能看到 `backend`、`frontend`、`skills`、`Dockerfile` 就是对的。

## 四、下载代码（所有路线第一步）

代码和 21 个内置 Skill 都在 Git 仓库里，先下载到本机：

```bash
git clone https://github.com/wansheng8/AIxiaoshuo.git
cd AIxiaoshuo
```

用自己的 Fork 就把地址换成你的仓库地址。

如果 Git 下载很慢，也可以不用命令：在 GitHub 仓库页面点绿色「Code」按钮，选「Download ZIP」，解压后进入文件夹即可。

下载完成后，文件夹里应该有这些内容：

```
AIxiaoshuo/
├── backend/        后端代码
├── frontend/       网页源码
├── skills/         21 个内置 Skill（不能删）
├── scripts/        setup.sh / serve.sh / check-model.js 等便捷脚本
├── data/           以后你的作品都在这里
├── Dockerfile
├── docker-compose.yml
└── start-prod.sh
```

## 五、路线 A：本机直接部署（个人电脑，推荐新手）

Windows 用户建议用「Git Bash」：安装 Git 时已自带，在项目文件夹里右键选「Open Git Bash here」即可。本文命令在 Git Bash、macOS、Linux 上完全通用。

### 第一步：一键安装（推荐）

在项目根目录执行：

```bash
bash scripts/setup.sh
```

它会检查 Node、生成 `.env`（如果还没有）、安装前后端依赖并构建前端。第一次会比较慢。

如果提示找不到 lock 文件、`npm ci` 失败，就进入 `frontend` 或 `backend` 目录改用 `npm install`。安装时打印几条 `vulnerabilities`（漏洞）警告属正常，不影响使用。

<details>
<summary>不想用脚本、想手动执行</summary>

```bash
cd frontend
npm ci
npm run build

cd ../backend
npm ci --omit=dev
```

</details>

### 第二步：启动服务

```bash
bash scripts/serve.sh start
```

脚本会在后台启动并自动做健康检查，成功会打印访问地址。常用命令：

```bash
bash scripts/serve.sh status
bash scripts/serve.sh restart
bash scripts/serve.sh stop
```

想看运行日志：`tail -n 50 moshu.log`。

<details>
<summary>想在前台运行（关掉窗口即停止）</summary>

```bash
node backend/src/index.js
```

看到 `moshu backend on 8787` 就是启动成功。

</details>

如果你用的是 PowerShell 或 CMD 而不是 Git Bash：脚本改用 `node backend/src/index.js` 前台运行即可，目录分隔符用反斜杠。

### 第三步：打开网页

浏览器访问：

```
http://127.0.0.1:8787
```

能看到墨枢首页即部署成功。

### 第四步：配置模型并自检

先在页面「设置」里填好 Base URL、模型名与 API Key，然后回到项目根目录执行：

```bash
node scripts/check-model.js
```

它会向模型接口的 `/models` 查询，确认你填的模型名真实存在。若提示「不在列表」，按它列出的实际模型名修改设置页，不要凭名字猜。

### 第五步：开机自启（可选）

后台启动用 `bash scripts/serve.sh start` 已经够用；服务器要开机自启，见「systemd 常驻」一节。

## 六、路线 B：Docker Compose（服务器推荐）

前提：已按 3.3 装好 Docker。

第一步，准备数据目录。Linux 必须执行 `chown`，macOS / Windows 的 Docker Desktop 可跳过：

```bash
mkdir -p data
sudo chown -R 1000:1000 data
```

第二步，构建并启动：

```bash
docker compose up -d --build
```

第一次会下载基础镜像并构建，需要几分钟。完成后浏览器访问：

```
http://服务器IP:8787
```

查看状态与日志：

```bash
docker compose ps
docker compose logs -f
```

`docker compose ps` 的 STATUS 显示 `healthy` 就是正常。

停止与更新：

```bash
docker compose down
docker compose up -d --build
```

数据保存在宿主机的 `data/` 文件夹，删除容器不会丢数据。

## 七、配置模型（必须做，否则无法生成）

墨枢本身不提供模型，需要你自备一个模型接口（API Key）。

### 7.1 获取 API Key（以 DeepSeek 为例）

1. 打开 https://platform.deepseek.com
2. 注册并登录，进入「API Keys」页面
3. 点创建，复制生成的 Key 并保存好（只显示一次）

不想用 DeepSeek 也可以，见 7.3 的常见供应商表。

### 7.2 在页面里填写

1. 打开墨枢，点左侧导航「设置」
2. 协议选「OpenAI Chat 兼容」
3. 选择供应商预设，或手动填 Base URL、模型名、API Key
4. 点「测试」，提示成功说明连上了
5. 点「拉取模型」可从列表里挑，也可以手动输入模型名
6. 保存。需要多个供应商时，保存后在顶部切换

### 7.3 常见供应商参数

| 供应商 | 协议 | Base URL | 模型示例 |
| --- | --- | --- | --- |
| DeepSeek | openai-chat | https://api.deepseek.com/v1 | deepseek-chat |
| 通义千问 | openai-chat | https://dashscope.aliyuncs.com/compatible-mode/v1 | qwen-plus |
| 智谱 GLM | openai-chat | https://open.bigmodel.cn/api/paas/v4 | glm-4-flash |
| Kimi | openai-chat | https://api.moonshot.cn/v1 | moonshot-v1-auto |
| 硅基流动 | openai-chat | https://api.siliconflow.cn/v1 | 见官网 |
| OpenAI | openai-chat | https://api.openai.com/v1 | gpt-4o-mini |
| Anthropic | anthropic | https://api.anthropic.com/v1 | claude-sonnet-4-5 |
| Gemini | gemini | https://generativelanguage.googleapis.com/v1beta | gemini-2.0-flash |
| Ollama（本地） | ollama | http://127.0.0.1:11434 | 见 `ollama list` |

Key 只保存在本机 `data/settings.json`，不要写进脚本，也不要提交到仓库。

## 八、第一次使用：写出第一章

1. 首页点「新建作品」，写一句灵感，例如：末世废土里，主角靠捡垃圾觉醒
2. 打开这本书，在「稿本」里依次执行：开书策划、设定手册、全书大纲、人物资产
3. 生成「分章细纲」，再点「按细纲拆入目录」，就得到章节目录
4. 打开第一章，点「本章正文」生成；写不动时点「续写」；定稿前用「审稿」
5. 想贴合个人笔感：进「文风」页，导入你写过的 500 字以上原文

所有修改都会自动保存，关掉浏览器不会丢。

## 九、让局域网 / 公网访问

- 同一局域网（手机、另一台电脑）：用 `http://这台电脑的内网IP:8787` 访问。Windows / macOS 首次会弹防火墙提示，选择「允许」。
- 云服务器：在云厂商控制台的「安全组」或系统防火墙里放行 8787 端口。
- 想在公网用域名并启用 HTTPS：见第十一节「反向代理与 HTTPS」。

### 设置访问密码（公网强烈建议）

默认没有密码，谁打开链接谁就能看到你的稿子。公网部署时请在项目根目录的 `.env` 里加一行，然后重启服务：

```bash
ACCESS_PASSWORD=你的访问密码
```

设置后，打开网页会先要求输入密码，验证通过才进入；除 `/api/health`（供健康检查）外的所有接口都需要验证。密码留空或删掉这一行，就恢复成不需要密码。修改密码后旧登录会自动失效，需要重新输入。

Docker Compose 部署时，同样在项目根目录的 `.env` 里设置 `ACCESS_PASSWORD`，然后 `docker compose up -d` 重建容器即可。

## 十、日常维护

### 备份

所有数据都在 `data/`，备份就是打包这个目录：

```bash
tar -czf moshu-backup-$(date +%Y%m%d).tar.gz data/
```

Windows 直接复制整个 `data` 文件夹即可。恢复时先停止服务，把备份解回 `data/`，再启动。

### 升级

```bash
git pull
```

Docker Compose：

```bash
docker compose up -d --build
```

本机直接部署：

```bash
cd frontend
npm ci
npm run build

cd ../backend
npm ci --omit=dev
```

然后重启服务：本机是 `Ctrl + C` 后重新 `node backend/src/index.js`，systemd 是 `sudo systemctl restart moshu`。

旧工程的 JSON 里带 `schemaVersion`，首次打开会自动迁移并留快照，无需手工处理。

### 回滚

切回旧版本代码并重新构建即可。数据向后兼容，回滚前建议先备份 `data/`。

### 健康检查

```bash
curl http://127.0.0.1:8787/api/health
```

返回 `{"ok":true,"name":"moshu"}` 即正常。Docker 内置了健康检查，`docker compose ps` 会显示 `healthy`。

## 十一、进阶

### 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `8787` | 服务端口 |
| `PROMPT_TOKEN_BUDGET` | `40000` | 提示词 token 预算，超出后按优先级裁剪 |
| `LLM_RETRY_ATTEMPTS` | `3` | 生成失败重试次数（1-8） |
| `LLM_RETRY_BASE_MS` | `800` | 重试退避基数毫秒 |
| `LLM_RETRY_MAX_MS` | `15000` | 重试退避上限毫秒 |
| `ACCESS_PASSWORD` | 空 | 可选访问密码；留空表示不启用鉴权，公网部署建议设置 |

两种设置方式任选：

最简单的做法是把仓库根目录的 `.env.example` 复制成同目录的 `.env`，改里面的值，重启服务即可。`.env` 会被后端自动读取，已经存在的同名环境变量优先、不会被覆盖。

也可以在启动命令前临时指定，例如改端口：

```bash
PORT=9000 node backend/src/index.js
```

模型接口（Base URL、模型名、API Key）在应用「设置」页填写，不走环境变量。用 systemd 部署时，改 `deploy/moshu.env` 即可。

### 反向代理与 HTTPS

后端已同时提供页面与接口，前面接一个 nginx 就能绑定域名。把 `deploy/nginx.conf` 复制到 nginx 配置目录，并把里面的 `server_name` 换成你的域名：

```bash
sudo cp deploy/nginx.conf /etc/nginx/conf.d/moshu.conf
sudo nginx -t
sudo systemctl reload nginx
```

签发 HTTPS 证书（以 certbot 为例）：

```bash
sudo certbot --nginx -d moshu.example.com
```

要点：生成接口是 SSE 流式响应，nginx 必须关闭 `proxy_buffering` 并放宽超时，`deploy/nginx.conf` 已经写好。

### systemd 常驻（Linux 服务器）

1. 先把代码放到 `/opt/moshu`，并按路线 A 完成前端构建与后端依赖安装
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

### Docker 单容器（不用 Compose）

构建镜像：

```bash
docker build -t moshu:latest .
```

运行：

```bash
docker run -d \
  --name moshu \
  --restart unless-stopped \
  -p 8787:8787 \
  -e PORT=8787 \
  -v "$(pwd)/data:/app/data" \
  moshu:latest
```

查看日志：

```bash
docker logs -f moshu
```

## 十二、排错大全

按你看到的现象查：

| 现象 | 原因与解决 |
| --- | --- |
| 浏览器打不开页面 | 服务没启动。确认运行窗口里有 `moshu backend on 8787`；再换浏览器或清缓存试试 |
| 页面白屏 / 控制台报 404 | 前端没构建。执行 `cd frontend && npm ci && npm run build` |
| `npm ci` 报错 | 多半是网络问题，先 `npm config set registry https://registry.npmmirror.com`，或改用 `npm install` |
| 提示端口被占用 | 换端口启动：`PORT=9000 node backend/src/index.js`，然后访问 9000 |
| 设置页「测试」失败 | 检查 Base URL 结尾版本号是否正确、Key 是否复制完整、账户余额是否充足 |
| 提示模型不存在 / 返回空白 | 执行 `node scripts/check-model.js`，按它列出的实际模型名修改设置页，别凭名字猜 |
| 模型报鉴权失败 | 到设置页重填 Key 再测试；鉴权类错误不会自动重试 |
| 生成很久没反应 | 大模型本身较慢属正常；经 nginx 时确认已关闭缓冲（见 `deploy/nginx.conf`） |
| Docker 容器反复重启 / 写不进去 | Linux 执行 `sudo chown -R 1000:1000 data` |
| 「资产」页没有内置 Skill | 部署时漏了 `skills/builtin`。重新完整克隆仓库；后端启动日志会打印缺失告警 |
| 数据会随容器删除丢吗 | 不会，`data/` 已挂载到宿主机 |
