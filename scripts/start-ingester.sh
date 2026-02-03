#!/bin/bash

# PerpsTrader Market Data Ingester Startup Script

echo "🚀 Starting PerpsTrader Market Data Ingester..."

# Kill any existing processes
pkill -f "node.*market-ingester" 2>/dev/null

# Wait for processes to stop
sleep 2

# Start the market ingester
cd /home/d/PerpsTrader
node bin/market-ingester/market-ingester.js > logs/market-ingester.log 2>&1 &

INGESTER_PID=$!
echo "📡 Market ingester started (PID: $INGESTER_PID)"
echo "📍 Ingesting data for BTC, ETH, SOL from Hyperliquid"
echo "📊 Data stored in SQLite database"
echo "🔍 Watch logs: tail -f logs/market-ingester.log"
