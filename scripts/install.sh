#!/bin/bash

# PerpsTrader Installation Script

set -e

echo "🚀 Installing PerpsTrader AI Trading System..."

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    echo "❌ Please don't run this script as root"
    exit 1
fi

# Install Node.js dependencies
echo "📦 Installing Node.js dependencies..."
npm install

# Build TypeScript
echo "🔨 Building TypeScript..."
npm run build

# Create necessary directories
echo "📁 Creating directories..."
mkdir -p /home/d/PerpsTrader/{config,data,logs}

# Create configuration file
echo "⚙️ Creating configuration..."
cat > /home/d/PerpsTrader/config/config.json << EOF
{
  "app": {
    "name": "PerpsTrader AI",
    "version": "1.0.0",
    "environment": "production",
    "logLevel": "info"
  },
  "hyperliquid": {
    "privateKey": "",
    "mainAddress": "",
    "testnet": true,
    "baseUrl": "https://api.hyperliquid.xyz"
  },
  "searchApi": {
    "baseUrl": "http://localhost:8000/api/v1",
    "timeout": 30000
  },
  "database": {
    "type": "sqlite",
    "connection": "/home/d/PerpsTrader/data/trading.db"
  },
  "risk": {
    "maxPositionSize": 0.1,
    "maxDailyLoss": 0.05,
    "maxLeverage": 5,
    "emergencyStop": false
  },
  "trading": {
    "symbols": ["BTC", "ETH"],
    "timeframes": ["1m", "5m", "15m", "1h"],
    "strategies": ["market_making", "trend_following"]
  }
}
EOF

# Create Hyperliquid keys file template
echo "🔑 Creating Hyperliquid keys template..."
cat > /home/d/PerpsTrader/config/hyperliquid.keys << EOF
# Hyperliquid Credentials
# IMPORTANT: Keep this file secure and never commit to version control
HYPERLIQUID_PRIVATE_KEY=your_private_key_here
HYPERLIQUID_MAIN_ADDRESS=your_main_wallet_address_here
HYPERLIQUID_TESTNET=true
EOF

# Set permissions
echo "🔒 Setting permissions..."
chmod 600 /home/d/PerpsTrader/config/hyperliquid.keys
chmod 755 /home/d/PerpsTrader/bin/*.js

# Install systemd services
echo "🔧 Installing systemd services..."
sudo cp /home/d/PerpsTrader/systemd/*.service /etc/systemd/system/
sudo systemctl daemon-reload

echo "✅ Installation completed!"
echo ""
echo "📝 Next steps:"
echo "1. Edit /home/d/PerpsTrader/config/hyperliquid.keys with your API credentials"
echo "2. Edit /home/d/PerpsTrader/config/config.json to customize settings"
echo "3. Start services with: sudo systemctl start perps-agent perps-dashboard"
echo "4. Enable services on boot: sudo systemctl enable perps-agent perps-dashboard"
echo "5. Check status: systemctl status perps-*"
echo "6. View logs: journalctl -u perps-agent -f"
echo ""
echo "🌐 Dashboard will be available at: http://localhost:3001"
echo ""
echo "⚠️  IMPORTANT: Start with testnet=true until you're confident in the system!"
