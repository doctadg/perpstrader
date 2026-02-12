# PerpsTrader System Documentation

> **Version:** 2.0.0  
> **Last Updated:** February 2026  
> **Repository:** `perpstrader/`

---

## 1. System Overview

### What is PerpsTrader?

PerpsTrader is an autonomous AI-powered trading and intelligence platform that combines:

- **Perpetual Futures Trading** on Hyperliquid DEX (live trading with 40x leverage)
- **News Intelligence** - 24/7 monitoring of 12 news categories with AI analysis
- **Prediction Markets** - Paper trading on Polymarket with automated position management
- **Real-time Dashboard** - Web interface for monitoring P&L, positions, and system health

### Key Capabilities

| Feature | Description |
|---------|-------------|
| AI Trading Agent | LangGraph-based autonomous trading with strategy generation, backtesting, and execution |
| News Analysis | 12-category news monitoring with sentiment analysis, embeddings, and story clustering |
| Market Making | Automated market data ingestion via WebSocket from Hyperliquid |
| Risk Management | Position sizing, stop-losses, trailing stops, circuit breakers, daily loss limits |
| Prediction Trading | Automated paper trading on Polymarket with theory generation and risk gates |

---

## 2. Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PerpsTrader System                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────────────┐ │
│  │  LangGraph      │    │  News Agent     │    │  Prediction Markets     │ │
│  │  Trading Agent  │    │  (12 Categories)│    │  (Polymarket)           │ │
│  │                 │    │                 │    │                         │ │
│  │ • Strategy Gen  │    │ • Search/Scrape │    │ • Market Discovery      │ │
│  │ • Backtesting   │    │ • Categorize    │    │ • Theory Generation     │ │
│  │ • Risk Gate     │    │ • Clustering    │    │ • Position Management   │ │
│  │ • Execution     │    │ • Embeddings    │    │ • Stop Loss Monitoring  │ │
│  └────────┬────────┘    └────────┬────────┘    └────────────┬────────────┘ │
│           │                      │                         │              │
│           ▼                      ▼                         ▼              │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                      Shared Infrastructure                          │  │
│  │  • SQLite Databases  • Redis Message Bus  • Circuit Breakers       │  │
│  │  • Vector Store      • Logger            • Config Manager          │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                    │                                      │
│                                    ▼                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                      Execution Layer                                │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │  │
│  │  │ Hyperliquid  │  │ Polymarket   │  │ Market Data Ingestion    │  │  │
│  │  │ SDK Client   │  │ API Client   │  │ WebSocket + REST         │  │  │
│  │  └──────────────┘  └──────────────┘  └──────────────────────────┘  │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                    │                                      │
│                                    ▼                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                      Dashboard (Port 3001)                          │  │
│  │  REST API + WebSocket + Static Files                                │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Folder Structure

