#!/bin/bash
# Setup Enhanced Clustering System
# Installs and configures all enhanced clustering features

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
MIGRATIONS_DIR="$PROJECT_ROOT/migrations"
SQLITE_DB="$PROJECT_ROOT/data/trading.db"

echo "═════════════════════════════════════════════════════════"
echo "  Enhanced Clustering Setup Script"
echo "═════════════════════════════════════════════════════════"
echo ""

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

# Step 1: Check prerequisites
log_info "Checking prerequisites..."

if ! command -v node &> /dev/null; then
    log_error "Node.js is not installed"
    exit 1
fi

if ! command -v sqlite3 &> /dev/null; then
    log_warn "sqlite3 CLI not found, using better-sqlite3 for migrations"
fi

log_info "Node.js version: $(node --version)"
log_info "Project root: $PROJECT_ROOT"
echo ""

# Step 2: Create data directory if it doesn't exist
log_info "Ensuring data directory exists..."
mkdir -p "$PROJECT_ROOT/data"
log_info "Data directory: $PROJECT_ROOT/data"
echo ""

# Step 3: Build TypeScript
log_info "Building TypeScript..."
cd "$PROJECT_ROOT"
npm run build

if [ $? -ne 0 ]; then
    log_error "TypeScript build failed"
    exit 1
fi

log_info "Build completed successfully"
echo ""

# Step 4: Run database migration
log_info "Running database migration 002_cluster_enhancements.sql..."

if [ -f "$MIGRATIONS_DIR/run-002.sh" ]; then
    log_info "Using migration runner script..."
    bash "$MIGRATIONS_DIR/run-002.sh"
else
    log_warn "Migration runner not found, running SQL directly..."

    if command -v sqlite3 &> /dev/null; then
        sqlite3 "$SQLITE_DB" < "$MIGRATIONS_DIR/002_cluster_enhancements.sql"
    else
        log_error "Cannot run migration: sqlite3 not available"
        log_error "Please run: bash $MIGRATIONS_DIR/run-002.sh"
        exit 1
    fi
fi

if [ $? -ne 0 ]; then
    log_error "Database migration failed"
    exit 1
fi

log_info "Database migration completed successfully"
echo ""

# Step 5: Verify database tables
log_info "Verifying enhanced database tables..."

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

if command -v sqlite3 &> /dev/null; then
    MISSING_TABLES=()

    for table in "${REQUIRED_TABLES[@]}"; do
        EXISTS=$(sqlite3 "$SQLITE_DB" "SELECT name FROM sqlite_master WHERE type='table' AND name='$table';")
        if [ -z "$EXISTS" ]; then
            MISSING_TABLES+=("$table")
        else
            log_info "  ✓ Table exists: $table"
        fi
    done

    if [ ${#MISSING_TABLES[@]} -gt 0 ]; then
        log_error "Missing tables: ${MISSING_TABLES[*]}"
        exit 1
    fi

    # Verify story_clusters table has new columns
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

    log_info "Verifying story_clusters enhanced columns..."
    for column in "${REQUIRED_COLUMNS[@]}"; do
        EXISTS=$(sqlite3 "$SQLITE_DB" "PRAGMA table_info(story_clusters);" | grep -c "$column" || true)
        if [ "$EXISTS" -gt 0 ]; then
            log_info "  ✓ Column exists: $column"
        else
            log_warn "  ⚠ Column missing: $column (may need manual migration)"
        fi
    done
else
    log_warn "Cannot verify tables without sqlite3 CLI"
fi

echo ""

# Step 6: Create example environment configuration
log_info "Creating example environment configuration..."

ENV_EXAMPLE="$PROJECT_ROOT/.env.enhanced.example"

cat > "$ENV_EXAMPLE" << 'EOF'
# Enhanced Clustering Configuration
# Copy this file to .env and adjust values as needed

# Enable/disable enhanced features
ENHANCED_CLUSTERING_ENABLED=true
ENTITY_EXTRACTION_ENABLED=true
ANOMALY_DETECTION_ENABLED=true
HEAT_PREDICTION_ENABLED=true
USER_PERSONALIZATION_ENABLED=true

# News agent configuration
NEWS_CYCLE_INTERVAL_MS=60000
NEWS_ROTATION_MODE=true
NEWS_QUERIES_PER_CATEGORY=3

# Enhanced clustering options
CLUSTER_BATCH_SIZE=20
CLUSTER_MERGE_HOURS_THRESHOLD=48
CLUSTER_MERGE_SIMILARITY_THRESHOLD=0.85

# Vector configuration
NEWS_VECTOR_DISTANCE_THRESHOLD=0.70
NEWS_VECTOR_FILTER_BY_CATEGORY=true

# Fallback options
NEWS_USE_GLM=false
NEWS_FALLBACK_TO_BASIC=true

# Dashboard configuration
DASHBOARD_PORT=3001
DASHBOARD_ALLOWED_ORIGINS=http://localhost:3001,https://localhost:3001
NEWS_DASHBOARD_POLL_MS=10000
NEWS_DASHBOARD_POLL_LIMIT=25

# Prediction markets
PREDICTION_MIN_VOLUME=1000
EOF

log_info "Example configuration created: $ENV_EXAMPLE"
echo ""

# Step 7: Display next steps
log_info "Setup completed successfully!"
echo ""
echo "═════════════════════════════════════════════════════════"
echo "  Next Steps"
echo "═════════════════════════════════════════════════════════"
echo ""
echo "1. Review and update environment configuration:"
echo "   cp .env.enhanced.example .env"
echo "   # Edit .env with your settings"
echo ""
echo "2. Start the enhanced news agent:"
echo "   npm run start:news-agent  # or node bin/news-agent.js"
echo ""
echo "3. Start the dashboard:"
echo "   npm run start:dashboard   # or node bin/dashboard-server.js"
echo ""
echo "4. Test enhanced endpoints:"
echo "   curl http://localhost:3001/api/enhanced/news/decay-config"
echo "   curl http://localhost:3001/api/enhanced/news/quality-metrics"
echo ""
echo "5. View enhanced features in dashboard:"
echo "   Open http://localhost:3001"
echo ""
echo "═════════════════════════════════════════════════════════"
echo "  Enhanced Clustering Features Enabled"
echo "═════════════════════════════════════════════════════════"
echo ""
echo "✓ Enhancement 1: Heat Decay Configuration"
echo "✓ Enhancement 2: Cluster Evolution Tracking"
echo "✓ Enhancement 3: Multi-dimensional Ranking"
echo "✓ Enhancement 4: Cross-Category Linking"
echo "✓ Enhancement 5: Entity Extraction & Tracking"
echo "✓ Enhancement 6: Predictive Scoring"
echo "✓ Enhancement 7: User Personalization"
echo "✓ Enhancement 9: Anomaly Detection"
echo "✓ Enhancement 10: Performance Monitoring"
echo ""
echo "Documentation: /home/d/PerpsTrader/ENHANCED-FEATURES.md"
echo ""
