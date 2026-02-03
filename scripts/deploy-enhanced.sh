#!/bin/bash
# Deploy enhanced clustering with safety checks
#
# This script performs a controlled deployment of enhanced clustering features,
# including pre-flight checks, database backups, migrations, and post-deploy verification.
#
# Usage:
#   ./scripts/deploy-enhanced.sh [options]
#
# Options:
#   --dry-run    Run pre-flight checks without deploying
#   --skip-backup Skip database backup (not recommended)
#   --help       Show this help message
#
# Environment:
#   PERPS_DIR    PerpsTrader directory (default: script parent's parent)
#   BACKUP_DIR   Backup directory (default: data/backups)

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
DRY_RUN=false
SKIP_BACKUP=false

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
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --skip-backup)
            SKIP_BACKUP=true
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

log_info "=== Enhanced Clustering Deployment ==="
log_info "Directory: $PERPS_DIR"

# Step 1: Pre-flight checks
log_info "Running pre-flight checks..."

if [ -f "$PERPS_DIR/scripts/qc/verify-migration.sh" ]; then
    log_info "Verifying migration prerequisites..."
    ./scripts/qc/verify-migration.sh || {
        log_error "Migration verification failed"
        exit 1
    }
else
    log_warn "verify-migration.sh not found, skipping"
fi

if [ -f "$PERPS_DIR/scripts/qc/test-api-endpoints.sh" ]; then
    log_info "Testing API endpoints (pre-deploy)..."
    ./scripts/qc/test-api-endpoints.sh || {
        log_error "Pre-deploy API test failed"
        exit 1
    }
else
    log_warn "test-api-endpoints.sh not found, skipping"
fi

if [ "$DRY_RUN" = true ]; then
    log_info "Dry run complete. Exiting without deploying."
    exit 0
fi

# Step 2: Backup database
if [ "$SKIP_BACKUP" = false ]; then
    log_info "Backing up database..."
    mkdir -p "$BACKUP_DIR"

    timestamp=$(date +%Y%m%d_%H%M%S)
    backup_file="$BACKUP_DIR/news.db.pre_enhanced_$timestamp"

    if [ -f "$DB_PATH" ]; then
        cp "$DB_PATH" "$backup_file" || {
            log_error "Database backup failed"
            exit 1
        }
        log_info "Database backed up to: $backup_file"

        # Keep last 10 backups
        ls -t "$BACKUP_DIR"/news.db.pre_enhanced_* 2>/dev/null | tail -n +11 | xargs rm -f 2>/dev/null || true
        log_info "Old backups cleaned up"
    else
        log_warn "Database file not found at $DB_PATH, skipping backup"
    fi
else
    log_warn "Skipping database backup (--skip-backup flag set)"
fi

# Step 3: Backup environment
log_info "Backing up environment configuration..."
if [ -f ".env" ]; then
    cp .env .env.backup || {
        log_error "Environment backup failed"
        exit 1
    }
    log_info "Environment backed up to .env.backup"
fi

# Step 4: Run migration
log_info "Running database migration..."

if [ -f "./migrations/run-002.sh" ]; then
    ./migrations/run-002.sh || {
        log_error "Migration failed"
        log_error "You may need to restore from backup: cp $backup_file $DB_PATH"
        exit 1
    }
    log_info "Migration completed successfully"
elif [ -f "./migrations/002-enhanced-clustering.sql" ]; then
    log_info "Running SQL migration directly..."
    sqlite3 "$DB_PATH" < ./migrations/002-enhanced-clustering.sql || {
        log_error "SQL migration failed"
        exit 1
    }
    log_info "Migration completed successfully"
else
    log_warn "Migration script not found, assuming database is already migrated"
fi

# Step 5: Restart services
log_info "Restarting services..."

if [ -f "$PERPS_DIR/scripts/perps-control" ]; then
    ./scripts/perps-control restart news-agent || {
        log_warn "Failed to restart news-agent, continuing..."
    }
    sleep 5

    ./scripts/perps-control restart dashboard || {
        log_warn "Failed to restart dashboard, continuing..."
    }
    log_info "Services restarted"
else
    log_warn "perps-control script not found, skipping service restart"
    log_warn "You may need to manually restart your services"
fi

# Step 6: Post-deploy verification
log_info "Waiting for services to stabilize..."
sleep 30

if [ -f "$PERPS_DIR/scripts/qc/test-api-endpoints.sh" ]; then
    log_info "Testing API endpoints (post-deploy)..."
    ./scripts/qc/test-api-endpoints.sh || {
        log_error "Post-deploy API test failed"
        log_warn "Deployment may not have completed successfully"
        log_warn "Consider rolling back with: ./scripts/rollback-enhanced.sh"
        exit 1
    }
    log_info "Post-deploy verification passed"
else
    log_warn "test-api-endpoints.sh not found, skipping post-deploy verification"
fi

log_info "=== Deployment Complete ==="
log_info "Enhanced clustering features are now active"
log_info "Backup location: $backup_file"
log_info "To rollback, run: ./scripts/rollback-enhanced.sh"
