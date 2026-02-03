#!/bin/bash
# Test database cleanup operations

PERPS_DIR="/home/d/PerpsTrader"
DB_PATH="$PERPS_DIR/data/trading.db"

echo "=== Database Cleanup Test ==="
echo "Database: $DB_PATH"
echo "Size before: $(du -sh "$DB_PATH" | cut -f1)"
echo ""

# Test VACUUM
echo "Testing VACUUM..."
/usr/local/bin/sqlite3 "$DB_PATH" "VACUUM;"
VACUUM_RESULT=$?
echo "VACUUM result: $VACUUM_RESULT"
echo ""

# Test simple DELETE
echo "Testing DELETE of 1 old record..."
/usr/local/bin/sqlite3 "$DB_PATH" "DELETE FROM trades WHERE rowid IN (SELECT rowid FROM trades ORDER BY timestamp ASC LIMIT 1);"
DELETE_RESULT=$?
echo "DELETE result: $DELETE_RESULT"
echo ""

echo "=== Test Complete ==="
