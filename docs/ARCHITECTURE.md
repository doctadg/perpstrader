# PerpsTrader Architecture

## System Overview

PerpsTrader is an autonomous cryptocurrency perpetual futures trading system. It ingests market data and news, analyzes sentiment and on-chain signals, generates trading strategies, manages risk, and executes trades — all orchestrated via a LangGraph agent pipeline running on Node.js.

The system is designed as a collection of composable agents, each responsible for a specific domain, communicating through a shared state graph.

```
+------------------------------------------------------------------+
|                        PerpsTrader System                         |
|                                                                  |
|  +----------+   +----------+   +-----------+   +-------------+  |
|  |  News    |   | Research |   | Prediction|   |   PumpFun   |  |
|  |  Agent   |   |  Engine  |   |   Agent   |   |    Agent    |  |
|  +----+-----+   +----+-----+   +-----+-----+   +------+------+  |
|       |              |               |                |         |
|       v              v               v                v         |
|  +-----------------------------------------------------------+  |
|  |                   LangGraph Orchestrator                   |  |
|  |           (State Graph / Agent Pipeline)                   |  |
|  +-----------------------------------------------------------+  |
|       |              |               |                |         |
|       v              v               v                v         |
|  +----+-----+   +----+-----+   +-----+-----+   +------+------+  |
|  | Strategy |   | Evolution|   |    Risk   |   |  Safekeeping |  |
|  |  Engine  |   |  Engine  |   |  Manager  |   |    Fund      |  |
|  +----+-----+   +----+-----+   +-----+-----+   +------+------+  |
|       |                                            |         |
|       v                                            v         |
|  +----+-------------------------------+   +------+------+  |
|  |         Execution Engine            |   |    API     |  |
|  |   (Order Placement & Management)    |   |  Gateway   |  |
|  +-------------------------------------+   +-------------+  |
+------------------------------------------------------------------+
```

## Module Descriptions

### News Agent (`src/agents/news/`)
Monitors and ingests news from RSS feeds, social media, and news APIs. Performs initial sentiment classification and routes relevant articles to downstream agents.

**Responsibilities:**
- Fetch and normalize news from configured sources
- Classify sentiment (bullish/bearish/neutral)
- Extract relevant entities (tokens, protocols, events)
- Feed the LangGraph state with structured news data

### Research Engine (`src/research/`)
Performs deep-dive analysis on tokens, protocols, and market conditions. Generates research reports that feed into strategy decisions.

**Responsibilities:**
- On-chain metrics aggregation (TVL, volume, holder distribution)
- Fundamental analysis of protocols
- Historical correlation analysis
- Backtesting support for strategy validation

### Prediction Agent (`src/agents/prediction/`)
Uses ML models and historical pattern matching to generate price predictions and probability estimates for tradable assets.

**Responsibilities:**
- Time-series forecasting
- Volatility prediction
- Signal confidence scoring

### PumpFun Agent (`src/agents/pumpfun/`)
Specialized agent for detecting and trading meme/launch tokens on the PumpFun platform. Rapid detection of trending tokens and execution with heightened risk controls.

**Responsibilities:**
- Token launch monitoring
- Liquidity and social signal detection
- Fast entry/exit execution
- Separate risk parameters for high-volatility tokens

### Strategy Engine (`src/strategy/`)
Consumes signals from news, research, prediction, and PumpFun agents to generate actionable trading strategies. Evaluates strategy quality and picks the best approach.

**Responsibilities:**
- Signal aggregation and scoring
- Strategy generation (long/short, entries/exits, position sizing)
- Strategy ranking and selection
- Multi-timeframe analysis

### Evolution Engine (`src/evolution/`)
Continuously adapts and improves trading strategies based on performance feedback. Implements genetic/evolutionary optimization of strategy parameters.

**Responsibilities:**
- Performance tracking per strategy
- Parameter mutation and crossover
- Strategy retirement and promotion
- A/B testing of strategy variants

### Risk Manager (`src/risk/`)
Gatekeeper for all trade execution. Enforces risk limits across the entire portfolio and per-position.

**Responsibilities:**
- Position sizing (Kelly criterion, fixed fractional)
- Drawdown limits (daily, weekly, max)
- Correlation checks (avoid over-exposure to correlated assets)
- Leverage limits
- Emergency circuit breakers

### Execution Engine (`src/engine/`)
Handles all interactions with the blockchain/Dex. Places, modifies, and cancels orders. Manages order lifecycle and handles failures gracefully.

**Responsibilities:**
- Order placement and management
- Slippage protection
- Transaction signing and broadcasting
- Order status tracking and reconciliation
- Gas/fee estimation

### Safekeeping Fund (`src/safekeeping/`)
Manages the treasury and reserve fund. Handles profit allocation, withdrawal controls, and ensures the system maintains adequate reserves.

**Responsibilities:**
- Treasury balance tracking
- Profit realization and reinvestment logic
- Withdrawal authorization
- Reserve ratio enforcement

