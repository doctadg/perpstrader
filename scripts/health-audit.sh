#!/usr/bin/env bash

# PerpsTrader end-to-end health and readiness audit.

set -u

PASS_COUNT=0
WARN_COUNT=0
FAIL_COUNT=0

print_pass() {
  echo "[PASS] $1"
  PASS_COUNT=$((PASS_COUNT + 1))
}

print_warn() {
  echo "[WARN] $1"
  WARN_COUNT=$((WARN_COUNT + 1))
}

print_fail() {
  echo "[FAIL] $1"
  FAIL_COUNT=$((FAIL_COUNT + 1))
}

http_check() {
  local name="$1"
  local url="$2"
  local expected_code="${3:-200}"
  local body
  local code

  body="$(mktemp)"
  code="$(curl -sS -m 12 -o "$body" -w "%{http_code}" "$url" 2>/dev/null || true)"

  if [ "$code" = "$expected_code" ]; then
    print_pass "$name ($url -> $code)"
  else
    local preview
    preview="$(head -c 180 "$body" 2>/dev/null | tr '\n' ' ')"
    print_fail "$name ($url -> $code, expected $expected_code) ${preview:+| $preview}"
  fi

  rm -f "$body"
}

json_probe() {
  local name="$1"
  local url="$2"
  local js_expr="$3"
  local mode="${4:-fail}" # fail|warn

  local payload
  payload="$(curl -sS -m 12 "$url" 2>/dev/null || true)"
  if [ -z "$payload" ]; then
    if [ "$mode" = "warn" ]; then
      print_warn "$name (no response from $url)"
    else
      print_fail "$name (no response from $url)"
    fi
    return
  fi

  if node -e "const data = JSON.parse(process.argv[1]); process.exit(($js_expr) ? 0 : 1);" "$payload" >/dev/null 2>&1; then
    print_pass "$name"
  else
    if [ "$mode" = "warn" ]; then
      print_warn "$name"
    else
      print_fail "$name"
    fi
  fi
}

process_check() {
  local name="$1"
  local pattern="$2"
  if pgrep -f "$pattern" >/dev/null 2>&1; then
    print_pass "$name process running"
  else
    print_warn "$name process not found"
  fi
}

echo "PerpsTrader Health Audit"
echo "========================"

# Service/process presence
process_check "Dashboard" "node .*bin/dashboard/dashboard-server.js"
process_check "Trader" "node .*bin/main.js"
process_check "News Agent" "node .*bin/news-agent.js"
process_check "Prediction Agent" "node .*bin/prediction-agent.js"
process_check "Redis (isolated)" "redis-server 127.0.0.1:6380"
process_check "ChromaDB" "node .*chroma run"

# Core endpoints
http_check "Dashboard health endpoint" "http://localhost:3001/api/health" 200
http_check "Dashboard status endpoint" "http://localhost:3001/api/status" 200
http_check "Dashboard news stats endpoint" "http://localhost:3001/api/news/stats" 200
http_check "Dashboard heatmap top endpoint" "http://localhost:3001/api/heatmap/top" 200
http_check "Prediction status endpoint" "http://localhost:3001/api/predictions/status" 200

# Search API endpoints (health endpoint is known to be flaky on some deployments)
http_check "Search API performance endpoint" "http://localhost:8000/api/v1/performance" 200
http_check "Search API docs endpoint" "http://localhost:8000/docs" 200

# Chroma heartbeat (try both API versions)
if curl -sS -m 8 "http://127.0.0.1:8001/api/v2/heartbeat" >/dev/null 2>&1 || \
   curl -sS -m 8 "http://127.0.0.1:8001/api/v1/heartbeat" >/dev/null 2>&1; then
  print_pass "Chroma heartbeat endpoint"
else
  print_fail "Chroma heartbeat endpoint (no response on port 8001)"
fi

# Redis ping
if command -v redis-cli >/dev/null 2>&1; then
  if [ "$(redis-cli -p 6380 ping 2>/dev/null || true)" = "PONG" ]; then
    print_pass "Redis ping on port 6380"
  else
    print_fail "Redis ping on port 6380 failed"
  fi
else
  print_warn "redis-cli not installed (skipping Redis ping)"
fi

# Data flow integrity from dashboard health payload
json_probe "Dashboard summary includes message bus connectivity" \
  "http://localhost:3001/api/health" \
  "data && data.messageBus && data.messageBus.connected === true" \
  "fail"

json_probe "Dashboard summary includes cache connectivity" \
  "http://localhost:3001/api/health" \
  "data && data.cache && data.cache.connected === true" \
  "fail"

json_probe "Vector store is not degraded" \
  "http://localhost:3001/api/health" \
  "Array.isArray(data?.summary?.components) && data.summary.components.some(c => c.component === 'vector-store' && c.status === 'HEALTHY')" \
  "fail"

json_probe "No open circuit breakers" \
  "http://localhost:3001/api/health" \
  "Array.isArray(data?.summary?.breakers) && data.summary.breakers.every(b => b.isOpen === false)" \
  "warn"

# Basic DB artifacts
for db in data/trading.db data/news.db data/predictions.db; do
  if [ -s "$db" ]; then
    print_pass "Database present: $db"
  else
    print_fail "Database missing/empty: $db"
  fi
done

echo
echo "Audit Summary"
echo "-------------"
echo "PASS: $PASS_COUNT"
echo "WARN: $WARN_COUNT"
echo "FAIL: $FAIL_COUNT"

if [ "$FAIL_COUNT" -gt 0 ]; then
  echo
  echo "Readiness: NOT READY"
  exit 1
fi

if [ "$WARN_COUNT" -gt 0 ]; then
  echo
  echo "Readiness: READY WITH WARNINGS"
  exit 0
fi

echo
echo "Readiness: READY"
exit 0
