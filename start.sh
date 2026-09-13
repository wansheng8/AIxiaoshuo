#!/bin/bash
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

cd "$ROOT/backend"
node src/index.js &
BACKEND_PID=$!

cleanup() {
  kill "$BACKEND_PID" 2>/dev/null || true
}
trap cleanup EXIT

for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  if node -e "require('http').get('http://127.0.0.1:8787/api/health',(r)=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))" 2>/dev/null; then
    break
  fi
  sleep 0.2
done

cd "$ROOT/frontend"
npm run dev
