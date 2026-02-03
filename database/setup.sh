#!/bin/bash
# Database Setup Script for PerpsTrader
# Creates fresh SQLite databases for new installations

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DATA_DIR="$PROJECT_ROOT/data"
SCHEMA_DIR="$PROJECT_ROOT/database/schema"

echo "🔧 PerpsTrader Database Setup"
echo "=============================="
echo ""

# Create data directory
mkdir -p "$DATA_DIR"

echo "📁 Data directory: $DATA_DIR"
echo ""

# Check for sqlite3
if ! command -v sqlite3 &> /dev/null; then
    echo "❌ sqlite3 is required but not installed"
    echo "Install with: sudo apt-get install sqlite3"
    exit 1
fi

# Initialize news.db
echo "📰 Creating news.db..."
sqlite3 "$DATA_DIR/news.db" < "$SCHEMA_DIR/news.sql"
echo "✅ news.db created"

# Initialize predictions.db
echo "🎯 Creating predictions.db..."
sqlite3 "$DATA_DIR/predictions.db" < "$SCHEMA_DIR/predictions.sql"
echo "✅ predictions.db created"

# Initialize trading.db
echo "📈 Creating trading.db..."
sqlite3 "$DATA_DIR/trading.db" < "$SCHEMA_DIR/trading.sql"
echo "✅ trading.db created"

echo ""
echo "✅ All databases initialized successfully!"
echo ""
echo "Next steps:"
echo "1. Copy .env.example to .env and configure your API keys"
echo "2. Run: npm install"
echo "3. Start the system: ./scripts/perps-control start"