```
perpstrader/
├── src/                          # TypeScript source code
│   ├── main.ts                   # Main trading agent entry point
│   ├── news-agent.ts             # News agent entry point
│   ├── prediction-agent.ts       # Prediction markets entry point
│   │
│   ├── agent/                    # LangGraph agent implementations
│   ├── backtest/                 # Backtesting engine
│   ├── dashboard/                # Dashboard server and API routes
│   │   ├── dashboard-server.ts   # Main Express server
│   │   ├── enhanced-api-routes.ts
│   │   ├── market-heatmap-routes.ts
│   │   └── funding-arbitrage-routes.ts
│   │
│   ├── data/                     # Data stores and persistence
│   │   ├── news-store.ts         # News article storage
│   │   ├── prediction-store.ts   # Prediction positions/trades
│   │   ├── trace-store.ts        # Trading cycle traces
│   │   └── vector-store.ts       # Pattern embeddings (ChromaDB)
│   │
│   ├── data-manager/             # Trading data management
│   ├── execution-engine/         # Trade execution layer
│   │   ├── execution-engine.ts   # Main execution orchestrator
│   │   ├── hyperliquid-client.ts # Hyperliquid SDK wrapper
│   │   ├── hyperliquid-client-optimized.ts
│   │   └── position-recovery.ts  # Position recovery monitoring
│   │
│   ├── infrastructure/           # System infrastructure
│   │   ├── token-bucket.ts       # Rate limiting
│   │   ├── overfill-protection.ts
│   │   ├── snapshot-service.ts
│   │   └── reconciliation-service.ts
│   │
│   ├── jobs/                     # Background job processors
│   ├── langgraph/                # LangGraph trading pipeline
│   │   ├── graph.ts              # Trading orchestrator
│   │   ├── state.ts              # Agent state types
│   │   └── nodes/                # Individual pipeline nodes
│   │
│   ├── market-ingester/          # Hyperliquid market data
│   │   └── market-ingester.ts    # WebSocket + REST ingestion
│   │
│   ├── news-agent/               # News processing pipeline
│   │   ├── graph.ts              # News orchestrator
│   │   ├── enhanced-story-cluster-node.ts
│   │   ├── anomaly-detector.ts
│   │   └── heat-predictor.ts
│   │
│   ├── news-ingester/            # News ingestion sources
│   ├── prediction-markets/       # Polymarket integration
│   │   ├── graph.ts              # Prediction orchestrator
│   │   ├── polymarket-client.ts
│   │   ├── execution-engine.ts
│   │   ├── risk-manager.ts
│   │   └── position-reconciler.ts
│   │
│   ├── pumpfun-agent/            # Solana pump.fun analysis
│   ├── risk-manager/             # Trading risk management
│   ├── safekeeping-fund/         # Fund recovery system
│   ├── shared/                   # Shared utilities
│   │   ├── types.ts              # Core TypeScript types
│   │   ├── config.ts             # Configuration manager
│   │   ├── logger.ts             # Winston logger
│   │   ├── circuit-breaker.ts    # Circuit breaker implementation
│   │   └── message-bus.ts        # Redis message bus
│   │
│   ├── strategy-engine/          # Strategy generation
│   ├── ta-module/                # Technical analysis
│   └── workers/                  # Background workers
│
├── bin/                          # Compiled JavaScript output
├── dashboard/public/             # Dashboard static files
├── database/                     # Database schemas
│   ├── schema/
│   │   ├── news.sql              # News database schema
│   │   ├── predictions.sql       # Predictions database schema
│   │   └── trading.sql           # Trading database schema
│   └── setup.sh                  # Database initialization script
│
├── config/                       # Configuration files
├── data/                         # SQLite databases (runtime)
├── scripts/                      # Utility scripts
│   ├── perps-control             # Main service control script
│   ├── build.sh
│   ├── setup-enhanced-clustering.sh
│   └── *.ts                      # Analysis and debug scripts
│
├── systemd/                      # SystemD service definitions
├── migrations/                   # Database migrations
└── docs/                         # Documentation
```

### Main Modules

| Module | Purpose | Entry Point |
|--------|---------|-------------|
| `main.ts` | Autonomous trading agent | `bin/main.js` |
| `news-agent.ts` | News monitoring & analysis | `bin/news-agent.js` |
| `prediction-agent.ts` | Prediction market trading | `bin/prediction-agent.js` |
| `dashboard-server.ts` | Web dashboard & API | `bin/dashboard/dashboard-server.js` |
| `market-ingester.ts` | Real-time market data | Initialized by main.ts |

---

## 3. Trading Engine

### Trading Cycle Flow (LangGraph)

The trading engine uses a LangGraph-based pipeline with 8 nodes:

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Trading Cycle Pipeline                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   ┌─────────────┐   ┌─────────────┐   ┌─────────────────────────┐  │
│   │ 1. Market   │──▶│ 2. Pattern  │──▶│ 3. Strategy Ideation    │  │
│   │    Data     │   │   Recall    │   │    (LLM-powered)        │  │
│   │             │   │             │   │                         │  │
│   │ Fetch OHLCV │   │ Vector      │   │ Generate 3 strategies   │  │
│   │ Calculate   │   │ similarity  │   │ based on patterns       │  │
│   │ indicators  │   │ search      │   │ and regime              │  │
│   └─────────────┘   └─────────────┘   └─────────────────────────┘  │
│                                                  │                  │
│                                                  ▼                  │
│   ┌─────────────┐   ┌─────────────┐   ┌─────────────────────────┐  │
│   │ 6. Risk     │──▶│ 5. Strategy │◀──│ 4. Backtester           │  │
│   │    Gate     │   │   Selector  │   │                         │  │
│   │             │   │             │   │ Simulate each strategy  │  │
│   │ Position    │   │ Pick best   │   │ on historical data      │  │
│   │ sizing with │   │ Sharpe ratio│   │ Calculate metrics       │  │
│   │ 40x leverage│   │             │   │                         │  │
│   └──────┬──────┘   └─────────────┘   └─────────────────────────┘  │
│          │                                                          │
│          ▼ (if approved)                                            │
│   ┌─────────────┐   ┌─────────────┐                                │
│   │ 7. Executor │──▶│ 8. Learner  │                                │
│   │             │   │             │                                │
│   │ Submit to   │   │ Store trace │                                │
│   │ Hyperliquid │   │ Update stats│                                │
│   │ Track fill  │   │             │                                │
│   └─────────────┘   └─────────────┘                                │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Order Execution Flow

