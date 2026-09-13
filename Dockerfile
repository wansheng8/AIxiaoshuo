ARG NODE_IMAGE=node:20-alpine

# 1) 构建前端静态产物
FROM ${NODE_IMAGE} AS frontend
WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# 2) 安装后端生产依赖
FROM ${NODE_IMAGE} AS deps
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

# 3) 运行时镜像
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    PORT=8787
WORKDIR /app

COPY --from=deps /app/backend/node_modules ./backend/node_modules
COPY backend/package.json ./backend/package.json
COPY backend/src ./backend/src
COPY --from=frontend /build/frontend/dist ./frontend/dist

# 内置 Skill 是运行时只读资源，必须随镜像一起打包
# 后端通过 ROOT/skills/builtin 读取，缺失会导致无可用 Skill、无法生成
COPY skills ./skills

RUN mkdir -p /app/data && chown -R node:node /app/data
USER node

EXPOSE 8787
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||8787)+'/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "backend/src/index.js"]
