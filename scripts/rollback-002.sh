#!/bin/bash

# Rollback Script for Migration 002: Cluster Enhancements
# This script safely rolls back the enhanced clustering features

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="${PROJECT_DIR}/backups"
MIGRATION_DIR="${PROJECT_DIR}/migrations"
SQL_FILE="${MIGRATION_DIR}/002_cluster_enhancements.sql"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    local color=$1
    local message=$2
    echo -e "${color}${message}${NC}"
}

# Function to confirm action
confirm() {
    read -p "$(echo -e ${YELLOW}$1 (y/n) ${NC})" response
    case "$response" in
        [yY][eE][sS]|[yY])
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

print_status $BLUE "================================================"
print_status $BLUE "  ROLLBACK MIGRATION 002: Cluster Enhancements"
print_status $BLUE "================================================"
echo ""

# Check if migration file exists
if [ ! -f "$SQL_FILE" ]; then
    print_status $RED "❌ Migration file not found: $SQL_FILE"
    exit 1
fi

# Check if database exists
DB_PATH="${PROJECT_DIR}/data/trading.db"
if [ ! -f "$DB_PATH" ]; then
    print_status $RED "❌ Database not found: $DB_PATH"
    exit 1
fi

print_status $BLUE "📋 Migration Details:"
echo "  Migration: 002_cluster_enhancements.sql"
echo "  Database: $DB_PATH"
echo "  Backup Directory: $BACKUP_DIR"
echo ""

# Create backup before rollback
print_status $YELLOW "🔄 Creating database backup before rollback..."

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/trading_db_before_rollback_002_${TIMESTAMP}.db"

mkdir -p "$BACKUP_DIR"

if cp "$DB_PATH" "$BACKUP_FILE"; then
    print_status $GREEN "✅ Backup created: $BACKUP_FILE"
else
    print_status $RED "❌ Failed to create backup"
    exit 1
fi

echo ""

# Show what will be rolled back
print_status $YELLOW "⚠️  This will rollback the following changes:"
echo "  • Enhanced clustering tables (if created)"
echo "  • Heat history tracking"
echo "  • Entity extraction data"
echo "  • Cross-category linking tables"
echo "  • User personalization data"
echo "  • Quality metrics tracking"
echo ""

# Confirm rollback
if ! confirm "Do you want to proceed with the rollback?"; then
    print_status $YELLOW "❌ Rollback cancelled by user"
    exit 0
fi

echo ""

# Create rollback SQL (reverse of migration)
print_status $BLUE "🔄 Executing rollback..."

ROLLBACK_SQL="${MIGRATION_DIR}/rollback_002_${TIMESTAMP}.sql"

cat > "$ROLLBACK_SQL" << 'EOF'
-- Rollback Migration 002: Cluster Enhancements
-- This script reverses the enhanced clustering features

BEGIN TRANSACTION;

-- Drop new tables if they exist
DROP TABLE IF EXISTS cluster_heat_history;
DROP TABLE IF EXISTS cluster_entities;
DROP TABLE IF EXISTS cluster_cross_refs;
DROP TABLE IF EXISTS cluster_hierarchy;
DROP TABLE IF EXISTS user_engagement;
DROP TABLE IF EXISTS user_category_preferences;
DROP TABLE IF EXISTS cluster_quality_metrics;
DROP TABLE IF EXISTS entity_heat;

-- Remove enhanced columns from clusters table if they were added
-- (Note: ALTER TABLE DROP COLUMN is not supported in all SQLite versions,
-- so we recreate the table without the enhanced columns)

-- Check if enhanced columns exist and remove them
PRAGMA table_info(clusters);

-- If enhanced columns exist, create a new table without them and migrate data
-- This is a safe approach for SQLite

-- For now, we just drop the new tables. The existing clusters table remains
-- but won't have the enhanced features available.

COMMIT;

-- Vacuum to reclaim space
VACUUM;

-- Analyze to update query planner statistics
ANALYZE;

-- Success message
SELECT 'Rollback completed successfully' AS status;
EOF

# Execute rollback
if sqlite3 "$DB_PATH" < "$ROLLBACK_SQL"; then
    print_status $GREEN "✅ Rollback SQL executed successfully"
else
    print_status $RED "❌ Rollback SQL failed"
    print_status $YELLOW "💡 Database backup preserved at: $BACKUP_FILE"
    exit 1
fi

echo ""

# Disable enhanced clustering in environment
ENV_FILE="${PROJECT_DIR}/.env"
ENV_EXAMPLE="${PROJECT_DIR}/.env.enhanced.example"

if [ -f "$ENV_FILE" ]; then
    print_status $BLUE "🔧 Disabling enhanced clustering in environment..."

    # Backup existing .env
    cp "$ENV_FILE" "${ENV_FILE}.backup_rollback_002_${TIMESTAMP}"

    # Comment out or disable enhanced clustering settings
    if grep -q "^USE_ENHANCED_CLUSTERING=true" "$ENV_FILE"; then
        sed -i.bak 's/^USE_ENHANCED_CLUSTERING=true/# USE_ENHANCED_CLUSTERING=false  # Disabled after rollback 002/' "$ENV_FILE"
        print_status $GREEN "✅ USE_ENHANCED_CLUSTERING disabled in .env"
    else
        # Add disabled setting if not present
        echo "" >> "$ENV_FILE"
        echo "# Enhanced clustering disabled after rollback 002" >> "$ENV_FILE"
        echo "USE_ENHANCED_CLUSTERING=false" >> "$ENV_FILE"
        print_status $GREEN "✅ USE_ENHANCED_CLUSTERING=false added to .env"
    fi
else
    print_status $YELLOW "⚠️  No .env file found, skipping environment update"
fi

echo ""

# Restart services if they're running
print_status $BLUE "🔄 Checking services..."

SERVICES_RESTARTED=false

if systemctl is-active --quiet perps-dashboard; then
    if confirm "Restart perps-dashboard to apply changes?"; then
        sudo systemctl restart perps-dashboard
        print_status $GREEN "✅ perps-dashboard restarted"
        SERVICES_RESTARTED=true
    fi
fi

if systemctl is-active --quiet perps-agent; then
    if confirm "Restart perps-agent to apply changes?"; then
        sudo systemctl restart perps-agent
        print_status $GREEN "✅ perps-agent restarted"
        SERVICES_RESTARTED=true
    fi
fi

echo ""

# Summary
print_status $GREEN "=========================================="
print_status $GREEN "✅ ROLLBACK 002 COMPLETED SUCCESSFULLY"
print_status $GREEN "=========================================="
echo ""
print_status $BLUE "Summary:"
echo "  • Database backup: $BACKUP_FILE"
echo "  • Rollback SQL: $ROLLBACK_SQL"
echo "  • Enhanced clustering: DISABLED"
echo "  • Services restarted: $SERVICES_RESTARTED"
echo ""
print_status $YELLOW "⚠️  Notes:"
echo "  • The system will now use standard clustering mode"
echo "  • Enhanced features (anomaly detection, predictions, etc.) are disabled"
echo "  • Backup is preserved for recovery if needed"
echo ""
print_status $BLUE "📊 To verify the rollback, run:"
echo "  $0 enhanced"
echo ""
print_status $BLUE "🔄 To re-enable enhanced clustering:"
echo "  1. Restore from backup if needed"
echo "  2. Run migration again: sqlite3 $DB_PATH < $SQL_FILE"
echo "  3. Set USE_ENHANCED_CLUSTERING=true in .env"
echo "  4. Restart services"
echo ""