```typescript
// Execution flow in execution-engine.ts
async executeSignal(signal: TradingSignal, riskAssessment: RiskAssessment): Promise<Trade> {
  // 1. Validate signal
  if (signal.action === 'HOLD') throw new Error('Cannot execute HOLD');
  
  // 2. Check configuration
  if (!hyperliquidClient.isConfigured()) {
    throw new Error('Hyperliquid Client not configured');
  }
  
  // 3. Submit order via Hyperliquid SDK
  const result = await hyperliquidClient.placeOrder({
    symbol: signal.symbol,
    side: signal.action,
    size: riskAssessment.suggestedSize,
    price: signal.price,
    orderType: signal.type.toLowerCase()
  });
  
  // 4. Track and persist trade
  await dataManager.saveTrade(trade);
}
```

### Risk Management

The risk manager (`src/risk-manager/risk-manager.ts`) enforces:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `maxPositionSize` | 10% of portfolio | Max position as % of total value |
| `maxDailyLoss` | 5% of portfolio | Daily loss limit before halting |
| `maxLeverage` | 40x | Maximum leverage per position |
| `trailingStopPct` | 1.5% | Trailing stop from peak PnL |
| `minNotional` | $250 | Minimum position size |

**Position Sizing Formula:**
```
targetMarginPercent = 15% + (confidence - 0.5) * 2 * 20%  // 15-35% based on confidence
targetMargin = availableBalance * targetMarginPercent
targetNotional = targetMargin * 40  // 40x leverage
positionSize = targetNotional / price
```

### Circuit Breakers

Circuit breakers prevent cascading failures:

```typescript
// Usage in any component
import circuitBreaker from './shared/circuit-breaker';

const result = await circuitBreaker.execute(
  'execution',  // breaker name
  async () => {
    // Operation that might fail
    return await riskyOperation();
  },
  async () => {
    // Fallback when breaker is open
    return defaultValue;
  }
);
```

**Available Breakers:**
- `execution` - Trading execution
- `news-execution` - News processing
- `market-data` - Market data fetching
- `pattern-recall` - Vector store queries

---

## 4. News System

### News Categories (12 Total)

```typescript
const ALL_CATEGORIES: NewsCategory[] = [
  'CRYPTO',      // Cryptocurrency news
  'STOCKS',      // Stock market news
  'ECONOMICS',   // Economic indicators, Fed policy
  'GEOPOLITICS', // International conflicts, elections
  'TECH',        // Technology announcements
  'COMMODITIES', // Oil, gold, agriculture
  'SPORTS',      // General sports
  'FOOTBALL',    // Soccer
  'BASKETBALL',  // NBA
  'TENNIS',      // Tennis tournaments
  'MMA',         // UFC and MMA
  'GOLF'         // Golf tournaments
];
```

### News Pipeline (9 Steps)

