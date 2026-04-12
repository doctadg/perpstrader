#!/bin/bash
# Pump.fun Metrics Export Script
set -e
PROJECT_ROOT="/home/d/PerpsTrader"
METRICS_DIR="$PROJECT_ROOT/data/pumpfun-metrics-history"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

mkdir -p "$METRICS_DIR"

# Check if database exists and has data
if [ ! -f "$PROJECT_ROOT/data/pumpfun.db" ]; then
    echo "❌ No pumpfun database found"
    exit 1
fi

# Get basic stats
TOTAL_TRADES=$(sqlite3 "$PROJECT_ROOT/data/pumpfun.db" "SELECT COUNT(*) FROM pumpfun_trade_outcomes;" 2>/dev/null || echo "0")
WINNING_TRADES=$(sqlite3 "$PROJECT_ROOT/data/pumpfun.db" "SELECT COUNT(*) FROM pumpfun_trade_outcomes WHERE pnl_pct > 0;" 2>/dev/null || echo "0")
LOSING_TRADES=$(sqlite3 "$PROJECT_ROOT/data/pumpfun.db" "SELECT COUNT(*) FROM pumpfun_trade_outcomes WHERE pnl_pct <= 0;" 2>/dev/null || echo "0")
QUICK_RUGS=$(sqlite3 "$PROJECT_ROOT/data/pumpfun.db" "SELECT COUNT(*) FROM pumpfun_trade_outcomes WHERE hold_time_minutes < 5;" 2>/dev/null || echo "0")

# Create comprehensive metrics report
cat > "$METRICS_DIR/pumpfun-stats-$TIMESTAMP.json" << JSON_EOF
{
  "export_timestamp": "$(date -Iseconds)",
  "total_trades": $TOTAL_TRADES,
  "winning_trades": $WINNING_TRADES,
  "losing_trades": $LOSING_TRADES,
  "quick_rugs": $QUICK_RUGS,
  "quick_rug_rate": $(echo "scale=1; $QUICK_RUGS * 100 / $TOTAL_TRADES" | bc -l 2>/dev/null || echo "0"),
  "win_rate": $(echo "scale=1; $WINNING_TRADES * 100 / $TOTAL_TRADES" | bc -l 2>/dev/null || echo "0"),
  "threshold": $(grep -o "PUMPFUN_MIN_BUY_SCORE=[0-9.]*" .env 2>/dev/null | cut -d= -f2 || echo "0.35")
}
JSON_EOF

# Create latest symlink
ln -sf "$METRICS_DIR/pumpfun-stats-$TIMESTAMP.json" "$PROJECT_ROOT/data/pumpfun-metrics-latest.json"

echo "✅ Metrics exported to: $METRICS_DIR/"
echo "📈 Summary:"
echo "Total Trades: $TOTAL_TRADES"
echo "Win Rate: $(echo "scale=1; $WINNING_TRADES * 100 / $TOTAL_TRADES" | bc -l 2>/dev/null || echo "0")%"
echo "Quick Rugs: $QUICK_RUGS ($(echo "scale=1; $QUICK_RUGS * 100 / $TOTAL_TRADES" | bc -l 2>/dev/null || echo "0")%)"
echo "Current Threshold: $(grep -o "PUMPFUN_MIN_BUY_SCORE=[0-9.]*" .env 2>/dev/null | cut -d= -f2 || echo "0.35")"