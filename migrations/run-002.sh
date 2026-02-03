#!/bin/bash
# Migration Runner for 002_cluster_enhancements.sql
# Runs the enhanced clustering database migration

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
SQLITE_DB="$PROJECT_ROOT/data/trading.db"
MIGRATION_FILE="$SCRIPT_DIR/002_cluster_enhancements.sql"

# Color codes
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

echo "═════════════════════════════════════════════════════════"
echo "  Migration 002: Cluster Enhancements"
echo "═════════════════════════════════════════════════════════"
echo ""

# Check if migration file exists
if [ ! -f "$MIGRATION_FILE" ]; then
    log_error "Migration file not found: $MIGRATION_FILE"
    exit 1
fi

log_info "Migration file: $MIGRATION_FILE"
log_info "Database: $SQLITE_DB"
echo ""

# Check if sqlite3 is available
if ! command -v sqlite3 &> /dev/null; then
    log_error "sqlite3 CLI not found"
    log_error "Please install sqlite3: apt-get install sqlite3 (Debian/Ubuntu)"
    log_error "                      or: brew install sqlite3 (macOS)"
    exit 1
fi

# Check if database exists
if [ ! -f "$SQLITE_DB" ]; then
    log_warn "Database does not exist: $SQLITE_DB"
    log_info "Creating database..."
    mkdir -p "$(dirname "$SQLITE_DB")"
    sqlite3 "$SQLITE_DB" "SELECT 1;"
    log_info "Database created"
fi

# Backup database before migration
BACKUP_DIR="$PROJECT_ROOT/data/backups"
BACKUP_FILE="$BACKUP_DIR/trading.db.pre-002.$(date +%Y%m%d_%H%M%S).bak"

log_info "Creating database backup..."
mkdir -p "$BACKUP_DIR"
cp "$SQLITE_DB" "$BACKUP_FILE"

if [ $? -eq 0 ]; then
    log_info "Backup created: $BACKUP_FILE"
else
    log_error "Failed to create backup"
    exit 1
fi
echo ""

# Check if migration was already run
MIGRATION_TABLE="schema_migrations"

log_info "Checking if migration was already applied..."

# Check if schema_migrations table exists
TABLE_EXISTS=$(sqlite3 "$SQLITE_DB" "SELECT name FROM sqlite_master WHERE type='table' AND name='$MIGRATION_TABLE';")

if [ -z "$TABLE_EXISTS" ]; then
    log_info "Creating migrations table..."
    sqlite3 "$SQLITE_DB" "CREATE TABLE IF NOT EXISTS $MIGRATION_TABLE (migration_id TEXT PRIMARY KEY, applied_at TEXT);"
fi

# Check if migration 002 was already applied
APPLIED=$(sqlite3 "$SQLITE_DB" "SELECT migration_id FROM $MIGRATION_TABLE WHERE migration_id='002_cluster_enhancements';")

if [ -n "$APPLIED" ]; then
    log_warn "Migration 002_cluster_enhancements was already applied"
    echo ""
    read -p "Re-run migration? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Skipping migration"
        exit 0
    fi
    log_warn "Re-running migration (data may be affected)..."
fi
echo ""

# Run migration
log_info "Running migration..."

# Use BEGIN TRANSACTION for atomic execution
sqlite3 "$SQLITE_DB" <<EOF
BEGIN TRANSACTION;

$(cat "$MIGRATION_FILE")

-- Record migration
INSERT OR REPLACE INTO $MIGRATION_TABLE (migration_id, applied_at)
VALUES ('002_cluster_enhancements', datetime('now'));

COMMIT;
EOF

if [ $? -eq 0 ]; then
    log_info "Migration completed successfully"
else
    log_error "Migration failed!"
    log_error "Restoring backup..."

    cp "$BACKUP_FILE" "$SQLITE_DB"

    if [ $? -eq 0 ]; then
        log_info "Database restored from backup"
    else
        log_error "Failed to restore backup!"
    fi
    exit 1
fi
echo ""

# Verify migration
log_info "Verifying migration..."

# Check for required tables
REQUIRED_TABLES=(
    "cluster_heat_history"
    "named_entities"
    "entity_article_links"
    "entity_cluster_links"
    "cluster_cross_refs"
    "cluster_hierarchy"
    "user_engagement"
    "user_category_preferences"
    "clustering_metrics"
    "label_quality_tracking"
    "circuit_breaker_metrics"
    "heat_decay_config"
)

MISSING_TABLES=()

for table in "${REQUIRED_TABLES[@]}"; do
    EXISTS=$(sqlite3 "$SQLITE_DB" "SELECT name FROM sqlite_master WHERE type='table' AND name='$table';")
    if [ -z "$EXISTS" ]; then
        MISSING_TABLES+=("$table")
    fi
done

if [ ${#MISSING_TABLES[@]} -gt 0 ]; then
    log_error "Migration verification failed: missing tables"
    for table in "${MISSING_TABLES[@]}"; do
        log_error "  - $table"
    done
    exit 1
fi

log_info "All required tables created successfully"
echo ""

# Check for required columns in story_clusters
log_info "Verifying story_clusters enhanced columns..."

REQUIRED_COLUMNS=(
    "heat_velocity"
    "acceleration"
    "predicted_heat"
    "prediction_confidence"
    "is_cross_category"
    "parent_cluster_id"
    "entity_heat_score"
    "source_authority_score"
    "sentiment_velocity"
    "market_correlation_score"
    "composite_rank_score"
    "is_anomaly"
    "anomaly_type"
    "anomaly_score"
    "lifecycle_stage"
    "peak_heat"
    "peak_time"
)

MISSING_COLUMNS=()

for column in "${REQUIRED_COLUMNS[@]}"; do
    EXISTS=$(sqlite3 "$SQLITE_DB" "PRAGMA table_info(story_clusters);" | grep -c "$column" || true)
    if [ "$EXISTS" -eq 0 ]; then
        MISSING_COLUMNS+=("$column")
    fi
done

if [ ${#MISSING_COLUMNS[@]} -gt 0 ]; then
    log_warn "Some columns were not added (may already exist):"
    for column in "${MISSING_COLUMNS[@]}"; do
        log_warn "  - $column"
    done
else
    log_info "All enhanced columns added successfully"
fi
echo ""

# Display summary
echo "═════════════════════════════════════════════════════════"
echo "  Migration Summary"
echo "═════════════════════════════════════════════════════════"
echo ""
log_info "✓ Migration 002_cluster_enhancements applied successfully"
log_info "✓ Database backup: $BACKUP_FILE"
log_info "✓ All tables verified"
echo ""
log_info "Enhanced features are now ready to use!"
echo ""