```
┌─────────────────────────────────────────────────────────────────────┐
│                      News Processing Pipeline                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. SEARCH        → Query Brave Search API for each category       │
│  2. SCRAPE        → Fetch article content with language filter     │
│  3. QUALITY       → LLM-based quality validation                   │
│  4. CATEGORIZE    → Classify using gpt-oss-20b                     │
│  5. TOPIC GEN     → Extract entities and generate topics           │
│  6. REDUNDANCY    → Remove near-duplicate articles                 │
│  7. STORE         → Persist to SQLite + embeddings                 │
│  8. CLUSTER       → Group related stories (standard or enhanced)   │
│  9. CLEANUP       → Update statistics and prune old data           │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Enhanced Clustering Features

When `USE_ENHANCED_CLUSTERING=true`:

| Feature | Description | Environment Variable |
|---------|-------------|---------------------|
| Entity Extraction | Extract people, organizations, locations | `ENABLE_ENTITY_EXTRACTION` |
| Anomaly Detection | Detect unusual news patterns | `ENABLE_ANOMALY_DETECTION` |
| Heat Prediction | Predict story momentum | `ENABLE_HEAT_PREDICTION` |
| Cross-Category Linking | Link stories across categories | `ENABLE_CROSS_CATEGORY_LINKING` |
| User Personalization | Personalize based on interests | `ENABLE_USER_PERSONALIZATION` |

### News Database Schema (news.db)

```sql
-- Core tables
articles              # News articles with metadata
article_embeddings    # Vector embeddings for semantic search
market_links          # Links to prediction markets
```

---

## 5. Prediction Markets

### Polymarket Integration

The prediction markets module trades on Polymarket (paper trading):

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Prediction Market Pipeline                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. MARKET DATA    → Fetch active markets from Polymarket API      │
│  2. NEWS CONTEXT   → Link relevant news to markets                 │
│  3. THEORIZER      → Generate prediction theories using LLM        │
│  4. BACKTEST       → Simulate strategies on historical prices      │
│  5. IDEA SELECTOR  → Pick best opportunity by edge/confidence      │
│  6. RISK GATE      → Validate position size and concentration      │
│  7. EXECUTOR       → Execute paper trade (simulated)               │
│  8. LEARNER        → Update performance tracking                   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Position Management

- **Stop Loss Monitoring**: Every 30 seconds
- **Position Reconciliation**: Every 5 minutes
- **Emergency Stop**: Immediate halt of all trading
- **Portfolio Tracking**: Realized/unrealized PnL calculation

### Polymarket Client

```typescript
// Fetch active markets
const markets = await polymarketClient.fetchMarkets(100);

// Get price history for a token
const candles = await polymarketClient.fetchCandles(tokenId);
```

---

## 6. Market Data

### Hyperliquid Integration

The market ingester connects to Hyperliquid via:

1. **WebSocket** - Real-time L2 order book, trades, funding rates
2. **REST API** - Candle snapshots, metadata

### WebSocket Subscriptions

```typescript
// Subscribed channels per symbol
{ type: 'allMids' }           // All mid prices
{ type: 'l2Book', coin }      // Level 2 order book
{ type: 'trades', coin }      // Trade stream
{ type: 'funding', coin }     // Funding rate updates
```

### Candle Building

Trade-based 1-second candles are built from WebSocket trade feed:

```typescript
interface TradeCandle {
  symbol: string;
  bucketStartMs: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  notional: number;
}
```

### Symbol Categories

Symbols are auto-categorized on ingestion:

| Category | Examples |
|----------|----------|
| Layer 1 | BTC, ETH |
| Layer 2 | ARB, OP, BASE, MNT |
| DeFi | UNI, AAVE, CRV, PENDLE |
| Meme | DOGE, SHIB, PEPE, BONK, WIF |
| AI | RENDER, TAO, FET, WLD |
| Solana | SOL, JTO, JUP, RAY |
| Gaming | AXS, SAND, MANA, GALA |
| RWA | ONDO, CFG |
| Infrastructure | LINK, GRT, PYTH |

---

## 7. Database Schema

### Three Main Databases

| Database | File | Purpose |
|----------|------|---------|
| news.db | `data/news.db` | News articles, embeddings, clusters |
| predictions.db | `data/predictions.db` | Prediction markets, positions, trades |
| trading.db | `data/trading.db` | Trading signals, positions, backtests |

### Trading Database Schema (trading.db)

```sql
-- Core Tables
strategies           # Trading strategy definitions
signals              # Generated trading signals
positions            # Current and historical positions
trades               # Executed trades
ai_insights          # LLM-generated insights
market_data          # OHLCV candle data
backtests            # Strategy backtest results
```

### Predictions Database Schema (predictions.db)

```sql
-- Core Tables
markets              # Polymarket market definitions
market_snapshots     # Price history snapshots
positions            # Open/closed prediction positions
trades               # Prediction market trades
portfolio_snapshots  # Portfolio value over time
ideas                # AI-generated prediction theories
```

### Key Relationships

```
strategies ──┬──▶ signals ──┬──▶ trades
             │              │
             └──▶ backtests │
                            │
positions ◀─────────────────┘
```

---

## 8. API Endpoints

### Dashboard API Routes

Base URL: `http://localhost:3001`

#### Health & Status

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | System health status |
| `/api/status` | GET | Detailed component status |
| `/api/cycles` | GET | Trading cycle metrics |

