#!/bin/bash

# PerpsTrader Test Script

echo "🧪 Testing PerpsTrader AI Trading System..."

# Test 1: Check if all executables exist
echo "📋 Test 1: Checking executables..."
if [ -f "bin/agent.js" ] && [ -f "bin/dashboard.js" ] && [ -f "bin/execution.js" ]; then
    echo "✅ All executable files found"
else
    echo "❌ Missing executable files"
    exit 1
fi

# Test 2: Check if TypeScript compiled successfully
echo "📋 Test 2: Checking TypeScript compilation..."
if [ -f "bin/ai-agent.js" ]; then
    echo "✅ TypeScript compilation successful"
else
    echo "❌ TypeScript compilation failed"
    exit 1
fi

# Test 3: Check configuration files
echo "📋 Test 3: Checking configuration..."
if [ -f "config/config.json" ]; then
    echo "✅ Configuration file exists"
else
    echo "⚠️  Configuration file not found (will be created by install script)"
fi

# Test 4: Check systemd service files
echo "📋 Test 4: Checking systemd services..."
if [ -f "systemd/perps-agent.service" ]; then
    echo "✅ Systemd service files created"
else
    echo "❌ Systemd service files missing"
    exit 1
fi

# Test 5: Check dashboard HTML
echo "📋 Test 5: Checking dashboard..."
if [ -f "dashboard/public/index.html" ]; then
    echo "✅ Dashboard HTML created"
else
    echo "❌ Dashboard HTML missing"
    exit 1
fi

# Test 6: Test basic module imports
echo "📋 Test 6: Testing module imports..."
cd /home/d/PerpsTrader
node -e "
try {
    const config = require('./bin/config.js');
    console.log('✅ Config module loads successfully');
} catch (e) {
    console.log('❌ Config module failed to load');
    process.exit(1);
}
"

# Test 7: Check search server connectivity
echo "📋 Test 7: Checking search server connectivity..."
if curl -s http://localhost:8000/api/v1/health > /dev/null; then
    echo "✅ Search server is running and accessible"
else
    echo "⚠️  Search server not accessible (make sure it's running on port 8000)"
fi

echo ""
echo "🎉 PerpsTrader AI Trading System test completed!"
echo ""
echo "📝 Next steps:"
echo "1. Run ./scripts/install.sh to install systemd services"
echo "2. Configure your Hyperliquid API keys in config/hyperliquid.keys"
echo "3. Start with: ./scripts/perps-control start"
echo "4. Access dashboard at: http://localhost:3000"
echo ""
echo "⚠️  Remember to start with testnet=true for initial testing!"