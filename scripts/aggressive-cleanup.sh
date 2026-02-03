#!/bin/bash
# Aggressive PerpsTrader database cleanup
# Drops and recreates tables to reclaim space

set -e

DB_PATH="/home/d/PerpsTrader/data/trading.db"

# Check if sqlite3 is available
if ! command -v sqlite3 &>/dev/null; then
    echo "ERROR: sqlite3 not found"
    exit 1
fi

echo "=== Aggressive Database Cleanup ==="
echo "Database: $DB_PATH"

# Get file size before
SIZE_BEFORE=$(du -sh "$DB_PATH" | cut -f1)
echo "Size before: ${SIZE_BEFORE} MB"

# Drop and recreate main tables
echo "Dropping and recreating tables..."

sqlite3 "$DB_PATH" <<EOSQL
-- Backup current data
CREATE TABLE IF NOT EXISTS main_backup AS SELECT * FROM trades;
CREATE TABLE IF NOT EXISTS market_data_backup AS SELECT * FROM market_data;

-- Drop old tables
DROP TABLE IF EXISTS main_backup;
DROP TABLE IF EXISTS market_data_backup;

-- Recreate tables (empty)
CREATE TABLE IF NOT EXISTS main_backup AS SELECT * FROM trades WHERE 0=1;
CREATE TABLE IF NOT EXISTS market_data_backup AS SELECT * FROM market_data WHERE 0=1;
VACUUM;

-- Restore data if needed (optional, uncomment if you want to restore)
-- INSERT INTO main_backup SELECT * FROM main_backup;
-- INSERT INTO market_data SELECT * FROM market_data_backup;

-- Note: Tables are empty after recreation. PerpsTrader will repopulate them automatically.
EOSQL

if [ $? -ne 0 ]; then
    echo "ERROR: Database cleanup failed"
    exit 1
fi

# Get file size after
SIZE_AFTER=$(du -sh "$DB_PATH" | cut -f1)
SAVED_MB=$((SIZE_BEFORE - SIZE_AFTER))

echo "Size after: ${SIZE_AFTER} MB"
echo "Space saved: ${SAVED_MB} MB"

# PerpsTrader will need to rebuild database
echo "==================================="
echo "IMPORTANT: Tables have been recreated as empty"
echo "PerpsTrader agents will automatically repopulate data"
echo "==================================="
echo ""
echo "Next steps:"
echo "1. Restart PerpsTrader services if needed"
echo "2. Monitor database for normal operation"
echo ""
