# Risk Manager Fix - Technical Implementation Details

## Code Changes Breakdown

### 1. GLM Service (`src/shared/glm-service.ts`)

**Location:** `optimizeStrategy()` method, line ~410

**Change:**
```typescript
// OLD REVENGE TRADING LOGIC:
stopLoss: performance.winRate > 50
  ? strategy.riskParameters.stopLoss * 0.95
  : strategy.riskParameters.stopLoss * 1.05, // ❌ WIDENS stops when losing!

takeProfit: performance.profitFactor > 1
  ? strategy.riskParameters.takeProfit * 1.05
  : strategy.riskParameters.takeProfit * 0.95, // ❌ Lowers targets when losing!
```

**New Logic:**
```typescript
let stopLoss = strategy.riskParameters.stopLoss;
let takeProfit = strategy.riskParameters.takeProfit;

// REVERSED: Tighten stops when losing, not widen
if (performance.winRate < 50) {
  stopLoss = strategy.riskParameters.stopLoss * 0.90;  // Tighten 10%
  takeProfit = strategy.riskParameters.takeProfit * 1.10; // Raise 10%
} else {
  // When winning, still keep stops tight
  stopLoss = strategy.riskParameters.stopLoss * 0.95;
  takeProfit = strategy.riskParameters.takeProfit;
}

// ENFORCE max 1:3 risk/reward
const minTakeProfit = stopLoss * 3.0;
if (takeProfit < minTakeProfit) {
  takeProfit = minTakeProfit;
  logger.warn(`[OpenRouter] Adjusted take profit to maintain 1:3 R:R ratio: ${(takeProfit * 100).toFixed(2)}%`);
}
```

### 2. Risk Manager (`src/risk-manager/risk-manager.ts`)

#### A. Added Hard Stop Tracking (line ~28)
```typescript
// NEW: Track hard stops per position - these NEVER move
private positionHardStops: Map<string, number> = new Map();
```

#### B. Modified `registerPositionOpen()` (line ~470)
```typescript
registerPositionOpen(symbol: string, side: string, stopLossPct?: number): void {
  const positionKey = `${symbol}_${side}`;
  this.positionOpenTimes.set(positionKey, Date.now());

  // CRITICAL FIX: Set hard stop that NEVER moves
  const hardStop = stopLossPct || 0.012; // Default 1.2% if not provided
  this.positionHardStops.set(positionKey, hardStop);

  logger.info(
    `[RiskManager] Position registered: ${positionKey} at ${new Date().toISOString()} with HARD STOP at -${(hardStop * 100).toFixed(2)}%`
  );
}
```

#### C. Modified `shouldClosePosition()` (line ~445)
```typescript
shouldClosePosition(position: Position): boolean {
  // ... existing code ...

  // CRITICAL FIX: Use position-specific hard stop that NEVER moves
  const hardStopPct = this.positionHardStops.get(positionKey) || 0.012; // Default 1.2%

  if (unrealizedPnLPct <= -hardStopPct) {
    logger.warn(
      `[RiskManager] HARD STOP triggered for ${position.symbol}: ` +
      `unrealized ${(unrealizedPnLPct * 100).toFixed(2)}% <= -${(hardStopPct * 100).toFixed(2)}%`
    );
    return true;
  }

  // ... rest of logic ...
}
```

#### D. Modified `checkPositionRisk()` (line ~375)
```typescript
// CRITICAL FIX: Use position-specific hard stop that NEVER moves
const hardStopPct = this.positionHardStops.get(positionKey) || 0.012; // Default 1.2%

// Force exit if unrealized PnL exceeds hard stop
if (unrealizedPnLPercentage <= -hardStopPct) {
  warnings.push(
    `CRITICAL: Hard stop triggered at -${(hardStopPct * 100).toFixed(2)}%: ` +
    `unrealized ${(unrealizedPnLPercentage * 100).toFixed(2)}%`
  );
  riskScore = Math.max(riskScore, 1.0);
}
```

#### E. Modified `clearPositionTracking()` (line ~495)
```typescript
clearPositionTracking(symbol: string, side: string): void {
  const positionKey = `${symbol}_${side}`;
  this.positionOpenTimes.delete(positionKey);
  this.positionPeakPnL.delete(positionKey);
  this.positionHardStops.delete(positionKey); // CRITICAL FIX: Clear hard stop
  logger.info(`[RiskManager] Position tracking cleared: ${positionKey}`);
}
```

