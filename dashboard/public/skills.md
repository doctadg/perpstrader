# PerpsTrader System Documentation

> **Version:** 2.0.0  
> **Last Updated:** February 2026  
> **Repository:** `/home/d/PerpsTrader`

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
/home/d/PerpsTrader/
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
0 3 * * * /home/d/PerpsTrader/scripts/cleanup.sh

# Hourly trace analysis
0 * * * * /home/d/PerpsTrader/scripts/trace-analysis.sh

# Daily backup (2 AM)
0 2 * * * /home/d/PerpsTrader/scripts/backup.sh
```

### First-Time Setup

```bash
# 1. Clone repository
git clone https://github.com/doctadg/perpstrader.git
cd perpstrader

# 2. Install dependencies
npm install

# 3. Set up databases
bash database/setup.sh

# 4. Configure environment
cp .env.example .env
# Edit .env with your API keys

# 5. Build TypeScript
npm run build

# 6. Start the system
./scripts/perps-control start

# 7. Access dashboard
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
