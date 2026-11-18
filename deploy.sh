#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATE_DIR="$ROOT_DIR/.deploy"
PID_FILE="$STATE_DIR/backend.pid"
LOG_FILE="$STATE_DIR/backend.log"
export NODE_ENV="${NODE_ENV:-production}"
export SAKI_PROFILE="${SAKI_PROFILE:-light}"
mkdir -p "$STATE_DIR"
fail() { printf '[Saki] %s\n' "$*" >&2; exit 1; }
running() {
  [[ -f "$PID_FILE" ]] || return 1
  local pid command
  read -r pid < "$PID_FILE"
  [[ "$pid" =~ ^[0-9]+$ ]] || return 1
  kill -0 "$pid" 2>/dev/null || return 1
  command="$(ps -p "$pid" -o args=)"
  [[ "$command" == *"$ROOT_DIR/backend/server.js"* ]]
}
stop() {
  if running; then
    local pid
    read -r pid < "$PID_FILE"
    kill -TERM "$pid"
    for ((i=0; i<15; i++)); do kill -0 "$pid" 2>/dev/null || break; sleep 1; done
    if kill -0 "$pid" 2>/dev/null; then fail "Process is still stopping; check $LOG_FILE. No force kill was sent."; fi
  fi
  rm -f -- "$PID_FILE"
}
start() {
  running && { printf '[Saki] Already running.\n'; return; }
  command -v node >/dev/null || fail 'Install Node.js 22.12+ first.'
  node "$ROOT_DIR/scripts/launch.cjs" --prepare
  local heap="${SAKI_HEAP_MB:-384}"
  [[ "$heap" =~ ^[0-9]+$ ]] && ((heap >= 128)) || fail 'SAKI_HEAP_MB must be >= 128.'
  nohup node "--max-old-space-size=$heap" "$ROOT_DIR/backend/server.js" >> "$LOG_FILE" 2>&1 < /dev/null &
  local pid=$!
  printf '%s\n' "$pid" > "$PID_FILE"
  for ((i=0; i<30; i++)); do
    kill -0 "$pid" 2>/dev/null || fail "Server exited. Check $LOG_FILE."
    if node "$ROOT_DIR/scripts/health.cjs" "$pid" >/dev/null 2>&1; then
      printf '[Saki] Ready. Logs: %s\n' "$LOG_FILE"
      return
    fi
    sleep 1
  done
  stop
  fail "Health check timed out. Check $LOG_FILE."
}
case "${1:-start}" in
  start|deploy) start ;;
  stop) stop ;;
  restart) stop; start ;;
  status) if running; then printf '[Saki] Running PID %s\n' "$(cat "$PID_FILE")"; else printf '[Saki] Stopped\n'; exit 1; fi ;;
  logs) tail -n 100 -f "$LOG_FILE" ;;
  *) fail 'Usage: bash deploy.sh [start|stop|restart|status|logs]' ;;
esac
