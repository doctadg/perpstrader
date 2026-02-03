#!/bin/bash
# Test database cleanup operations using full sqlite3 path

PERPS_DIR="/home/d/PerpsTrader"
DB_PATH="$PERPS_DIR/data/trading.db"

echo "=== Database Cleanup Test ==="
echo "Database: $DB_PATH"
echo "Size before: $(du -sh "$DB_PATH" | cut -f1)"
echo ""

echo "=== Testing sqlite3 ==="
which sqlite3 || /usr/bin/sqlite3
SQLITE3_PATH=$(which sqlite3 || /usr/bin/sqlite3)

echo "SQLite3: $SQLITE3_PATH"
echo ""

# Test VACUUM
echo "Testing VACUUM..."
"$SQLITE3_PATH" "$DB_PATH" "VACUUM;" 2>/dev/null
VACUUM_RESULT=$?
echo "VACUUM result: $VACUUM_RESULT"
echo ""

# Test DELETE
echo "Testing DELETE of 1 record..."
"$SQLITE3_PATH" "$DB_PATH" "DELETE FROM trades WHERE rowid IN (SELECT rowid FROM trades ORDER BY timestamp ASC LIMIT 1);" 2>/dev/null
DELETE_RESULT=$?
echo "DELETE result: $DELETE_RESULT"
echo ""

# Test COUNT
echo "Testing COUNT..."
COUNT=$("$SQLITE3_PATH" "$DB_PATH" "SELECT COUNT(*) FROM trades;")
echo "COUNT: $COUNT"
echo ""

echo "=== Test Complete ==="
