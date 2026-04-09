#!/bin/bash
# Pump.fun Metrics Export Script
set -e
PROJECT_ROOT="/home/d/PerpsTrader"
METRICS_DIR="$PROJECT_ROOT/data/pumpfun-metrics-history"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

mkdir -p "$METRICS_DIR"

# Create comprehensive metrics report
cat > "/tmp/pumpfun-stats-$TIMESTAMP.json" << JSON_EOF
{
  "export_timestamp": "$(date -Iseconds)",
  "total_trades": $(sqlite3 "$PROJECT_ROOT/pumpfun.db" "SELECT COUNT(*) FROM pumpfun_trade_outcomes;"),
  "winning_trades": $(sqlite3 "$PROJECT_ROOT/pumpfun.db" "SELECT COUNT(*) FROM pumpfun_trade_outcomes WHERE pnl_pct > 0;"),
  "losing_trades": $(sqlite3 "$PROJECT_ROOT/pumpfun.db" "SELECT COUNT(*) FROM pumpfun_trade_outcomes WHERE pnl_pct <= 0;"),
  "total_sol_pnl": $(sqlite3 "$PROJECT_ROOT/pumpfun.db" "SELECT SUM(pnl_sol) FROM pumpfun_trade_outcomes;"),
  "avg_pnl_pct": $(sqlite3 "$PROJECT_ROOT/pumpfun.db" "SELECT AVG(pnl_pct) FROM pumpfun_trade_outcomes;"),
  "quick_rugs": $(sqlite3 "$PROJECT_ROOT/pumpfun.db" "SELECT COUNT(*) FROM pumpfun_trade_outcomes WHERE hold_time_minutes < 5;"),
  "avg_hold_time": $(sqlite3 "$PROJECT_ROOT/pumpfun.db" "SELECT AVG(hold_time_minutes) FROM pumpfun_trade_outcomes;"),
  "score_distribution": {
    "0.00-0.29": $(sqlite3 "$PROJECT_ROOT/pumpfun.db" "SELECT COUNT(*) FROM pumpfun_trade_outcomes WHERE entry_score < 0.3;"),
    "0.30-0.39": $(sqlite3 "$PROJECT_ROOT/pumpfun.db" "SELECT COUNT(*) FROM pumpfun_trade_outcomes WHERE entry_score >= 0.3 AND entry_score < 0.4;"),
    "0.40-0.49": $(sqlite3 "$PROJECT_ROOT/pumpfun.db" "SELECT COUNT(*) FROM pumpfun_trade_outcomes WHERE entry_score >= 0.4 AND entry_score < 0.5;"),
    "0.50-0.59": $(sqlite3 "$PROJECT_ROOT/pumpfun.db" "SELECT COUNT(*) FROM pumpfun_trade_outcomes WHERE entry_score >= 0.5 AND entry_score < 0.6;"),
    "0.60-0.69": $(sqlite3 "$PROJECT_ROOT/pumpfun.db" "SELECT COUNT(*) FROM pumpfun_trade_outcomes WHERE entry_score >= 0.6 AND entry_score < 0.7;"),
    "0.70+": $(sqlite3 "$PROJECT_ROOT/pumpfun.db" "SELECT COUNT(*) FROM pumpfun_trade_outcomes WHERE entry_score >= 0.7;")
  }
}
JSON_EOF

cp "/tmp/pumpfun-stats-$TIMESTAMP.json" "$METRICS_DIR/"
ln -sf "$METRICS_DIR/pumpfun-stats-$TIMESTAMP.json" "$PROJECT_ROOT/data/pumpfun-metrics-latest.json"
rm "/tmp/pumpfun-stats-$TIMESTAMP.json"

echo "✅ Metrics exported to: $METRICS_DIR/"
echo "📈 Summary:"
sqlite3 "$PROJECT_ROOT/pumpfun.db" "SELECT 'Total Trades: ' || COUNT(*) as total, 'Win Rate: ' || ROUND(CAST(COUNT(CASE WHEN pnl_pct > 0 THEN 1 END) AS REAL) / COUNT(*) * 100, 1) || '%' as win_rate, 'Avg PnL%: ' || ROUND(AVG(pnl_pct), 2) as avg_pnl FROM pumpfun_trade_outcomes;"