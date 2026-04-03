#!/bin/bash

# Pump.fun Metrics Export Script
# Exports trade data from SQLite to JSON for analysis

set -e

# Database path
DB_PATH="../data/pumpfun.db"

# Ensure data directory exists
mkdir -p ../data

# Export metrics to JSON
sqlite3 "$DB_PATH" << 'EOF'
-- Get total trades and quick rugs
SELECT json_object(
  'timestamp', datetime('now'),
  'total_trades_analyzed', COUNT(DISTINCT id),
  'quick_rugs_count', SUM(CASE WHEN hold_time_minutes < 5 THEN 1 ELSE 0 END),
  'quick_rugs_rate', ROUND(100.0 * SUM(CASE WHEN hold_time_minutes < 5 THEN 1 ELSE 0 END) / COUNT(DISTINCT id), 1),
  'score_buckets', (
    SELECT json_object(
      '0.00-0.29', json_object('count', COUNT(CASE WHEN entry_score < 0.3 THEN 1 END), 'note', CASE WHEN COUNT(CASE WHEN entry_score < 0.3 THEN 1 END) = 0 THEN 'no trades' ELSE NULL END),
      '0.30-0.39', json_object('count', COUNT(CASE WHEN entry_score >= 0.3 AND entry_score < 0.4 THEN 1 END), 'note', CASE WHEN COUNT(CASE WHEN entry_score >= 0.3 AND entry_score < 0.4 THEN 1 END) = 0 THEN 'no trades' ELSE NULL END),
      '0.40-0.49', json_object('count', COUNT(CASE WHEN entry_score >= 0.4 AND entry_score < 0.5 THEN 1 END), 'note', CASE WHEN COUNT(CASE WHEN entry_score >= 0.4 AND entry_score < 0.5 THEN 1 END) = 0 THEN 'no trades' ELSE NULL END),
      '0.50-0.59', json_object('count', COUNT(CASE WHEN entry_score >= 0.5 AND entry_score < 0.6 THEN 1 END), 'note', CASE WHEN COUNT(CASE WHEN entry_score >= 0.5 AND entry_score < 0.6 THEN 1 END) = 0 THEN 'no trades' ELSE NULL END),
      '0.60-0.69', json_object('count', COUNT(CASE WHEN entry_score >= 0.6 AND entry_score < 0.7 THEN 1 END), 'note', CASE WHEN COUNT(CASE WHEN entry_score >= 0.6 AND entry_score < 0.7 THEN 1 END) = 0 THEN 'no trades' ELSE NULL END),
      '0.70-1.00', json_object(
        'count', COUNT(CASE WHEN entry_score >= 0.7 THEN 1 END),
        'win_rate', ROUND(100.0 * SUM(CASE WHEN pnl_pct > 0 THEN 1 ELSE 0 END) / COUNT(CASE WHEN entry_score >= 0.7 THEN 1 END), 1),
        'avg_pnl', ROUND(AVG(COALESCE(pnl_pct, 0)), 2),
        'best_pnl', ROUND(MAX(COALESCE(pnl_pct, 0)), 2),
        'worst_pnl', ROUND(MIN(COALESCE(pnl_pct, 0)), 2),
        'avg_hold_time', ROUND(AVG(hold_time_minutes), 1)
      )
    )
  ),
  'quick_rugs_examples', (
    SELECT json_group_array(json_object(
      'score', entry_score,
      'pnl_pct', ROUND(pnl_pct, 4),
      'hold_time', ROUND(hold_time_minutes, 4),
      'token_symbol', token_symbol
    ))
    FROM pumpfun_trade_outcomes
    WHERE hold_time_minutes < 5
    ORDER BY created_at DESC
    LIMIT 5
  ),
  'config_weights', (
    SELECT json_object(
      'social', COALESCE((SELECT value FROM config WHERE key = 'pumpfun.social_weight'), 0.3),
      'freshness', COALESCE((SELECT value FROM config WHERE key = 'pumpfun.freshness_weight'), 0.2),
      'websiteQuality', COALESCE((SELECT value FROM config WHERE key = 'pumpfun.website_quality_weight'), 0.1),
      'aiAnalysis', COALESCE((SELECT value FROM config WHERE key = 'pumpfun.ai_analysis_weight'), 0.15),
      'tokenQuality', COALESCE((SELECT value FROM config WHERE key = 'pumpfun.token_quality_weight'), 0.15),
      'redFlagPenalty', COALESCE((SELECT value FROM config WHERE key = 'pumpfun.red_flag_penalty_weight'), 0.1)
    )
    FROM config
    LIMIT 1
  )
)
FROM pumpfun_trade_outcomes;
EOF

# Copy to latest metrics file
cp ../data/pumpfun-metrics-latest.json ../data/pumpfun-metrics-$(date +%Y%m%d_%H%M%S).json

echo "Metrics exported successfully to ../data/pumpfun-metrics-latest.json"
