# PerpsTrader

**An open-source, agent-first autonomous trading floor.**

PerpsTrader is a modular TypeScript platform where AI agents orchestrate every stage of the trading lifecycle — from market research and news analysis to strategy generation, risk gating, execution, and post-trade learning. Each module runs independently and communicates through a shared message bus, making it straightforward to swap, extend, or replace any component.

Designed for developers who want to build their own agent-controlled trading systems — not for people looking for a black-box profit printer.

![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.3+-3178c6.svg)
![Node.js](https://img.shields.io/badge/Node.js-18+-339933.svg)
![Docker](https://img.shields.io/badge/Docker-ready-2496ED.svg)

---

## Features

- **Modular agent architecture** — 12 independent modules, each runnable standalone or as part of the full pipeline
- **LangGraph orchestration** — graph-based trading cycle with conditional branching and circuit breaker protection at every node
- **AI-driven strategy generation** — LLMs generate, mutate, and evolve trading strategies via a genetic algorithm engine
- **News intelligence** — monitors 12 news categories with semantic embeddings, vector clustering, and real-time heat scoring
- **Multi-venue execution** — Hyperliquid perpetual futures, Polymarket prediction markets, Solana pump.fun token analysis
- **Hard risk controls** — circuit breakers, position sizing limits, drawdown protection, emergency stop with position recovery
- **Continuous backtesting** — tick-level historical backtests with automated result analysis and strategy leaderboard
- **Real-time dashboard** — Bloomberg-terminal-style web UI with WebSocket push updates across all subsystems
- **Agent Control API** — full REST API for external agents (Hermes, OpenClaw, custom bots) to query state and control the trading floor

---

## Architecture

```
                    ┌─────────────────────────────────────┐
                    │         External Agents             │
                    │    (Hermes / OpenClaw / Custom)     │
                    └──────────┬──────────────────────────┘
                               │  REST API  (:3001)
                    ┌──────────▼──────────────────────────┐
                    │           Dashboard Server           │
                    │    (Express + Socket.IO + Web UI)   │
                    └──┬────────┬────────┬────────┬───────┘
                       │        │        │        │
            ┌──────────▼──┐ ┌──▼───┐ ┌──▼──────▼──────────────┐
            │  News Agent │ │Evolve│ │  Research Engine       │
            │  (LangGraph)│ │Engine│ │  (BullMQ Workers)     │
            └──────┬──────┘ └──┬───┘ └──────────┬─────────────┘
                   │           │                 │
                   └─────┬─────┴─────┬───────────┘
                         │           │
              ┌──────────▼───────────▼──────────┐
              │         LangGraph Orchestrator  │
              │                                 │
              │  Market Data → Pattern Recall   │
              │  → Strategy Ideation (LLM)      │
              │  → Backtest → Strategy Select   │
              │  → Risk Gate → Execute → Learn  │
              └──────┬──────────────┬───────────┘
                     │              │
          ┌──────────▼──┐  ┌───────▼───────────┐
          │Risk Manager │  │ Execution Engine   │
          │(Circuit Brk)│  │  (Hyperliquid DEX) │
          └─────────────┘  └───────────────────┘
                     │              │
        ┌────────────▼──────────────▼─────────────┐
        │          Redis (BullMQ Message Bus)      │
        └──┬──────────┬──────────┬────────────────┘
           │          │          │
    ┌──────▼───┐ ┌───▼────┐ ┌───▼──────────────┐
    │Prediction │ │PumpFun │ │ Safekeeping Fund │
    │  Agent    │ │ Agent  │ │(Multi-chain Yield)│
    │(Polymarket)│ │(Solana)│ │                  │
    └───────────┘ └────────┘ └──────────────────┘

    Storage:  SQLite (trades, traces, strategies)
              ChromaDB  (news embeddings, vector search)
              Redis     (message bus, caching)
```

---

## Quick Start

### Option 1: Docker Compose (recommended)

```bash
git clone https://github.com/your-org/PerpsTrader.git
cd PerpsTrader
cp .env.example .env
# Edit .env with your API keys and wallet configuration
docker compose up -d
```

The dashboard will be available at `http://localhost:3001`.

### Option 2: Manual Install

```bash
# Prerequisites
# Node.js 18+, Redis, SQLite3

git clone https://github.com/your-org/PerpsTrader.git
cd PerpsTrader

# Install dependencies
npm install

# Build TypeScript
npm run build

# Configure environment
cp .env.example .env
# Edit .env — see Configuration section below

# Start Redis (if not running)
redis-server --daemonize yes

# Launch the full system
npm start
```

### Running Individual Agents

Each agent can run as a standalone process:

```bash
npm run start:news-agent       # News ingestion pipeline
npm run start:predictions      # Polymarket prediction agent
npm run start:pumpfun          # Solana pump.fun token scanner
npm run start:dashboard        # Dashboard server only
npm run research:worker        # Backtest worker process
npm run research:evolve        # Strategy evolution engine
```

---

## Agent Modules

### Core Trading Pipeline

| Module | Description | Source |
|--------|-------------|--------|
| **LangGraph Orchestrator** | Graph-based trading cycle coordinator. Routes data through 8 sequential nodes with conditional branching — market data, pattern recall, strategy ideation, backtesting, strategy selection, risk gate, execution, and learning. Circuit breaker protection at every node. | `src/langgraph/` |
| **Execution Engine** | Hyperliquid DEX integration for perpetual futures. Market/limit orders, position management, funding rate tracking, and automated position recovery on startup. | `src/execution-engine/` |
| **Risk Manager** | Multi-layer risk controls: circuit breakers per subsystem, max position sizing, daily loss limits, leverage caps, emergency stop with full position closeout. | `src/risk-manager/` |
| **Strategy Engine** | Technical analysis strategies (trend following, mean reversion, market making) plus AI-generated strategy ideation via LLM. Includes trace analysis for post-trade learning. | `src/strategy-engine/` |
| **Backtester** | Full historical backtesting with configurable parameters. Tick-level candle data, performance metrics (Sharpe, max drawdown, win rate), and automated result analysis. | `src/backtest-worker/`, `src/backtest/` |

### Intelligence Layer

| Module | Description | Source |
|--------|-------------|--------|
| **News Agent** | LangGraph-based news pipeline. Monitors 12 categories via SearXNG, performs AI sentiment analysis, generates embeddings, clusters semantically related stories, scores market heat, and links news to tradable assets. | `src/news-agent/` |
| **Research Engine** | Continuous market research system. Generates strategy ideas, submits backtest jobs to BullMQ workers, tracks experiments, and maintains a strategy leaderboard. | `src/research-engine/` |
| **Evolution Engine** | Genetic algorithm that mutates existing strategies, runs backtests, selects high-performing variants, and evolves the strategy pool autonomously over time. | `bin/evolution-engine/` |
| **Prediction Agent** | Polymarket integration. Scans prediction markets, evaluates thesis alignment, manages positions with dedicated risk controls, and runs its own LangGraph pipeline. | `src/prediction-markets/` |
| **PumpFun Agent** | Solana pump.fun token analysis pipeline. Scores tokens across social signals, freshness, website quality, and AI analysis. Configurable thresholds and sniper cooldowns. | `src/pumpfun-agent/` |

### Infrastructure

| Module | Description | Source |
|--------|-------------|--------|
| **Safekeeping Fund** | Multi-chain yield optimization across ETH, BSC, and Solana. Wallet setup, balance tracking, and yield aggregation. | `src/safekeeping-fund/` |
| **Dashboard** | Bloomberg-terminal-style web UI served via Express. Real-time WebSocket updates, market heatmaps, news clusters, funding rate arb scanner, strategy research view, prediction market tracker, and pump.fun token explorer. | `src/dashboard/`, `dashboard/public/` |

---

## Agent Control API

The dashboard server exposes a REST API at `:3001` designed for external agents to monitor and control the trading floor. All endpoints return JSON.

### System Status

```
GET  /api/health              — Health check (DB, Redis, market data connectivity)
GET  /api/status              — Full system status (active symbols, last cycle, uptime)
GET  /api/config              — Current runtime configuration
GET  /api/cache/stats         — Redis cache hit/miss statistics
```

### Trading Control

```
GET  /api/mode/status         — Trading mode per subsystem (paper/testnet/live)
PUT  /api/mode/set            — Change trading mode (requires confirmation for live)
POST /api/mode/confirm/:token — Confirm pending mode change
POST /api/mode/enable/:sub    — Enable subsystem (perps, predictions, pumpfun)
POST /api/mode/disable/:sub   — Disable subsystem
GET  /api/mode/history        — Mode change audit trail
GET  /api/mode/env-overrides  — Export mode as env var overrides
```

### Emergency Controls

```
POST /api/emergency-stop              — Activate emergency stop (close all positions)
GET  /api/circuit-breakers            — Status of all circuit breakers
POST /api/circuit-breakers/:name/reset — Reset a specific circuit breaker
GET  /api/position-recovery           — Position recovery status
POST /api/position-recovery/recover   — Trigger position reconciliation
```

### Trading Data

```
GET  /api/portfolio            — Current portfolio (positions, PnL, margin)
GET  /api/trades               — Trade history
GET  /api/cycles               — Recent trading cycles
GET  /api/traces               — Orchestrator execution traces
GET  /api/traces/:id           — Full trace detail for a specific cycle
GET  /api/strategies           — Active strategies and performance
GET  /api/market-data          — Latest market data per symbol
GET  /api/insights             — AI-generated market insights
```

### News Intelligence

```
GET  /api/news                 — Paginated news articles
GET  /api/news/stats           — News ingestion statistics
GET  /api/news/clusters        — Semantic news clusters
GET  /api/news/clusters/:id    — Cluster detail with articles and scores
GET  /api/news/heatmap         — Market heat scores by category
GET  /api/news/search          — Full-text news search
POST /api/news/:id/summarize   — Generate AI summary of an article
```

### Research & Evolution

```
GET  /api/research/ideas       — Strategy ideas queue
GET  /api/research/backtests   — Backtest results
GET  /api/research/leaderboard — Strategy performance leaderboard
GET  /api/research/evolution   — Evolution engine generation stats
```

### Prediction Markets

```
GET  /api/predictions/status   — Prediction agent status
GET  /api/predictions/markets  — Tracked prediction markets
GET  /api/predictions/positions — Active prediction positions
GET  /api/predictions/trades   — Prediction market trade history
```

### Funding & Arbitrage

```
GET  /api/funding/rates                    — Current funding rates
GET  /api/funding/opportunities            — Funding rate arbitrage opportunities
GET  /api/funding/cross-exchange           — Cross-exchange price differences
GET  /api/funding/hyperliquid/live         — Hyperliquid funding rate data
GET  /api/funding/hyperliquid/extreme      — Extreme funding rate alerts
```

### PumpFun Token Analysis

```
GET  /api/pumpfun/tokens           — Scanned tokens with scores
GET  /api/pumpfun/token/:mint      — Detail for specific token
GET  /api/pumpfun/stats            — Scanner statistics
GET  /api/pumpfun/high-confidence  — Tokens above confidence threshold
```

All endpoints support CORS and are suitable for programmatic access from any agent framework.

---

## Configuration

Configuration is split between environment variables and `config/config.json`.

### Environment Variables

```bash
# ── Application ──
NODE_ENV=production
LOG_LEVEL=info
PORT=3001

# ── Hyperliquid (Execution) ──
HYPERLIQUID_PRIVATE_KEY=0x...           # Wallet private key
HYPERLIQUID_MAIN_ADDRESS=0x...          # Wallet address
HYPERLIQUID_TESTNET=true                # Set false for mainnet
HYPERLIQUID_BASE_URL=https://api.hyperliquid.xyz

# ── Risk Controls ──
RISK_MAX_POSITION_SIZE=10               # Max position size (USD)
RISK_MAX_DAILY_LOSS=50                  # Daily loss limit (USD)
RISK_MAX_LEVERAGE=20                    # Max leverage multiplier
RISK_EMERGENCY_STOP=false               # Manual emergency stop flag

# ── Trading Parameters ──
TRADING_MIN_ANALYSIS_CANDLES=50         # Minimum candles before analysis
TRADING_MAX_ACTIVE_SYMBOLS=30           # Max symbols to track
TRADING_EXCLUDED_SYMBOLS=               # Comma-separated symbols to skip
TRADING_CYCLE_INTERVAL_MS=60000         # Milliseconds between cycles

# ── AI / LLM ──
OPENROUTER_API_KEY=sk-or-...            # OpenRouter API key
GLM_MODEL=z-ai/glm-4.7-flash            # Default LLM model
OPENROUTER_EMBEDDING_MODEL=openai/text-embedding-3-small

# ── Redis ──
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# ── Database ──
DB_PATH=./data/trading.db

# ── News Agent ──
SEARXNG_BASE_URL=http://localhost:8080   # SearXNG instance for news search

# ── PumpFun Agent ──
PUMPFUN_MIN_BUY_SCORE=0.35
PUMPFUN_SNIPER_COOLDOWN_MS=2000
PUMPFUN_MAX_SNIPE_PER_HOUR=15

# ── Telegram Alerts (optional) ──
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=

# ── Polymarket (optional) ──
POLYMARKET_PRIVATE_KEY=
POLYMARKET_API_URL=https://gamma-api.polymarket.com
```

### config.json

`config/config.json` provides structured defaults for app settings, Hyperliquid connection, risk parameters, trading symbols/timeframes, GLM/AI model configuration, and pump.fun scoring weights. Environment variables take precedence over config.json values.

---

## Dashboard

The web dashboard at `http://localhost:3001` provides a real-time view of the entire trading floor:

- **Main Terminal** — portfolio overview, active positions, PnL tracking, live trade feed
- **Trading Traces** — step-by-step visualization of each LangGraph cycle execution
- **News Intelligence** — semantic news clusters, category heat map, article search, AI summaries
- **Market Heatmap** — bubble and grid visualizations of market activity by sector
- **Strategy Research** — idea queue, backtest results, strategy leaderboard, evolution stats
- **Funding Arbitrage** — live funding rates, cross-exchange price differentials, opportunity scanner
- **Prediction Markets** — Polymarket positions, thesis tracking, backtest history
- **PumpFun Explorer** — Solana token scores, high-confidence picks, token details
- **Safekeeping** — multi-chain wallet balances and yield overview

All views update in real-time via Socket.IO WebSocket connections.

---

## Development

### Project Structure

```
PerpsTrader/
├── src/                        # TypeScript source
│   ├── langgraph/              # Trading orchestrator graph + nodes
│   ├── execution-engine/       # Hyperliquid order execution
│   ├── risk-manager/           # Risk controls + circuit breakers
│   ├── strategy-engine/        # Trading strategies + trace analysis
│   ├── news-agent/             # News pipeline (LangGraph-based)
│   ├── prediction-markets/     # Polymarket integration (LangGraph)
│   ├── pumpfun-agent/          # Solana token analysis (LangGraph)
│   ├── research-engine/        # Continuous research + backtest jobs
│   ├── backtest-worker/        # BullMQ backtest job processor
│   ├── backtest/               # Backtesting engine
│   ├── safekeeping-fund/       # Multi-chain yield management
│   ├── dashboard/              # Express server + API routes
│   ├── data/                   # Data management (SQLite, traces)
│   ├── market-ingester/        # Market data ingestion
│   └── shared/                 # Shared utilities (logger, circuit breaker, embeddings)
├── bin/                        # Compiled JavaScript output
├── dashboard/public/           # Static web UI (HTML/JS/CSS)
├── config/                     # Configuration files
├── data/                       # SQLite database, generated data
├── database/                   # SQL migration schemas
├── logs/                       # Application logs
├── monitoring/                 # Alert rules and monitoring config
├── scripts/                    # Utility scripts
├── migrations/                 # Database migration runners
└── training-dataset/           # Captured training data
```

### Available Scripts

```bash
npm run build              # Compile TypeScript to bin/
npm run dev                # Run with --watch (auto-restart on changes)
npm start                 # Launch full system (main entry)
npm run test               # Run test suite
npm run test:unit          # Unit tests only (Jest)
npm run lint               # ESLint
npm run setup              # Install + build

# Agent processes
npm run start:news-agent   # News ingestion pipeline
npm run start:predictions  # Prediction market agent
npm run start:pumpfun      # Pump.fun token scanner
npm run start:dashboard    # Dashboard server only
npm run research:worker    # Backtest worker
npm run research:evolve    # Strategy evolution engine

# Database
npm run migrate:002        # Run migration 002
npm run migrate:evolution  # Apply evolution engine schema

# Wallets
npm run wallets:setup      # Safekeeping fund wallet setup
```

### Adding a New Agent

1. Create a new directory under `src/your-agent/`
2. Implement your agent with a `start()` function
3. If using LangGraph, define nodes in `nodes/` and state in `state.ts`
4. Add API routes in the dashboard server (`src/dashboard/dashboard-server.ts`)
5. Add the agent as a child process in `src/main.ts` if it should run alongside the core system
6. Add npm scripts to `package.json` for standalone execution

### Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Write code and tests
4. Ensure `npm run build` and `npm run lint` pass
5. Submit a pull request with a clear description of the change

This project uses TypeScript strict mode. The build script tolerates non-blocking type errors from external dependencies but will fail on genuine code issues.

---

## Disclaimer

PerpsTrader is software infrastructure for building automated trading systems. It does not guarantee profitability. Trading involves substantial risk of loss. Use at your own risk. Always test thoroughly in paper mode before deploying with real capital.

---

## License

MIT
