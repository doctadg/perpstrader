#!/bin/bash
# Aggressive market_data cleanup - keep only last 6 hours of tick data
# Run every 4 hours via cron

set -e

DB_PATH="/home/d/PerpsTrader/data/trading.db"
LOG_FILE="/home/d/PerpsTrader/data/market-data-cleanup.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Get current stats (use -list to avoid headers)
ROWS_BEFORE=$(sqlite3 -list "$DB_PATH" "SELECT COUNT(*) FROM market_data;")
SIZE_BEFORE=$(du -sh "$DB_PATH" | cut -f1)

log "Starting cleanup: $ROWS_BEFORE rows, $SIZE_BEFORE size"

# Keep only last 6 hours (more aggressive for tick data)
CUTOFF=$(date -u -d '6 hours ago' '+%Y-%m-%dT%H:%M:%S.000Z')

# Create temp table with recent data only
sqlite3 "$DB_PATH" "CREATE TABLE market_data_temp AS SELECT * FROM market_data WHERE timestamp > '$CUTOFF';"

# Swap tables
sqlite3 "$DB_PATH" "DROP TABLE market_data;"
sqlite3 "$DB_PATH" "ALTER TABLE market_data_temp RENAME TO market_data;"

# Recreate indexes
sqlite3 "$DB_PATH" "CREATE INDEX IF NOT EXISTS idx_market_data_symbol ON market_data(symbol);"
sqlite3 "$DB_PATH" "CREATE INDEX IF NOT EXISTS idx_market_data_timestamp ON market_data(timestamp);"

# Get new stats
ROWS_AFTER=$(sqlite3 -list "$DB_PATH" "SELECT COUNT(*) FROM market_data;")
log "After cleanup: $ROWS_AFTER rows (removed $((ROWS_BEFORE - ROWS_AFTER)) rows)"

# Vacuum to reclaim space (use INTO to avoid locking)
sqlite3 "$DB_PATH" "VACUUM INTO '/home/d/PerpsTrader/data/trading_vacuum.db';"
mv /home/d/PerpsTrader/data/trading_vacuum.db "$DB_PATH"

SIZE_AFTER=$(du -sh "$DB_PATH" | cut -f1)
log "Completed: $SIZE_AFTER size (saved: $SIZE_BEFORE -> $SIZE_AFTER)"
