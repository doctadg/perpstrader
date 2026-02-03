#!/bin/bash

# PerpsTrader Dashboard Startup Script
# This script ensures the dashboard is accessible on your local network

echo "🚀 Starting PerpsTrader AI Dashboard..."

# Kill any existing dashboard processes
pkill -f "node.*dashboard" 2>/dev/null
pkill -f "simple-dashboard" 2>/dev/null

# Wait a moment for processes to stop
sleep 2

# Get the local IP address
LOCAL_IP=$(hostname -I | awk '{print $1}')

echo "📍 Local IP Address: $LOCAL_IP"
echo "🌐 Dashboard will be accessible at: http://$LOCAL_IP:3000"
echo "💻 Also accessible at: http://localhost:3000"
echo ""

# Start the dashboard server
cd /home/d/PerpsTrader

# Use the simplified dashboard that works
node simple-dashboard.js > logs/dashboard.log 2>&1 &

# Wait for server to start
sleep 3

# Test if dashboard is responding
if curl -s http://localhost:3000/api/health > /dev/null; then
    echo "✅ Dashboard started successfully!"
    echo "🌐 Access on your local network: http://$LOCAL_IP:3000"
    echo "💻 Access locally: http://localhost:3000"
    echo ""
    echo "📱 You can now access the dashboard from any device on your network using: http://$LOCAL_IP:3000"
    echo ""
    echo "🔍 To test the API endpoints:"
    echo "   curl http://$LOCAL_IP:3000/api/health"
    echo "   curl http://$LOCAL_IP:3000/api/status"
    echo ""
else
    echo "❌ Dashboard failed to start. Check logs/dashboard.log for errors."
    exit 1
fi