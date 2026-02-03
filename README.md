# PerpsTrader - AI News Intelligence & Prediction Markets

An AI-powered news analysis and prediction market system that continuously monitors 12 news categories, performs sentiment analysis with embeddings, and makes automated predictions on real-world events.

## 🚀 Features

- **News Agent**: Monitors 12 categories (crypto, stocks, economics, geopolitics, sports, etc.)
- **Sentiment Analysis**: AI-powered sentiment detection with embeddings
- **Prediction Markets**: Automated paper trading on prediction markets
- **Perps Trading**: Hyperliquid DEX integration for perpetual trading
- **Real-time Dashboard**: Web dashboard at http://localhost:3001

## 🏗️ Architecture

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────────┐
│   News Agent    │────▶│  Embeddings  │────▶│  Vector Store   │
│  (12 categories)│     └──────────────┘     └─────────────────┘
└─────────────────┘              │                     │
         │                       ▼                     ▼
         │              ┌──────────────┐     ┌─────────────────┐
         └─────────────▶│ Sentiment AI │────▶│ Prediction Agent│
                        └──────────────┘     └─────────────────┘
                                                       │
                                                       ▼
┌─────────────────┐     ┌──────────────┐     ┌─────────────────┐
│   Dashboard     │◀────│  Risk Mgr    │◀────│  Trade Engine   │
│  (Web UI)       │     └──────────────┘     │  (Hyperliquid)  │
└─────────────────┘                          └─────────────────┘
```

## 📦 Quick Start

### Prerequisites
- Node.js 18+
- SQLite3
- API keys for GLM/OpenRouter

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/doctadg/perpstrader.git
cd perpstrader

# 2. Install dependencies
npm install

# 3. Set up databases
bash database/setup.sh

# 4. Configure environment
cp .env.example .env
# Edit .env with your API keys

# 5. Start the system
./scripts/perps-control start
```

### Access the Dashboard
- Local: http://localhost:3001
- Network: http://YOUR_IP:3001

## 🗄️ Database Setup

Fresh databases are created via:
```bash
bash database/setup.sh
```

This creates:
- `data/news.db` - News articles & embeddings
- `data/predictions.db` - Prediction market positions
- `data/trading.db` - Trading signals & positions

**Note**: Database files are excluded from git. Each user gets a fresh database on setup.

## 🔧 Configuration

Edit `.env` with your API keys:
```
# Required
GLM_API_KEY=your_key_here
HYPERLIQUID_PRIVATE_KEY=your_key_here

# Optional
OPENROUTER_API_KEY=your_key_here
```

## 🎮 Service Control

```bash
# Check status
./scripts/perps-control status

# Start all services
./scripts/perps-control start

# Stop all services
./scripts/perps-control stop

# Restart specific service
./scripts/perps-control restart news-agent
```

## 📊 System Components

| Service | Description | Port |
|---------|-------------|------|
| perps-agent | Main AI trading agent | - |
| perps-research | Technical analysis & signals | - |
| perps-execution | Trade execution engine | - |
| perps-dashboard | Web dashboard | 3001 |
| news-agent | News scraping & analysis | - |
| prediction-agent | Prediction market trading | - |

## 🧪 Development

```bash
# Run in development mode
npm run dev

# Build TypeScript
npm run build

# Run tests
npm test
```

## 🔐 Security

- Private keys stored in `.env` (never commit)
- Paper trading mode available for testing
- Risk management built-in

## 📝 License

MIT License - See LICENSE file

## 🤝 Contributing

Pull requests welcome! Please ensure:
1. No database files in commits
2. Update schema files for DB changes
3. Add tests for new features

---

Built with ❤️ by Vex for the Colosseum Agent Hackathon
