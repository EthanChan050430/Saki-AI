#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
DEPLOY_DIR="$ROOT_DIR/.deploy"
PID_DIR="$DEPLOY_DIR/pids"
LOG_DIR="$DEPLOY_DIR/logs"

BACKEND_PID_FILE="$PID_DIR/backend.pid"
FRONTEND_PID_FILE="$PID_DIR/frontend.pid"
BACKEND_LOG_FILE="$LOG_DIR/backend.log"
FRONTEND_LOG_FILE="$LOG_DIR/frontend.log"

BACKEND_PORT="${BACKEND_PORT:-5431}"
FRONTEND_PORT="${FRONTEND_PORT:-5432}"
SKIP_FRONTEND_BUILD="true"

mkdir -p "$PID_DIR" "$LOG_DIR"

log() {
  printf '[deploy] %s\n' "$*"
}

warn() {
  printf '[deploy][warn] %s\n' "$*" >&2
}

fail() {
  printf '[deploy][error] %s\n' "$*" >&2
  exit 1
}

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

require_command() {
  command_exists "$1" || fail "Missing required command: $1"
}

detect_protocol() {
  local ssl_dir="$ROOT_DIR/ssl"
  local key_file cert_file

  if [[ ! -d "$ssl_dir" ]]; then
    echo "http"
    return
  fi

  key_file="$(find "$ssl_dir" -maxdepth 1 -type f \( -iname '*.key' -o -iname '*_key.*' -o -iname 'key.pem' \) | head -n 1 || true)"
  cert_file="$(find "$ssl_dir" -maxdepth 1 -type f \( -iname '*.crt' -o -iname '*cert*.pem' -o -iname '*fullchain*.pem' -o -iname '*.pem' \) \
    ! -iname 'ca*' ! -iname 'chain*' ! -iname '*bundle*' ! -iname '*.key' ! -iname '*_key.*' | head -n 1 || true)"

  if [[ -n "$key_file" && -n "$cert_file" ]]; then
    echo "https"
  else
    echo "http"
  fi
}

wait_for_url() {
  local url="$1"
  local name="$2"
  local max_attempts="${3:-30}"
  local attempt=1

  while (( attempt <= max_attempts )); do
    if curl -kfsS --max-time 5 "$url" >/dev/null 2>&1; then
      log "$name is ready: $url"
      return 0
    fi
    sleep 2
    attempt=$((attempt + 1))
  done

  warn "$name did not become ready in time: $url"
  return 1
}

is_pid_running() {
  local pid="$1"
  [[ -n "$pid" ]] && kill -0 "$pid" >/dev/null 2>&1
}

read_pid() {
  local pid_file="$1"
  if [[ -f "$pid_file" ]]; then
    tr -d '[:space:]' < "$pid_file"
  fi
}

stop_by_pid_file() {
  local pid_file="$1"
  local name="$2"
  local pid

  pid="$(read_pid "$pid_file")"
  if [[ -z "${pid:-}" ]]; then
    log "$name is not running"
    rm -f "$pid_file"
    return 0
  fi

  if is_pid_running "$pid"; then
    log "Stopping $name (PID $pid)"
    kill "$pid" >/dev/null 2>&1 || true

    for _ in {1..15}; do
      if ! is_pid_running "$pid"; then
        break
      fi
      sleep 1
    done

    if is_pid_running "$pid"; then
      warn "$name did not stop gracefully, killing forcefully"
      kill -9 "$pid" >/dev/null 2>&1 || true
    fi
  else
    log "$name PID file exists but process is already gone"
  fi

  rm -f "$pid_file"
}

start_process() {
  local name="$1"
  local pid_file="$2"
  local log_file="$3"
  shift 3

  local current_pid
  current_pid="$(read_pid "$pid_file")"
  if [[ -n "${current_pid:-}" ]] && is_pid_running "$current_pid"; then
    log "$name is already running (PID $current_pid)"
    return 0
  fi

  rm -f "$pid_file"
  log "Starting $name"
  nohup "$@" >>"$log_file" 2>&1 &
  local new_pid=$!
  echo "$new_pid" > "$pid_file"
  log "$name started with PID $new_pid"
}

install_dependencies() {
  require_command node
  require_command npm

  log "Installing root dependencies"
  if [[ -f "$ROOT_DIR/package-lock.json" ]]; then
    npm ci --prefix "$ROOT_DIR"
  else
    npm install --prefix "$ROOT_DIR"
  fi

  log "Installing backend dependencies"
  if [[ -f "$BACKEND_DIR/package-lock.json" ]]; then
    npm ci --prefix "$BACKEND_DIR"
  else
    npm install --prefix "$BACKEND_DIR"
  fi

  if [[ "${SKIP_FRONTEND_BUILD:-false}" != "true" ]]; then
    log "Installing frontend dependencies"
    if [[ -f "$FRONTEND_DIR/package-lock.json" ]]; then
      npm ci --prefix "$FRONTEND_DIR"
    else
      npm install --prefix "$FRONTEND_DIR"
    fi
  fi
}

build_frontend() {
  if [[ "${SKIP_FRONTEND_BUILD:-false}" == "true" ]]; then
    if [[ -d "$FRONTEND_DIR/dist" ]]; then
      log "Skipping frontend build (using existing dist/)"
      return 0
    else
      fail "Frontend dist/ directory not found. Please build frontend manually or remove SKIP_FRONTEND_BUILD."
    fi
  fi

  log "Building frontend"
  NODE_OPTIONS="--max-old-space-size=4096" npm --prefix "$FRONTEND_DIR" run build
}

