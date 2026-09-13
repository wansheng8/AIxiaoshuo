#!/usr/bin/env bash
# 墨枢一键安装：检查 Node、安装依赖、构建前端。
# 用法：bash scripts/setup.sh
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v node >/dev/null 2>&1; then
  echo "未找到 Node.js。请先安装 Node.js 18+（推荐 20 LTS）：https://nodejs.org"
  exit 1
fi
echo "Node $(node -v) / npm $(npm -v)"

if [ ! -f .env ] && [ -f .env.example ]; then
  cp .env.example .env
  echo "已生成 .env（端口、token 预算、重试等可在此调整；模型密钥请在页面「设置」填写）"
  echo "如需公网访问保护，可在 .env 中设置 ACCESS_PASSWORD=你的访问密码（留空则不需要密码）"
fi

echo "安装前端依赖…"
(cd frontend && npm ci)
echo "构建前端…"
(cd frontend && npm run build)
echo "安装后端依赖…"
(cd backend && npm ci --omit=dev)

echo
echo "安装完成。启动服务：bash scripts/serve.sh start"
echo "然后打开 http://127.0.0.1:8787/ ，到「设置」页填写模型接口。"
echo "配置好模型后可用 node scripts/check-model.js 核对模型名是否正确。"
