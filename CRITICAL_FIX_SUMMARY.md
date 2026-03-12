# CRITICAL FIX: Execution Engine 0% Fill Rate Issue

## Problem
- **Issue**: 0% fill rate with 86 cancelled orders
- **Symptom**: Orders were being placed but immediately cancelled
- **Root Cause**: All reduce-only (exit) orders were using `Ioc` (Immediate-Or-Cancel) time-in-force

## Root Cause Analysis

### The Bug
In `hyperliquid-client.ts`, line ~815 (before fix):

```typescript
const marketLikeOrder = requestedOrderType === 'market' || params.reduceOnly === true;
const orderTypeConfig = {
    limit: { tif: marketLikeOrder ? ('Ioc' as const) : ('Gtc' as const) }
};
```

This meant:
- **Market orders** → `Ioc` (correct - needs immediate fill)
- **Reduce-only orders** → `Ioc` (INCORRECT - these are exit orders that should stay open)
- **Regular limit orders** → `Gtc` (correct)

### Why This Caused 0% Fill Rate

With `Ioc` (Immediate-Or-Cancel):
1. Order is submitted to Hyperliquid
2. If it can't be filled **immediately** at the specified price, it's cancelled
3. No order stays on the book - it's either filled or cancelled instantly

Since exit orders (reduce-only) were using `Ioc`:
- If the market moved even slightly between getting the price and placing the order
- Or if there wasn't enough liquidity at that exact moment
- The order would be immediately cancelled
- Result: 0% fill rate, 86 cancelled orders

## The Fix

### 1. Changed Order Type Logic (hyperliquid-client.ts, line ~815)

**Before:**
```typescript
const marketLikeOrder = requestedOrderType === 'market' || params.reduceOnly === true;
const orderTypeConfig = {
    limit: { tif: marketLikeOrder ? ('Ioc' as const) : ('Gtc' as const) }
};
```

**After:**
```typescript
// CRITICAL FIX: Only use IOC for actual market orders, NOT for reduce-only limit orders
const isMarketOrder = requestedOrderType === 'market';
const useIoc = isMarketOrder;

// CRITICAL FIX: Use GTC for limit orders (including reduce-only) to ensure they stay open
const orderTypeConfig = {
    limit: { tif: useIoc ? ('Ioc' as const) : ('Gtc' as const) }
};
```

**Result:**
- **Market orders** → `Ioc` (immediate execution or cancel)
- **Reduce-only limit orders** → `Gtc` (stay on book until filled or explicitly cancelled) ✅
- **Regular limit orders** → `Gtc` (stay on book until filled or explicitly cancelled) ✅

### 2. Added Periodic Order Timeout Monitor (hyperliquid-client.ts, constructor)

**Added:**
```typescript
// CRITICAL FIX: Start periodic order timeout monitor (every 30 seconds)
private orderTimeoutMonitor: NodeJS.Timeout | null = null;
private readonly ORDER_TIMEOUT_CHECK_INTERVAL_MS = 30000;

private startOrderTimeoutMonitor(): void {
    this.orderTimeoutMonitor = setInterval(async () => {
        await this.checkOrderTimeouts();
    }, this.ORDER_TIMEOUT_CHECK_INTERVAL_MS);
}
```

**Why:** Ensures orders are properly monitored for timeouts even when no new orders are being placed.

## Order Lifecycle After Fix

1. **Entry Order (limit)** → `Gtc` → Stays on book until filled or cancelled
2. **Exit Order (reduce-only limit)** → `Gtc` → Stays on book until filled or cancelled ✅
3. **Market Order** → `Ioc` → Fills immediately or cancels (correct behavior)

## Expected Results

- **Fill Rate**: Should increase from 0% to normal levels (typically 60-90% for limit orders)
- **Order Status**: Orders will show as "RESTING" instead of being immediately cancelled
- **Cancelled Orders**: Will only occur due to:
  - Explicit cancellation (user request, timeout after 5 minutes)
  - Insufficient margin
  - Invalid price/size
  - Circuit breaker triggered (after 100 cancellations in 10 minutes)

## Monitoring

### Key Metrics to Watch
1. **Fill Rate**: Should be > 50% for limit orders
2. **Order Status Distribution**: Should see "FILLED" and "RESTING" statuses
3. **Cancel Reasons**: Should be specific (margin, timeout, etc.) not just "Ioc"

### Log Messages to Look For
- `[PlaceOrder] Order RESTING: ...` - Order is on the book waiting to fill
- `[PlaceOrder] Order FILLED: ...` - Order was filled
- `[OrderStats] ... fillRate=X%` - Should be > 50%

### Dashboard Indicators
- Fill rate should increase significantly
- Number of resting orders should be > 0
- Cancelled order count should decrease dramatically

## Testing Recommendations

1. **Place a limit order** (entry or exit) - should stay on book
2. **Check order status** - should be "RESTING" not "CANCELLED"
3. **Monitor fill rate** - should increase over time
4. **Verify timeout** - orders should only cancel after 5 minutes if not filled

## Files Modified

1. `/home/d/PerpsTrader/src/execution-engine/hyperliquid-client.ts`
   - Line ~815: Fixed order type logic to use GTC for reduce-only limit orders
   - Constructor: Added periodic order timeout monitor

## Additional Notes

- **Order Timeout**: 5 minutes (300 seconds) - orders that don't fill in 5 minutes are cancelled
- **Circuit Breaker**: Triggers after 100 cancelled orders in 10 minutes, blocks new orders for 30 minutes
- **Confidence Threshold**: 0.85 - orders below this confidence are rejected
- **Cooldown**: 10 seconds between orders for same symbol (5 second minimum)

## Verification Steps

1. ✅ Fix applied to hyperliquid-client.ts
2. ✅ Code compiles without errors
3. ✅ Order type logic verified (GTC for limit orders)
4. ✅ Periodic monitor added for timeout checks
5. ⏳ Test with live trading (monitor fill rates)