#### Trading Data

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/portfolio` | GET | Live portfolio from Hyperliquid |
| `/api/strategies` | GET | Active strategies |
| `/api/signals` | GET | Recent trading signals |
| `/api/positions` | GET | Current positions |
| `/api/trades` | GET | Trade history |
| `/api/backtests` | GET | Backtest results |

#### System Control

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/emergency-stop` | POST | Emergency stop all trading |
| `/api/circuit-breakers` | GET | Circuit breaker status |
| `/api/circuit-breakers/:name/reset` | POST | Reset circuit breaker |
| `/api/position-recovery` | GET | Position recovery stats |

#### News & Predictions

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/news` | GET | Recent news articles |
| `/api/news/clusters` | GET | Story clusters |
| `/api/predictions/markets` | GET | Active prediction markets |
| `/api/predictions/portfolio` | GET | Prediction portfolio |
| `/api/predictions/positions` | GET | Open prediction positions |

#### Enhanced Clustering (when enabled)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/enhanced/news/anomalies` | GET | Detected anomalies |
| `/api/enhanced/news/predictions` | GET | Heat predictions |
| `/api/enhanced/news/entities/trending` | GET | Trending entities |
| `/api/enhanced/news/quality-metrics` | GET | News quality stats |

#### Heatmap & Arbitrage

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/heatmap/markets` | GET | Market heatmap data |
| `/api/heatmap/bubbles` | GET | Bubble chart data |
| `/api/funding/opportunities` | GET | Funding arbitrage opportunities |
| `/api/funding/history` | GET | Historical funding rates |

---

## 9. Configuration

### Environment Variables (.env)

```bash
# ============================================
# REQUIRED: GLM API (for AI analysis)
# ============================================
GLM_API_KEY=your_glm_api_key_here
GLM_BASE_URL=https://api.glm.ai/v1
GLM_MODEL=glm-4

# ============================================
# REQUIRED: Hyperliquid (for perp trading)
# ============================================
HYPERLIQUID_PRIVATE_KEY=0x...
HYPERLIQUID_TESTNET=false
HYPERLIQUID_BASE_URL=https://api.hyperliquid.xyz

# ============================================
# OPTIONAL: OpenRouter (for embeddings/classification)
# ============================================
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_LABELING_MODEL=google/gemini-flash-1.5
OPENROUTER_EMBEDDING_MODEL=text-embedding-3-small

# ============================================
# OPTIONAL: Redis (for message bus)
# ============================================
REDIS_URL=redis://localhost:6379

# ============================================
# NEWS AGENT CONFIGURATION
# ============================================
NEWS_CYCLE_INTERVAL_MS=60000
NEWS_QUERIES_PER_CATEGORY=3
NEWS_ROTATION_MODE=true  # Rotate through categories

# ============================================
# ENHANCED CLUSTERING (optional features)
# ============================================
USE_ENHANCED_CLUSTERING=true
ENABLE_ENTITY_EXTRACTION=true
ENABLE_ANOMALY_DETECTION=true
ENABLE_HEAT_PREDICTION=true
ENABLE_CROSS_CATEGORY_LINKING=true

# ============================================
# APP CONFIGURATION
# ============================================
NODE_ENV=production
LOG_LEVEL=info
DASHBOARD_PORT=3001
```

### Configuration File (config/config.json)

Runtime configuration merged with environment variables:

```json
{
  "app": { "name": "PerpsTrader AI", "version": "1.0.0" },
  "trading": {
    "symbols": ["BTC", "ETH", "SOL", ...],
    "timeframes": ["1s", "1m", "5m", "15m", "1h"],
    "strategies": ["market_making", "trend_following"]
  },
  "risk": {
    "maxPositionSize": 0.1,
    "maxDailyLoss": 0.05,
    "maxLeverage": 40,
    "emergencyStop": false
  }
}
```

---

## 10. Deployment

### Service Control

```bash
# Check all service status
./scripts/perps-control status

# Start all services
./scripts/perps-control start

# Stop all services
./scripts/perps-control stop

# Restart specific service
./scripts/perps-control restart perps-dashboard

# Show enhanced clustering status
./scripts/perps-control enhanced

# Emergency stop
./scripts/perps-control emergency

# View logs
./scripts/perps-control logs perps-agent
```

### PM2 Setup (Alternative to SystemD)

```bash
# Install PM2
npm install -g pm2

# Start services with PM2
pm2 start ecosystem.config.js

# Or start individually
pm2 start bin/main.js --name perps-agent
pm2 start bin/news-agent.js --name news-agent
pm2 start bin/prediction-agent.js --name prediction-agent
pm2 start bin/dashboard/dashboard-server.js --name dashboard

