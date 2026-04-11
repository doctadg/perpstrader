# Hermes Integration Guide for PerpsTrader

> How to control the PerpsTrader trading floor from the Hermes agent platform.

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Configuration](#configuration)
4. [API Client Setup](#api-client-setup)
5. [Querying the Trading Floor](#querying-the-trading-floor)
   - [System Status](#system-status)
   - [Positions & Portfolio](#positions--portfolio)
   - [News & Intelligence](#news--intelligence)
   - [Predictions](#predictions)
   - [Risk Assessment](#risk-assessment)
   - [Agent Logs](#agent-logs)
6. [Controlling Agents](#controlling-agents)
   - [Start/Stop Agents](#startstop-agents)
   - [Trigger Trading Cycles](#trigger-trading-cycles)
7. [Strategy Management](#strategy-management)
   - [List Strategies](#list-strategies)
   - [Create a Strategy](#create-a-strategy)
   - [Activate/Deactivate Strategies](#activatedeactivate-strategies)
8. [Backtesting](#backtesting)
   - [Trigger a Backtest](#trigger-a-backtest)
   - [Retrieve Results](#retrieve-results)
   - [Review History](#review-history)
9. [Trade Execution](#trade-execution)
   - [Submit a Trade](#submit-a-trade)
   - [Close a Position](#close-a-position)
   - [Order Management](#order-management)
10. [Risk Management](#risk-management)
    - [Update Risk Limits](#update-risk-limits)
    - [Emergency Stop](#emergency-stop)
11. [WebSocket Event Streaming](#websocket-event-streaming)
12. [Webhook Integration](#webhook-integration)
13. [Hermes Skill Reference](#hermes-skill-reference)
14. [Common Workflows](#common-workflows)
15. [Error Handling Best Practices](#error-handling-best-practices)

---

## Overview

PerpsTrader exposes a comprehensive REST API at `/api/agent/*` (port 3001) that allows Hermes to fully control the trading floor. This guide covers all the operations Hermes can perform, with practical examples.

**Architecture:**

```
Hermes Agent
    |
    | HTTP REST + Bearer token
    v
PerpsTrader Dashboard (port 3001)
    ├── /api/agent/status       — System health
    ├── /api/agent/agents       — Agent control
    ├── /api/agent/positions    — Portfolio data
    ├── /api/agent/trade        — Trade execution
    ├── /api/agent/strategies   — Strategy management
    ├── /api/agent/backtest/*   — Backtesting
    ├── /api/agent/risk         — Risk management
    ├── /api/agent/emergency-stop — Emergency halt
    └── /api/agent/webhooks     — Event notifications
```

---

## Prerequisites

1. PerpsTrader is running with the dashboard server on port 3001
2. `AGENT_API_KEY` environment variable is set (or accept the default `perpstrader-dev-key` for development)
3. Network access from the Hermes runtime to the PerpsTrader server
4. (Optional) Redis running for WebSocket event streaming

---

## Configuration

Set the following in Hermes configuration:

```yaml
# Hermes config
skills:
  perpstrader:
    base_url: "http://localhost:3001/api/agent"
    api_key: "${PERPSTRADER_API_KEY}"   # Bearer token
    timeout_seconds: 30
```

Environment variable:
```bash
PERPSTRADER_API_KEY=your-secure-key-here
```

---

## API Client Setup

### Using fetch (Node.js / Hermes runtime)

```javascript
const PERPSTRADER_URL = 'http://localhost:3001/api/agent';
const API_KEY = process.env.PERPSTRADER_API_KEY;

async function perpsApi(method, path, body = null) {
  const opts = {
    method,
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    timeout: 30000,
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${PERPSTRADER_URL}${path}`, opts);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(`PerpsTrader API ${res.status}: ${data.error || JSON.stringify(data)}`);
  }
  return data;
}

// Convenience methods
const api = {
  get:    (path) => perpsApi('GET', path),
  post:   (path, body) => perpsApi('POST', path, body),
  delete: (path) => perpsApi('DELETE', path),
};
```

### Using curl (from shell)

Set an alias for convenience:
```bash
export PERPS_KEY="perpstrader-dev-key"
perps() {
  curl -s -H "Authorization: Bearer $PERPS_KEY" -H "Content-Type: application/json" "$@"
}
```

---

## Querying the Trading Floor

### System Status

Get the overall health of the trading floor. Call this first to understand the current state before making any decisions.

```javascript
const status = await api.get('/status');

// Check health
if (status.health === 'DEGRADED') {
  console.warn('Trading floor is DEGRADED. Check circuit breakers and agents.');
}

// Check individual agents
for (const agent of status.agents) {
  console.log(`${agent.name}: ${agent.status} (cycles: ${agent.cyclesCompleted})`);
}

// Check infrastructure
if (!status.messageBus.connected) {
  console.error('Message bus disconnected — real-time events not flowing');
}
```

**Shell:**
```bash
perps http://localhost:3001/api/agent/status | jq '.health, .agents[].name, .agents[].status'
```

### Positions & Portfolio

Query current open positions and overall portfolio health.

```javascript
// Get open positions
const positions = await api.get('/positions');
for (const pos of positions.positions) {
  console.log(`${pos.side} ${pos.size} ${pos.symbol} @ ${pos.entryPrice} (PnL: ${pos.unrealizedPnL})`);
}

// Get portfolio summary
const portfolio = await api.get('/portfolio');
console.log(`Balance: $${portfolio.availableBalance} | Exposure: $${portfolio.exposure.gross}`);
console.log(`Daily PnL: $${portfolio.dailyPnL} | Unrealized: $${portfolio.unrealizedPnL}`);
```

**Shell:**
```bash
# Positions table
perps http://localhost:3001/api/agent/positions | \
  jq -r '.positions[] | "\(.side) \(.size) \(.symbol) | entry: \(.entryPrice) | PnL: \(.unrealizedPnL)"'

# Portfolio summary
perps http://localhost:3001/api/agent/portfolio | jq '{balance: .availableBalance, daily_pnl: .dailyPnL, exposure: .exposure.gross}'
```

### News & Intelligence

Get the latest news with sentiment, and the market heatmap for understanding what's driving markets.

```javascript
// Latest news (positive sentiment only)
const news = await api.get('/news?sentiment=POSITIVE&limit=10');
for (const article of news.articles) {
  console.log(`[${article.sentiment}] ${article.title} — ${article.source}`);
}

// Market heatmap — what's hot right now
const heatmap = await api.get('/news/heatmap?hours=6&limit=5');
for (const cluster of heatmap.clusters) {
  console.log(`[${cluster.trend}] ${cluster.title} (heat: ${cluster.heatScore})`);
  console.log(`  Assets: ${cluster.affectedAssets.join(', ')}`);
}

// Recent trading signals
const signals = await api.get('/signals');
for (const sig of signals.signals) {
  console.log(`Signal: ${sig.action} ${sig.symbol} (confidence: ${sig.confidence})`);
}
```

### Predictions

Query current Polymarket prediction market positions.

```javascript
const predictions = await api.get('/predictions');

console.log(`Open prediction positions: ${predictions.totalPositions}`);
console.log(`Unrealized PnL: $${predictions.unrealizedPnL}`);

for (const pos of predictions.positions) {
  console.log(`${pos.outcome} ${pos.title} — size: $${pos.size}, PnL: $${pos.unrealizedPnL}`);
}
```

### Risk Assessment

Check the current risk score and any warnings before making trading decisions.

```javascript
const risk = await api.get('/risk');

console.log(`Risk Level: ${risk.riskLevel} (score: ${risk.riskScore})`);
console.log(`Drawdown: ${risk.drawdown.daily > 0 ? '+' : ''}$${risk.drawdown.daily} today`);
console.log(`Exposure: $${risk.exposure.gross} gross, $${risk.exposure.net} net`);
console.log(`Win/Loss today: ${risk.dailyMetrics.wins}W / ${risk.dailyMetrics.losses}L`);

// Check for warnings
if (risk.warnings.length > 0) {
  for (const w of risk.warnings) {
    console.warn(`RISK WARNING: ${w}`);
  }
}

// Check circuit breakers
for (const cb of risk.circuitBreakers) {
  if (cb.state === 'OPEN') {
    console.error(`CIRCUIT BREAKER OPEN: ${cb.name}`);
  }
}
```

### Agent Logs

Query logs to understand recent agent behavior.

```javascript
// Recent error logs
const errorLogs = await api.get('/logs?level=error&limit=20');
for (const log of errorLogs.logs) {
  console.error(`[${log.agent}] ${log.message}`);
}

// Specific agent logs
const newsLogs = await api.get('/logs?agent=news&limit=50');
```

---

## Controlling Agents

### Start/Stop Agents

The six agent modules can be individually started and stopped:

| Agent        | Description                                          |
|--------------|------------------------------------------------------|
| `news`       | News ingestion, clustering, and sentiment analysis   |
| `execution`  | Trade execution engine for Hyperliquid perpetuals    |
| `prediction` | Prediction market analysis (Polymarket)              |
| `pumpfun`    | pump.fun token discovery and analysis                |
| `safekeeping`| Automated yield farming and DeFi safekeeping         |
| `research`   | Strategy research, backtesting, genetic evolution    |

```javascript
// Start the news agent
const result = await api.post('/start/news', { reason: 'Monitoring breaking news' });
console.log(result.message);  // "Agent news start signal sent"

// Stop the execution agent
const result = await api.post('/stop/execution', { reason: 'Pausing for analysis' });
console.log(result.message);  // "Agent execution stop signal sent"

// Check all agents first
const agents = await api.get('/agents');
for (const agent of agents.agents) {
  if (agent.status === 'STOPPED' && agent.name !== 'pumpfun') {
    await api.post(`/start/${agent.name}`, { reason: 'Auto-start via Hermes' });
  }
}
```

**Shell:**
```bash
# Start news agent
perps -X POST http://localhost:3001/api/agent/start/news -d '{"reason":"Evening session"}'

# Stop execution agent
perps -X POST http://localhost:3001/api/agent/stop/execution -d '{"reason":"Risk pause"}'

# List all agents
perps http://localhost:3001/api/agent/agents | jq '.agents[] | {name, status, enabled}'
```

### Trigger Trading Cycles

Manually kick off a trading cycle, optionally targeting a specific symbol.

```javascript
// Trigger cycle for all symbols
const result = await api.post('/cycle/trigger', {
  reason: 'Scheduled 4-hour review'
});

// Trigger cycle for specific symbol (force even if risk is elevated)
const result = await api.post('/cycle/trigger', {
  symbol: 'BTC',
  force: true,
  reason: 'Strong signal detected on BTC'
});

console.log(`Cycle ${result.cycleId} triggered`);
```

---

## Strategy Management

### List Strategies

```javascript
const strategies = await api.get('/strategies');

console.log(`${strategies.activeCount} active strategies out of ${strategies.total} total`);

for (const s of strategies.strategies) {
  if (s.isActive) {
    console.log(`${s.name} — Sharpe: ${s.performance.sharpeRatio}, Win Rate: ${(s.performance.winRate * 100).toFixed(1)}%`);
  }
}
```

### Create a Strategy

Submit a new strategy to be evaluated and potentially traded.

```javascript
const result = await api.post('/strategies/create', {
  name: 'BTC RSI Oversold Bounce',
  description: 'Buy BTC when RSI drops below 25 on 4h chart with volume confirmation',
  type: 'AI_PREDICTION',
  symbols: ['BTC'],
  timeframe: '4h',
  parameters: {
    rsiPeriod: 14,
    oversoldThreshold: 25,
    volumeMultiplier: 1.5,
  },
  entryConditions: [
    'RSI(14) < 25',
    'Volume > 1.5x average',
    'No circuit breaker open',
  ],
  exitConditions: [
    'RSI(14) > 50',
    'Stop loss hit',
  ],
  riskParameters: {
    maxPositionSize: 0.05,
    stopLossPercent: 3.0,
  },
});

console.log(`Strategy created: ${result.strategyId}`);

// Wait for evaluation, then activate
await api.post('/strategies/activate', { strategyId: result.strategyId });
```

### Activate/Deactivate Strategies

```javascript
// Activate
await api.post('/strategies/activate', { strategyId: 'str_abc123' });

// Deactivate
await api.post('/strategies/deactivate', { strategyId: 'str_abc123' });

// Practical: deactivate all non-performing strategies
const strategies = await api.get('/strategies');
for (const s of strategies.strategies) {
  if (s.isActive && s.performance.sharpeRatio < 1.0) {
    await api.post('/strategies/deactivate', { strategyId: s.id });
    console.log(`Deactivated ${s.name} (Sharpe: ${s.performance.sharpeRatio})`);
  }
}
```

---

## Backtesting

### Trigger a Backtest

Queue a backtest for a strategy before deploying it live.

```javascript
const result = await api.post('/backtest/run', {
  strategyId: 'str_abc123',
  strategyName: 'BTC RSI Oversold Bounce',
  instruments: ['BTC'],
  dateRange: {
    from: '2024-01-01T00:00:00.000Z',
    to: '2024-12-31T23:59:59.000Z',
  },
  initialCapital: 10000,
  parameters: {
    rsiPeriod: 14,
    oversoldThreshold: 25,
  },
});

console.log(`Backtest queued: ${result.backtestId} (status: ${result.status})`);
```

### Retrieve Results

Poll for results (backtests run asynchronously):

```javascript
async function waitForBacktest(backtestId, maxWaitMs = 300000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const result = await api.get(`/backtest/${backtestId}/results`);

    if (result.status === 'COMPLETED') {
      return result;
    }
    if (result.status === 'FAILED') {
      throw new Error(`Backtest failed: ${result.error}`);
    }

    // Still PENDING or RUNNING — wait and retry
    await new Promise(r => setTimeout(r, 5000));
  }
  throw new Error(`Backtest timed out after ${maxWaitMs}ms`);
}

// Usage
const results = await waitForBacktest('bt_abc123');
console.log(`Return: ${(results.totalReturn * 100).toFixed(1)}%`);
console.log(`Sharpe: ${results.sharpeRatio}`);
console.log(`Max DD: ${(results.maxDrawdown * 100).toFixed(1)}%`);
console.log(`Win Rate: ${(results.winRate * 100).toFixed(1)}%`);

// Only activate if it passes quality gates
if (results.sharpeRatio > 1.5 && results.winRate > 0.55 && results.maxDrawdown < 0.15) {
  await api.post('/strategies/activate', { strategyId: results.strategyId });
  console.log('Strategy activated — backtest passed quality gates');
} else {
  console.log('Strategy NOT activated — backtest did not meet thresholds');
}
```

### Review History

```javascript
const history = await api.get('/backtest/history?limit=10');

for (const run of history.runs) {
  console.log(`${run.strategyName}: ${run.status} | Return: ${(run.totalReturn * 100).toFixed(1)}% | Sharpe: ${run.sharpeRatio}`);
}
```

---

## Trade Execution

### Submit a Trade

**Always check risk status and emergency stop state before trading.**

```javascript
// Pre-flight checks
const risk = await api.get('/risk');
if (risk.riskLevel === 'CRITICAL') {
  console.error('CRITICAL risk level — aborting trade');
  return;
}
if (risk.circuitBreakers.some(cb => cb.state === 'OPEN')) {
  console.error('Circuit breaker open — aborting trade');
  return;
}

// Submit the trade
const result = await api.post('/trade', {
  symbol: 'BTC',
  side: 'BUY',
  size: 0.01,
  type: 'MARKET',
  leverage: 5,
  stopLoss: 90000,      // Always set a stop loss
  takeProfit: 105000,   // Optional take profit
});

if (result.success) {
  console.log(`Trade submitted: ${result.side} ${result.size} ${result.symbol} @ ${result.filledPrice}`);
  console.log(`Order ID: ${result.orderId}`);
} else {
  console.error(`Trade rejected: ${result.message}`);
}
```

### Close a Position

```javascript
// First, find the position to close
const positions = await api.get('/positions');
const btcPosition = positions.positions.find(p => p.symbol === 'BTC' && p.side === 'LONG');

if (btcPosition) {
  const result = await api.post(`/close/${btcPosition.id}`);
  console.log(`Position closed: PnL $${result.pnl}`);
}
```

### Order Management

```javascript
// List open orders
const orders = await api.get('/orders');
console.log(`${orders.total} open orders`);

// Cancel a specific order
await api.post('/orders/cancel', { orderId: 'ord_abc123' });

// Cancel all orders
const cancelResult = await api.post('/orders/cancel-all');
console.log(`Cancelled ${cancelResult.cancelledCount} orders`);
```

---

## Risk Management

### Update Risk Limits

Dynamically adjust risk parameters at runtime.

```javascript
// Tighten risk during volatile periods
const result = await api.post('/risk/limits', {
  maxLeverage: 3,          // Reduce from 10 to 3
  maxDailyLoss: 1000,      // Reduce daily loss limit
  consecutiveLossLimit: 3, // Fewer consecutive losses before halt
});

console.log('Risk limits updated:');
for (const [key, newVal] of Object.entries(result.newLimits)) {
  const oldVal = result.previousLimits[key];
  if (oldVal !== newVal) {
    console.log(`  ${key}: ${oldVal} → ${newVal}`);
  }
}

// Loosen risk when conditions improve
await api.post('/risk/limits', {
  maxLeverage: 10,
  maxDailyLoss: 5000,
});
```

### Emergency Stop

**The nuclear option.** Immediately closes all positions, cancels all orders, and stops all agents.

```javascript
// Hermes should only call this in extreme circumstances
const result = await api.post('/emergency-stop');

console.log(`EMERGENCY STOP EXECUTED`);
console.log(`  Positions closed: ${result.positionsClosed}`);
console.log(`  Orders cancelled: ${result.ordersCancelled}`);

// Verify all agents are stopped
const status = await api.get('/status');
for (const agent of status.agents) {
  console.log(`  ${agent.name}: ${agent.status}`);
}
```

**Shell (one-liner for emergencies):**
```bash
perps -X POST http://localhost:3001/api/agent/emergency-stop | jq '{success, positionsClosed, ordersCancelled}'
```

---

## WebSocket Event Streaming

For real-time monitoring, connect to the Socket.IO server and listen for events.

```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3001');

// Critical events Hermes should monitor
socket.on('execution_filled', (data) => {
  console.log(`TRADE FILLED: ${data.side} ${data.symbol} @ ${data.price}`);
});

socket.on('cycle_error', (data) => {
  console.error(`CYCLE ERROR: ${data.error}`);
});

socket.on('circuit_breaker_open', (data) => {
  console.error(`CIRCUIT BREAKER OPENED: ${data.name} — consider emergency stop`);
});

socket.on('risk_alert', (data) => {
  console.warn(`RISK ALERT: ${data.message}`);
});

socket.on('emergency_stop', (data) => {
  console.error(`EMERGENCY STOP triggered: ${data.message}`);
});

socket.on('research:backtest:complete', (data) => {
  console.log(`BACKTEST COMPLETE: ${data.backtestId} — Sharpe: ${data.sharpeRatio}`);
});

socket.on('position_closed', (data) => {
  console.log(`POSITION CLOSED: ${data.symbol} — PnL: $${data.pnl}`);
});
```

---

## Webhook Integration

Register webhooks so PerpsTrader pushes events to Hermes instead of requiring polling.

```javascript
// Register Hermes as a webhook receiver
const result = await api.post('/webhooks', {
  url: 'https://hermes.example.com/webhooks/perpstrader',
  events: ['trade', 'risk_alert', 'agent_status', 'backtest_complete', 'position_change'],
  secret: process.env.WEBHOOK_SECRET,
  description: 'Hermes agent event receiver',
});

console.log(`Webhook registered: ${result.webhook.id}`);

// List active webhooks
const webhooks = await api.get('/webhooks');
console.log(`${webhooks.total} active webhooks`);

// Remove a webhook
await api.delete(`/webhooks/${webhookId}`);
```

---

## Hermes Skill Reference

The Hermes skill wraps the PerpsTrader API into a structured interface. Here's the skill definition:

### Skill: `perpstrader`

**Capabilities:**

| Capability             | Method         | Endpoint                    |
|------------------------|----------------|-----------------------------|
| `get_status`           | GET            | `/status`                   |
| `get_agents`           | GET            | `/agents`                   |
| `start_agent`          | POST           | `/start/{agent}`            |
| `stop_agent`           | POST           | `/stop/{agent}`             |
| `trigger_cycle`        | POST           | `/cycle/trigger`            |
| `get_positions`        | GET            | `/positions`                |
| `get_portfolio`        | GET            | `/portfolio`                |
| `submit_trade`         | POST           | `/trade`                    |
| `close_position`       | POST           | `/close/{positionId}`       |
| `get_orders`           | GET            | `/orders`                   |
| `cancel_order`         | POST           | `/orders/cancel`            |
| `cancel_all_orders`    | POST           | `/orders/cancel-all`        |
| `get_news`             | GET            | `/news`                     |
| `get_heatmap`          | GET            | `/news/heatmap`             |
| `get_signals`          | GET            | `/signals`                  |
| `get_predictions`      | GET            | `/predictions`              |
| `get_strategies`       | GET            | `/strategies`               |
| `create_strategy`      | POST           | `/strategies/create`        |
| `activate_strategy`    | POST           | `/strategies/activate`      |
| `deactivate_strategy`  | POST           | `/strategies/deactivate`    |
| `get_evolution`        | GET            | `/evolution`                |
| `get_risk`             | GET            | `/risk`                     |
| `update_risk_limits`   | POST           | `/risk/limits`              |
| `emergency_stop`       | POST           | `/emergency-stop`           |
| `run_backtest`         | POST           | `/backtest/run`             |
| `get_backtest_results` | GET            | `/backtest/{id}/results`    |
| `get_backtest_history` | GET            | `/backtest/history`         |
| `get_candles`          | GET            | `/data/candles`             |
| `get_market_trades`    | GET            | `/data/trades`              |
| `get_funding_rates`    | GET            | `/data/funding`             |
| `get_logs`             | GET            | `/logs`                     |
| `register_webhook`     | POST           | `/webhooks`                 |
| `delete_webhook`       | DELETE         | `/webhooks/{id}`            |
| `list_webhooks`        | GET            | `/webhooks`                 |

### Skill YAML (for Hermes configuration)

```yaml
skills:
  - name: perpstrader
    description: "Control the PerpsTrader autonomous trading floor"
    base_url: "http://localhost:3001/api/agent"
    auth:
      type: bearer
      token_env: PERPSTRADER_API_KEY
    tools:
      - name: get_status
        description: "Get trading floor health and agent status"
        method: GET
        path: /status

      - name: get_positions
        description: "Get all open perpetual positions"
        method: GET
        path: /positions

      - name: get_portfolio
        description: "Get portfolio summary with PnL and exposure"
        method: GET
        path: /portfolio

      - name: get_risk
        description: "Get current risk metrics and circuit breaker status"
        method: GET
        path: /risk

      - name: submit_trade
        description: "Submit a trade order (requires symbol, side, size)"
        method: POST
        path: /trade
        params:
          - name: symbol
            type: string
            required: true
          - name: side
            type: string
            required: true
            enum: [BUY, SELL]
          - name: size
            type: number
            required: true
          - name: leverage
            type: number
          - name: stopLoss
            type: number
          - name: takeProfit
            type: number

      - name: start_agent
        description: "Start a trading agent (news, execution, prediction, pumpfun, safekeeping, research)"
        method: POST
        path: /start/{agent}
        params:
          - name: agent
            type: string
            required: true
            enum: [news, execution, prediction, pumpfun, safekeeping, research]

      - name: stop_agent
        description: "Stop a trading agent"
        method: POST
        path: /stop/{agent}
        params:
          - name: agent
            type: string
            required: true
            enum: [news, execution, prediction, pumpfun, safekeeping, research]

      - name: trigger_cycle
        description: "Manually trigger a trading cycle"
        method: POST
        path: /cycle/trigger
        params:
          - name: symbol
            type: string
          - name: force
            type: boolean

      - name: emergency_stop
        description: "EMERGENCY: Close all positions, cancel all orders, stop all agents"
        method: POST
        path: /emergency-stop

      - name: get_news
        description: "Get latest news with sentiment analysis"
        method: GET
        path: /news
        params:
          - name: limit
            type: integer
          - name: sentiment
            type: string
            enum: [POSITIVE, NEGATIVE, NEUTRAL]
          - name: category
            type: string

      - name: get_heatmap
        description: "Get market news heatmap with hot topics"
        method: GET
        path: /news/heatmap
        params:
          - name: hours
            type: integer
          - name: category
            type: string

      - name: get_predictions
        description: "Get prediction market positions and signals"
        method: GET
        path: /predictions

      - name: get_signals
        description: "Get recent trading signals"
        method: GET
        path: /signals

      - name: get_strategies
        description: "List all strategies with performance metrics"
        method: GET
        path: /strategies

      - name: create_strategy
        description: "Submit a new trading strategy"
        method: POST
        path: /strategies/create
        params:
          - name: name
            type: string
            required: true
          - name: symbols
            type: array
            required: true
          - name: timeframe
            type: string
          - name: parameters
            type: object

      - name: activate_strategy
        description: "Activate a strategy for live trading"
        method: POST
        path: /strategies/activate
        params:
          - name: strategyId
            type: string
            required: true

      - name: deactivate_strategy
        description: "Deactivate a strategy"
        method: POST
        path: /strategies/deactivate
        params:
          - name: strategyId
            type: string
            required: true

      - name: run_backtest
        description: "Trigger a backtest for a strategy"
        method: POST
        path: /backtest/run
        params:
          - name: strategyId
            type: string
            required: true
          - name: instruments
            type: array
            required: true
          - name: dateRange
            type: object
            required: true
            properties:
              from: string
              to: string

      - name: get_backtest_results
        description: "Get results for a completed backtest"
        method: GET
        path: /backtest/{id}/results
        params:
          - name: id
            type: string
            required: true

      - name: update_risk_limits
        description: "Update risk parameters at runtime"
        method: POST
        path: /risk/limits
        params:
          - name: maxLeverage
            type: number
          - name: maxDailyLoss
            type: number
          - name: maxPositionSize
            type: number
          - name: consecutiveLossLimit
            type: number

      - name: close_position
        description: "Close a specific position by ID"
        method: POST
        path: /close/{positionId}
        params:
          - name: positionId
            type: string
            required: true

      - name: cancel_all_orders
        description: "Cancel all open orders"
        method: POST
        path: /orders/cancel-all

      - name: get_logs
        description: "Query agent execution logs"
        method: GET
        path: /logs
        params:
          - name: agent
            type: string
          - name: level
            type: string
            enum: [info, warn, error]
          - name: limit
            type: integer
```

---

## Common Workflows

### Workflow: Morning Risk Assessment

```javascript
// 1. Check system health
const status = await api.get('/status');
if (status.health !== 'HEALTHY') {
  await notifyAdmin(`Trading floor DEGRADED: ${status.errors.join(', ')}`);
}

// 2. Review risk
const risk = await api.get('/risk');
if (risk.riskLevel === 'CRITICAL') {
  // Don't start new trades, but don't emergency stop — just monitor
  console.warn('Critical risk — monitoring only');
}

// 3. Review overnight news
const news = await api.get('/news/heatmap?hours=8&limit=5');
for (const cluster of news.clusters.filter(c => c.heatScore > 0.7)) {
  console.log(`High-impact overnight: ${cluster.title} → ${cluster.affectedAssets}`);
}

// 4. Review positions
const positions = await api.get('/positions');
for (const pos of positions.positions) {
  if (pos.unrealizedPnL < -100) {
    console.warn(`Losing position: ${pos.symbol} PnL $${pos.unrealizedPnL} — consider closing`);
  }
}
```

### Workflow: Automated Strategy Deployment

```javascript
// 1. Backtest the strategy
const bt = await api.post('/backtest/run', {
  strategyId: 'str_new_strategy',
  instruments: ['BTC', 'ETH'],
  dateRange: { from: '2024-01-01', to: '2024-12-31' },
  initialCapital: 10000,
});

// 2. Wait for results
const results = await waitForBacktest(bt.backtestId);

// 3. Quality gates
const passes = results.sharpeRatio > 1.5
  && results.winRate > 0.55
  && results.maxDrawdown < 0.15
  && results.profitFactor > 1.3;

if (passes) {
  // 4. Deploy with conservative risk
  await api.post('/strategies/activate', { strategyId: results.strategyId });
  await api.post('/risk/limits', { maxPositionSize: 200, maxLeverage: 3 });
  console.log(`Strategy deployed with conservative limits`);
} else {
  console.log(`Strategy rejected: Sharpe=${results.sharpeRatio}, WR=${results.winRate}, DD=${results.maxDrawdown}`);
}
```

### Workflow: Emergency Response

```javascript
// Triggered by circuit_breaker_open WebSocket event

async function handleCircuitBreakerOpen(data) {
  console.error(`CIRCUIT BREAKER: ${data.name}`);

  // 1. Get current state
  const risk = await api.get('/risk');

  // 2. If multiple breakers open, emergency stop
  const openBreakers = risk.circuitBreakers.filter(cb => cb.state === 'OPEN');
  if (openBreakers.length >= 2 || risk.riskScore >= 70) {
    console.error('Multiple breakers open — executing emergency stop');
    await api.post('/emergency-stop');
    await notifyAdmin('Emergency stop executed due to circuit breaker cascade');
    return;
  }

  // 3. Single breaker — tighten risk limits
  await api.post('/risk/limits', {
    maxLeverage: 2,
    maxDailyLoss: Math.floor(risk.drawdown.daily * -0.5),  // Reduce by 50%
  });

  // 4. Cancel all pending orders
  await api.post('/orders/cancel-all');

  // 5. Notify
  await notifyAdmin(`Circuit breaker ${data.name} opened. Risk tightened, orders cancelled.`);
}
```

---

## Error Handling Best Practices

1. **Always check risk before trading** — Call `/risk` and verify `riskLevel` is not CRITICAL and no circuit breakers are OPEN.

2. **Handle 503 gracefully** — The execution engine may not be loaded. Treat `503` as "feature temporarily unavailable" and retry.

3. **Check emergency stop state** — Before submitting trades, verify trading is not halted (the API returns `403` if emergency stop is active).

4. **Use webhooks for critical events** — Don't poll for trade fills or risk alerts. Register a webhook and push events to Hermes.

5. **Backtest before activating** — Never activate a strategy without first verifying backtest results meet quality thresholds.

6. **Always set stop losses** — When submitting trades via `/trade`, always include a `stopLoss` parameter.

7. **Rate limit awareness** — The API allows 100 requests per 15 minutes. Batch queries where possible and cache responses.

8. **Idempotent operations** — Starting an already-running agent returns `409`, not an error. Design workflows to handle this gracefully.
