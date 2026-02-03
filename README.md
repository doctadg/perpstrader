# PerpsTrader AI - Automated Hyperliquid Trading Agent

🤖 A sophisticated AI-powered trading system for Hyperliquid DEX that combines research, technical analysis, strategy development, and automated execution.

## 🚀 Features

### Core Capabilities
- **AI-Powered Research**: Continuously researches trading strategies using your existing search server
- **Technical Analysis**: Advanced technical indicators and pattern recognition
- **Strategy Generation**: Automatically brainstorms and backtests trading strategies
- **Risk Management**: Comprehensive position sizing and risk controls
- **Real-time Execution**: Automated trade execution on Hyperliquid
- **Learning System**: Adapts and optimizes strategies based on performance
- **24/7 Monitoring**: Web dashboard for real-time monitoring

### Strategy Types
- Market Making (Grid Trading, Inventory Balanced)
- Trend Following (MA Crossover, MACD Momentum)
- Mean Reversion (Bollinger Bands, RSI Extreme)
- Arbitrage (Triangular Arbitrage)
- AI Prediction (Sentiment-Based)

## 📋 System Requirements

- Node.js 18+
- Linux system with systemd
- 2GB+ RAM
- 10GB+ disk space
- Stable internet connection

## 🛠️ Installation

### Quick Install
```bash
# Clone the repository
git clone <repository-url>
cd PerpsTrader

# Run the installation script
./scripts/install.sh
```

### Manual Install
```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Create configuration
mkdir -p config data logs
cp systemd/*.service /etc/systemd/system/
systemctl daemon-reload
```

## ⚙️ Configuration

### 1. Hyperliquid API Keys
Edit `/home/d/PerpsTrader/config/hyperliquid.keys`:
```bash
HYPERLIQUID_API_KEY=your_api_key_here
HYPERLIQUID_API_SECRET=your_api_secret_here
HYPERLIQUID_TESTNET=true  # Start with testnet!
```

### 2. Main Configuration
Edit `/home/d/PerpsTrader/config/config.json`:
```json
{
  "risk": {
    "maxPositionSize": 0.1,    // 10% of portfolio per position
    "maxDailyLoss": 0.05,       // 5% max daily loss
    "maxLeverage": 5,           // Maximum 5x leverage
    "emergencyStop": false
  },
  "trading": {
    "symbols": ["BTC", "ETH"],    // Trading pairs
    "timeframes": ["1m", "5m", "15m", "1h"],
    "strategies": ["market_making", "trend_following"]
  }
}
```

## 🎮 Usage

### Control Script
```bash
# Show all service status
./scripts/perps-control status

# Start all services
./scripts/perps-control start

# Start specific service
./scripts/perps-control start perps-agent

# Stop all services
./scripts/perps-control stop

# View logs
./scripts/perps-control logs perps-agent

# Emergency stop all trading
./scripts/perps-control emergency

# Update system
./scripts/perps-control update
```

### Systemd Commands
```bash
# Enable services on boot
sudo systemctl enable perps-agent perps-dashboard

# Start services
sudo systemctl start perps-agent perps-dashboard

# Check status
systemctl status perps-*

# View logs
journalctl -u perps-agent -f
```

## 🌐 Dashboard

Access the web dashboard at: `http://0.0.0.0:3001`

This will be accessible across your entire local network (not just localhost). You can access it from any device on your network using your server's IP address.

### Dashboard Features
- Real-time system status
- Active strategies monitoring
- Recent trades history
- Performance metrics
- AI insights and recommendations
- Risk metrics

## 📊 Services

### perps-agent
Main AI trading agent that orchestrates all components:
- Research cycles (every 30 minutes)
- Trading cycles (every 1 minute)
- Learning cycles (every 24 hours)

### perps-research
Dedicated research engine that:
- Analyzes market conditions
- Monitors trading signals
- Feeds insights to the main agent

### perps-execution
Trading execution engine that:
- Connects to Hyperliquid API
- Executes trades with risk management
- Monitors positions and portfolio

### perps-dashboard
Web interface for:
- Real-time monitoring
- Historical performance
- System configuration
- Manual controls

## 🔒 Security

### API Key Security
- API keys are stored in `config/hyperliquid.keys` with 600 permissions
- Never commit API keys to version control
- Use testnet initially for testing
- Consider using IP whitelisting if available

