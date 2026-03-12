import assert from 'assert';
import hyperliquidClient, { HyperliquidClient } from '../src/execution-engine/hyperliquid-client';
import { hyperliquidRateLimiter } from '../src/infrastructure/token-bucket';

async function run(): Promise<void> {
    const client = new HyperliquidClient();
    const internal = client as any;

    if (internal.orderTimeoutMonitor) {
        clearInterval(internal.orderTimeoutMonitor);
        internal.orderTimeoutMonitor = null;
    }

    internal.wallet = { address: '0x1111111111111111111111111111111111111111' };
    internal.walletAddress = '0x1111111111111111111111111111111111111111';
    internal.userAddress = '0x1111111111111111111111111111111111111111';
    internal.walletClient = {
        order: async (_payload: any) => ({
            status: 'ok',
            response: {
                data: {
                    statuses: [
                        { resting: { oid: 101 } }
                    ]
                }
            }
        }),
        cancel: async (_payload: any) => ({ status: 'ok' })
    };

    internal.initialize = async () => {
        internal.isInitialized = true;
    };
    internal.checkOrderTimeouts = async () => {};
    internal.getAggressiveMarketPrice = async () => 50000;
    internal.getBufferedBookPrice = async () => 50010;
    internal.assetIndices.set('BTC', 0);

    (hyperliquidRateLimiter as any).throttleExchangeRequest = async () => {};
    (hyperliquidRateLimiter as any).throttleInfoRequest = async () => {};

    let observedTif: string | undefined;
    let orderCallCount = 0;
    internal.walletClient.order = async (payload: any) => {
        orderCallCount += 1;
        observedTif = payload.orders?.[0]?.t?.limit?.tif;
        return {
            status: 'ok',
            response: {
                data: {
                    statuses: [
                        { resting: { oid: 101 } }
                    ]
                }
            }
        };
    };

    const restingResult = await client.placeOrder({
        symbol: 'BTC',
        side: 'BUY',
        size: 0.01,
        orderType: 'market',
        confidence: 0.95,
        bypassCooldown: true
    });

    assert.strictEqual(restingResult.success, true, 'market-intent order should be accepted');
    assert.strictEqual(restingResult.status, 'RESTING', 'market-intent order should be able to rest');
    assert.strictEqual(observedTif, 'Gtc', 'market-intent order should use GTC by default');

    // Ensure same-direction pending orders block churn beyond the short duplicate window.
    internal.orderAttemptCount.clear();
    internal.lastOrderTime.clear();
    internal.cancelCooldownUntil.clear();
    internal.trackPendingOrder('301', 'BTC', 'BUY', Date.now() - 15000, 'limit', 'Gtc', false);

    const pendingBlocked = await client.placeOrder({
        symbol: 'BTC',
        side: 'BUY',
        size: 0.02,
        orderType: 'limit',
        confidence: 0.95,
    });
    assert.strictEqual(pendingBlocked.success, false, 'same-direction pending order should block new placement');
    assert.strictEqual(pendingBlocked.status, 'PENDING_ORDER', 'pending order guard should return PENDING_ORDER');

    // Precision guard for low-priced assets should never collapse to zero.
    internal.assetSizeDecimals.set('PUMP', 2);
    const lowPriceFormatted = internal.formatPrice(0.001915, 'PUMP');
    assert.notStrictEqual(lowPriceFormatted, '0.00', 'low-priced assets should not be rounded to zero');

    // Minimum notional guard should reject undersized entry orders pre-flight.
    const callsBeforeMinNotional = orderCallCount;
    internal.pendingOrders.clear();
    internal.pendingOrdersByDirection.clear();
    internal.orderAttemptCount.clear();
    internal.lastOrderTime.clear();
    internal.cancelCooldownUntil.clear();
    const minNotionalResult = await client.placeOrder({
        symbol: 'BTC',
        side: 'BUY',
        size: 0.0001,
        price: 50000,
        orderType: 'limit',
        confidence: 0.95,
        bypassCooldown: true
    });
    assert.strictEqual(minNotionalResult.success, false, 'undersized notional should be rejected');
    assert.strictEqual(minNotionalResult.status, 'MIN_NOTIONAL', 'minimum notional guard should return MIN_NOTIONAL');
    assert.strictEqual(orderCallCount, callsBeforeMinNotional, 'exchange order call should be skipped for MIN_NOTIONAL');

    let cancelCallCount = 0;
    internal.walletClient.cancel = async (_payload: any) => {
        cancelCallCount += 1;
        return { status: 'ok' };
    };

    internal.trackPendingOrder('201', 'BTC', 'BUY', Date.now(), 'limit', 'Gtc', false);
    const earlyCancel = await client.cancelOrder('BTC', '201');
    assert.strictEqual(earlyCancel, false, 'cancel should be blocked before min order age');
    assert.strictEqual(cancelCallCount, 0, 'exchange cancel should not be called for early cancellation');

    const minAgeMs = internal.MIN_ORDER_AGE_BEFORE_CANCEL_MS as number;
    internal.trackPendingOrder('202', 'BTC', 'BUY', Date.now() - minAgeMs - 1000, 'limit', 'Gtc', false);
    const matureCancel = await client.cancelOrder('BTC', '202');
    assert.strictEqual(matureCancel, true, 'cancel should succeed after min order age');
    assert.strictEqual(cancelCallCount, 1, 'exchange cancel should be called for mature cancellation');

    const sharedClient = hyperliquidClient as any;
    if (sharedClient.orderTimeoutMonitor) {
        clearInterval(sharedClient.orderTimeoutMonitor);
        sharedClient.orderTimeoutMonitor = null;
    }

    console.log('PASS: execution churn fix regression checks');
    process.exit(0);
}

run().catch((error) => {
    console.error('FAIL: execution churn fix regression checks', error);
    process.exit(1);
});
