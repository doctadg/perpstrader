#!/usr/bin/env bash

# PerpsTrader Quick Start Script
# Starts/stops core services without systemd

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_DIR="$PROJECT_DIR/logs"

mkdir -p "$LOG_DIR"

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

declare -A SERVICE_CMDS
SERVICE_CMDS[dashboard]="node $PROJECT_DIR/bin/dashboard/dashboard-server.js"
SERVICE_CMDS[trader]="node $PROJECT_DIR/bin/main.js"
SERVICE_CMDS[news]="node $PROJECT_DIR/bin/news-agent.js"
SERVICE_CMDS[predictions]="node $PROJECT_DIR/bin/prediction-agent.js"

declare -A SERVICE_PATTERNS
SERVICE_PATTERNS[dashboard]="node $PROJECT_DIR/bin/dashboard/dashboard-server.js"
SERVICE_PATTERNS[trader]="node $PROJECT_DIR/bin/main.js"
SERVICE_PATTERNS[news]="node $PROJECT_DIR/bin/news-agent.js"
SERVICE_PATTERNS[predictions]="node $PROJECT_DIR/bin/prediction-agent.js"

ALL_SERVICES=(dashboard trader news predictions)

pid_file() {
  echo "$LOG_DIR/$1.pid"
}

log_file() {
  echo "$LOG_DIR/$1.log"
}

print_info() {
  echo -e "${GREEN}[INFO]${NC} $1"
}

print_warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

is_running() {
  local service="$1"
  local pattern="${SERVICE_PATTERNS[$service]:-}"
  local pid_path
  pid_path="$(pid_file "$service")"

  if [ ! -f "$pid_path" ]; then
    if [ -n "$pattern" ] && pgrep -f "$pattern" >/dev/null 2>&1; then
      return 0
    fi
    return 1
  fi

  local pid
  pid="$(cat "$pid_path" 2>/dev/null || true)"
  if [ -z "$pid" ]; then
    if [ -n "$pattern" ] && pgrep -f "$pattern" >/dev/null 2>&1; then
      return 0
    fi
    return 1
  fi

  if kill -0 "$pid" 2>/dev/null; then
    return 0
  fi

  rm -f "$pid_path"
  if [ -n "$pattern" ] && pgrep -f "$pattern" >/dev/null 2>&1; then
    return 0
  fi
  return 1
}

start_service() {
  local service="$1"
  local cmd="${SERVICE_CMDS[$service]:-}"

  if [ -z "$cmd" ]; then
    print_error "Unknown service: $service"
    return 1
  fi

  if is_running "$service"; then
    local pid
    pid="$(cat "$(pid_file "$service")")"
    print_warn "$service already running (pid $pid)"
    return 0
  fi

  print_info "Starting $service..."
  nohup bash -lc "$cmd" >> "$(log_file "$service")" 2>&1 &
  echo "$!" > "$(pid_file "$service")"
  sleep 2

  if is_running "$service"; then
    local pid
    pid="$(cat "$(pid_file "$service")")"
    print_info "$service started (pid $pid)"
  else
    print_error "$service failed to start (check $(log_file "$service"))"
    return 1
  fi
}

stop_service() {
  local service="$1"
  local pattern="${SERVICE_PATTERNS[$service]:-}"
  local pid_path
  pid_path="$(pid_file "$service")"

  if ! is_running "$service"; then
    print_warn "$service is not running"
    rm -f "$pid_path"
    return 0
  fi

  if [ -f "$pid_path" ]; then
    local pid
    pid="$(cat "$pid_path")"
    print_info "Stopping $service (pid $pid)..."
    kill "$pid" 2>/dev/null || true

    for _ in $(seq 1 20); do
      if ! kill -0 "$pid" 2>/dev/null; then
        break
      fi
      sleep 0.25
    done

    if kill -0 "$pid" 2>/dev/null; then
      print_warn "$service did not exit gracefully, force killing..."
      kill -9 "$pid" 2>/dev/null || true
    fi
  elif [ -n "$pattern" ]; then
    print_warn "No PID file for $service, stopping by process pattern"
    pkill -f "$pattern" 2>/dev/null || true
  fi

  rm -f "$pid_path"
  print_info "$service stopped"
}

status_service() {
  local service="$1"
  local pattern="${SERVICE_PATTERNS[$service]:-}"
  if is_running "$service"; then
    local pid_path pid
    pid_path="$(pid_file "$service")"
    if [ -f "$pid_path" ]; then
      pid="$(cat "$pid_path")"
    else
      pid="$(pgrep -f "$pattern" | head -n 1)"
    fi
    printf "%-12s %s\n" "$service" "RUNNING (pid $pid)"
  else
    printf "%-12s %s\n" "$service" "STOPPED"
  fi
}

show_status() {
  echo "PerpsTrader Quick Status"
  echo "========================"
  for service in "${ALL_SERVICES[@]}"; do
    status_service "$service"
  done

  echo
  if curl -sS http://localhost:3001/api/health >/dev/null 2>&1; then
    print_info "Dashboard API healthy at http://localhost:3001"
  else
    print_warn "Dashboard API not responding on http://localhost:3001"
  fi
}

show_logs() {
  local service="${1:-dashboard}"
  local log_path
  log_path="$(log_file "$service")"

  if [ ! -f "$log_path" ]; then
    print_error "No log file found for $service ($log_path)"
    exit 1
  fi

  tail -f "$log_path"
}

start_all() {
  for service in "${ALL_SERVICES[@]}"; do
    start_service "$service"
  done
  show_status
}

stop_all() {
  for service in "${ALL_SERVICES[@]}"; do
    stop_service "$service"
  done
  show_status
}

restart_all() {
  stop_all
  start_all
}

show_help() {
  cat <<'EOF'
PerpsTrader Quick Start

Usage: ./scripts/quick-start.sh <command> [service]

Commands:
  start [service]      Start all services or one service
  stop [service]       Stop all services or one service
  restart [service]    Restart all services or one service
  status               Show service status
  logs [service]       Tail logs (default: dashboard)
  help                 Show this help

Services:
  dashboard            Web dashboard (port 3001)
  trader               Main trading agent
  news                 News ingestion agent
  predictions          Prediction markets agent
EOF
}

main() {
  local command="${1:-help}"
  local service="${2:-}"

  case "$command" in
    start)
      if [ -n "$service" ]; then
        start_service "$service"
      else
        start_all
      fi
      ;;
    stop)
      if [ -n "$service" ]; then
        stop_service "$service"
      else
        stop_all
      fi
      ;;
    restart)
      if [ -n "$service" ]; then
        stop_service "$service"
        start_service "$service"
      else
        restart_all
      fi
      ;;
    status)
      show_status
      ;;
    logs)
      show_logs "$service"
      ;;
    help|-h|--help)
      show_help
      ;;
    *)
      print_error "Unknown command: $command"
      show_help
      exit 1
      ;;
  esac
}

main "$@"