show_status() {
  local backend_pid frontend_pid

  backend_pid="$(read_pid "$BACKEND_PID_FILE")"
  frontend_pid="$(read_pid "$FRONTEND_PID_FILE")"

  if [[ -n "${backend_pid:-}" ]] && is_pid_running "$backend_pid"; then
    log "Backend: running (PID $backend_pid)"
  else
    log "Backend: stopped"
  fi

  if [[ -n "${frontend_pid:-}" ]] && is_pid_running "$frontend_pid"; then
    log "Frontend: running (PID $frontend_pid)"
  else
    log "Frontend: stopped"
  fi
}

show_logs() {
  local target="${1:-all}"

  case "$target" in
    backend)
      [[ -f "$BACKEND_LOG_FILE" ]] && tail -n 100 "$BACKEND_LOG_FILE" || log "No backend log yet"
      ;;
    frontend)
      [[ -f "$FRONTEND_LOG_FILE" ]] && tail -n 100 "$FRONTEND_LOG_FILE" || log "No frontend log yet"
      ;;
    all)
      log "=== backend.log ==="
      [[ -f "$BACKEND_LOG_FILE" ]] && tail -n 80 "$BACKEND_LOG_FILE" || log "No backend log yet"
      log "=== frontend.log ==="
      [[ -f "$FRONTEND_LOG_FILE" ]] && tail -n 80 "$FRONTEND_LOG_FILE" || log "No frontend log yet"
      ;;
    *)
      fail "Unknown log target: $target"
      ;;
  esac
}

deploy() {
  require_command curl
  install_dependencies
  build_frontend
  stop_by_pid_file "$BACKEND_PID_FILE" "backend"
  stop_by_pid_file "$FRONTEND_PID_FILE" "frontend"

  : > "$BACKEND_LOG_FILE"
  : > "$FRONTEND_LOG_FILE"

  start_process "backend" "$BACKEND_PID_FILE" "$BACKEND_LOG_FILE" npm --prefix "$BACKEND_DIR" run start
  
  if [[ "${SKIP_FRONTEND_BUILD:-false}" == "true" ]]; then
    log "Serving frontend using preview"
    start_process "frontend" "$FRONTEND_PID_FILE" "$FRONTEND_LOG_FILE" npm --prefix "$FRONTEND_DIR" run preview -- --host 0.0.0.0 --port "$FRONTEND_PORT"
  else
    log "Starting frontend via dev (not recommended for production with dist/)"
    start_process "frontend" "$FRONTEND_PID_FILE" "$FRONTEND_LOG_FILE" npm --prefix "$FRONTEND_DIR" run dev -- --host 0.0.0.0 --port "$FRONTEND_PORT"
  fi

  local protocol backend_url frontend_url
  protocol="$(detect_protocol)"
  backend_url="$protocol://127.0.0.1:$BACKEND_PORT/api/history"
  frontend_url="$protocol://127.0.0.1:$FRONTEND_PORT"

  wait_for_url "$backend_url" "Backend" || true
  wait_for_url "$frontend_url" "Frontend" || true

  log "Deployment finished"
  log "Frontend URL: $frontend_url"
  log "Backend URL:  $protocol://127.0.0.1:$BACKEND_PORT"
  log "Logs directory: $LOG_DIR"

  log "Attaching to logs (Press Ctrl+C to stop following logs, services will remain running)"
  tail -f "$BACKEND_LOG_FILE" "$FRONTEND_LOG_FILE"
}

start_only() {
  require_command curl
  local protocol backend_url frontend_url

  start_process "backend" "$BACKEND_PID_FILE" "$BACKEND_LOG_FILE" npm --prefix "$BACKEND_DIR" run start
  start_process "frontend" "$FRONTEND_PID_FILE" "$FRONTEND_LOG_FILE" npm --prefix "$FRONTEND_DIR" run preview -- --host 0.0.0.0 --port "$FRONTEND_PORT"

  protocol="$(detect_protocol)"
  backend_url="$protocol://127.0.0.1:$BACKEND_PORT/api/history"
  frontend_url="$protocol://127.0.0.1:$FRONTEND_PORT"

  wait_for_url "$backend_url" "Backend" || true
  wait_for_url "$frontend_url" "Frontend" || true

  log "Services started"
  log "Attaching to logs (Press Ctrl+C to stop following logs, services will remain running)"
  tail -f "$BACKEND_LOG_FILE" "$FRONTEND_LOG_FILE"
}

stop_all() {
  stop_by_pid_file "$BACKEND_PID_FILE" "backend"
  stop_by_pid_file "$FRONTEND_PID_FILE" "frontend"
}

usage() {
  cat <<'EOF'
Usage:
  ./deploy.sh                Deploy everything
  ./deploy.sh deploy         Same as default
  ./deploy.sh start          Start backend and frontend
  ./deploy.sh stop           Stop backend and frontend
  ./deploy.sh restart        Restart backend and frontend
  ./deploy.sh status         Show process status
  ./deploy.sh logs [target]  Tail logs; target: backend|frontend|all

Notes:
  - Backend runs on port 5431 by default.
  - Frontend preview runs on port 5432 by default.
  - If ./ssl contains a usable cert/key pair, health checks use HTTPS automatically.
  - Runtime files are stored in ./.deploy/
EOF
}

main() {
  local action="${1:-deploy}"

  case "$action" in
    deploy)
      deploy
      ;;
    start)
      start_only
      ;;
    stop)
      stop_all
      ;;
    restart)
      stop_all
      start_only
      ;;
    status)
      show_status
      ;;
    logs)
      show_logs "${2:-all}"
      ;;
    help|-h|--help)
      usage
      ;;
    *)
      usage
      fail "Unknown action: $action"
      ;;
  esac
}

main "$@"
