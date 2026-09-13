#!/usr/bin/env bash
# 墨枢启停脚本：用 pidfile 管理进程，避免 pkill 误杀。
# 用法：bash scripts/serve.sh {start|stop|restart|status}
set -euo pipefail
cd "$(dirname "$0")/.."

PID_FILE=.moshu.pid
LOG_FILE=moshu.log
PORT="${PORT:-8787}"

is_running() {
  [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null
}

start() {
  if is_running; then
    echo "已在运行：PID $(cat "$PID_FILE")  http://127.0.0.1:$PORT/"
    return 0
  fi
  if ! command -v node >/dev/null 2>&1; then
    echo "未找到 Node.js，请先安装 Node.js 18+（推荐 20 LTS）"
    return 1
  fi
  if command -v setsid >/dev/null 2>&1; then
    PORT="$PORT" setsid nohup node backend/src/index.js > "$LOG_FILE" 2>&1 < /dev/null &
  else
    PORT="$PORT" nohup node backend/src/index.js > "$LOG_FILE" 2>&1 < /dev/null &
  fi
  echo $! > "$PID_FILE"
  if ! command -v curl >/dev/null 2>&1; then
    sleep 1
    echo "已启动：PID $(cat "$PID_FILE")  http://127.0.0.1:$PORT/"
    return 0
  fi
  for _ in $(seq 1 20); do
    if curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then
      echo "已启动：PID $(cat "$PID_FILE")  http://127.0.0.1:$PORT/"
      return 0
    fi
    sleep 0.5
  done
  echo "启动后健康检查未通过，请查看 $LOG_FILE"
  return 1
}

stop() {
  if [ -f "$PID_FILE" ]; then
    kill "$(cat "$PID_FILE")" 2>/dev/null || true
    rm -f "$PID_FILE"
    echo "已停止"
  else
    echo "没有在运行"
  fi
}

status() {
  if is_running; then
    echo "运行中：PID $(cat "$PID_FILE")  http://127.0.0.1:$PORT/"
  else
    echo "已停止"
  fi
}

case "${1:-start}" in
  start) start ;;
  stop) stop ;;
  restart) stop; sleep 1; start ;;
  status) status ;;
  *) echo "用法：bash scripts/serve.sh {start|stop|restart|status}"; exit 1 ;;
esac