### System Security
- Services run as non-root user
- Systemd security hardening enabled
- Database and logs isolated
- Network access restricted as needed

## 📈 Risk Management

### Built-in Protections
- Maximum position size limits
- Daily loss limits
- Leverage caps
- Emergency stop functionality
- Portfolio concentration limits
- Real-time risk scoring

### Risk Metrics
- Position risk assessment
- Portfolio risk analysis
- Daily P&L tracking
- Drawdown monitoring
- Win rate analysis

## 🧠 AI Features

### Research Integration
- Uses your existing search server at `localhost:8000`
- Researches trading strategies continuously
- Analyzes market sentiment
- Monitors arbitrage opportunities

### Strategy Generation
- Brainstorms new strategies based on research
- Backtests against historical data
- Optimizes parameters automatically
- Activates only profitable strategies

### Learning System
- Analyzes strategy performance
- Identifies underperforming strategies
- Optimizes parameters
- Adapts to market conditions

## 📝 Logging

### Log Locations
- Application logs: `logs/combined.log`
- Error logs: `logs/error.log`
- System logs: `journalctl -u perps-*`

### Log Levels
- `debug`: Detailed debugging info
- `info`: General information
- `warn`: Warning messages
- `error`: Error messages only

## 🔄 Updates

### Automatic Updates
```bash
# Update to latest version
./scripts/perps-control update
```

### Manual Updates
```bash
# Pull latest changes
git pull origin main

# Rebuild
npm run build

# Restart services
./scripts/perps-control restart
```

## 🛠️ Development

### Project Structure
```
PerpsTrader/
├── src/                    # TypeScript source code
│   ├── agent-core/         # Main AI agent
│   ├── research-engine/     # Research integration
│   ├── ta-module/         # Technical analysis
│   ├── strategy-engine/    # Strategy development
│   ├── execution-engine/   # Hyperliquid integration
│   ├── data-manager/      # Database operations
│   ├── risk-manager/      # Risk management
│   └── shared/           # Shared utilities
├── bin/                   # Compiled JavaScript executables
├── dashboard/             # Web interface
├── systemd/              # Service files
├── scripts/              # Control scripts
├── config/               # Configuration files
├── data/                 # Database storage
└── logs/                 # Log files
```

### Building
```bash
# Development build with watch
npm run dev

# Production build
npm run build

# Run tests
npm test

# Lint code
npm run lint
```

## 🚨 Troubleshooting

### Common Issues

#### Services Won't Start
```bash
# Check service status
systemctl status perps-*

# View logs for errors
journalctl -u perps-agent -n 50

# Check configuration
node bin/agent.js --dry-run
```

#### API Connection Issues
```bash
# Verify search server is running
curl http://localhost:8000/api/v1/health

# Test Hyperliquid credentials
node bin/execution.js --test-credentials
```

#### Database Issues
```bash
# Check database permissions
ls -la data/trading.db

# Rebuild database
rm data/trading.db
./scripts/perps-control restart
```

### Performance Issues

#### High Memory Usage
- Reduce number of active strategies
- Increase cleanup intervals
- Monitor with `htop`

#### High CPU Usage
- Check for infinite loops in logs
- Reduce research frequency
- Optimize strategy parameters

## 📞 Support

### Getting Help
1. Check logs: `journalctl -u perps-* -f`
2. Review configuration files
3. Check system resources
4. Review this README

### Emergency Procedures
```bash
# Immediate stop of all trading
./scripts/perps-control emergency

# Disable all services
sudo systemctl disable perps-*

# Remove from system
sudo systemctl stop perps-*
sudo rm /etc/systemd/system/perps-*.service
sudo systemctl daemon-reload
```

## 📄 License

MIT License - see LICENSE file for details.

## ⚠️ Disclaimer

**IMPORTANT**: This is an experimental trading system. Trading cryptocurrencies involves substantial risk of loss. Use at your own risk. Always start with testnet and small amounts. The developers are not responsible for any financial losses.

### Best Practices
1. **ALWAYS** start with testnet
2. Use small position sizes initially
3. Monitor closely for first few days
4. Have emergency procedures ready
5. Keep regular backups
6. Never risk more than you can afford to lose

---

**Happy Trading! 🚀**
