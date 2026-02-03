#!/bin/bash
# Robust PerpsTrader database cleanup
# Safely archives old data and vacuums databases to reclaim space
# Usage: ./cleanup-simple.sh [trading|market_data|ai_insights|news|predictions|all]

set -e

PERPS_DIR="/home/d/PerpsTrader"
DATA_DIR="$PERPS_DIR/data"
BACKUP_DIR="$DATA_DIR/backups"

# Function to log
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$DATA_DIR/cleanup.log"
}

# Function to log with status
log_status() {
    local status="$1"
    local message="$2"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [$status] $message" | tee -a "$DATA_DIR/cleanup.log"
}

# Function to handle errors
error_exit() {
    log_status "ERROR" "$1"
    exit 1
}

# Function to clean a single database
cleanup_database() {
    local db_name="$1"
    local keep_days="${2:-90}"
    local db_path="$DATA_DIR/${db_name}.db"
    local backup_path="$BACKUP_DIR/${db_name}_$(date '+%Y%m%d').db"

    log_status "INFO" "Starting cleanup for $db_name"
    log "Database: $db_path"
    log "Keeping records newer than $keep_days days"

    # Check if database exists
    if [ ! -f "$db_path" ]; then
        error_exit "Database not found: $db_path"
    fi

    # Check file size before
    local size_before_mb=$(du -sh "$db_path" | cut -f1)
    log_status "INFO" "Size before: ${size_before_mb} MB"

    # Create backup
    log_status "INFO" "Backing up to $backup_path"
    if ! cp "$db_path" "$backup_path"; then
        error_exit "Backup failed"
    fi
    log_status "SUCCESS" "Backup created"

    # Calculate cutoff date
    local cutoff_date=$(date -d "$keep_days days ago" '+%Y-%m-%d')

    # Get count before
    local before_count=$(sqlite3 "$db_path" "SELECT COUNT(*) as count FROM main WHERE timestamp < '$cutoff_date'" 2>/dev/null)
    if [ $? -ne 0 ]; then
        error_exit "COUNT query failed"
    fi

    # Delete old records
    log_status "INFO" "Deleting records older than $keep_days days..."
    local delete_result=$(sqlite3 "$db_path" "DELETE FROM main WHERE timestamp < '$cutoff_date'" 2>/dev/null)
    if [ $? -ne 0 ]; then
        error_exit "DELETE failed"
    fi

    # Get count after
    local after_count=$(sqlite3 "$db_path" "SELECT COUNT(*) as count FROM main" 2>/dev/null)
    if [ $? -ne 0 ]; then
        error_exit "COUNT query after failed"
    fi

    local deleted_count=$((before_count - after_count))

    log_status "SUCCESS" "Deleted $deleted_count old records"

    # Vacuum database
    log_status "INFO" "Vacuuming database..."
    if ! sqlite3 "$db_path" "VACUUM" 2>/dev/null; then
        error_exit "VACUUM failed"
    fi

    # Get file size after
    local size_after_mb=$(du -sh "$db_path" | cut -f1)

    local space_saved_mb=$((size_before_mb - size_after_mb))

    log_status "SUCCESS" "Vacuum complete. Space saved: ~${space_saved_mb} MB"
    log_status "INFO" "Size after: ${size_after_mb} MB"

    # Get final size for verification
    local size_final_mb=$(du -sh "$db_path" | cut -f1)
    log_status "INFO" "Final size verification: ${size_final_mb} MB"

    return 0
}

# Main execution
main() {
    local db_name="${1:-all}"

    if [ "$db_name" = "all" ]; then
        log_status "INFO" "=== Cleaning all databases ==="
        
        local failed=0
        local cleaned=0
        
        # Process each database
        for table in trades market_data ai_insights news predictions; do
            if cleanup_database "$table"; then
                ((cleaned++))
            else
                ((failed++))
            fi
        done
        
        if [ $cleaned -gt 0 ]; then
            log_status "SUCCESS" "Cleaned $cleaned databases successfully"
        fi
        
        if [ $failed -gt 0 ]; then
            log_status "ERROR" "Failed to clean $failed databases"
            exit 1
        fi
    else
        # Clean single database
        if cleanup_database "$db_name"; then
            log_status "SUCCESS" "Cleanup completed for $db_name"
            exit 0
        else
            log_status "ERROR" "Unknown database: $db_name"
            exit 1
    fi
}

# Run main with error handling
main "$@" 2>&1 || error_exit "Main script failed"
}
