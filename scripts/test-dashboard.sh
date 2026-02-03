#!/bin/bash

echo "🧪 Testing Dashboard Access..."

# Start dashboard in background
echo "🚀 Starting dashboard server..."
node bin/dashboard-server.js &
DASHBOARD_PID=$!

# Wait for server to start
sleep 3

# Test local access
echo "🔗 Testing local access..."
if curl -s http://localhost:3000/api/status > /dev/null; then
    echo "✅ Local access working"
else
    echo "❌ Local access failed"
fi

# Test network access
echo "🌍 Testing network access..."
if curl -s http://0.0.0.0:3000/api/status > /dev/null; then
    echo "✅ Network access working"
else
    echo "❌ Network access failed"
fi

# Show access URLs
echo ""
echo "📱 Dashboard Access URLs:"
echo "🔗 Local: http://localhost:3000"
echo "🌍 Network: http://0.0.0.0:3000"

# Get server IP for external access
SERVER_IP=$(hostname -I | awk '{print $1}')
if [ ! -z "$SERVER_IP" ]; then
    echo "🌐 External: http://$SERVER_IP:3000"
fi

echo ""
echo "📋 Dashboard is running in background (PID: $DASHBOARD_PID)"
echo "🛑 To stop: kill $DASHBOARD_PID"
echo ""
echo "📱 Try accessing the dashboard from your browser now!"
echo "⏳ Will auto-stop in 60 seconds..."

# Auto-stop after 60 seconds
sleep 60
kill $DASHBOARD_PID 2>/dev/null
echo "✅ Dashboard test completed"