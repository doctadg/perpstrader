# PerpsTrader Infrastructure Fixes + STABLE Funding Arb Setup

**Goal:** Fix broken dashboard/safekeeping endpoints, resolve process leaks, and architect a paper STABLE funding rate arbitrage strategy.

**Date:** 2026-03-19 18:45 UTC+7

---

## Current State (from investigation)

### 1. Dashboard (Port 3001)

**Root cause identified.** The compiled `dashboard-server.js` resolves static files to:
```
path.join(__dirname, '../../dashboard/public')
```
which resolves to `PerpsTrader/dashboard/public/` (the root-level dir). This dir HAS all the HTML files (index.html, safekeeping.html, pools.html, etc.).

**BUT** -- port 3001 is currently held by a **worldmonitor vite dev server** (PID 20161), NOT PerpsTrader:
```
node /home/d/.openclaw/workspace/worldmonitor/node_modules/.bin/vite --host 0.0.0.0 --port 3001
```

PerpsTrader's dashboard fails to bind with EADDRINUSE and silently continues. The PerpsTrader `/api/health` check at the start of this session returned the worldmonitor response, not PerpsTrader.

**Safekeeping API routes ARE defined** in `dashboard-server.ts`:
- `GET /api/safekeeping` -- reads Redis `safekeeping:state` key, falls back to defaults
- `GET /api/safekeeping/history`
- `GET /api/safekeeping/health`
- `POST /api/safekeeping/rebalance`
- `POST /api/safekeeping/halt`

Redis `safekeeping:state` IS populated -- the agent is running and writing state (cycle 7, finding DEX LP opportunities like ZEC/WBNB at 658% APR).

The 404s reported earlier were likely from hitting the worldmonitor server instead of PerpsTrader.

### 2. Safekeeping Fund Service

**Status:** Running but with severe process leak -- **5 separate processes** spawned, each consuming ~100MB RAM. The `fork()` in main.ts spawns child processes that silently fail to communicate, and the restart logic doesn't kill previous instances.

**The agent itself works.** Redis state shows:
- Cycle 7 completed, step LEARNING_SKIP
- Chains connected: ETH (3.8s latency), BSC (0.6s), SOL (0.35s)
- Finding opportunities across Uniswap V3 pools
- TVL: $0 (no wallet funded)
- AI analysis failing: `TypeError: Cannot read properties of undefined (reading 'slice')` (OpenRouter 400 errors)

**No Hyperliquid integration.** Safekeeping fund only does DEX LP (Uniswap V3 on ETH, PancakeSwap V3 on BSC, Meteora on Solana). It cannot short perps or execute funding rate arbitrage. This is a completely different system from the execution engine.

### 3. STABLE Funding Arb Opportunity

**STABLE on Hyperliquid:** -50.4% annualized funding, $1.2M 24h volume, $0.027 mark price.
- Short STABLE perps = collect -50% funding (shorts get paid when funding is negative)
- Hedge with long stablecoins elsewhere (CEX earn, money market, or just hold USDC)
- Risk: STABLE is a stablecoin -- price should be ~$1. But it's at $0.027, which means either the perp is heavily de-pegged or STABLE is not actually a stablecoin (likely the latter -- "STABLE" is a meme token name).

**Execution engine already has Hyperliquid client** (`src/execution-engine/hyperliquid-client.ts`) with `placeOrder()` supporting market/limit orders. Account equity: $2.08 (paper trading).

### 4. Process Leak

**31 total Node processes** running PerpsTrader code. Child process restart logic in `main.ts` spawns new processes without ensuring old ones are killed. Multiple safekeeping-fund instances (5), plus stale processes from previous restarts.

---

## Fix Plan

### Phase 1: Dashboard (Quick Win)

**Step 1:** Kill the worldmonitor vite server on port 3001
```bash
kill 20161 20160 20148
```

**Step 2:** Restart PerpsTrader main process
```bash
kill $(pgrep -f "bin/main.js" | head -1)
cd /home/d/PerpsTrader && nohup node bin/main.js > logs/main-restart.log 2>&1 &
```

