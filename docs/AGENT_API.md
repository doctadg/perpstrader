# PerpsTrader Agent API Reference

> Complete API documentation for controlling the PerpsTrader trading floor from external AI agents (Hermes, Claude, custom bots, etc.).

---

## Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Rate Limiting](#rate-limiting)
4. [Quickstart](#quickstart)
5. [Endpoints](#endpoints)
   - [Trading Floor Control](#trading-floor-control)
   - [Data & Intelligence](#data--intelligence)
   - [Portfolio Management](#portfolio-management)
   - [Strategy Control](#strategy-control)
   - [Risk Management](#risk-management)
   - [Backtest Management](#backtest-management)
   - [Historical Data](#historical-data)
   - [Order Management](#order-management)
   - [Log Streaming](#log-streaming)
   - [Webhook Management](#webhook-management)
6. [WebSocket Events](#websocket-events)
7. [Error Codes](#error-codes)
8. [Troubleshooting](#troubleshooting)

---

## Overview

The PerpsTrader Agent API is a REST interface mounted at **`/api/agent/*`** on the dashboard server (default port **3001**). It allows external AI agents to:

- Monitor system health, positions, portfolio, and risk
- Start/stop individual trading agents
- Submit trades and manage positions
- Create, activate, and deactivate strategies
- Trigger backtests and retrieve results
- Query news, signals, predictions, and market data
- Execute emergency stops
- Register webhooks for real-time event notifications

All endpoints return JSON. Timestamps are ISO 8601 strings.

**Base URL:** `http://localhost:3001/api/agent`

---

## Authentication

All requests to `/api/agent/*` require a **Bearer token** in the `Authorization` header.

```
Authorization: Bearer <your-api-key>
```

### Configuring the API Key

The API key is read from the `AGENT_API_KEY` environment variable. If not set, it defaults to `perpstrader-dev-key` for development.

```bash
# In your .env file or environment
AGENT_API_KEY=your-secure-api-key-here
```

### Authentication Errors

**401 — Missing Authorization header:**
```json
{
  "error": "Missing Authorization header",
  "message": "Provide a Bearer token in the Authorization header",
  "timestamp": "2025-01-15T12:00:00.000Z"
}
```

**401 — Invalid format:**
```json
{
  "error": "Invalid Authorization header format",
  "message": "Expected: Bearer <token>",
  "timestamp": "2025-01-15T12:00:00.000Z"
}
```

**403 — Wrong key:**
```json
{
  "error": "Invalid API key",
  "timestamp": "2025-01-15T12:00:00.000Z"
}
```

---

## Rate Limiting

All agent API endpoints are rate-limited to **100 requests per 15 minutes per IP address**.

Rate limit info is returned in standard headers:
```
RateLimit-Limit: 100
RateLimit-Remaining: 97
RateLimit-Reset: 1705312800
```

**429 — Rate limit exceeded:**
```json
{
  "error": "Too many requests",
  "message": "Rate limit exceeded. Try again later.",
  "timestamp": "2025-01-15T12:00:00.000Z"
}
```

---

## Quickstart

### 1. Health Check

```bash
curl -s http://localhost:3001/api/agent/status \
  -H "Authorization: Bearer perpstrader-dev-key" | jq
```

### 2. List Agents

```bash
curl -s http://localhost:3001/api/agent/agents \
  -H "Authorization: Bearer perpstrader-dev-key" | jq
```

### 3. Start an Agent

```bash
curl -s -X POST http://localhost:3001/api/agent/start/news \
  -H "Authorization: Bearer perpstrader-dev-key" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Starting news pipeline"}' | jq
```

### 4. View Positions

```bash
curl -s http://localhost:3001/api/agent/positions \
  -H "Authorization: Bearer perpstrader-dev-key" | jq
```

### 5. Submit a Trade

```bash
curl -s -X POST http://localhost:3001/api/agent/trade \
  -H "Authorization: Bearer perpstrader-dev-key" \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "BTC",
    "side": "BUY",
    "size": 0.01,
    "type": "MARKET",
    "leverage": 5
  }' | jq
```

### 6. Emergency Stop

```bash
curl -s -X POST http://localhost:3001/api/agent/emergency-stop \
  -H "Authorization: Bearer perpstrader-dev-key" | jq
```

---

## Endpoints

### Trading Floor Control

---

#### `GET /status` — System Status Overview

Returns the overall health of the trading floor including all agents, message bus, cache, and circuit breakers.

**Response:**
```json
{
  "timestamp": "2025-01-15T12:00:00.000Z",
  "uptime": 86400000,
  "health": "HEALTHY",
  "environment": "production",
  "version": "1.0.0",
  "agents": [
    {
      "name": "news",
      "status": "RUNNING",
      "uptime": 3600000,
      "lastCycleTime": "2025-01-15T11:59:00.000Z",
      "cyclesCompleted": 42,
      "error": null
    }
  ],
  "messageBus": {
    "connected": true,
    "subscriptions": 15
  },
  "cache": {
    "connected": true
  },
  "errors": []
}
```

**Health levels:** `HEALTHY` | `DEGRADED`

**curl:**
```bash
curl -s http://localhost:3001/api/agent/status \
  -H "Authorization: Bearer perpstrader-dev-key"
```

---

#### `GET /agents` — List All Agents

Returns all available agent modules with their status, configuration, and metrics.

**Response:**
```json
{
  "agents": [
    {
      "name": "news",
      "status": "RUNNING",
      "description": "News ingestion, clustering, and sentiment analysis pipeline",
      "config": { "pollingInterval": "10000" },
      "lastActivity": "2025-01-15T11:59:00.000Z",
      "cyclesCompleted": 42,
      "errorCount": 0,
      "enabled": true
    },
    {
      "name": "execution",
      "status": "RUNNING",
      "description": "Trade execution engine for Hyperliquid perpetuals",
      "config": { "environment": "LIVE" },
      "lastActivity": "2025-01-15T11:58:00.000Z",
      "cyclesCompleted": 12,
      "errorCount": 1,
      "enabled": true
    }
  ],
  "timestamp": "2025-01-15T12:00:00.000Z"
}
```

**Valid agent names:** `news` | `execution` | `prediction` | `pumpfun` | `safekeeping` | `research`

**curl:**
```bash
curl -s http://localhost:3001/api/agent/agents \
  -H "Authorization: Bearer perpstrader-dev-key"
```

---

#### `POST /start/:agentName` — Start an Agent

Starts a specific agent module. Publishes a start event to the message bus and updates the agent registry.

**Path Parameters:**
| Parameter   | Type   | Description                  |
|-------------|--------|------------------------------|
| agentName   | string | One of the valid agent names |

**Request Body (optional):**
```json
{
  "reason": "Starting for evening session"
}
```

**Response:**
```json
{
  "success": true,
  "agent": "news",
  "action": "start",
  "message": "Agent news start signal sent",
  "previousStatus": "STOPPED",
  "newStatus": "RUNNING"
}
```

**Errors:** `400` — Invalid agent name · `409` — Agent already running

**curl:**
```bash
curl -s -X POST http://localhost:3001/api/agent/start/news \
  -H "Authorization: Bearer perpstrader-dev-key" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Evening session"}'
```

---

#### `POST /stop/:agentName` — Stop an Agent

Stops a specific agent module. Publishes a stop event to the message bus and updates the agent registry.

**Path Parameters:**
| Parameter   | Type   | Description                  |
|-------------|--------|------------------------------|
| agentName   | string | One of the valid agent names |

**Request Body (optional):**
```json
{
  "reason": "Maintenance window"
}
```

**Response:**
```json
{
  "success": true,
  "agent": "execution",
  "action": "stop",
  "message": "Agent execution stop signal sent",
  "previousStatus": "RUNNING",
  "newStatus": "STOPPED"
}
```

**Errors:** `400` — Invalid agent name · `409` — Agent already stopped

**curl:**
```bash
curl -s -X POST http://localhost:3001/api/agent/stop/execution \
  -H "Authorization: Bearer perpstrader-dev-key" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Maintenance"}'
```

---

#### `POST /cycle/trigger` — Trigger a Trading Cycle

Manually triggers a new trading cycle. Can target a specific symbol.

**Request Body (optional):**
```json
{
  "symbol": "BTC",
  "force": false,
  "reason": "Breaking news on BTC"
}
```

| Field    | Type    | Default                          | Description                     |
|----------|---------|----------------------------------|---------------------------------|
| symbol   | string  | null                             | Target symbol (null = all)      |
| force    | boolean | false                            | Force cycle even if risk is high|
| reason   | string  | "Manual trigger via Agent API"   | Reason for trigger              |

**Response:**
```json
{
  "success": true,
  "cycleId": "manual_1705312800000_a1b2c3",
  "message": "Trading cycle triggered for BTC",
  "timestamp": "2025-01-15T12:00:00.000Z"
}
```

**curl:**
```bash
curl -s -X POST http://localhost:3001/api/agent/cycle/trigger \
  -H "Authorization: Bearer perpstrader-dev-key" \
  -H "Content-Type: application/json" \
  -d '{"symbol": "BTC", "reason": "News spike"}'
```

---

### Data & Intelligence

---

#### `GET /news` — Latest News with Sentiment

Returns recent news articles with sentiment analysis, paginated and filterable.

**Query Parameters:**
| Parameter  | Type   | Default | Description                    |
|------------|--------|---------|--------------------------------|
| limit      | int    | 50      | Max articles (1-200)           |
| offset     | int    | 0       | Pagination offset              |
| category   | string | —       | Filter by category             |
| sentiment  | string | —       | Filter: POSITIVE, NEGATIVE, NEUTRAL |

**Response:**
```json
{
  "articles": [
    {
      "id": "abc123",
      "title": "Bitcoin Surges Past Key Resistance",
      "content": "...",
      "source": "CoinDesk",
      "sentiment": "POSITIVE",
      "categories": ["CRYPTO", "MARKET"],
      "publishedAt": "2025-01-15T11:30:00.000Z"
    }
  ],
  "total": 48,
  "limit": 50,
  "offset": 0,
  "categories": { "CRYPTO": 20, "MACRO": 15, "DEFI": 13 }
}
```

**curl:**
```bash
# All recent news
curl -s http://localhost:3001/api/agent/news \
  -H "Authorization: Bearer perpstrader-dev-key"

# Positive crypto news, first 10
curl -s "http://localhost:3001/api/agent/news?limit=10&sentiment=POSITIVE&category=CRYPTO" \
  -H "Authorization: Bearer perpstrader-dev-key"
```

---

#### `GET /news/heatmap` — Market News Heatmap

Returns clustered news topics with heat scores, sentiment, and affected assets.

**Query Parameters:**
| Parameter  | Type    | Default | Description                  |
|------------|---------|---------|------------------------------|
| limit      | int     | 80      | Max clusters (1-200)         |
| hours      | int     | 24      | Lookback window in hours     |
| category   | string  | ALL     | Filter by category           |
| force      | boolean | false   | Force refresh                |

**Response:**
```json
{
  "generatedAt": "2025-01-15T12:00:00.000Z",
  "hours": 24,
  "category": "ALL",
  "totalArticles": 150,
  "totalClusters": 12,
  "clusters": [
    {
      "id": "cl_001",
      "title": "Fed Rate Decision Impact",
      "category": "MACRO",
      "heatScore": 0.92,
      "articleCount": 8,
      "sentimentScore": -0.3,
      "trend": "RISING",
      "topTags": ["fed", "interest rate", "fomc"],
      "affectedAssets": ["BTC", "ETH", "SPY"],
      "marketLinks": []
    }
  ],
  "byCategory": { "MACRO": 5, "CRYPTO": 4, "DEFI": 3 },
  "topMovers": []
}
```

**curl:**
```bash
curl -s "http://localhost:3001/api/agent/news/heatmap?hours=12&category=CRYPTO" \
  -H "Authorization: Bearer perpstrader-dev-key"
```

---

#### `GET /signals` — Recent Trading Signals

Returns recent trading signals extracted from strategy engine traces.

**Response:**
```json
{
  "signals": [
    {
      "action": "BUY",
      "symbol": "BTC",
      "confidence": 0.85,
      "reason": "Strong bullish divergence + news sentiment",
      "cycleId": "cycle_abc123",
      "timestamp": "2025-01-15T11:45:00.000Z"
    }
  ],
  "total": 5,
  "generatedAt": "2025-01-15T12:00:00.000Z"
}
```

**curl:**
```bash
curl -s http://localhost:3001/api/agent/signals \
  -H "Authorization: Bearer perpstrader-dev-key"
```

---

#### `GET /predictions` — Prediction Market Positions

Returns current Polymarket positions and recent prediction trading signals.

**Response:**
```json
{
  "positions": [
    {
      "marketId": "poly_abc",
      "title": "Will BTC reach $100k by March?",
      "outcome": "YES",
      "size": 500,
      "avgPrice": 0.35,
      "currentPrice": 0.42,
      "unrealizedPnL": 35.0
    }
  ],
  "signals": [
    {
      "id": "sig_001",
      "marketId": "poly_abc",
      "marketTitle": "Will BTC reach $100k by March?",
      "outcome": "YES",
      "action": "BUY",
      "confidence": 0.65,
      "reason": "On-chain metrics suggest bullish momentum",
      "timestamp": "2025-01-15T11:00:00.000Z"
    }
  ],
  "totalPositions": 3,
  "unrealizedPnL": 85.5,
  "timestamp": "2025-01-15T12:00:00.000Z"
}
```

**curl:**
```bash
curl -s http://localhost:3001/api/agent/predictions \
  -H "Authorization: Bearer perpstrader-dev-key"
```

---

### Portfolio Management

---

#### `GET /positions` — Current Open Positions

Returns all open perpetual positions from the execution engine.

**Response:**
```json
{
  "positions": [
    {
      "id": "pos_abc123",
      "symbol": "BTC",
      "side": "LONG",
      "size": 0.05,
      "entryPrice": 95000.0,
      "markPrice": 97500.0,
      "leverage": 5,
      "unrealizedPnL": 125.0,
      "marginUsed": 950.0
    }
  ],
  "total": 1,
  "totalUnrealizedPnL": 125.0,
  "timestamp": "2025-01-15T12:00:00.000Z"
}
```

**curl:**
```bash
curl -s http://localhost:3001/api/agent/positions \
  -H "Authorization: Bearer perpstrader-dev-key"
```

---

#### `GET /portfolio` — Portfolio Summary

Returns a full portfolio overview including PnL, exposure, and risk metrics.

**Response:**
```json
{
  "totalValue": 25000.0,
  "availableBalance": 18000.0,
  "usedBalance": 7000.0,
  "dailyPnL": 350.0,
  "unrealizedPnL": 500.0,
  "exposure": {
    "gross": 12000.0,
    "net": 8000.0,
    "long": 10000.0,
    "short": 2000.0
  },
  "risk": {
    "currentDrawdown": 0.02,
    "maxDrawdown": 0.10,
    "riskScore": 15
  },
  "positionCount": 3,
  "timestamp": "2025-01-15T12:00:00.000Z"
}
```

**curl:**
```bash
curl -s http://localhost:3001/api/agent/portfolio \
  -H "Authorization: Bearer perpstrader-dev-key"
```

---

#### `POST /trade` — Submit a Trade

Submits a new trade order with validation against risk limits.

**Request Body:**
```json
{
  "symbol": "BTC",
  "side": "BUY",
  "size": 0.01,
  "type": "MARKET",
  "price": null,
  "leverage": 5,
  "stopLoss": 90000,
  "takeProfit": 105000
}
```

| Field       | Type   | Required | Description                     |
|-------------|--------|----------|---------------------------------|
| symbol      | string | Yes      | Trading pair (e.g., "BTC")      |
| side        | string | Yes      | `BUY` or `SELL`                 |
| size        | number | Yes      | Position size (must be > 0)     |
| type        | string | No       | `MARKET` (default) or `LIMIT`   |
| price       | number | No       | Limit price (required for LIMIT)|
| leverage    | number | No       | Leverage multiplier             |
| stopLoss    | number | No       | Stop loss price                 |
| takeProfit  | number | No       | Take profit price               |

**Response (success):**
```json
{
  "success": true,
  "orderId": "ord_abc123",
  "tradeId": "trd_def456",
  "symbol": "BTC",
  "side": "BUY",
  "size": 0.01,
  "filledPrice": 97500.0,
  "status": "FILLED",
  "message": "Trade BUY 0.01 BTC submitted"
}
```

**Errors:** `400` — Missing required fields, invalid side, size <= 0, leverage exceeds max · `403` — Emergency stop active · `503` — Execution engine unavailable

**curl:**
```bash
# Market buy
curl -s -X POST http://localhost:3001/api/agent/trade \
  -H "Authorization: Bearer perpstrader-dev-key" \
  -H "Content-Type: application/json" \
  -d '{"symbol":"ETH","side":"BUY","size":0.1,"leverage":3,"stopLoss":3000}'

# Limit sell
curl -s -X POST http://localhost:3001/api/agent/trade \
  -H "Authorization: Bearer perpstrader-dev-key" \
  -H "Content-Type: application/json" \
  -d '{"symbol":"BTC","side":"SELL","size":0.005,"type":"LIMIT","price":100000}'
```

---

#### `POST /close/:positionId` — Close a Position

Closes a specific open position by its ID.

**Path Parameters:**
| Parameter    | Type   | Description              |
|--------------|--------|--------------------------|
| positionId   | string | Position ID to close     |

**Response:**
```json
{
  "success": true,
  "positionId": "pos_abc123",
  "symbol": "BTC",
  "pnl": 125.50,
  "message": "Position pos_abc123 closed"
}
```

**Errors:** `400` — Close failed · `503` — Execution engine unavailable

**curl:**
```bash
curl -s -X POST http://localhost:3001/api/agent/close/pos_abc123 \
  -H "Authorization: Bearer perpstrader-dev-key"
```

---

### Strategy Control

---

#### `GET /strategies` — List All Strategies

Returns all registered strategies with performance metrics.

**Response:**
```json
{
  "strategies": [
    {
      "id": "str_001",
      "name": "BTC Momentum Breakout",
      "type": "AI_PREDICTION",
      "isActive": true,
      "symbols": ["BTC"],
      "performance": {
        "winRate": 0.62,
        "sharpeRatio": 1.8,
        "totalPnL": 2500.0,
        "totalTrades": 48,
        "maxDrawdown": 0.04,
        "profitFactor": 1.6
      },
      "createdAt": "2025-01-10T08:00:00.000Z",
      "updatedAt": "2025-01-15T12:00:00.000Z"
    }
  ],
  "total": 5,
  "activeCount": 3,
  "timestamp": "2025-01-15T12:00:00.000Z"
}
```

**curl:**
```bash
curl -s http://localhost:3001/api/agent/strategies \
  -H "Authorization: Bearer perpstrader-dev-key"
```

---

#### `POST /strategies/activate` — Activate a Strategy

**Request Body:**
```json
{
  "strategyId": "str_001"
}
```

**Response:**
```json
{
  "success": true,
  "strategyId": "str_001",
  "active": true,
  "message": "Strategy str_001 activation signal sent"
}
```

**curl:**
```bash
curl -s -X POST http://localhost:3001/api/agent/strategies/activate \
  -H "Authorization: Bearer perpstrader-dev-key" \
  -H "Content-Type: application/json" \
  -d '{"strategyId":"str_001"}'
```

---

#### `POST /strategies/deactivate` — Deactivate a Strategy

**Request Body:**
```json
{
  "strategyId": "str_001"
}
```

**Response:**
```json
{
  "success": true,
  "strategyId": "str_001",
  "active": false,
  "message": "Strategy str_001 deactivation signal sent"
}
```

**curl:**
```bash
curl -s -X POST http://localhost:3001/api/agent/strategies/deactivate \
  -H "Authorization: Bearer perpstrader-dev-key" \
  -H "Content-Type: application/json" \
  -d '{"strategyId":"str_001"}'
```

---

#### `POST /strategies/create` — Create a New Strategy

Submits a new strategy to the strategy engine via the message bus.

**Request Body:**
```json
{
  "name": "Mean Reversion BTC",
  "description": "Mean reversion strategy for BTC on 4h timeframe",
  "type": "AI_PREDICTION",
  "symbols": ["BTC"],
  "timeframe": "4h",
  "parameters": {
    "lookback": 20,
    "zscoreThreshold": 2.0
  },
  "entryConditions": ["zscore > 2.0", "rsi < 30"],
  "exitConditions": ["zscore < 0.5"],
  "riskParameters": {
    "maxPositionSize": 0.1,
    "stopLossPercent": 2.0
  }
}
```

| Field            | Type     | Required | Description                           |
|------------------|----------|----------|---------------------------------------|
| name             | string   | Yes      | Strategy name                         |
| symbols          | string[] | Yes      | Non-empty array of trading symbols    |
| description      | string   | No       | Strategy description                  |
| type             | string   | No       | Strategy type (default: AI_PREDICTION)|
| timeframe        | string   | No       | Chart timeframe (default: 1h)         |
| parameters       | object   | No       | Strategy parameters                   |
| entryConditions  | string[] | No       | Entry condition rules                 |
| exitConditions   | string[] | No       | Exit condition rules                  |
| riskParameters   | object   | No       | Risk-specific parameters              |

**Response:**
```json
{
  "success": true,
  "strategyId": "str_1705312800000_a1b2c3",
  "message": "Strategy \"Mean Reversion BTC\" creation signal sent"
}
```

**curl:**
```bash
curl -s -X POST http://localhost:3001/api/agent/strategies/create \
  -H "Authorization: Bearer perpstrader-dev-key" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Mean Reversion BTC",
    "symbols": ["BTC"],
    "timeframe": "4h",
    "parameters": {"lookback": 20, "zscoreThreshold": 2.0}
  }'
```

---

#### `GET /evolution` — Evolution Engine Status

Returns the current status of the genetic strategy evolution engine.

**Response:**
```json
{
  "currentGeneration": 12,
  "totalGenerations": 12,
  "populationSize": 50,
  "bestFitness": 2.4,
  "avgFitness": 1.1,
  "topPerformers": [
    {
      "id": "evo_12_001",
      "name": "Mutated Momentum v7",
      "generation": 12,
      "fitness": 2.4,
      "sharpeRatio": 2.4,
      "winRate": 0.68,
      "pnl": 5200.0,
      "mutations": ["crossover_gen11_003", "mutate_threshold_0.05"]
    }
  ],
  "fitnessHistory": [
    {
      "generation": 1,
      "bestFitness": 0.8,
      "avgFitness": 0.3,
      "populationSize": 50,
      "timestamp": "2025-01-14T08:00:00.000Z"
    }
  ],
  "timestamp": "2025-01-15T12:00:00.000Z"
}
```

**curl:**
```bash
curl -s http://localhost:3001/api/agent/evolution \
  -H "Authorization: Bearer perpstrader-dev-key"
```

---

### Risk Management

---

#### `GET /risk` — Current Risk Metrics

Returns a comprehensive risk assessment including drawdown, exposure, circuit breakers, and daily metrics.

**Response:**
```json
{
  "timestamp": "2025-01-15T12:00:00.000Z",
  "drawdown": {
    "current": 0.02,
    "max": 0.10,
    "daily": -150.0
  },
  "exposure": {
    "gross": 15000.0,
    "net": 10000.0,
    "long": 12500.0,
    "short": 2500.0,
    "utilization": 0.6
  },
  "circuitBreakers": [
    {
      "name": "dailyLoss",
      "state": "CLOSED",
      "lastTripTime": null,
      "tripCount": 0,
      "resetTime": null
    }
  ],
  "dailyMetrics": {
    "pnl": -150.0,
    "trades": 8,
    "wins": 5,
    "losses": 3,
    "consecutiveLosses": 1
  },
  "riskScore": 15,
  "riskLevel": "LOW",
  "warnings": []
}
```

**Risk levels:** `LOW` (0-19) | `MEDIUM` (20-39) | `HIGH` (40-69) | `CRITICAL` (70+)

**curl:**
```bash
curl -s http://localhost:3001/api/agent/risk \
  -H "Authorization: Bearer perpstrader-dev-key"
```

---

#### `POST /risk/limits` — Update Risk Limits

Dynamically updates risk configuration parameters at runtime.

**Request Body (partial updates allowed):**
```json
{
  "maxPositionSize": 1000,
  "maxDailyLoss": 5000,
  "maxLeverage": 10,
  "maxDrawdownPercent": 15,
  "dailyLossLimit": 2000,
  "consecutiveLossLimit": 5,
  "maxTradesPerDay": 50
}
```

| Field                | Type   | Description                       |
|----------------------|--------|-----------------------------------|
| maxPositionSize      | number | Max position size in USD          |
| maxDailyLoss         | number | Max daily loss in USD             |
| maxLeverage          | number | Max leverage multiplier           |
| maxDrawdownPercent   | number | Max drawdown % before halt        |
| dailyLossLimit       | number | Daily loss limit in USD           |
| consecutiveLossLimit | number | Consecutive losses before halt    |
| maxTradesPerDay      | number | Max trades per day                |

**Response:**
```json
{
  "success": true,
  "previousLimits": {
    "maxPositionSize": 500,
    "maxDailyLoss": 3000,
    "maxLeverage": 5,
    "maxDrawdownPercent": 10,
    "dailyLossLimit": 1000,
    "consecutiveLossLimit": 3,
    "maxTradesPerDay": 30
  },
  "newLimits": {
    "maxPositionSize": 1000,
    "maxDailyLoss": 5000,
    "maxLeverage": 10,
    "maxDrawdownPercent": 15,
    "dailyLossLimit": 2000,
    "consecutiveLossLimit": 5,
    "maxTradesPerDay": 50
  },
  "message": "Risk limits updated successfully"
}
```

**curl:**
```bash
curl -s -X POST http://localhost:3001/api/agent/risk/limits \
  -H "Authorization: Bearer perpstrader-dev-key" \
  -H "Content-Type: application/json" \
  -d '{"maxLeverage": 10, "maxDailyLoss": 5000}'
```

---

#### `POST /emergency-stop` — Emergency Stop All Trading

**THIS IS THE NUCLEAR OPTION.** Immediately closes all positions, cancels all orders, stops all agents, and halts trading.

This endpoint:
1. Closes all open positions via position recovery
2. Stops the execution engine (cancels pending orders)
3. Publishes an `EMERGENCY_STOP` event to the message bus
4. Updates all agent statuses to STOPPED (persisted to SQLite)

**Response:**
```json
{
  "success": true,
  "message": "Emergency stop executed — all positions closed, orders cancelled",
  "positionsClosed": 3,
  "ordersCancelled": 1,
  "timestamp": "2025-01-15T12:00:00.000Z"
}
```

**curl:**
```bash
curl -s -X POST http://localhost:3001/api/agent/emergency-stop \
  -H "Authorization: Bearer perpstrader-dev-key"
```

---

### Backtest Management

---

#### `POST /backtest/run` — Trigger a Backtest

Queues a backtest job for the research engine to execute.

**Request Body:**
```json
{
  "strategyId": "str_001",
  "strategyName": "BTC Momentum Breakout",
  "strategyType": "AI_PREDICTION",
  "instruments": ["BTC", "ETH"],
  "dateRange": {
    "from": "2024-01-01T00:00:00.000Z",
    "to": "2024-12-31T23:59:59.000Z"
  },
  "initialCapital": 10000,
  "parameters": {
    "lookback": 20,
    "threshold": 0.75
  }
}
```

| Field           | Type     | Required | Description                        |
|-----------------|----------|----------|------------------------------------|
| strategyId      | string   | Yes      | Strategy to backtest               |
| instruments     | string[] | Yes      | Non-empty array of instruments     |
| dateRange.from  | string   | Yes      | Start timestamp (ISO 8601)         |
| dateRange.to    | string   | Yes      | End timestamp (ISO 8601)           |
| strategyName    | string   | No       | Display name                       |
| strategyType    | string   | No       | Strategy type                      |
| initialCapital  | number   | No       | Starting capital (default: 10000)  |
| parameters      | object   | No       | Strategy parameters                |

**Response:**
```json
{
  "success": true,
  "backtestId": "bt_1705312800000_a1b2c3",
  "status": "PENDING",
  "message": "Backtest job bt_1705312800000_a1b2c3 queued",
  "timestamp": "2025-01-15T12:00:00.000Z"
}
```

**curl:**
```bash
curl -s -X POST http://localhost:3001/api/agent/backtest/run \
  -H "Authorization: Bearer perpstrader-dev-key" \
  -H "Content-Type: application/json" \
  -d '{
    "strategyId": "str_001",
    "instruments": ["BTC"],
    "dateRange": {"from": "2024-06-01", "to": "2024-12-31"},
    "initialCapital": 10000
  }'
```

---

#### `GET /backtest/:id/results` — Get Backtest Results

Retrieves results for a specific backtest by ID.

**Response:**
```json
{
  "backtestId": "bt_1705312800000_a1b2c3",
  "strategyId": "str_001",
  "strategyName": "BTC Momentum Breakout",
  "status": "COMPLETED",
  "dateRange": {
    "from": "2024-06-01T00:00:00.000Z",
    "to": "2024-12-31T23:59:59.000Z"
  },
  "instruments": ["BTC"],
  "initialCapital": 10000,
  "finalCapital": 12850.0,
  "totalReturn": 0.285,
  "annualizedReturn": 0.42,
  "sharpeRatio": 1.65,
  "maxDrawdown": 0.08,
  "winRate": 0.58,
  "totalTrades": 42,
  "profitFactor": 1.8,
  "trades": [
    {
      "id": "t_abc123",
      "symbol": "BTC",
      "side": "BUY",
      "size": 0.01,
      "entryPrice": 65000.0,
      "exitPrice": 68000.0,
      "pnl": 30.0,
      "timestamp": "2024-07-15T10:00:00.000Z",
      "strategyId": "str_001"
    }
  ],
  "equityCurve": [
    { "timestamp": "2024-06-01", "value": 10000 },
    { "timestamp": "2024-07-01", "value": 10500 }
  ],
  "createdAt": "2025-01-15T12:00:00.000Z",
  "completedAt": "2025-01-15T12:05:00.000Z"
}
```

**Errors:** `404` — Backtest not found

**curl:**
```bash
curl -s http://localhost:3001/api/agent/backtest/bt_1705312800000_a1b2c3/results \
  -H "Authorization: Bearer perpstrader-dev-key"
```

---

#### `GET /backtest/history` — List Past Backtests

Returns a paginated list of previous backtest runs.

**Query Parameters:**
| Parameter  | Type | Default | Description          |
|------------|------|---------|----------------------|
| limit      | int  | 50      | Max results (1-200)  |

**Response:**
```json
{
  "runs": [
    {
      "id": "bt_1705312800000_a1b2c3",
      "strategyId": "str_001",
      "strategyName": "BTC Momentum Breakout",
      "status": "COMPLETED",
      "instruments": ["BTC"],
      "totalReturn": 0.285,
      "sharpeRatio": 1.65,
      "maxDrawdown": 0.08,
      "winRate": 0.58,
      "totalTrades": 42,
      "createdAt": "2025-01-15T12:00:00.000Z",
      "completedAt": "2025-01-15T12:05:00.000Z"
    }
  ],
  "total": 15,
  "timestamp": "2025-01-15T12:00:00.000Z"
}
```

**curl:**
```bash
curl -s "http://localhost:3001/api/agent/backtest/history?limit=20" \
  -H "Authorization: Bearer perpstrader-dev-key"
```

---

### Historical Data

---

#### `GET /data/candles` — OHLCV Candle Data

Returns candlestick/OHLCV data from the trading database.

**Query Parameters:**
| Parameter  | Type   | Default         | Description                  |
|------------|--------|-----------------|------------------------------|
| instrument | string | required        | Symbol (e.g., "BTC")         |
| timeframe  | string | 1h              | Candle timeframe             |
| from       | string | epoch 0         | Start timestamp (ISO 8601)   |
| to         | string | now             | End timestamp (ISO 8601)     |

**Response:**
```json
{
  "instrument": "BTC",
  "timeframe": "1h",
  "from": "2025-01-14T00:00:00.000Z",
  "to": "2025-01-15T12:00:00.000Z",
  "candles": [
    {
      "timestamp": 1705224000,
      "open": 96000.0,
      "high": 96500.0,
      "low": 95500.0,
      "close": 96200.0,
      "volume": 1234.5
    }
  ],
  "count": 36
}
```

**curl:**
```bash
curl -s "http://localhost:3001/api/agent/data/candles?instrument=BTC&timeframe=1h&from=2025-01-14&to=2025-01-15" \
  -H "Authorization: Bearer perpstrader-dev-key"
```

---

#### `GET /data/trades` — Recent Market Trades

Returns recent market trades for a specific instrument.

**Query Parameters:**
| Parameter  | Type   | Default | Description                  |
|------------|--------|---------|------------------------------|
| instrument | string | required| Symbol (e.g., "BTC")         |
| limit      | int    | 100     | Max trades (1-1000)          |

**Response:**
```json
{
  "instrument": "BTC",
  "trades": [
    {
      "id": "mt_001",
      "timestamp": 1705312800,
      "price": 97500.0,
      "size": 0.05,
      "side": "BUY",
      "symbol": "BTC"
    }
  ],
  "count": 100
}
```

**curl:**
```bash
curl -s "http://localhost:3001/api/agent/data/trades?instrument=BTC&limit=50" \
  -H "Authorization: Bearer perpstrader-dev-key"
```

---

#### `GET /data/funding` — Funding Rate History

Returns funding rate history for perpetual contracts.

**Query Parameters:**
| Parameter  | Type   | Default | Description                  |
|------------|--------|---------|------------------------------|
| instrument | string | required| Symbol (e.g., "BTC")         |
| limit      | int    | 24      | Max rates (1-500)            |

**Response:**
```json
{
  "instrument": "BTC",
  "rates": [
    {
      "id": "fr_001",
      "symbol": "BTC",
      "timestamp": 1705312800,
      "fundingRate": 0.0001,
      "nextFundingTime": 1705316400
    }
  ],
  "count": 24,
  "currentRate": 0.0001,
  "nextFundingTime": 1705316400
}
```

**curl:**
```bash
curl -s "http://localhost:3001/api/agent/data/funding?instrument=BTC&limit=48" \
  -H "Authorization: Bearer perpstrader-dev-key"
```

---

### Order Management

---

#### `GET /orders` — List Open Orders

Returns all currently open orders from the execution engine.

**Response:**
```json
{
  "orders": [
    {
      "id": "ord_abc123",
      "symbol": "BTC",
      "side": "BUY",
      "type": "LIMIT",
      "size": 0.01,
      "price": 95000.0,
      "stopPrice": null,
      "filledSize": 0,
      "status": "OPEN",
      "createdAt": "2025-01-15T10:00:00.000Z",
      "updatedAt": "2025-01-15T10:00:00.000Z"
    }
  ],
  "total": 1,
  "timestamp": "2025-01-15T12:00:00.000Z"
}
```

**curl:**
```bash
curl -s http://localhost:3001/api/agent/orders \
  -H "Authorization: Bearer perpstrader-dev-key"
```

---

#### `POST /orders/cancel` — Cancel an Order

Cancels a specific open order by ID.

**Request Body:**
```json
{
  "orderId": "ord_abc123"
}
```

**Response:**
```json
{
  "success": true,
  "orderId": "ord_abc123",
  "message": "Order ord_abc123 cancelled",
  "previousStatus": "OPEN"
}
```

**curl:**
```bash
curl -s -X POST http://localhost:3001/api/agent/orders/cancel \
  -H "Authorization: Bearer perpstrader-dev-key" \
  -H "Content-Type: application/json" \
  -d '{"orderId": "ord_abc123"}'
```

---

#### `POST /orders/cancel-all` — Cancel All Open Orders

Cancels all open orders across all instruments.

**Response:**
```json
{
  "success": true,
  "cancelledCount": 3,
  "message": "3 open orders cancelled",
  "cancelledOrders": ["ord_abc123", "ord_def456", "ord_ghi789"]
}
```

**curl:**
```bash
curl -s -X POST http://localhost:3001/api/agent/orders/cancel-all \
  -H "Authorization: Bearer perpstrader-dev-key"
```

---

### Log Streaming

---

#### `GET /logs` — Query Agent Logs

Returns agent execution logs, optionally filtered by agent and log level.

**Query Parameters:**
| Parameter  | Type   | Default | Description                       |
|------------|--------|---------|-----------------------------------|
| agent      | string | —       | Filter by agent name              |
| level      | string | —       | Filter: info, warn, error         |
| limit      | int    | 100     | Max log entries (1-1000)          |

**Response:**
```json
{
  "logs": [
    {
      "timestamp": "2025-01-15T11:59:00.000Z",
      "level": "info",
      "agent": "execution",
      "message": "Cycle for BTC — success: true",
      "meta": {
        "symbol": "BTC",
        "riskScore": 12
      }
    },
    {
      "timestamp": "2025-01-15T11:58:00.000Z",
      "level": "error",
      "agent": "execution",
      "message": "Failed cycle for ETH (risk: 82)",
      "meta": {
        "symbol": "ETH",
        "riskScore": 82
      }
    }
  ],
  "total": 45,
  "limit": 100,
  "agent": "execution",
  "level": null,
  "timestamp": "2025-01-15T12:00:00.000Z"
}
```

**curl:**
```bash
# All logs
curl -s http://localhost:3001/api/agent/logs \
  -H "Authorization: Bearer perpstrader-dev-key"

# Error logs for execution agent
curl -s "http://localhost:3001/api/agent/logs?agent=execution&level=error&limit=50" \
  -H "Authorization: Bearer perpstrader-dev-key"
```

---

### Webhook Management

---

#### `POST /webhooks` — Register a Webhook

Registers a URL to receive real-time event notifications via HTTP POST.

**Request Body:**
```json
{
  "url": "https://your-server.com/webhooks/perpstrader",
  "events": ["trade", "signal", "risk_alert"],
  "secret": "whsec_your_signing_secret",
  "description": "Hermes notification endpoint"
}
```

| Field       | Type     | Required | Description                                        |
|-------------|----------|----------|----------------------------------------------------|
| url         | string   | Yes      | Valid HTTPS URL to receive events                  |
| events      | string[] | Yes      | Non-empty array of event types                     |
| secret      | string   | No       | Signing secret for payload verification            |
| description | string   | No       | Human-readable description                         |

**Valid events:** `trade` | `signal` | `risk_alert` | `agent_status` | `backtest_complete` | `position_change`

**Response:**
```json
{
  "success": true,
  "webhook": {
    "id": "wh_1705312800000_a1b2c3",
    "url": "https://your-server.com/webhooks/perpstrader",
    "events": ["trade", "signal", "risk_alert"],
    "secret": "whsec_your_signing_secret",
    "active": true,
    "createdAt": "2025-01-15T12:00:00.000Z",
    "description": "Hermes notification endpoint"
  },
  "message": "Webhook wh_1705312800000_a1b2c3 registered"
}
```

**curl:**
```bash
curl -s -X POST http://localhost:3001/api/agent/webhooks \
  -H "Authorization: Bearer perpstrader-dev-key" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-server.com/hooks/perps",
    "events": ["trade", "risk_alert", "emergency_stop"],
    "secret": "my_secret_key"
  }'
```

---

#### `GET /webhooks` — List Active Webhooks

**Response:**
```json
{
  "webhooks": [
    {
      "id": "wh_1705312800000_a1b2c3",
      "url": "https://your-server.com/webhooks/perpstrader",
      "events": ["trade", "signal", "risk_alert"],
      "active": true,
      "createdAt": "2025-01-15T12:00:00.000Z",
      "description": "Hermes notification endpoint"
    }
  ],
  "total": 1,
  "timestamp": "2025-01-15T12:00:00.000Z"
}
```

**curl:**
```bash
curl -s http://localhost:3001/api/agent/webhooks \
  -H "Authorization: Bearer perpstrader-dev-key"
```

---

#### `DELETE /webhooks/:id` — Remove a Webhook

Deactivates a webhook by ID.

**Response:**
```json
{
  "success": true,
  "webhookId": "wh_1705312800000_a1b2c3",
  "message": "Webhook wh_1705312800000_a1b2c3 removed"
}
```

**Errors:** `404` — Webhook not found

**curl:**
```bash
curl -s -X DELETE http://localhost:3001/api/agent/webhooks/wh_1705312800000_a1b2c3 \
  -H "Authorization: Bearer perpstrader-dev-key"
```

---

## WebSocket Events

The dashboard server exposes a Socket.IO server for real-time event streaming. Connect to the default namespace to receive broadcasts.

**Connection:** `ws://localhost:3001`

### Connection Lifecycle

On connect, the server emits:
- `cycle_metrics` — Current cycle metrics snapshot
- `message_bus_status` — `{ connected: boolean }`

### Event Reference

#### News Events

| Event                  | Description                              |
|------------------------|------------------------------------------|
| `news_update`          | New articles from polling fallback       |
| `news_clustered`       | News clustering completed                |
| `news_hot_clusters`    | Updated hot cluster rankings             |
| `news_categorized`     | New articles categorized                 |
| `anomaly_detected`     | News anomaly alert                       |
| `prediction_generated` | News heat prediction generated           |
| `cross_category_linked`| Cross-category news link found           |
| `entity_trending`      | Entity trending alert                    |
| `user_engagement`      | User engagement metrics update           |
| `quality_metric`       | News quality metrics update              |

#### Trading Cycle Events

| Event              | Description                         |
|--------------------|-------------------------------------|
| `cycle_start`      | Trading cycle started               |
| `cycle_complete`   | Trading cycle completed             |
| `cycle_error`      | Trading cycle failed with error     |
| `cycle_update`     | Cycle step progress update          |

#### Execution Events

| Event              | Description                         |
|--------------------|-------------------------------------|
| `execution_filled` | Order filled                        |
| `execution_failed` | Order failed                        |
| `position_opened`  | New position opened                 |
| `position_closed`  | Position closed                     |

#### Risk Events

| Event                    | Description                         |
|--------------------------|-------------------------------------|
| `circuit_breaker_open`   | Circuit breaker triggered           |
| `circuit_breaker_closed` | Circuit breaker reset               |

#### pump.fun Events

| Event                     | Description                         |
|---------------------------|-------------------------------------|
| `pumpfun_cycle_start`     | pump.fun scan cycle started         |
| `pumpfun_cycle_complete`  | pump.fun scan cycle completed       |
| `pumpfun_high_confidence` | High-confidence token discovered    |

#### Research Events

| Event                          | Description                         |
|--------------------------------|-------------------------------------|
| `research:idea`                | Strategy idea generated             |
| `research:backtest:start`      | Backtest started                    |
| `research:backtest:progress`   | Backtest progress update            |
| `research:backtest:complete`   | Backtest completed                  |
| `research:generation`          | New evolution generation            |
| `research:regime`              | Market regime detected              |
| `research:leaderboard:update`  | Strategy leaderboard updated        |

#### Safekeeping Events

| Event                             | Description                         |
|-----------------------------------|-------------------------------------|
| `safekeeping:cycle:start`        | Safekeeping cycle started           |
| `safekeeping:cycle:complete`     | Safekeeping cycle completed         |
| `safekeeping:cycle:stop`         | Safekeeping cycle stopped           |
| `safekeeping:cycle:error`        | Safekeeping cycle error             |
| `safekeeping:execution:submit`   | Safekeeping trade submitted         |
| `safekeeping:execution:complete` | Safekeeping trade completed         |
| `safekeeping:position:opened`    | Safekeeping position opened         |
| `safekeeping:position:closed`    | Safekeeping position closed         |
| `safekeeping:emergency:halt`     | Safekeeping emergency halt          |

### Example: Socket.IO Client (JavaScript)

```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3001');

socket.on('connect', () => {
  console.log('Connected to PerpsTrader dashboard');
});

socket.on('cycle_complete', (data) => {
  console.log('Cycle completed:', data);
});

socket.on('execution_filled', (data) => {
  console.log('Trade filled:', data);
});

socket.on('risk_alert', (data) => {
  console.warn('Risk alert:', data);
});

socket.on('disconnect', () => {
  console.log('Disconnected');
});
```

---

## Error Codes

| HTTP Status | Meaning                          | Common Causes                                    |
|-------------|----------------------------------|--------------------------------------------------|
| 400         | Bad Request                      | Missing/invalid fields, validation failure       |
| 401         | Unauthorized                     | Missing or malformed Authorization header        |
| 403         | Forbidden                        | Invalid API key, emergency stop active           |
| 404         | Not Found                        | Backtest ID or webhook ID not found              |
| 409         | Conflict                        | Agent already running/stopped                    |
| 429         | Too Many Requests                | Rate limit exceeded (100 req/15min)              |
| 500         | Internal Server Error            | Unexpected server error                          |
| 503         | Service Unavailable              | Execution engine not loaded                      |

### Standard Error Response Format

```json
{
  "error": "Human-readable error message",
  "details": "Optional additional context",
  "timestamp": "2025-01-15T12:00:00.000Z"
}
```

---

## Troubleshooting

### "Execution engine not available" (503)

The execution engine module failed to load. Check:
- The execution engine is properly built and the `.js` files exist
- Environment variables for Hyperliquid API keys are set
- Run `npm run build` if you recently changed source files

### "Database not available" (503)

The SQLite database could not be opened. Check:
- The database path in config (default: `./data/trading.db`)
- File permissions on the data directory
- The database file exists (run the migration if first time)

### Empty responses for data endpoints

Some endpoints return empty arrays instead of errors when data is unavailable:
- `/positions` returns `{ positions: [], total: 0 }` if execution engine is not loaded
- `/news` returns `{ articles: [], total: 0 }` if news store has no data
- `/signals` returns `{ signals: [], total: 0 }` if no traces have signals

This is by design — agents should treat empty results as "no data yet" rather than errors.

### Emergency stop doesn't close positions

The emergency stop attempts to close positions but may fail if:
- The execution engine is not loaded (503)
- Network connectivity to Hyperliquid is down
- Positions are in a state that prevents closing

Check `/logs` after an emergency stop for details on any failures.

### WebSocket not receiving events

- Ensure you're connecting to the correct port (default: 3001)
- Socket.IO uses WebSocket transport with fallbacks — make sure your client supports it
- Redis message bus must be connected for most events (check `/status` for `messageBus.connected`)
- Some events only fire when the corresponding agent is running

### Rate limit issues

- Default: 100 requests per 15 minutes per IP
- Monitor `RateLimit-Remaining` header in responses
- Batch multiple queries when possible (e.g., get `/status` which includes agent info instead of separate `/agents` call)
- For high-frequency use, consider increasing the limit in `auth-middleware.ts`
