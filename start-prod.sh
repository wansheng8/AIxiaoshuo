#!/bin/bash
# 墨枢生产启动脚本（不使用 Docker 的直连部署）
# 首次会安装依赖并构建前端，之后直接启动后端（同时提供 API 与页面）。
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

if [ ! -d "$ROOT/frontend/node_modules" ]; then
  echo "[moshu] 安装前端依赖..."
  (cd "$ROOT/frontend" && npm ci)
fi

if [ ! -d "$ROOT/backend/node_modules" ]; then
  echo "[moshu] 安装后端依赖..."
  (cd "$ROOT/backend" && npm ci --omit=dev)
fi

if [ ! -f "$ROOT/frontend/dist/index.html" ]; then
  echo "[moshu] 构建前端..."
  (cd "$ROOT/frontend" && npm run build)
fi

echo "[moshu] 启动服务，端口 ${PORT:-8787}"
cd "$ROOT/backend"
exec node src/index.js