**Step 3:** Verify dashboard is serving
```bash
curl -s http://localhost:3001/api/health
curl -s http://localhost:3001/api/safekeeping
curl -s http://localhost:3001/safekeeping   # HTML page
```

**Files:** None to edit. Just process management.

**Risk:** Low. worldmonitor can be restarted on a different port if needed.

---

### Phase 2: Safekeeping + Pools Endpoints (Already Working)

The endpoints exist and work. The 404s were caused by hitting the wrong server on port 3001. After Phase 1, these endpoints will be accessible:

| Endpoint | Status | Data Source |
|----------|--------|-------------|
| `GET /api/safekeeping` | Working (Redis-backed) | `safekeeping:state` |
| `GET /api/safekeeping/history` | Working | Redis |
| `GET /api/safekeeping/health` | Working | Redis |
| `GET /api/funding/rates` | Working | SQLite funding.db |
| `GET /api/funding/opportunities` | Working | SQLite funding.db |
| `GET /pools.html` | Working | Static file |
| `GET /safekeeping` | Working | Static file |

**Step 1:** Verify all endpoints respond after Phase 1.

**Step 2 (optional):** Add safekeeping fund Hyperliquid perp positions to the `/api/safekeeping` response so the dashboard can show funding arb positions alongside DEX LP positions. This requires:
- New route or extending existing to query HL positions
- Dashboard HTML update to display perp positions

**Files to change (optional Step 2):**
- `src/dashboard/dashboard-server.ts` -- add HL position query to `/api/safekeeping`
- `src/dashboard/public/safekeeping.html` -- add perp positions table

---

### Phase 3: Process Leak Fix

**Root cause:** `main.ts` `CHILD_PROCESSES` map doesn't kill previous instance before spawning replacement. When main restarts, it spawns children that never get cleaned up.

**Step 1:** Add PID file locking to `main.ts`
```typescript
// At startup:
import { writeFileSync, existsSync, readFileSync, unlinkSync } from 'fs';
const PID_FILE = '/tmp/perpstrader-main.pid';
if (existsSync(PID_FILE)) {
  const oldPid = parseInt(readFileSync(PID_FILE, 'utf8'));
  try { process.kill(oldPid, 'SIGTERM'); } catch {}
  unlinkSync(PID_FILE);
}
writeFileSync(PID_FILE, process.pid.toString());

// On exit:
process.on('exit', () => { try { unlinkSync(PID_FILE); } catch {} });
```

**Step 2:** Kill orphan children in `spawnChildProcess()` before forking new ones
```typescript
const existing = CHILD_PROCESSES.get(name);
if (existing && !existing.killed) {
  logger.warn(`[ChildProcess] Killing existing ${name} (PID: ${existing.pid})`);
  existing.kill('SIGTERM');
  await new Promise(r => setTimeout(r, 2000));
  if (!existing.killed) existing.kill('SIGKILL');
}
```

**Step 3:** One-time cleanup of current leaks
```bash
# Kill all safekeeping orphans (keep only main + its children)
pkill -f "bin/safekeeping-fund/main.js"
pkill -f "bin/funding-arbitrage-job.js"
pkill -f "bin/prediction-agent.js"
# Then restart main (which will spawn fresh children)
```

**Files to change:**
- `src/main.ts` -- PID lock + child cleanup before spawn

---

### Phase 4: STABLE Funding Arb (Paper Mode)

**Architecture:** This is a new capability that bridges the safekeeping fund with the execution engine. The safekeeping fund currently only does DEX LP. We need to add funding rate arbitrage as a new strategy.

**Step 1: Create funding arb strategy type in safekeeping fund**

Add to `src/safekeeping-fund/types.ts`:
```typescript
interface FundingArbPosition {
  symbol: string;         // "STABLE"
  side: 'short';          // Always short for negative funding
  size: number;           // Position size in USD
  entryPrice: number;
  currentFunding: number;  // Current annualized rate
  collectedFunding: number; // Total funding collected
  hedgeInstrument: string;  // "USDC_cash" or "USDC_CEARN" etc
  openTime: number;
  targetRate: number;      // Close if rate drops below this
  maxLoss: number;         // Max acceptable price deviation
}
```