# Save PM2 config
pm2 save
pm2 startup
```

### SystemD Services

Services defined in `systemd/`:

| Service | Description | Auto-start |
|---------|-------------|------------|
| `perps-agent` | Main trading agent | Yes |
| `perps-dashboard` | Web dashboard | Yes |
| `perps-news` | News agent | Optional |
| `perps-predictions` | Prediction markets | Optional |

```bash
# Enable services
sudo systemctl enable perps-agent perps-dashboard

# Start services
sudo systemctl start perps-agent perps-dashboard

# View logs
sudo journalctl -u perps-agent -f
```

### Cron Jobs

```bash
# Daily database cleanup (3 AM)
0 3 * * * /path/to/perpstrader/scripts/cleanup.sh

# Hourly trace analysis
0 * * * * /path/to/perpstrader/scripts/trace-analysis.sh

# Daily backup (2 AM)
0 2 * * * /path/to/perpstrader/scripts/backup.sh
```

## 11. Setup & Dependencies

### System Requirements

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js | 20.x or 22.x | LTS recommended |
| npm | 10.x+ | Comes with Node.js |
| SQLite | 3.x | For database (bundled with better-sqlite3) |
| Redis | 7.x+ | Optional, for message bus |
| PM2 | 5.x+ | Optional, for process management |
| Git | 2.x+ | For cloning |

### Step-by-Step Installation

#### 1. Install System Dependencies

**Ubuntu/Debian:**
```bash
# Update package list
sudo apt update

# Install Node.js 22.x
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# Install build tools (for native modules)
sudo apt install -y build-essential python3 make g++

# Install Redis (optional)
sudo apt install -y redis-server
sudo systemctl enable redis-server
sudo systemctl start redis-server

# Install PM2 globally (optional)
sudo npm install -g pm2
```

**macOS:**
```bash
# Install Homebrew if not present
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Node.js
brew install node@22

# Install Redis (optional)
brew install redis
brew services start redis

# Install PM2 globally (optional)
npm install -g pm2
```

#### 2. Clone & Setup Repository

```bash
# Clone repository
git clone https://github.com/yourusername/perpstrader.git
cd perpstrader

# Install Node.js dependencies
npm install

# The following native modules will be built:
# - better-sqlite3 (SQLite database)
# - bcrypt (password hashing - if used)
# - Other native dependencies
```

#### 3. Install Python Dependencies (for SearXNG search)

```bash
# Create Python virtual environment
python3 -m venv ./searxng/venv

# Activate virtual environment
source ./searxng/venv/bin/activate

# Install SearXNG
git clone https://github.com/searxng/searxng.git ./searxng/app
cd ./searxng/app
pip install -e .

# Copy default settings
cp searx/settings.yml ./searxng/settings.yml
```

#### 4. Configure Environment Variables

```bash
# Copy example environment file
cp .env.example .env

# Edit .env with your settings
nano .env
```

### Required API Keys

The following API keys are required for full functionality. You can obtain them from the respective services.

#### 1. Hyperliquid (Required for Trading)

**What it's for:** Executing trades on Hyperliquid DEX

**How to obtain:**
1. Visit https://app.hyperliquid.xyz
2. Connect your wallet (MetaMask, WalletConnect, etc.)
3. Deposit USDC to your trading account
4. Export your wallet's private key (keep this secure!)
5. Copy your wallet address

**Environment variables:**
```bash
HYPERLIQUID_PRIVATE_KEY=your_wallet_private_key_here
HYPERLIQUID_ADDRESS=your_wallet_address_here
HYPERLIQUID_TESTNET=false  # Set to true for testnet
```

**Security note:** Never share your private key. Store it in `.env` only.

#### 2. OpenRouter (Required for AI Analysis)

**What it's for:** Accessing LLMs for news analysis, strategy generation, and predictions

**How to obtain:**
1. Visit https://openrouter.ai
2. Create an account
3. Go to Settings → API Keys
4. Generate a new API key
5. Copy the key (starts with `sk-or-...`)

**Environment variables:**
```bash
OPENROUTER_API_KEY=sk-or-your-key-here
```

**Models used:**
- `google/gemini-2.0-flash-001` - Fast news analysis
- `anthropic/claude-3.5-sonnet` - Strategy generation
- `meta-llama/llama-3.3-70b-instruct` - Predictions

#### 3. GLM API (Alternative to OpenRouter)

**What it's for:** Chinese LLM for strategy generation (optional alternative)

**How to obtain:**
1. Visit https://open.bigmodel.cn
2. Create an account
3. Go to API Keys section
4. Generate and copy your API key

**Environment variables:**
```bash
GLM_API_KEY=your_glm_api_key_here
```

#### 4. ChromaDB (Optional - for Vector Store)

**What it's for:** Storing pattern embeddings for similarity search

**How to obtain:** Self-hosted or cloud instance

**Environment variables:**
```bash
CHROMADB_URL=http://localhost:8000  # Or your ChromaDB instance
```

**Setup:**
```bash
# Install ChromaDB
pip install chromadb