#### F. Enhanced `calculateStopLossAndTakeProfit()` (line ~262)
```typescript
// Added logging:
logger.info(
  `[RiskManager] Stop/Take Profit calc: SL=${(stopLoss * 100).toFixed(2)}%, ` +
  `TP=${(takeProfit * 100).toFixed(2)}, R:R=1:${riskRewardRatio.toFixed(2)}`
);
```

### 3. Execution Engine (`src/execution-engine/execution-engine.ts`)

#### A. Import Risk Manager (line ~1)
```typescript
import riskManager from '../risk-manager/risk-manager';
```

#### B. Register Position on Entry (line ~420)
```typescript
if (isExitOrder) {
  this.clearManagedExitPlan(signal.symbol);
  // CRITICAL FIX: Clear risk manager tracking on position close
  const exitSide = signal.action === 'SELL' ? 'LONG' : 'SHORT';
  riskManager.clearPositionTracking(signal.symbol, exitSide);
} else {
  const entryPrice = trade.price > 0 ? trade.price : (signal.price || 0);
  const entrySide: 'LONG' | 'SHORT' = signal.action === 'BUY' ? 'LONG' : 'SHORT';
  this.registerManagedExitPlan(
    signal.symbol,
    entrySide,
    entryPrice,
    riskAssessment.stopLoss,
    riskAssessment.takeProfit
  );
  // CRITICAL FIX: Register position with risk manager for hard stop tracking
  riskManager.registerPositionOpen(signal.symbol, entrySide, riskAssessment.stopLoss);
}
```

## Data Flow

### Position Open Flow:
```
1. Signal Generated (strategy-engine)
   ↓
2. Risk Assessment (risk-manager.calculateStopLossAndTakeProfit)
   → Calculates SL: 0.8-1.2%, TP: 2.4-7.0%, R:R: 1:3 to 1:6
   ↓
3. Position Sized (risk-manager.calculatePositionSize)
   → Uses SL% to size position based on risk budget
   ↓
4. Order Executed (execution-engine.executeSignal)
   → Places order on Hyperliquid
   ↓
5. Position Registered (risk-manager.registerPositionOpen)
   → Stores HARD STOP = actual SL% (never moves!)
   → Initializes peak PnL tracking
   → Sets open timestamp
```

### Position Monitor Flow:
```
Every 5 seconds (execution-engine.enforceManagedExitPlans):
   ↓
1. Check current PnL % vs entry price
   ↓
2. If PnL <= -hardStopPct:
   → HARD STOP EXIT (immediate)
   ↓
3. If PnL >= takeProfitPct:
   → TAKE PROFIT EXIT
   ↓
4. Check trailing stop (if peak PnL > +1%)
   → Exit if retraced > 35% from peak
   ↓
5. Check breakeven stop (if peak PnL > +1.5%)
   → Exit if PnL goes negative
```

## Risk Management Layers

### Layer 1: Entry Risk Control
- Stop loss: 0.6-1.2% (tightens when losing)
- Take profit: 2.4-7.0% (3-6x stop)
- Position size: Based on 0.5-1.0% account risk
- Leverage: Max 20x

### Layer 2: Hard Stop (Never Moves)
- Set at position open = actual SL%
- Stored in `positionHardStops` Map
- Checked every 5 seconds
- **Cannot be widened** once set

### Layer 3: Managed Exit Plan
- Registered at position open
- SL trigger: 90% of stop loss (early exit)
- TP trigger: 115% of take profit (let winners run)
- Checked every 5 seconds

### Layer 4: Trailing Stop
- Activates after +1% unrealized PnL
- Allows 35% retrace from peak
- Protects profits on winning trades

### Layer 5: Breakeven Stop
- Activates after +1.5% peak PnL
- Exits if position goes negative
- Locks in breakeven on big winners

### Layer 6: Time-Based Stop
- Max holding: 4 hours
- Force exit after 2 hours if PnL < -1%
- Prevents bag-holding

### Layer 7: Daily Loss Limit
- Hard limit: -$50 (5% of $1k account)
- Circuit breaker triggers emergency stop
- Blocks all new trades until reset

## Verification Checklist

- [x] Revenge trading logic reversed
- [x] Hard stops implemented and never move
- [x] Max 1:3 R:R enforced
- [x] Position tracking connected
- [x] All changes logged
- [x] Code compiles (pre-existing errors only)
- [ ] Deploy to testnet
- [ ] Monitor first 20 trades
- [ ] Verify PnL turns positive

---

**Implementation Date:** 2026-03-06
**Status:** COMPLETE - Ready for Deployment
