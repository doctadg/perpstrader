#!/bin/bash
# Setup script for PerpsTrader Redis Message Bus
# This installs and configures an isolated Redis instance for the trading system

set -e

echo "╔════════════════════════════════════════════════════════════╗"
echo "║  PerpsTrader Redis Message Bus - Setup                    ║"
echo "╚════════════════════════════════════════════════════════════╝"

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo "Please run this script with sudo (for systemd service installation)"
  exit 1
fi

USER_HOME=$(eval echo ~${SUDO_USER})
PROJECT_DIR="/home/d/PerpsTrader"

echo ""
echo "📦 Step 1: Installing Redis server..."
apt-get update -qq
apt-get install -y redis-server

echo ""
echo "📁 Step 2: Creating directories..."
mkdir -p "$PROJECT_DIR/logs"
mkdir -p "$PROJECT_DIR/data/redis"
chown -R d:d "$PROJECT_DIR/logs"
chown -R d:d "$PROJECT_DIR/data/redis"

echo ""
echo "🔧 Step 3: Installing Node.js dependencies..."
cd "$PROJECT_DIR"
sudo -u d npm install ioredis bullmq
sudo -u d npm install --save-dev @types/ioredis

echo ""
echo "🔨 Step 4: Building TypeScript..."
sudo -u d npm run build

echo ""
echo "📋 Step 5: Installing systemd services..."
# Copy service files
cp "$PROJECT_DIR/systemd/perps-redis.service" /etc/systemd/system/
cp "$PROJECT_DIR/systemd/perps-news-worker.service" /etc/systemd/system/

# Reload systemd
systemctl daemon-reload

echo ""
echo "🚀 Step 6: Starting Redis message bus..."
systemctl enable perps-redis.service
systemctl start perps-redis.service

# Wait for Redis to start
sleep 2

# Test connection
if redis-cli -p 6380 ping > /dev/null 2>&1; then
  echo "✅ Redis message bus is running on port 6380"
else
  echo "❌ Redis failed to start. Check logs: journalctl -u perps-redis"
  exit 1
fi

echo ""
echo "🎯 Step 7: Enabling news worker..."
systemctl enable perps-news-worker.service
systemctl start perps-news-worker.service

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  Setup Complete!"
echo ""
echo "  Redis Message Bus: redis://127.0.0.1:6380"
echo "  - DB 0: Pub/Sub messages"
echo "  - DB 1: LLM/Embedding cache"
echo "  - DB 2: Job queues"
echo ""
echo "  Services:"
echo "  - perps-redis.service (isolated Redis)"
echo "  - perps-news-worker.service (background jobs)"
echo ""
echo "  Commands:"
echo "  - Status: systemctl status perps-redis"
echo "  - Logs: journalctl -u perps-redis -f"
echo "  - Redis CLI: redis-cli -p 6380"
echo ""
echo "  To restart other services with Redis:"
echo "  systemctl restart perps-news perps-agent perps-dashboard"
echo "═══════════════════════════════════════════════════════════"
