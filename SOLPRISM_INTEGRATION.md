# SOLPRISM Integration — Verifiable Onchain Reasoning for PerpTrader

> Every trade decision committed onchain BEFORE execution. No hindsight bias. Full investor auditability.

## What is SOLPRISM?

[SOLPRISM](https://www.solprism.app/) is a protocol for **verifiable AI reasoning on Solana**. It uses a commit-reveal scheme: an AI agent hashes its full reasoning into a SHA-256 digest, publishes that hash onchain, executes its action, then reveals the full reasoning — allowing anyone to verify the hash matches.

**Program ID:** `CZcvoryaQNrtZ3qb3gC1h9opcYpzEP1D9Mu1RVwFQeBu`

## Why This Matters for Trading

AI-powered trading bots operate as black boxes. Investors can see the P&L but never know *why* a position was taken. SOLPRISM changes that:

| Problem | SOLPRISM Solution |
|---|---|
| Hindsight bias | Reasoning hash committed **before** the trade executes |
| Opaque decision-making | Full reasoning trace revealed and verifiable onchain |
| Unauditable performance | Every position tied to provable analysis (market data, indicators, strategy, risk assessment) |
| Trust-me-bro returns | Cryptographic proof that the AI's logic was fixed before market impact |

## Architecture

```
PerpTrader Pipeline (LangGraph)
────────────────────────────────────────────────────────────────
  Market Data → Pattern Recall → Strategy Ideation → Backtester
       → Strategy Selector → Risk Gate
                                  │
                    ┌─────────────┴─────────────┐
                    │    SOLPRISM Integration     │
                    │                             │
                    │  1. Build ReasoningTrace    │
                    │     from AgentState         │
                    │                             │
                    │  2. SHA-256 hash the trace  │
                    │                             │
                    │  3. COMMIT hash onchain     │
                    │     (Solana tx)             │
                    │                             │
                    │  4. EXECUTE trade           │
                    │     (Hyperliquid)           │
                    │                             │
                    │  5. REVEAL reasoning        │
                    │     onchain (Solana tx)     │
                    └─────────────┬─────────────┘
                                  │
                              Learner → Done
```

## What Gets Committed

The reasoning trace captures the **complete decision pipeline**:

```typescript
{
  version: "1.0.0",
  agent: "PerpTrader",
  timestamp: 1738670400000,
  action: {
    type: "trade",
    description: "SELL 0.0500 BTC @ $102,450.00"
  },
  inputs: {
    dataSources: [
      { name: "BTC OHLCV (1h)", type: "price_feed", summary: "200 candles | Latest close: 102450.00" },
      { name: "Technical Indicators", type: "model", summary: "RSI: 78.3 | MACD hist: -0.0012 | ATR: 450.2" },
      { name: "Pattern Memory (Vector DB)", type: "model", summary: "5 similar patterns | Bias: BEARISH" },
      { name: "Portfolio State", type: "api", summary: "Balance: $50,000 | Positions: 0" }
    ],
    context: "Trading cycle abc-123 for BTC on 1h timeframe. Market regime: LOW_VOLATILITY."
  },
  analysis: {
    observations: [
      "BTC last close: $102,450 (O: 102,100, H: 102,800, L: 101,900)",
      "RSI(14): 78.3",
      "MACD histogram: -0.0012",
      "Market regime classified as LOW_VOLATILITY",
      "Historical pattern bias: BEARISH"
    ],
    logic: "1. Ingested 200 1h candles for BTC. 2. Computed technical indicators... 7. Risk gate evaluated signal: RSI overbought (78.3 >= 75). Approved with risk score 35/100.",
    alternativesConsidered: [
      { action: "BUY BTC", reasonRejected: "Indicators and strategy logic favored SELL; RSI overbought", estimatedConfidence: 15 },
      { action: "HOLD (no position change)", reasonRejected: "Signal confidence (85%) exceeded threshold; the edge justified execution." },
      { action: "Use strategy 'Fast SMA Trend' (TREND_FOLLOWING)", reasonRejected: "Not selected after backtesting; 'RSI Mean Reversion' had better risk-adjusted returns." }
    ]
  },
  decision: {
    actionChosen: "SELL BTC x0.0500",
    confidence: 85,
    riskAssessment: "Risk score: 35/100. Position size: 0.0500 (risk-adjusted). Stop loss: 103200.00. Take profit: 100800.00. Leverage: 4x. No risk warnings.",
    expectedOutcome: "Expect short position to reach take-profit at $100,800.00 or stop at $103,200.00. Regime: LOW_VOLATILITY."
  },
  metadata: {
    sessionId: "abc-123",
    executionTimeMs: 4500,
    custom: {
      symbol: "BTC",
      action: "SELL",
      strategyType: "MEAN_REVERSION",
      strategyName: "RSI Mean Reversion",
      regime: "LOW_VOLATILITY",
      timeframe: "1h",
      patternBias: "BEARISH",
      isPaperTrade: false
    }
  }
}
```

This is hashed to produce a 32-byte SHA-256 commitment like:
```
a1b2c3d4e5f6...  (64 hex characters)
```

That hash is stored onchain **before** the trade hits Hyperliquid.

## Setup

### 1. Install the SDK

```bash
npm install @solprism/sdk
```

### 2. Create a Solana Keypair

```bash
# Generate a new keypair (or use an existing one)
solana-keygen new -o ~/.config/solana/perptrader-solprism.json

# Fund it on devnet
solana airdrop 2 --keypair ~/.config/solana/perptrader-solprism.json --url devnet
```

### 3. Configure Environment Variables

Add to your `.env`:

```bash
# Enable SOLPRISM
SOLPRISM_ENABLED=true
SOLPRISM_KEYPAIR_PATH=/path/to/perptrader-solprism.json
SOLPRISM_AGENT_NAME=PerpTrader
SOLPRISM_NETWORK=devnet

# Optional
SOLPRISM_RPC_URL=https://api.devnet.solana.com
SOLPRISM_AUTO_REVEAL=true
```

### 4. Run

No code changes needed — the integration is already wired into the LangGraph orchestrator. When `SOLPRISM_ENABLED=true`, every approved trade will automatically:

1. Build a reasoning trace from the pipeline state
2. Commit the hash onchain
3. Execute the trade
4. Reveal the reasoning onchain

## Graceful Degradation

SOLPRISM is designed to be **non-blocking**:

- If `SOLPRISM_ENABLED=false` → zero overhead, standard execution
- If `@solprism/sdk` is not installed → falls back to local hash computation (no onchain commits)
- If the Solana transaction fails → the trade still executes, a warning is logged
- If the keypair is missing → SOLPRISM auto-disables with a warning

The trading pipeline never stops because of a SOLPRISM issue.

## Verification

Anyone can verify a trade's reasoning:

```typescript
import { SolprismClient } from '@solprism/sdk';

const client = new SolprismClient('https://api.devnet.solana.com');

// Fetch the onchain commitment
const commitment = await client.getCommitment('COMMITMENT_PDA_ADDRESS');

// Verify against the revealed reasoning
const result = await client.verifyReasoning('COMMITMENT_PDA_ADDRESS', reasoningTrace);

console.log(result.valid);   // true = reasoning matches the pre-trade commitment
console.log(result.message); // "✅ Reasoning verified — the trace matches the onchain commitment"
```

Or visit [solprism.app](https://www.solprism.app/) to browse commitments in the explorer.

## File Structure

```
src/solprism/
├── config.ts            # Environment-based configuration
├── reasoning-builder.ts # Converts AgentState → ReasoningTrace
├── solprism-node.ts     # Commit-reveal wrapper for the executor
└── index.ts             # Public API exports
```

## Key Design Decisions

1. **Wrapper pattern**: SOLPRISM wraps the existing executor node rather than replacing it. This means zero changes to the core trading logic.

2. **Non-blocking**: All SOLPRISM operations are wrapped in try-catch. A Solana RPC failure never prevents a trade.

3. **Full pipeline capture**: The reasoning trace includes data from every LangGraph node — market data, pattern recall, strategy ideation, backtest results, risk assessment. It's the complete decision chain, not a summary.

4. **Dynamic SDK import**: The `@solprism/sdk` is imported dynamically. If it's not installed, the integration degrades to local hash computation.

5. **Deterministic hashing**: Uses canonical JSON serialization (sorted keys at every depth) to ensure the same reasoning always produces the same hash, regardless of property insertion order.

## License

MIT — same as PerpTrader.
