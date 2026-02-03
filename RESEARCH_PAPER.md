# PerpsTrader AI: A Comprehensive Architecture Analysis
## Autonomous Multi-Agent Cryptocurrency Trading System

**Date:** January 10, 2026
**Version:** 2.0.0
**Analysis Type:** Complete System Review

---

## Abstract

PerpsTrader AI is a sophisticated autonomous cryptocurrency trading system built on TypeScript, utilizing LangGraph-based orchestration, multiple AI services (GLM-4.7, OpenRouter), and real-time market data processing. This paper provides a comprehensive analysis of the system's architecture, data rails, external integrations, internal mechanisms, and security considerations. The system implements a microservice-like design with three autonomous agents: a main trading agent, a news analysis agent, and a prediction markets agent.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Architecture Overview](#2-system-architecture-overview)
3. [Agent Analysis](#3-agent-analysis)
4. [Data Rails & Storage Architecture](#4-data-rails--storage-architecture)
5. [External Platform Integrations](#5-external-platform-integrations)
6. [Internal Mechanisms](#6-internal-mechanisms)
7. [Technical Analysis & Market Data Pipeline](#7-technical-analysis--market-data-pipeline)
8. [Dashboard & Monitoring System](#8-dashboard--monitoring-system)
9. [Security & Configuration Management](#9-security--configuration-management)
10. [Critical Findings & Recommendations](#10-critical-findings--recommendations)

---

## 1. Executive Summary

### 1.1 System Purpose

PerpsTrader AI is an autonomous trading system designed for perpetual futures trading on the Hyperliquid DEX. The system combines:

- **AI-Powered Decision Making:** Uses GLM-4.7 and OpenRouter LLMs for strategy generation and market analysis
- **Real-Time Data Processing:** WebSocket-based market data ingestion with 1-second candle resolution
- **Multi-Agent Architecture:** Three specialized autonomous agents operating in parallel
- **Comprehensive Risk Management:** Multi-layered risk controls with circuit breakers
- **24/7 News Monitoring:** Continuous news scraping and analysis across 12 categories
- **Prediction Markets Trading:** Paper trading on Polymarket prediction markets

### 1.2 Key Specifications

| Component | Specification |
|-----------|---------------|
| **Language** | TypeScript 5.3.3 |
| **Primary Exchange** | Hyperliquid DEX |
| **Trading Symbols** | BTC, ETH, SOL |
| **Timeframes** | 1s, 1m, 5m, 15m, 1h |
| **Max Leverage** | 40x |
| **Cycle Interval** | 60 seconds (main), 90 seconds (predictions) |
| **Database** | SQLite with WAL mode |
| **AI Models** | GLM-4.7, OpenRouter (labeling/embedding) |

---

## 2. System Architecture Overview

### 2.1 Directory Structure

```
PerpsTrader/
├── src/
│   ├── langgraph/              # Trading orchestration graph
│   │   ├── graph.ts            # Main orchestrator
│   │   ├── state.ts            # State management
│   │   └── nodes/              # Processing nodes (8 types)
│   ├── news-agent/             # News analysis system
│   │   ├── graph.ts            # News processing pipeline
│   │   └── nodes/              # News processing nodes (6 types)
│   ├── prediction-markets/     # Polymarket integration
│   ├── market-ingester/        # Real-time data ingestion
│   ├── strategy-engine/        # Strategy generation & backtesting
│   ├── execution-engine/       # Trade execution
│   ├── risk-manager/           # Risk controls
│   ├── ta-module/              # Technical analysis
│   ├── dashboard/              # Web dashboard server
│   ├── data/                   # Data storage modules
│   └── shared/                 # Shared utilities & types
├── dashboard/                  # Frontend UI
├── config/                     # Configuration files
├── data/                       # SQLite databases
└── bin/                        # Compiled JavaScript
```

### 2.2 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        PERPSTRADER AI SYSTEM                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐             │
│  │  Trading     │    │   News       │    │  Prediction  │             │
│  │   Agent      │    │   Agent      │    │   Agent      │             │
│  │  (60s cycle) │    │  (60s cycle) │    │  (90s cycle) │             │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘             │
│         │                   │                   │                      │
│         └───────────────────┼───────────────────┘                      │
│                             ▼                                          │
│              ┌─────────────────────────┐                               │
│              │   Shared Data Layer     │                               │
│              │  (SQLite + Vector DB)   │                               │
│              └────────────┬────────────┘                               │
│                             ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    External Integrations                         │   │
│  │  Hyperliquid │ Polymarket │ GLM AI │ OpenRouter │ Search API    │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                             ▼                                          │
│              ┌─────────────────────────┐                               │
│              │     Dashboard Server    │                               │
│              │    (Express + Socket.IO) │                               │
│              └─────────────────────────┘                               │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Agent Analysis

### 3.1 Main Trading Agent

**Location:** `src/main.ts` → `bin/main.js`

#### 3.1.1 Purpose

The main trading agent is the core autonomous trading system that:
- Orchestrates all trading components via LangGraph
- Runs trading cycles every 60 seconds
- Manages BTC, ETH, SOL perpetual futures positions
- Implements the complete trading pipeline

#### 3.1.2 Trading Cycle Pipeline

```
┌──────────────────────────────────────────────────────────────────────────┐
│                    TRADING ORCHESTRATION GRAPH                           │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  1. MARKET DATA NODE                                                     │
│     ├─ Fetch candles (min 50, target 300)                               │
│     ├─ Compute indicators (RSI, MACD, BB, SMA/EMA, ATR, AD, OBV)       │
│     ├─ Detect market regime (6 types)                                   │
│     └─ Get portfolio state                                              │
│           │                                                              │
│           ▼                                                              │
│  2. PATTERN RECALL NODE (DISABLED)                                      │
│     └─ Vector store removed - no historical pattern matching            │
│           │                                                              │
│           ▼                                                              │
│  3. STRATEGY IDEATION NODE                                              │
│     ├─ Call GLM-4.7 for strategy generation (max 10)                    │
│     ├─ Fallback to 3 predefined strategies if LLM fails                 │
│     └─ Each strategy has risk params + confidence                       │
│           │                                                              │
│           ▼                                                              │
│  4. BACKTESTER NODE                                                     │
│     ├─ Vectorized backtesting using Float64Array                        │
│     ├─ Parallel processing with worker pools                            │
│     ├─ Signal logic: TREND_FOLLOWING, MEAN_REVERSION                   │
│     └─ Metrics: Sharpe, win rate, max drawdown, profit factor          │
│           │                                                              │
│           ▼                                                              │
│  5. STRATEGY SELECTOR NODE                                              │
│     ├─ Filter: Sharpe > 0.10, Win Rate > 25%, Max DD < 50%             │
│     ├─ Score: Sharpe (40%) + Return (30%) + Win Rate (20%) + 1/DD (10%)│
│     └─ Select highest scoring strategy                                 │
│           │                                                              │
│           ▼                                                              │
│  6. RISK GATE NODE                                                      │
│     ├─ Generate signals based on strategy type                          │
│     ├─ Validate: min expected move, cooldowns, position limits         │
│     ├─ Risk assessment via RiskManager                                  │
│     └─ Approve/reject for execution                                     │
│           │                                                              │
│           ▼                                                              │
│  7. EXECUTOR NODE (conditional)                                         │
│     ├─ Execute approved signals                                         │
│     ├─ Paper or live trading mode                                       │
│     └─ Persist trade to database                                       │
│           │                                                              │
│           ▼                                                              │
│  8. LEARNER NODE (DISABLED)                                            │
│     └─ Vector store removed - no learning from trades                   │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

#### 3.1.3 State Management

The `AgentState` interface tracks:
- **Cycle Metadata:** cycleId, cycleStartTime, currentStep
- **Market Context:** symbol, timeframe, candles, indicators, regime
- **Pattern Memory:** similarPatterns (empty due to disabled vector store)
- **Portfolio State:** current portfolio and positions
- **Strategy Pipeline:** strategyIdeas, backtestResults, selectedStrategy
- **Execution Pipeline:** signal, riskAssessment, executionResult
- **Control Flow:** shouldExecute, shouldLearn flags
- **Logging:** thoughts array for reasoning trace, errors array

### 3.2 News Agent

**Location:** `src/news-agent/` → `bin/news-agent.js`

#### 3.2.1 Purpose

The news agent operates 24/7 to:
- Monitor news across 12 categories
- Scrape and analyze article content
- Generate market-moving event alerts
- Cluster related stories by topic

#### 3.2.2 News Categories

```
CRYPTO, STOCKS, ECONOMICS, GEOPOLITICS, TECH, COMMODITIES,
SPORTS, FOOTBALL, BASKETBALL, TENNIS, MMA, GOLF
```

#### 3.2.3 News Processing Pipeline

```
┌──────────────────────────────────────────────────────────────────────────┐
│                     NEWS PROCESSING GRAPH                                │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  1. SEARCH NODE                                                          │
│     ├─ Rotate through 12 categories                                     │
│     ├─ 6 queries per category with modifiers                            │
│     └─ Deduplicate URLs and extract sources                            │
│           │                                                              │
│           ▼                                                              │
│  2. SCRAPE NODE                                                         │
│     ├─ 8 concurrent scrapes                                             │
│     ├─ Content quality filtering (min 200 chars)                        │
│     └─ Sort by recency                                                  │
│           │                                                              │
│           ▼                                                              │
│  3. CATEGORIZE NODE                                                      │
│     ├─ Tier 1: OpenRouter AI service                                    │
│     ├─ Tier 2: GLM service (fallback)                                  │
│     ├─ Tier 3: Keyword-based rules (final fallback)                    │
│     └─ Extract: tags, sentiment, importance, trends                    │
│           │                                                              │
│           ▼                                                              │
│  4. STORE NODE                                                          │
│     ├─ SQLite with FTS5 full-text search                               │
│     ├─ Duplicate detection via URL hashes                              │
│     └─ Market link correlation                                         │
│           │                                                              │
│           ▼                                                              │
│  5. STORY CLUSTER NODE                                                  │
│     ├─ AI-powered clustering (OpenRouter/GLM)                          │
│     ├─ ChromaDB vector similarity (0.55 threshold)                     │
│     ├─ Heat scoring with 3.5-hour decay                                │
│     └─ Duplicate detection via title fingerprints                     │
│           │                                                              │
│           ▼                                                              │
│  6. CLEANUP NODE                                                        │
│     └─ Generate cycle summary and statistics                           │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Prediction Markets Agent

**Location:** `src/prediction-agent.ts` → `bin/prediction-agent.js`

#### 3.3.1 Purpose

The prediction markets agent:
- Paper trades on Polymarket prediction platform
- Generates trading ideas using LLM analysis
- Backtests prediction strategies
- Stores traces for analysis

#### 3.3.2 Trading Pipeline

```
┌──────────────────────────────────────────────────────────────────────────┐
│                  PREDICTION MARKETS PIPELINE                             │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Market Data → News Context → Theorizer → Backtester → Idea Selector    │
│       ↓                                                              ↓   │
│    Risk Gate → Executor → Learner                                        │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

#### 3.3.3 Key Features

- **Binary Outcomes:** YES/NO markets with prices summing to ~1.0
- **Probability Pricing:** Prices represent implied probabilities
- **Edge Calculation:** Difference between predicted and implied probability
- **Minimum Edge:** 4% threshold required for trades
- **Paper Trading Only:** No real money at risk

---

## 4. Data Rails & Storage Architecture

### 4.1 Database Architecture

The system uses **SQLite** with multiple specialized databases:

#### 4.1.1 Main Trading Database (`data/trading.db`)

**Table: `agent_traces`**
```sql
CREATE TABLE agent_traces (
    id TEXT PRIMARY KEY,
    created_at DATETIME,
    symbol TEXT,
    timeframe TEXT,
    regime TEXT,
    agent_type TEXT,
    trace_data JSON,           -- Complete cycle trace
    trade_executed BOOLEAN,
    success BOOLEAN,
    analyzed BOOLEAN,
    -- Auto-migrated columns added as needed
);
```

- **Purpose:** Persist agent traces for daily LLM analysis
- **Features:** WAL mode for performance, indexes for efficient querying
- **Indexes:** created_at, symbol, regime, agent_type, analyzed

#### 4.1.2 News Database (`data/news.db`)

**Tables:**
- `news_articles` - Article storage with FTS5
- `story_clusters` - Event cluster metadata
- `cluster_articles` - Many-to-many mapping
- `cluster_title_fingerprints` - Duplicate detection

**Key Features:**
- FTS5 full-text search
- Category-based organization
- Sentiment and importance tracking
- Market link correlation

#### 4.1.3 Prediction Markets Database (`data/predictions.db`)

**Tables:**
- `prediction_markets` - Market metadata
- `prediction_market_prices` - Historical price snapshots
- `prediction_trades` - Executed trade records
- `prediction_positions` - Open position tracking
- `prediction_backtests` - Backtest results
- `prediction_agent_status` - System status and metrics

### 4.2 Data Stores

#### 4.2.1 Trace Store (`src/data/trace-store.ts`)

- Stores complete cycle traces with indicators, strategies, and outcomes
- Supports batch processing of unanalyzed traces
- Provides statistics and cleanup functionality
- Auto-migrates schema with new columns

#### 4.2.2 News Store (`src/data/news-store.ts`)

- FTS5-backed full-text search
- Duplicate detection via URL hashing
- Market link correlation
- Sentiment and importance tracking

#### 4.2.3 Story Cluster Store (`src/data/story-cluster-store.ts`)

- Heat scoring for trending stories (3.5-hour half-life decay)
- Title fingerprinting for duplicate detection
- Trend direction tracking
- Cluster merging capabilities

#### 4.2.4 Vector Store (`src/data/vector-store.ts`)

**Status:** DISABLED - Vector store functionality removed

Originally designed for:
- Price pattern embeddings (40-dimensional)
- Similar pattern matching
- Trade outcome learning

#### 4.2.5 News Vector Store (`src/data/news-vector-store.ts`)

- ChromaDB integration for semantic news clustering
- OpenRouter/local embedding generation
- Circuit breaker pattern for reliability
- Self-healing ChromaDB restart capability

### 4.3 Data Flow Diagram

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           DATA FLOW ARCHITECTURE                         │
└──────────────────────────────────────────────────────────────────────────┘

EXTERNAL SOURCES                    INTERNAL PROCESSES              STORAGE
┌────────────────┐                 ┌───────────────────┐          ┌────────────┐
│ Hyperliquid WS │────────────────▶│ Market Ingester   │──────────▶│ trading.db  │
│ (Real-time)    │ 1s candles      │                   │ candles   │            │
└────────────────┘                 └───────────────────┘          └────────────┘
                                                                        │
┌────────────────┐                 ┌───────────────────┐              │
│ News Sources   │────────────────▶│ News Agent        │──────────────┤
│ (12 categories)│ scraped content │                   │ articles     ▼
└────────────────┘                 └───────────────────┘          ┌────────────┐
                                                                │  news.db   │
┌────────────────┐                 ┌───────────────────┐          │            │
│ Polymarket API │────────────────▶│ Prediction Agent  │──────────▶│            │
│ (Gamma API)    │ market data     │                   │ markets   └────────────┘
└────────────────┘                 └───────────────────┘

┌────────────────┐                 ┌───────────────────┐          ┌────────────┐
│ GLM-4.7 API    │────────────────▶│ Strategy Engine   │──────────▶│ ChromaDB   │
│ (LLM)          │ strategies      │                   │ embeddings │ (vectors)  │
└────────────────┘                 └───────────────────┘          └────────────┘
```

---

## 5. External Platform Integrations

### 5.1 Trading Platforms

#### 5.1.1 Hyperliquid DEX (Primary)

**SDK:** `@nktkas/hyperliquid`

**Features:**
- EIP-712 signature support
- Testnet/mainnet switching
- Perpetual futures trading
- Real-time WebSocket data
- Order book (L2) data
- Funding rates

**Configuration:**
```json
{
  "hyperliquid": {
    "testnet": true,
    "baseUrl": "https://api.hyperliquid.xyz"
  }
}
```

**Asset Mapping:**
- BTC: $1 price ticks
- ETH: $0.1 price ticks
- Others: $0.01 price ticks

#### 5.1.2 CCXT Framework

**Purpose:** Universal cryptocurrency exchange API

**Features:**
- Supports 100+ exchanges
- Abstracts exchange differences
- Potential for multi-exchange arbitrage

**Status:** Integrated but primarily used for Hyperliquid

### 5.2 Prediction Markets

#### 5.2.1 Polymarket

**API:** Gamma API at `https://gamma-api.polymarket.com`

**Features:**
- Binary YES/NO outcome markets
- Price as probability representation
- Volume and liquidity metrics
- Historical price data

**Trading:**
- Paper trading only
- 0.1% fee per trade
- $10,000 starting balance

### 5.3 AI Services

#### 5.3.1 ZhiPu AI (GLM)

**Model:** GLM-4.7

**Usage:**
- Strategy generation (10 strategies max)
- Prediction market analysis
- News summarization
- Risk assessment

**Configuration:**
```json
{
  "glm": {
    "enabled": false,
    "baseUrl": "https://api.z.ai/api/paas/v4",
    "model": "glm-4.7",
    "timeout": 30000
  }
}
```

#### 5.3.2 OpenRouter

**Models:**
- Labeling Model: Categorization and tagging
- Embedding Model: Vector embeddings for clustering

**Usage:**
- News categorization (primary)
- Article summarization
- Semantic clustering

### 5.4 Data Sources

#### 5.4.1 Market Data

**WebSocket Subscriptions:**
- `allMids`: Mid prices for all symbols
- `l2Book`: Level 2 order book
- `trades`: Trade executions
- `funding`: Funding rate information

**Candle Resolutions:**
- 1s, 1m, 5m, 15m, 1h

#### 5.4.2 News Sources

**Categories:** 12 categories across finance, politics, sports

**Processing:**
- Real-time scraping
- Deduplication
- AI-powered categorization

---

## 6. Internal Mechanisms

### 6.1 Risk Management System

#### 6.1.1 Core Risk Manager (`src/risk-manager/risk-manager.ts`)

**Position Sizing Algorithm:**
```typescript
const LEVERAGE = 40;
const targetMarginPercent = 0.15 + (normalizedConfidence * 0.20); // 15-35%
const targetMargin = portfolio.availableBalance * targetMarginPercent;
const targetNotional = targetMargin * LEVERAGE;
```

**Risk Score Components:**
- Portfolio concentration risk (30% weight)
- Size risk (20% weight)
- Daily P&L risk (30% weight)
- Confidence risk (20% weight)

#### 6.1.2 Safety Engine (`src/risk-manager/safety-engine.ts`)

**Circuit Breakers:**
| Trigger | Action |
|---------|--------|
| Daily loss > 5% | Stop trading |
| Max drawdown > 15% | Reduce positions 50% |
| Volatility > 5% | Reduce leverage |
| Liquidity spread > 2% | Halt trading |

**Safety Rules:**
- Maximum 3 positions
- Max 20% capital per position
- Max 5x leverage (safety limit, below 40x trading limit)
- Correlation check prevents same-direction positions

#### 6.1.3 Advanced Risk Engine (`src/risk-manager/advanced-risk.ts`)

**AI-Powered Risk Assessment:**
- Overall risk assessment
- Position risk
- Market risk
- Correlation risk
- Liquidity risk
- Leverage risk

**Kelly Criterion:**
```typescript
const f = averageLoss > 0
    ? Math.max(0, Math.min(1, expectedReturn / averageLoss))
    : 0.1;
```

### 6.2 Strategy Engine

#### 6.2.1 Aggressive Strategies Collection

**18 Pre-defined Strategies:**

| Category | Strategies |
|----------|------------|
| High Frequency | 1-minute scalping (2x), Order book imbalance |
| Momentum | 5-minute surge, 15-minute breakout |
| Mean Reversion | Bollinger Band bounces, RSI extreme fades |
| Arbitrage | Funding rate arbitrage, Basis trading |
| Volatility | Volatility breakouts, Gap trading |
| AI-Powered | GLM 4.7 signals, Polymarket value betting |
| Multi-Timeframe | 1m/5m/15m alignment |
| News-Driven | Major news events (5x leverage) |

#### 6.2.2 Strategy Selection Criteria

**Relaxed Thresholds (Aggressive Mode):**
- Sharpe Ratio > 0.10 (was 0.25)
- Win Rate > 25% (was 30%)
- Max Drawdown < 50% (was 35%)
- Minimum 1 trade (was 2)

**Composite Score:**
```
Score = Sharpe (40%) + Return (30%) + Win Rate (20%) + 1/Drawdown (10%)
```

### 6.3 Execution Engine

#### 6.3.1 Order Flow

```
Signal → Risk Assessment → Order Placement → Persistence → Portfolio Update
```

#### 6.3.2 Order Types

**Market-like Orders with Slippage Protection:**
```typescript
orderPrice = side === 'BUY'
    ? midPrice * 1.005  // 0.5% slippage for buys
    : midPrice * 0.995; // 0.5% slippage for sells
```

#### 6.3.3 Paper Portfolio

**Starting Balance:** $10,000

**Features:**
- Realistic fee calculation (0.02%)
- Position management with P&L tracking
- Daily reset functionality
- State persistence

### 6.4 Technical Analysis Module

#### 6.4.1 Indicators Implemented

**Trend Indicators:**
- SMA/EMA (multiple periods)
- MACD (12/26/9)

**Momentum Indicators:**
- RSI (14-period)

**Volatility Indicators:**
- Bollinger Bands (20, 2)
- ATR (Average True Range)
- Standard Deviation

**Volume Indicators:**
- Accumulation/Distribution Line
- On-Balance Volume (OBV)

#### 6.4.2 Pattern Detection

- Candlestick: Hammer, Doji, Engulfing patterns
- Support/Resistance via pivot points
- Divergence detection (Price vs RSI)

### 6.5 Market Regime Detection

**Regime Classifications:**
| Regime | Condition |
|--------|-----------|
| HIGH_VOLATILITY | Annualized volatility > 50% |
| LOW_VOLATILITY | Annualized volatility < 15% |
| TRENDING_UP | Price change > 3%, RSI > 50 |
| TRENDING_DOWN | Price change < -3%, RSI < 50 |
| RANGING | Default (sideways market) |

---

## 7. Technical Analysis & Market Data Pipeline

### 7.1 Market Ingester Architecture

**Location:** `src/market-ingester/market-ingester.ts`

#### 7.1.1 WebSocket Data Processing

```
Hyperliquid WebSocket Connection
         │
         ├─── allMids (Mid Prices)
         ├─── l2Book (Order Book)
         ├─── trades (Executions)
         └── funding (Funding Rates)
         │
         ▼
    Real-time Processing
         │
         ├─── Trade-based Candles
         ├─── Quote-based Candles
         └── Validation
         │
         ▼
    Write Buffer (200 records / 200ms)
         │
         ▼
    SQLite Persistence
```

#### 7.1.2 Candle Creation

**Trade-based Candles:**
- Built from actual trade executions
- OHLCV updates in real-time
- Validation before persistence
- 1-second flush for stale candles

**Quote-based Candles:**
- Order book mid-price updates
- Used when trade data unavailable
- Ensures continuous price tracking

### 7.2 Data Quality & Validation

**Validation Systems:**
- Candle validation in market ingester
- RSI data validation (prevents stuck indicators)
- NaN/Infinity value detection
- Price relationship validation (high >= low)

---

## 8. Dashboard & Monitoring System

### 8.1 Dashboard Server

**Location:** `src/dashboard/dashboard-server.ts`

**Technology:**
- Express.js
- Socket.IO (WebSocket)
- Better-SQLite3 (read-only database access)

**Port:** 3001 (configurable via `DASHBOARD_PORT`)

### 8.2 Frontend Pages

#### 8.2.1 Main Dashboard (`index.html`)

**Visual Design:**
- Cyberpunk/terminal aesthetic
- CRT scanline effects
- Color-coded status indicators

**Components:**
- Top Status Bar: System ID, connection status
- Data Strip: NAV, liquidity, P&L, cycle count
- Pipeline HUD: 8-stage visualization
- Active Positions Table
- Activity Console
- Execution History

#### 8.2.2 Trace Investigator (`trace.html`)

**Features:**
- Cycle analysis details
- Technical indicators display
- LLM reasoning chain
- Strategy view with confidence levels
- Backtest results
- Execution summary

#### 8.2.3 News Terminal (`news.html`)

**Features:**
- Three-column layout (filters, feed, statistics)
- Real-time WebSocket updates
- Smart filtering
- Article reader with AI summarization
- Market links to predictions

#### 8.2.4 Event Heatmap (`heatmap.html`)

**Features:**
- Visual event clustering matrix
- Heat scoring with decay
- Time filters (1H, 6H, 12H, 24H)
- Trend indicators
- Cluster details modal

#### 8.2.5 Predictions Node (`predictions.html`)

**Features:**
- Market overview
- Position management
- Trade history
- Market news links
- Trace digest
- Backtest summary

### 8.3 API Endpoints

**Core APIs:**
- `GET /api/health` - Health check
- `GET /api/status` - System status
- `GET /api/cycles` - Trading cycle metrics
- `GET /api/portfolio` - Live portfolio data
- `GET /api/strategies` - Active strategies
- `GET /api/trades` - Trade history

**News APIs:**
- `GET /api/news` - News articles with filtering
- `GET /api/news/clusters` - Story clusters
- `GET /api/news/heatmap` - Event heatmap data
- `GET /api/news/search` - Full-text search
- `GET /api/news/:id/summarize` - AI summarization

**Prediction APIs:**
- `GET /api/predictions/status` - Agent status
- `GET /api/predictions/markets` - Available markets
- `GET /api/predictions/positions` - Open positions
- `GET /api/predictions/trades` - Trade history

---

## 9. Security & Configuration Management

### 9.1 Configuration System

#### 9.1.1 Configuration Hierarchy

```
1. Environment Variables (highest priority)
2. config.json file
3. Default values (lowest priority)
```

#### 9.1.2 Key Configuration Sections

**App Settings:**
```json
{
  "app": {
    "name": "PerpsTrader AI",
    "version": "1.0.0",
    "environment": "production",
    "logLevel": "info"
  }
}
```

**Risk Parameters:**
```json
{
  "risk": {
    "maxPositionSize": 10.0,      // 10% of portfolio
    "maxDailyLoss": 0.3,           // 0.3% daily loss limit
    "maxLeverage": 40,             // 40x maximum
    "emergencyStop": false
  }
}
```

**Trading Configuration:**
```json
{
  "trading": {
    "symbols": ["BTC", "ETH", "SOL"],
    "timeframes": ["1s", "1m", "5m", "15m", "1h"],
    "strategies": ["market_making", "trend_following", "mean_reversion", "arbitrage", "prediction"]
  }
}
```

### 9.2 API Key Management

**Security Practices:**
- Keys stored in `config/hyperliquid.keys` (excluded from git, 600 permissions)
- Environment variables override config file values
- Empty string values treated as "unset"
- Separate keys per service (Hyperliquid, Z.AI, OpenRouter)

### 9.3 Systemd Integration

**Services:**
- `perps-agent.service` - Main trading agent
- `perps-dashboard.service` - Dashboard server

**Features:**
- Auto-restart on failure
- Logging to `/var/log/`
- Controlled via `scripts/perps-control`

---

## 10. Critical Findings & Recommendations

### 10.1 Current Limitations

#### 10.1.1 Disabled Components

| Component | Status | Impact |
|-----------|--------|--------|
| Pattern Recognition | Vector store removed | No historical pattern matching |
| Learning System | Vector store removed | No adaptation from trade outcomes |
| GLM Service | `enabled: false` | LLM strategy generation disabled |

#### 10.1.2 Technical Debt

1. **Simplified LangGraph:** Direct orchestration instead of full graph capabilities
2. **Fallback-heavy:** Multiple fallback layers indicate reliability concerns
3. **Aggressive Parameters:** Lowered thresholds may increase risk
4. **No Position Recovery:** Manual intervention required for stuck positions

### 10.2 Security Considerations

#### 10.2.1 Positive Findings

- Proper API key isolation in `hyperliquid.keys`
- Environment variable override capability
- Testnet mode support for safe testing
- Read-only database access for dashboard

#### 10.2.2 Areas of Concern

- High leverage (40x) with aggressive parameters
- Emergency stop stored in config (potential accidental commit)
- No encryption for sensitive data at rest
- Dashboard runs on HTTP (no HTTPS enforcement)

### 10.3 Recommendations

#### 10.3.1 High Priority

1. **Re-enable Pattern Recognition:** Restore vector store for historical pattern matching
2. **Re-enable Learning:** Implement trade outcome learning for strategy improvement
3. **Enable GLM Service:** Critical for AI-powered strategy generation
4. **Review Risk Parameters:** 40x leverage with 30% daily loss may be excessive
5. **Add HTTPS:** Enforce HTTPS for dashboard in production

#### 10.3.2 Medium Priority

1. **Add Position Recovery:** Implement automatic recovery for stuck positions
2. **Improve Monitoring:** Add alerting for critical events
3. **Database Encryption:** Encrypt sensitive data at rest
4. **Reduce Fallbacks:** Increase reliability of primary services
5. **Add Circuit Breaker Testing:** Regular testing of safety mechanisms

#### 10.3.3 Low Priority

1. **Refactor LangGraph:** Utilize full LangGraph capabilities
2. **Add Unit Tests:** Improve test coverage
3. **Documentation:** Add inline code documentation
4. **Performance Profiling:** Identify and optimize bottlenecks

### 10.4 System Strengths

1. **Modular Architecture:** Clear separation of concerns
2. **Comprehensive Dashboard:** Excellent monitoring capabilities
3. **Multi-Agent Design:** Specialized agents for different functions
4. **Real-Time Processing:** High-frequency data handling
5. **Comprehensive Risk Controls:** Multiple layers of protection
6. **Paper Trading:** Safe testing environment

---

## Appendix A: Type Definitions

### Core Types

```typescript
interface TradingSignal {
  id: string;
  symbol: string;
  action: 'BUY' | 'SELL' | 'HOLD';
  size: number;
  price?: number;
  type: 'MARKET' | 'LIMIT';
  timestamp: Date;
  confidence: number;
  strategyId: string;
  reason: string;
}

interface Strategy {
  id: string;
  name: string;
  description: string;
  type: 'MARKET_MAKING' | 'TREND_FOLLOWING' | 'MEAN_REVERSION' | 'ARBITRATURE' | 'AI_PREDICTION';
  symbols: string[];
  timeframe: string;
  parameters: Record<string, any>;
  entryConditions: string[];
  exitConditions: string[];
  riskParameters: {
    maxPositionSize: number;
    stopLoss: number;
    takeProfit: number;
    maxLeverage: number;
  };
  performance: StrategyPerformance;
}

interface Portfolio {
  totalValue: number;
  availableBalance: number;
  usedBalance: number;
  positions: Position[];
  dailyPnL: number;
  unrealizedPnL: number;
}

interface RiskAssessment {
  approved: boolean;
  suggestedSize: number;
  riskScore: number;
  warnings: string[];
  stopLoss: number;
  takeProfit: number;
  leverage: number;
}
```

---

## Appendix B: Dependencies

### Production Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| @langchain/core | ^1.1.8 | LangChain core utilities |
| @langchain/langgraph | ^1.0.7 | Graph orchestration |
| @nktkas/hyperliquid | ^0.17.0 | Hyperliquid SDK |
| axios | ^1.6.2 | HTTP client |
| better-sqlite3 | ^9.2.2 | SQLite database |
| ccxt | ^4.1.48 | Exchange integration |
| chromadb | ^3.2.0 | Vector database |
| express | ^4.18.2 | Web server |
| socket.io | ^4.8.3 | WebSocket |
| technicalindicators | ^3.1.0 | Technical analysis |
| winston | ^3.11.0 | Logging |
| ws | ^8.18.3 | WebSocket client |

---

## Conclusion

PerpsTrader AI represents a sophisticated, production-grade autonomous trading system with comprehensive architecture spanning multiple specialized agents, robust risk management, and extensive monitoring capabilities. The system demonstrates strong engineering practices with modular design, clear separation of concerns, and multiple safety layers.

However, several key components (pattern recognition, learning system, GLM service) are currently disabled, which significantly limits the system's AI capabilities. Re-enabling these components should be a priority for full autonomous operation.

The aggressive risk parameters (40x leverage, relaxed thresholds) combined with disabled AI components suggest the system may be operating in a degraded state. A thorough review of risk settings and restoration of AI capabilities is recommended before live deployment.

---

**Document Version:** 1.0
**Last Updated:** January 10, 2026
**Analyst:** Claude Opus 4.5

