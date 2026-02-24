#!/usr/bin/env bash

# PerpsTrader operational test entrypoint.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo "Running PerpsTrader operational health audit..."
"$PROJECT_DIR/scripts/health-audit.sh"