**Step 2: Create `src/safekeeping-fund/nodes/funding-arb-node.ts`**

New graph node that:
1. Scans funding rates from the existing `FundingArbitrageScanner`
2. Filters for extreme negative rates (< -20% annualized)
3. Checks volume threshold (> $100k 24h)
4. For qualifying trades, calculates position size (max 10% of portfolio per position)
5. Places short via the execution engine's `HyperliquidClient.placeOrder()`
6. Monitors funding collection via `/api/funding/history/:symbol`
7. Closes position if funding normalizes (rate > -5%) or stop loss hit

**Step 3: Wire into safekeeping graph**

Add `FUNDING_ARB_SCAN` step to the LangGraph graph in `graph.ts`:
```
MARKET_MONITOR → APR_CALCULATOR → FUNDING_ARB_SCAN → REBALANCE_PLAN → SAFETY_GATE → EXECUTE → LEARNING
```

**Step 4: Dashboard integration**

Extend `/api/safekeeping` to include active funding arb positions. Update `safekeeping.html` to show:
- Active short positions with funding collected
- Entry/exit history
- Net PnL (funding collected vs price change)

**Step 5: Paper mode guard**

Before any real execution, add `PAPER_MODE` env var check:
```typescript
if (process.env.SAFEKEEPING_PAPER_MODE !== 'false') {
  logger.info(`[FundingArb] PAPER MODE: would short ${symbol} $${size}`);
  return { simulated: true, symbol, size };
}
```

**Files to create:**
- `src/safekeeping-fund/nodes/funding-arb-node.ts`
- `src/safekeeping-fund/nodes/funding-arb-monitor.ts`

**Files to modify:**
- `src/safekeeping-fund/types.ts` -- add `FundingArbPosition` interface
- `src/safekeeping-fund/graph.ts` -- add funding arb step
- `src/safekeeping-fund/constants.ts` -- add funding arb config constants
- `src/safekeeping-fund/state.ts` -- add funding arb state fields
- `src/dashboard/dashboard-server.ts` -- extend `/api/safekeeping` response
- `src/dashboard/public/safekeeping.html` -- add funding arb display

**Dependencies:**
- `src/execution-engine/hyperliquid-client.ts` (existing, import `placeOrder`)
- `src/market-ingester/funding-arbitrage-scanner.ts` (existing, import `FundingArbitrageScanner`)
- HL_PRIVATE_KEY or HYPERLINUX_PRIVATE_KEY env var (for live trading)

**Risk assessment for STABLE specifically:**
- STABLE at $0.027 is NOT a real stablecoin -- it's a meme token with a misleading name
- Shorting at -50% annualized on a token that's already 97% off its "peg" is risky
- The funding rate is extreme because longs are desperate (degen betting on recovery)
- **Paper mode first** to track PnL before committing real capital
- Consider setting position size to $0 initially (watch-only mode)

---

## Execution Order

| Priority | Phase | Effort | Impact |
|----------|-------|--------|--------|
| P0 | Phase 1: Kill worldmonitor, restart PerpsTrader | 5 min | Dashboard live |
| P0 | Phase 3: Process leak cleanup | 10 min | 5 processes killed, RAM freed |
| P1 | Phase 2: Verify all endpoints | 2 min | Confirm nothing else broken |
| P2 | Phase 4: STABLE funding arb (paper) | 2-3 hours | New capability |

---

## Open Questions

1. **Is worldmonitor still needed?** It's been running for 3 days on port 3001. If so, move it to another port (3002?).
2. **Funding rate for STABLE** -- at $0.027 mark price, this is clearly not a stablecoin. Should we target actual stablecoins (USDC, USDT perps) or embrace the high-risk meme plays?
3. **Capital allocation** -- $2.08 in the HL account. Even in paper mode, what position size should the funding arb target? Suggest starting with $0 (watch-only).
4. **AI analysis failures** -- OpenRouter returning 400 errors for safekeeping's AI analysis node. Needs investigation (model config issue).
