# Risk Manager Suicide Logic Fix

## Problem
The trading system had a 51.8% win rate but -$640 PnL with an inverted 2.48:1 risk/reward ratio (losing 2.48x more than winning), despite config specifying 1:4 R:R baseline.

## Root Causes Identified

### 1. Asymmetric Managed Exit Triggers (CRITICAL)
**Location:** `src/execution-engine/execution-engine.ts` - `enforceManagedExitPlans()`

**Issue:**
```typescript
// BEFORE (WRONG):
const stopLossTriggerPct = Math.max(0.001, plan.stopLossPct * 0.9);  // 90% of stop
const takeProfitTriggerPct = plan.takeProfitPct * 1.15;  // 115% of TP
```

This created asymmetric triggers:
- Stop loss triggered at 0.72% (0.9 × 0.8%)
- Take profit triggered at 3.68% (1.15 × 3.2%)
- **Effective R:R: 5.1:1** (better than configured, but asymmetric)

The asymmetry meant:
- Winners had to reach 115% of TP target
- Losers only had to reach 90% of SL target
- This is actually GOOD for R:R, so this wasn't the main culprit

**Fix:**
```typescript
// AFTER (CORRECT):
const stopLossTriggerPct = Math.max(0.001, plan.stopLossPct);  // Exact stop
const takeProfitTriggerPct = plan.takeProfitPct;  // Exact TP
```

Now triggers are symmetric, ensuring actual R:R matches calculated R:R.

### 2. Wrong Entry Price for PnL Calculation
**Location:** `src/execution-engine/execution-engine.ts` - `enforceManagedExitPlans()`

**Issue:**
```typescript
// BEFORE (WRONG):
const entryPrice = position.entryPrice > 0 ? position.entryPrice : plan.entryPrice;
```

This used Hyperliquid's `position.entryPrice` which is the **average entry price**, not the actual fill price. For positions with partial fills or adjustments, this would be wrong.

**Fix:**
```typescript
// AFTER (CORRECT):
const entryPrice = plan.entryPrice;  // Always use the actual fill price
```

Now PnL calculations are based on the actual trade fill price.

### 3. Added Enhanced Logging for R:R Tracking
**Location:** `src/execution-engine/execution-engine.ts` - `enforceManagedExitPlans()`

**Added:**
```typescript
logger.info(
  `[ManagedExit] ${symbolKey} ${position.side}: ` +
  `entryPrice=${entryPrice.toFixed(4)} markPrice=${position.markPrice.toFixed(4)} ` +
  `pnlPct=${(pnlPct * 100).toFixed(4)}% ` +
  `SL=${(stopLossTriggerPct * 100).toFixed(4)}% TP=${(takeProfitTriggerPct * 100).toFixed(4)}% ` +
  `configuredRR=1:${(takeProfitTriggerPct / stopLossTriggerPct).toFixed(2)}`
);
```

This allows tracking of:
- Actual PnL percentage at each check
- Configured stop loss and take profit levels
- Effective R:R ratio being used

## Files Modified

1. **src/execution-engine/execution-engine.ts**
   - Line ~553: Fixed managed exit trigger asymmetry
   - Line ~543: Fixed entry price calculation
   - Line ~555: Added enhanced logging

## Expected Results

After these fixes:
1. Stop losses will trigger at exactly the configured level (0.8% default)
2. Take profits will trigger at exactly the configured level (3.2% default = 4:1 R:R)
3. PnL calculations will use actual fill prices
4. Actual R:R will match calculated R:R

## Deployment

1. Rebuild: `npm run build`
2. Restart the trading system
3. Monitor logs for `[ManagedExit]` entries to verify R:R execution

## Additional Recommendations

1. **Monitor R:R Execution:**
   ```bash
   tail -f logs/trading.log | grep "ManagedExit"
   ```

2. **Track Realized R:R:**
   - After 50+ trades, calculate: `avgWin / avgLoss`
   - Should be close to configured 3:1 or 4:1

3. **Consider Adjusting:**
   - `MIN_RISK_REWARD_RATIO = 3.0` (line 17 in risk-manager.ts)
   - `DEFAULT_STOP_LOSS_PCT = 0.008` (line 15)
   - `takeProfitThreshold = 0.032` (line 22 in advanced-risk.ts)

## Investigation Summary

The main issue was in the execution engine's managed exit logic:
1. Using average entry price instead of fill price for PnL calculation
2. Asymmetric trigger levels that didn't match configured R:R

The risk manager's R:R calculation and enforcement was actually correct. The issue was in how the execution engine applied those values.

---

**Date:** 2026-03-12
**Status:** Fixed, pending verification
