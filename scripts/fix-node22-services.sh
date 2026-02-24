#!/bin/bash
# Fix PerpsTrader Node 22 + Service Restart Script

echo "🦊 Vex Capital - PerpsTrader Fix Script"
echo "========================================"

# 1. Copy fixed service files
echo "📋 Copying fixed service files..."
sudo cp /home/d/PerpsTrader/systemd/*.service /etc/systemd/system/

# 2. Reload systemd
echo "🔄 Reloading systemd..."
sudo systemctl daemon-reload

# 3. Stop all perps services
echo "🛑 Stopping all PerpsTrader services..."
sudo systemctl stop perps-agent perps-ingester perps-predictions perps-news perps-dashboard perps-news-worker perps-pumpfun perps-safekeeping perps-execution perps-research 2>/dev/null

# 4. Start infrastructure first
echo "🚀 Starting infrastructure (Redis, ChromaDB)..."
sudo systemctl start perps-redis chromadb
sleep 2

# 5. Start core services
echo "🚀 Starting core services..."
sudo systemctl start perps-dashboard perps-news perps-predictions
sleep 2

# 6. Start agent services
echo "🚀 Starting agent services..."
sudo systemctl start perps-ingester perps-agent

# 7. Show status
echo ""
echo "📊 Service Status:"
echo "=================="
for service in perps-redis chromadb perps-dashboard perps-news perps-predictions perps-ingester perps-agent; do
    status=$(sudo systemctl is-active $service 2>/dev/null)
    if [ "$status" = "active" ]; then
        echo "✅ $service: RUNNING"
    else
        echo "❌ $service: $status"
    fi
done

echo ""
echo "🌐 Dashboard: http://0.0.0.0:3001"
echo "✅ Done!"
