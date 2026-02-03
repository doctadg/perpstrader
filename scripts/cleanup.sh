#!/bin/bash
# Simple PerpsTrader database cleanup - inline version
# Direct execution, no subshells

set -e

PERPS_DIR="/home/d/PerpsTrader"
DATA_DIR="$PERPS_DIR/data"
BACKUP_DIR="$DATA_DIR/backups"

DB_NAME="${1:-all}"
KEEP_DAYS="${2:-90}"

cleanup_single() {
    local db_path="$DATA_DIR/${DB_NAME}.db"
    local backup_path="$BACKUP_DIR/${DB_NAME}_$(date '+%Y%m%d').db"

    echo "=== Cleaning $DB_NAME ==="
    echo "Keeping records newer than $KEEP_DAYS days"

    if [ ! -f "$db_path" ]; then
        echo "ERROR: Database not found: $db_path"
        return 1
    fi

    local size_before_mb=$(du -sh "$db_path" | cut -f1)
    echo "Size before: ${size_before_mb} MB"

    # Backup
    echo "Backing up to $backup_path..."
    cp "$db_path" "$backup_path"

    # Delete old records
    local cutoff_date=$(date -d "$KEEP_DAYS days ago" '+%Y-%m-%d')

    echo "Deleting records older than $cutoff_date..."
    /usr/local/bin/sqlite3 "$db_path" "DELETE FROM main WHERE timestamp < '$cutoff_date'"

    # Vacuum
    echo "Vacuuming database..."
    /usr/local/bin/sqlite3 "$db_path" "VACUUM"

    local size_after_mb=$(du -sh "$db_path" | cut -f1)
    local space_saved_mb=$((size_before_mb - size_after_mb))

    echo "=== Cleanup complete for $DB_NAME ==="
    echo "Size after: ${size_after_mb} MB"
    echo "Space saved: ~${space_saved_mb} MB"

    return 0
}

if [ "$DB_NAME" = "all" ]; then
    echo "=== Cleaning all databases ==="
    local failed=0

    cleanup_single "trades" || failed=1
    cleanup_single "market_data" || failed=1
    cleanup_single "ai_insights" || failed=1
    cleanup_single "news" || failed=1
    cleanup_single "predictions" || failed=1

    echo "=== All cleanups complete ==="
    echo "Failed: $failed"

    if [ $failed -gt 0 ]; then
        exit 1
    fi
else
    cleanup_single "$DB_NAME" || exit 1
fi