### API Gateway (`src/api/`)
REST API for external agents or dashboards to query state, submit signals, and control the system.

**Responsibilities:**
- Health checks and system status
- Portfolio and position queries
- Manual order placement/cancellation
- Strategy and risk parameter updates

## Data Flow

The primary trading pipeline flows through the LangGraph orchestrator:

```
News Sources          Market Data          On-Chain Data
     |                     |                     |
     v                     v                     v
+---------+          +-----------+        +-----------+
|  News   |          | Price Feed|        |   RPC     |
|  Agent  |          |  (WS/REST)|        |  Queries  |
+----+----+          +-----+-----+        +-----+-----+
     |                     |                     |
     |  sentiment          |  candles            |  metrics
     v                     v                     v
+----------------------------------------------------------+
|              LangGraph State Graph                        |
|                                                          |
|  [News Analysis] --> [Signal Generation] --> [Risk Check] |
|        ^                   |                    |        |
|        |                   v                    v        |
|        |            [Strategy Selection]  [Position Size]|
|        |                   |                    |        |
|        |                   v                    v        |
|        +----------- [Execution Engine] <-------+        |
|                          |                             |
|                          v                             |
|                   [Order Management]                    |
|                          |                             |
|                          v                             |
|                   [Performance Feedback]               |
|                          |                             |
|                          v                             |
|                   [Evolution Engine]                   |
+----------------------------------------------------------+
```

**Step by step:**

1. **Ingestion** — News agent fetches articles; market data streams candlesticks; on-chain data pulls metrics.
2. **Analysis** — News sentiment, prediction confidence, and research reports are combined into a unified signal.
3. **Strategy** — Strategy engine generates candidate strategies ranked by expected performance.
4. **Risk** — Risk manager validates position sizes, checks portfolio-level exposure, and applies circuit breakers.
5. **Execution** — Execution engine places orders with slippage protection and monitors fill status.
6. **Feedback** — Trade results feed back into the evolution engine for continuous improvement.

## Storage

| Store      | Purpose                                      | Location          |
|------------|----------------------------------------------|-------------------|
| **SQLite** | Persistent data: trades, strategies, config, performance history | `src/db/sqlite/` |
| **Redis**  | Caching, rate limiting, real-time state, pub/sub between agents | `src/db/redis/`  |
| **ChromaDB**| Vector storage for news embeddings, semantic search, research similarity | `src/db/chroma/` |

All database access is abstracted behind repository interfaces in `src/db/`.

## Agent Control (REST API)

External agents (or human operators) can interact with the system via the REST API:

```
GET  /api/health              System health status
GET  /api/portfolio           Current positions and balances
GET  /api/strategies          Active strategies and their status
POST /api/strategies          Submit a new strategy
PUT  /api/strategies/:id      Update strategy parameters
POST /api/orders              Place a manual order
DELETE /api/orders/:id        Cancel an order
GET  /api/risk/limits         Current risk parameters
PUT  /api/risk/limits         Update risk parameters
GET  /api/performance         PnL, win rate, drawdown stats
POST /api/circuit-breaker     Trigger emergency stop
```

Authentication is via API key in the `Authorization` header.

## LangGraph Orchestration

The system uses LangGraph to define a directed state graph where each node is an agent or processing step:

- **State** — A typed object containing news data, market data, signals, strategies, risk assessments, and execution results.
- **Nodes** — Each agent is a node that reads from and writes to the shared state.
- **Edges** — Define the flow between nodes. Conditional edges route based on state (e.g., skip execution if risk check fails).
- **Cycles** — The graph can loop: execution results feed back into analysis for the next tick.

The orchestrator lives in `src/agents/graph/` and the state definition is in `src/agents/graph/state.ts`.

## How to Add a New Agent/Module

Follow these steps to add a new agent to the pipeline:

### 1. Create the agent

```bash
mkdir src/agents/your-agent
touch src/agents/your-agent/index.ts
touch src/agents/your-agent/your-agent.ts
```

### 2. Define the agent interface

```typescript
import { AgentState } from '../graph/state';

interface YourAgentConfig {
  // agent-specific config
}

async function yourAgent(state: AgentState, config: YourAgentConfig): Promise<Partial<AgentState>> {
  // Process state, return partial state update
  return {
    // fields you want to update on the shared state
  };
}

export { yourAgent, YourAgentConfig };
```

### 3. Register in the graph

Edit `src/agents/graph/index.ts` to add your agent as a node and connect it with edges:

```typescript
import { yourAgent } from '../your-agent';

const graph = new StateGraph(AgentState)
  .addNode('your_agent', yourAgent)
  .addEdge('previous_node', 'your_agent')
  .addEdge('your_agent', 'next_node');
```

### 4. Add config

Add any agent-specific environment variables to `.env.example` and load them in your agent's config.

### 5. Write tests

Add tests in `tests/agents/your-agent.test.ts`. Cover normal operation and edge cases.

### 6. Update docs

Add a section to this file describing what your agent does and how it fits in the pipeline.