# Start ChromaDB server
chroma run --path ./chroma_data
```

#### 5. Telegram Bot (Optional - for Alerts)

**What it's for:** Sending trading alerts and status updates to your phone

**How to obtain:**
1. Message @BotFather on Telegram
2. Create a new bot with `/newbot`
3. Follow prompts to name your bot
4. Copy the bot token (format: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)
5. Message your bot to get your chat ID

**Environment variables:**
```bash
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_CHAT_ID=your_telegram_user_id
```

**Getting your chat ID:**
```bash
# Message @userinfobot on Telegram
# It will reply with your user ID
```

#### 6. Twitter/X API (Optional - for Social Signals)

**What it's for:** Monitoring Twitter for market sentiment

**How to obtain:**
1. Visit https://developer.twitter.com
2. Apply for Developer Account
3. Create a new app/project
4. Generate API Key and Secret
5. Generate Access Token and Secret

**Environment variables:**
```bash
TWITTER_API_KEY=your_api_key
TWITTER_API_SECRET=your_api_secret
TWITTER_ACCESS_TOKEN=your_access_token
TWITTER_ACCESS_SECRET=your_access_secret
```

#### 7. Discord Webhook (Optional - for Alerts)

**What it's for:** Sending alerts to Discord channels

**How to obtain:**
1. In Discord, go to Server Settings → Integrations → Webhooks
2. Create a new webhook
3. Copy the webhook URL

**Environment variables:**
```bash
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
```

### Complete Environment File Example

Create `.env` file in the project root:

```bash
# ============================================
# REQUIRED: Trading
# ============================================
HYPERLIQUID_PRIVATE_KEY=0x1234567890abcdef...
HYPERLIQUID_ADDRESS=0x1234567890abcdef...
HYPERLIQUID_TESTNET=false

# ============================================
# REQUIRED: AI/LLM (Choose OpenRouter OR GLM)
# ============================================
# Option 1: OpenRouter (Recommended)
OPENROUTER_API_KEY=sk-or-v1-1234567890abcdef...

# Option 2: GLM (Alternative)
# GLM_API_KEY=your_glm_key_here

# ============================================
# OPTIONAL: Notifications
# ============================================
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjkl...
TELEGRAM_CHAT_ID=123456789

DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...

# ============================================
# OPTIONAL: External Services
# ============================================
CHROMADB_URL=http://localhost:8000
REDIS_URL=redis://localhost:6379
SEARXNG_URL=http://localhost:8080

# ============================================
# OPTIONAL: Social Signals
# ============================================
TWITTER_API_KEY=your_twitter_api_key
TWITTER_API_SECRET=your_twitter_api_secret
TWITTER_ACCESS_TOKEN=your_access_token
TWITTER_ACCESS_SECRET=your_access_secret

# ============================================
# System Configuration
# ============================================
DASHBOARD_PORT=3001
NODE_ENV=production
LOG_LEVEL=info

# Database paths
NEWS_DB_PATH=./data/news.db
PREDICTIONS_DB_PATH=./data/predictions.db
TRADING_DB_PATH=./data/trading.db
```

### API Key Security Best Practices

1. **Never commit `.env` to git**
   ```bash
   echo ".env" >> .gitignore
   ```

2. **Use restrictive permissions**
   ```bash
   chmod 600 .env
   ```

3. **Rotate keys regularly**
   - Hyperliquid: Generate new wallet for each deployment
   - OpenRouter: Regenerate keys monthly
   - Telegram: Revoke and recreate bot if compromised

4. **Use environment-specific keys**
   - `.env.development` - Test keys
   - `.env.production` - Production keys (never shared)

5. **Monitor usage**
   - Check OpenRouter dashboard for unexpected usage
   - Monitor Hyperliquid wallet for unauthorized trades

#### 5. Set Up Databases

```bash
# Create data directory
mkdir -p data

