#!/bin/bash
# Rollback enhanced clustering deployment
#
# This script rolls back the enhanced clustering deployment by:
# - Stopping services
# - Rolling back database migrations
# - Restoring environment configuration
# - Restarting services
#
# Usage:
#   ./scripts/rollback-enhanced.sh [options]
#
# Options:
#   --backup-file PATH  Restore from specific backup file
#   --keep-backup       Don't restore database, only rollback migration
#   --help              Show this help message
#
# Environment:
#   PERPS_DIR     PerpsTrader directory (default: script parent's parent)
#   BACKUP_DIR    Backup directory (default: data/backups)

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
PERPS_DIR="${PERPS_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
BACKUP_DIR="${BACKUP_DIR:-$PERPS_DIR/data/backups}"
DB_PATH="$PERPS_DIR/data/news.db"
SPECIFIC_BACKUP=""
KEEP_BACKUP=false

# Functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

show_help() {
    grep '^#' "$0" | grep -v '#!' | sed 's/^# //g' | sed 's/^#//g' | head -20
    exit 0
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --backup-file)
            SPECIFIC_BACKUP="$2"
            shift 2
            ;;
        --keep-backup)
            KEEP_BACKUP=true
            shift
            ;;
        --help)
            show_help
            ;;
        *)
            log_error "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Change to PerpsTrader directory
cd "$PERPS_DIR"

log_info "=== Rolling Back Enhanced Clustering ==="
log_info "Directory: $PERPS_DIR"

# Step 1: Stop services
log_info "Stopping services..."

if [ -f "$PERPS_DIR/scripts/perps-control" ]; then
    ./scripts/perps-control stop news-agent || {
        log_warn "Failed to stop news-agent, continuing..."
    }
    ./scripts/perps-control stop dashboard || {
        log_warn "Failed to stop dashboard, continuing..."
    }
    log_info "Services stopped"
else
    log_warn "perps-control script not found, you may need to manually stop services"
fi

# Step 2: Rollback migration
log_info "Rolling back database migration..."

if [ -f "./scripts/rollback-002.sh" ]; then
    ./scripts/rollback-002.sh || {
        log_warn "Migration rollback script failed or not found"
        log_warn "Attempting manual rollback..."
    }
    log_info "Migration rollback completed"
elif [ -f "./migrations/rollback-002.sql" ]; then
    log_info "Running SQL rollback..."
    sqlite3 "$DB_PATH" < ./migrations/rollback-002.sql || {
        log_warn "SQL rollback failed"
    }
    log_info "Migration rollback completed"
else
    log_warn "Migration rollback script not found, skipping migration rollback"
    log_warn "You may need to manually revert database changes"
fi

# Step 3: Restore database (if requested and not keeping backup)
if [ "$KEEP_BACKUP" = false ]; then
    if [ -n "$SPECIFIC_BACKUP" ]; then
        # Use specific backup
        backup_file="$SPECIFIC_BACKUP"
        if [ ! -f "$backup_file" ]; then
            log_error "Specified backup file not found: $backup_file"
            exit 1
        fi
    else
        # Find most recent backup
        backup_file=$(ls -t "$BACKUP_DIR"/news.db.pre_enhanced_* 2>/dev/null | head -n1 || echo "")

        if [ -z "$backup_file" ]; then
            log_warn "No backup file found, skipping database restore"
            log_info "If you have a backup elsewhere, use --backup-file PATH"
        else
            log_info "Found backup: $backup_file"
        fi
    fi

    if [ -n "$backup_file" ] && [ -f "$backup_file" ]; then
        # Create a backup of current state before restoring
        if [ -f "$DB_PATH" ]; then
            pre_rollback_backup="$BACKUP_DIR/news.db.pre_rollback_$(date +%Y%m%d_%H%M%S)"
            cp "$DB_PATH" "$pre_rollback_backup" || {
                log_warn "Failed to create pre-rollback backup"
            }
            log_info "Current state backed up to: $pre_rollback_backup"
        fi

        log_info "Restoring database from backup..."
        cp "$backup_file" "$DB_PATH" || {
            log_error "Database restore failed"
            exit 1
        }
        log_info "Database restored from: $backup_file"
    fi
else
    log_info "Skipping database restore (--keep-backup flag set)"
fi

# Step 4: Restore environment
log_info "Restoring environment configuration..."

if [ -f ".env.backup" ]; then
    # Backup current .env before restoring
    cp .env .env.pre_rollback || {
        log_warn "Failed to backup current .env"
    }

    cp .env.backup .env || {
        log_error "Environment restore failed"
        exit 1
    }
    log_info "Environment restored from .env.backup"
else
    log_warn ".env.backup not found, skipping environment restore"
fi

# Step 5: Restart services
log_info "Restarting services..."

if [ -f "$PERPS_DIR/scripts/perps-control" ]; then
    ./scripts/perps-control start news-agent || {
        log_warn "Failed to start news-agent, continuing..."
    }
    sleep 5

    ./scripts/perps-control start dashboard || {
        log_warn "Failed to start dashboard, continuing..."
    }
    log_info "Services restarted"
else
    log_warn "perps-control script not found, skipping service restart"
    log_warn "You may need to manually restart your services"
fi

# Step 6: Verification
log_info "Waiting for services to stabilize..."
sleep 15

if [ -f "$PERPS_DIR/scripts/qc/test-api-endpoints.sh" ]; then
    log_info "Testing API endpoints (post-rollback)..."
    ./scripts/qc/test-api-endpoints.sh || {
        log_warn "API test failed after rollback"
        log_warn "Services may need additional configuration"
    }
    log_info "Post-rollback verification passed"
fi

log_info "=== Rollback Complete ==="
log_info "Enhanced clustering has been rolled back"

if [ -n "$backup_file" ] && [ -f "$backup_file" ]; then
    log_info "Database restored from: $backup_file"
fi

log_info "To redeploy, run: ./scripts/deploy-enhanced.sh"
