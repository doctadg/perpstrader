#!/usr/bin/env bash
# pumpfun-metrics.sh — Export pumpfun metrics JSON for Hermes analysis
# Usage: ./scripts/pumpfun-metrics.sh [--quiet]
# Output: data/pumpfun-metrics-latest.json + data/pumpfun-metrics-history/metrics-TIMESTAMP.json

set -euo pipefail
cd "$(dirname "$0")/.."

QUIET=false
[[ "${1:-}" == "--quiet" ]] && QUIET=true

python3 scripts/pumpfun-metrics.py 2>&1 | grep -v "^$" || true

OUTFILE="data/pumpfun-metrics-latest.json"
if [[ -f "$OUTFILE" ]]; then
    if ! $QUIET; then
        echo "Exported: $OUTFILE ($(wc -c < "$OUTFILE") bytes)"
        # Quick summary
        python3 -c "
import json
m = json.load(open('$OUTFILE'))
p = m['portfolio']
w = m['win_rate']
d = m['discovery']
print(f\"  Open: {p['open_positions']} | Closed: {p['closed_positions']} | PnL: {p['total_pnl_sol']} SOL ({p['total_pnl_pct']}%)\")
print(f\"  Win rate: {w['overall_win_rate']}% ({w['profitable_trades']}W/{w['losing_trades']}L)\")
print(f\"  Analyzed: {d['total_analyzed']} | BUY recs: {d['total_buy_recs']} | Avg score: {d['avg_score_last_100']}\")
" 2>/dev/null || true
    fi
else
    echo "ERROR: $OUTFILE not created" >&2
    exit 1
fi
