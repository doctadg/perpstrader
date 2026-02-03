#!/bin/bash
# Simple PerpsTrader database cleanup using sqlite3 CLI
# Usage: ./cleanup-simple.sh [trading|market_data|ai_insights|news|predictions]

set -e

# Add sqlite3 to PATH if not already there
if ! command -v sqlite3 &>/dev/null; then
    export PATH="/usr/local/bin:$PATH"
fi

PERPS_DIR="/home/d/PerpsTrader"
DATA_DIR="$PERPS_DIR/data"
BACKUP_DIR="$DATA_DIR/backups"

# Function to log
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Function to clean a single database
cleanup_single() {
    local db_name="$1"
    local db_path="$DATA_DIR/${db_name}.db"
    local keep_days="${2:-90}"

    log "=== Cleaning $db_name (keeping last $keep_days days) ==="

    if [ ! -f "$db_path" ]; then
        log "ERROR: Database not found: $db_path"
        return 1
    fi

    # Check file size before
    local size_before_mb=$(du -sh "$db_path" | cut -f1)

    log "Size before: ${size_before_mb} MB"

    # Create backup
    local now=$(date '+%Y%m%d')
    local backup_path="$BACKUP_DIR/${db_name}_${now}.db"

    log "Backing up to $backup_path..."
    cp "$db_path" "$backup_path"

    if [ $? -ne 0 ]; then
        log "ERROR: Backup failed"
        return 1
    fi

    # Delete old records
    local cutoff_date=$(date -d "$keep_days days ago" '+%Y-%m-%d')

    log "Deleting records older than $cutoff_date..."

    sqlite3 "$db_path" "DELETE FROM main WHERE timestamp < '$cutoff_date'" 2>/dev/null

    if [ $? -ne 0 ]; then
        log "ERROR: Delete failed"
        return 1
    fi

    # Vacuum database
    log "Vacuuming database..."
    sqlite3 "$db_path" "VACUUM" 2>/dev/null

    if [ $? -ne 0 ]; then
        log "ERROR: Vacuum failed"
        return 1
    fi

    # Check file size after
    local size_after_mb=$(du -sh "$db_path" | cut -f1)

    log "Size after: ${size_after_mb} MB"

    return 0
}

# Main execution
DB_NAME="${1:-all}"

if [ "$DB_NAME" = "all" ]; then
    log "=== Cleaning all databases ==="

    local failed=0
    for db in trading market_data ai_insights news predictions; do
        cleanup_single "$db" || failed=1
    done

    if [ $failed -eq 1 ]; then
        log "ERROR: Some cleanups failed"
        exit 1
    fi

    log "=== All cleanups complete ==="
else
    cleanup_single "$DB_NAME"
fi

exit 0
