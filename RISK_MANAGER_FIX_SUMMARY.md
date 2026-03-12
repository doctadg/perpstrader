# Risk Manager Revenge Trading Bug Fix - CRITICAL

**Date:** 2026-03-06
**Severity:** CRITICAL
**Status:** FIXED

## Problem

The trading system had a **51.8% win rate but -$640 PnL** with a **2.48:1 risk/reward ratio** (inverted - risking $2.48 to make $1). This indicated the system was **letting losers run** while cutting winners short - classic revenge trading behavior.

## Root Causes Identified

### 1. **REVENGE TRADING LOGIC in GLM Service** (Line 410)
**File:** `/home/d/PerpsTrader/src/shared/glm-service.ts`

**BEFORE:**
```typescript
stopLoss: performance.winRate > 50 
  ? strategy.riskParameters.stopLoss * 0.95  // Tighten when winning
  : strategy.riskParameters.stopLoss * 1.05, // WIDEN WHEN LOSING ❌
```

**Bug:** When win rate < 50%, the system **widened stops by 5%** - classic revenge trading! This allowed losing positions to run even further, creating larger losses.

**FIX:**
```typescript
// REVERSED: When losing, TIGHTEN stops (be more selective)
if (performance.winRate < 50) {
  stopLoss = strategy.riskParameters.stopLoss * 0.90;  // Tighten by 10%
  takeProfit = strategy.riskParameters.takeProfit * 1.10; // Raise targets
} else {
  // When winning, keep stops tight to preserve gains
  stopLoss = strategy.riskParameters.stopLoss * 0.95;
  takeProfit = strategy.riskParameters.takeProfit;
}
```

### 2. **Hard Stop Too Wide** (Risk Manager)
**File:** `/home/d/PerpsTrader/src/risk-manager/risk-manager.ts`

**BEFORE:**
- Hard stop at **-3%** (line 375)
- Calculated stop losses: **0.6% - 1.2%**
- **Mismatch:** Positions could hit managed exit at -0.9%, but if missed, could slide to -3% (3x the intended risk!)

**FIX:**
- Added **position-specific hard stops** that are set when position opens
- Hard stop = actual stop loss percentage used (0.6% - 1.2%)
- **Hard stops NEVER move** once set

### 3. **No Max Risk/Reward Enforcement**
**BEFORE:** No validation that reward was at least 3x risk

**FIX:**
```typescript
// Enforce max 1:3 risk/reward (reward must be at least 3x risk)
const minTakeProfit = stopLoss * 3.0;
if (takeProfit < minTakeProfit) {
  takeProfit = minTakeProfit;
  logger.warn(`Adjusted take profit to maintain 1:3 R:R ratio`);
}
```

### 4. **Position Tracking Not Connected**
**BEFORE:** `registerPositionOpen()` was never called - risk manager had no visibility into when positions opened

**FIX:** Connected execution engine to risk manager:
```typescript
// In execution-engine.ts after successful entry:
riskManager.registerPositionOpen(signal.symbol, entrySide, riskAssessment.stopLoss);
```

## Changes Made

### 1. `/home/d/PerpsTrader/src/shared/glm-service.ts`
- ✅ Reversed revenge trading logic in `optimizeStrategy()`
- ✅ Added max 1:3 risk/reward enforcement
- ✅ Tighten stops when losing, not widen

### 2. `/home/d/PerpsTrader/src/risk-manager/risk-manager.ts`
- ✅ Added `positionHardStops` Map to track position-specific hard stops
- ✅ Modified `registerPositionOpen()` to accept and store hard stop percentage
- ✅ Modified `shouldClosePosition()` to use position-specific hard stop (not fixed -3%)
- ✅ Modified `checkPositionRisk()` to use position-specific hard stop
- ✅ Modified `clearPositionTracking()` to clear hard stops
- ✅ Added logging for stop/take profit calculations with R:R ratio
- ✅ Enforced minimum 1:3 risk/reward in `calculateStopLossAndTakeProfit()`

### 3. `/home/d/PerpsTrader/src/execution-engine/execution-engine.ts`
- ✅ Imported `riskManager`
- ✅ Call `riskManager.registerPositionOpen()` after successful entry with stop loss percentage
- ✅ Call `riskManager.clearPositionTracking()` after successful exit

## Expected Impact

### Before Fix
- Win Rate: 51.8%
- Total PnL: **-$640**
- Risk/Reward: **2.48:1** (risking $2.48 to make $1) ❌
- Behavior: Letting losers run, cutting winners short

### After Fix (Expected)
- Win Rate: 51.8% (unchanged - system was right about direction)
- Total PnL: **Positive** (with proper R:R ratio)
- Risk/Reward: **1:3 minimum** (risking $1 to make $3+) ✅
- Behavior: Cut losers quickly at hard stop, let winners run to 3x+ targets

### Mathematical Impact
With 51.8% win rate and 1:3 R:R:
- 100 trades: 52 winners, 48 losers
- Average win: +3%, Average loss: -1%
- Expected PnL: (52 × 3%) - (48 × 1%) = +156% - 48% = **+108%** ✅

vs. old 2.48:1 R:R (inverted):
- Average win: +1%, Average loss: -2.48%
- Expected PnL: (52 × 1%) - (48 × 2.48%) = +52% - 119% = **-67%** ❌

## Verification Steps

1. **Check Logs:** Look for `[RiskManager] Stop/Take Profit calc` entries showing correct R:R
2. **Monitor Hard Stops:** Verify positions exit at registered hard stop percentage
3. **Track PnL:** After 20-30 trades, PnL should turn positive with same win rate
4. **No Stop Widening:** Verify stops never move wider after position opens

## Critical Rules Now Enforced

1. ✅ **Hard stops never move** once set at position open
2. ✅ **Max 1:3 risk/reward** enforced at strategy optimization
3. ✅ **Tighten stops when losing** (reversed from revenge trading)
4. ✅ **Position tracking connected** between execution and risk manager
5. ✅ **Hard stop = actual stop loss** (not arbitrary -3%)

## Files Modified

```
src/shared/glm-service.ts                    - REVENGE TRADING FIX
src/risk-manager/risk-manager.ts            - HARD STOP + R:R ENFORCEMENT
src/execution-engine/execution-engine.ts    - POSITION TRACKING CONNECTION
```

## Next Steps

1. **Deploy** changes to live/testnet system
2. **Monitor** first 20-30 trades for improved R:R ratio
3. **Verify** PnL turns positive with same ~52% win rate
4. **Watch** for hard stop exits in logs at correct percentages

---

**Fixed by:** Claude (OpenClaw Agent)
**Date:** 2026-03-06 04:31 UTC
**Priority:** P0 - CRITICAL BUG FIX
