#!/bin/bash
# Cleanup script for PerpsTrader databases
# Archives old data and vacuums databases to free space
# Usage: ./cleanup-database.sh [dry-run]

set -e

PERPS_DIR="/home/d/PerpsTrader"
DATA_DIR="$PERPS_DIR/data"
BACKUP_DIR="$DATA_DIR/backups"
DATE=$(date '+%Y%m%d')

# Log file
LOG_FILE="$DATA_DIR/cleanup.log"

# Dry run flag
DRY_RUN="${1:-false}"

# Ensure directories exist
mkdir -p "$BACKUP_DIR"

# Log function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Backup table before cleanup
backup_table() {
    local table_name="$1"
    local backup_file="$BACKUP_DIR/${table_name}_${DATE}.db"

    log "Backing up $table_name to $backup_file..."

    if [ "$DRY_RUN" = "true" ]; then
        log "[DRY RUN] Would backup: $backup_file"
        return 0
    fi

    cp "$DATA_DIR/$table_name.db" "$backup_file"

    if [ $? -eq 0 ]; then
        log "✓ Backup created: $backup_file"
        return 0
    else
        log "✗ Backup failed: $table_name"
        return 1
    fi
}

# Delete old records
delete_old_records() {
    local table_name="$1"
    local date_column="${2:-timestamp}"
    local days_old="${3:-90}"

    log "Deleting records older than $days_old days from $table_name..."

    if [ "$DRY_RUN" = "true" ]; then
        log "[DRY RUN] Would delete old records from $table_name"
        return 0
    fi

    # Calculate cutoff date
    local cutoff_date=$(date -d "$days_old days ago" '+%Y-%m-%d')

    # Get row count before deletion
    local count_before=$(sqlite3 "$DATA_DIR/$table_name.db" "SELECT COUNT(*) FROM $table_name WHERE $date_column < '$cutoff_date'")

    # Delete old records
    sqlite3 "$DATA_DIR/$table_name.db" "DELETE FROM $table_name WHERE $date_column < '$cutoff_date'"

    # Get row count after deletion
    local count_after=$(sqlite3 "$DATA_DIR/$table_name.db" "SELECT COUNT(*) FROM $table_name")

    local deleted=$((count_before - count_after))

    log "✓ Deleted $deleted old records from $table_name"
}

# Vacuum database
vacuum_database() {
    local db_name="$1"
    local db_path="$DATA_DIR/$db_name.db"

    log "Vacuuming $db_name..."

    if [ "$DRY_RUN" = "true" ]; then
        log "[DRY RUN] Would vacuum: $db_name"
        return 0
    fi

    # Get file size before
    local size_before=$(du -sh "$db_path" | cut -f1)

    # Vacuum database
    sqlite3 "$db_path" "VACUUM"

    # Get file size after
    local size_after=$(du -sh "$db_path" | cut -f1)

    # Calculate space saved
    local space_saved=$((size_before - size_after))

    log "✓ Vacuumed $db_name (freed $space_saved KB)"
}

# Get database size before cleanup
get_db_size() {
    local db_path="$1"
    du -sh "$db_path" | cut -f1
}

# Main cleanup function
cleanup_database() {
    local db_name="$1"

    log "=== Starting cleanup for $db_name ==="
    local size_before=$(get_db_size "$DATA_DIR/$db_name.db")
    log "Size before: $size_before KB"

    # Backup before cleanup
    if ! backup_table "$db_name"; then
        log "⚠ Backup failed, skipping cleanup"
        return 1
    fi

    # Archive old market data (keep last 30 days)
    log "Archiving old market_data..."
    delete_old_records "market_data" "timestamp" "30"

    # Archive old trades (keep last 90 days)
    log "Archiving old trades..."
    delete_old_records "trades" "timestamp" "90"

    # Archive old AI insights (keep last 30 days)
    log "Archiving old ai_insights..."
    delete_old_records "ai_insights" "timestamp" "30"

    # Vacuum to reclaim space
    log "Vacuuming database..."
    vacuum_database "$db_name"

    local size_after=$(get_db_size "$DATA_DIR/$db_name.db")
    local space_saved=$((size_before - size_after))

    log "=== Cleanup complete for $db_name ==="
    log "Size after: $size_after KB"
    log "Space saved: $space_saved KB"
}

# Cleanup main trading database
cleanup_database "trading"

# Cleanup news database
if [ -f "$DATA_DIR/news.db" ]; then
    log "=== Cleaning up news.db ==="
    local size_before=$(get_db_size "$DATA_DIR/news.db")
    log "Size before: $size_before KB"

    # Delete news older than 7 days
    sqlite3 "$DATA_DIR/news.db" "DELETE FROM articles WHERE publishedAt < datetime('now', '-7 days')"

    vacuum_database "news"

    local size_after=$(get_db_size "$DATA_DIR/news.db")
    local space_saved=$((size_before - size_after))

    log "=== News cleanup complete ==="
    log "Size after: $size_after KB"
    log "Space saved: $space_saved KB"
fi

# Cleanup predictions database
if [ -f "$DATA_DIR/predictions.db" ]; then
    log "=== Cleaning up predictions.db ==="
    local size_before=$(get_db_size "$DATA_DIR/predictions.db")
    log "Size before: $size_before KB"

    # Delete old predictions (keep last 7 days)
    sqlite3 "$DATA_DIR/predictions.db" "DELETE FROM predictions WHERE createdAt < datetime('now', '-7 days')"

    vacuum_database "predictions"

    local size_after=$(get_db_size "$DATA_DIR/predictions.db")
    local space_saved=$((size_before - size_after))

    log "=== Predictions cleanup complete ==="
    log "Size after: $size_after KB"
    log "Space saved: $space_saved KB"
fi

log "=== All cleanup tasks complete ==="