# Databases are created automatically on first run
# Or manually initialize:
node -e "
const Database = require('better-sqlite3');
const db = new Database('./data/trading.db');
console.log('Trading database ready');
db.close();
"
```

#### 6. Build TypeScript

```bash
# Compile TypeScript to JavaScript
npm run build

# This creates the bin/ directory with compiled output
```

#### 7. Start Services

**Option A: Using the control script (recommended)**
```bash
# Start all services
./scripts/perps-control start

# Check status
./scripts/perps-control status

# View logs
./scripts/perps-control logs
```

**Option B: Using PM2**
```bash
# Start with PM2
pm2 start ecosystem.config.js

# Save PM2 config
pm2 save
pm2 startup
```

**Option C: Manual start**
```bash
# Terminal 1: Dashboard
npm run dashboard

# Terminal 2: Trading Agent
npm run agent

# Terminal 3: News Agent (optional)
npm run news

# Terminal 4: Predictions (optional)
npm run predictions
```

#### 8. Start SearXNG (for news search)

```bash
cd ./searxng
source venv/bin/activate
export SEARXNG_SETTINGS_PATH=./searxng/settings.yml
python -m searx.webapp

# Or use the startup script
bash ./searxng/start.sh
```

#### 9. Access Dashboard

```bash
# Open in browser
open http://localhost:3001

# Or via Cloudflare Tunnel (if configured)
open https://perps.venym.io
```

### Dependency List

**Core Dependencies (package.json):**
```json
{
  "dependencies": {
    "axios": "^1.6.0",
    "better-sqlite3": "^9.4.0",
    "dotenv": "^16.3.0",
    "express": "^4.18.0",
    "ioredis": "^5.3.0",
    "langchain": "^0.1.0",
    "@langchain/core": "^0.1.0",
    "@langchain/glm": "^0.1.0",
    "socket.io": "^4.7.0",
    "uuid": "^9.0.0",
    "ws": "^8.14.0",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.3.0"
  }
}
```

**Install all dependencies:**
```bash
npm install
```

### Troubleshooting Setup Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| `better-sqlite3` build fails | Missing build tools | `sudo apt install build-essential python3` |
| `node-gyp` errors | Python not found | `sudo apt install python3` and `npm config set python python3` |
| Permission denied | npm global permissions | Use `npx` or fix npm permissions |
| Redis connection fails | Redis not running | `redis-server` or `sudo systemctl start redis` |
| Port 3001 in use | Another service using port | Kill process or change DASHBOARD_PORT |
| TypeScript build errors | Missing types | `npm install` or `npm run build:clean` |

### First-Time Setup Quick Checklist

```bash
# 1. Verify Node.js version (should be 20.x or 22.x)
node -v

# 2. Verify npm
npm -v

# 3. Clone repo
git clone https://github.com/doctadg/perpstrader.git && cd perpstrader

# 4. Install deps
npm install

# 5. Copy env
cp .env.example .env
# -> Edit .env with your API keys

# 6. Build
npm run build

# 7. Start
./scripts/perps-control start

# 8. Check
open http://localhost:3001
```

---

## Appendix A: Key Files Reference

| File | Purpose |
|------|---------|
| `src/main.ts` | Main trading agent entry |
| `src/langgraph/graph.ts` | Trading pipeline orchestrator |
| `src/execution-engine/hyperliquid-client.ts` | Exchange integration |
| `src/risk-manager/risk-manager.ts` | Risk management logic |
| `src/news-agent/graph.ts` | News pipeline orchestrator |
| `src/prediction-markets/graph.ts` | Prediction trading pipeline |
| `src/market-ingester/market-ingester.ts` | Real-time data ingestion |
| `src/shared/config.ts` | Configuration management |
| `src/shared/types.ts` | TypeScript type definitions |

## Appendix B: Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| `Database not found` | Run `bash database/setup.sh` |
| `Hyperliquid not configured` | Add `HYPERLIQUID_PRIVATE_KEY` to `.env` |
| `Circuit breaker open` | Check logs, reset via dashboard API |
| `Redis connection failed` | Start Redis: `redis-server` |
| `Build errors` | Run `npm run build` |

### Log Locations

```
logs/                    # Application logs
data/*.db               # SQLite databases
~/.pm2/logs/            # PM2 logs (if using PM2)
/var/log/journal/       # SystemD journal
```

---

*Built with ❤️ by Vex Capital*
