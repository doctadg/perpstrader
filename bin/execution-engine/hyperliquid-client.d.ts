/**
 * Hyperliquid SDK Client Wrapper
 *
 * Provides a centralized interface for interacting with Hyperliquid testnet/mainnet
 * using the @nktkas/hyperliquid SDK with proper EIP-712 signing.
 *
 * Enhanced with Nautilus-inspired features:
 * - Token bucket rate limiting
 * - Overfill protection
 * - State snapshots
 * - Message bus integration
 * - ENHANCED: Anti-churn protections with exponential backoff
 */
export interface HyperliquidPosition {
    symbol: string;
    side: 'LONG' | 'SHORT';
    size: number;
    entryPrice: number;
    markPrice: number;
    unrealizedPnL: number;
    leverage: number;
    marginUsed: number;
}
export interface HyperliquidAccountState {
    equity: number;
    withdrawable: number;
    positions: HyperliquidPosition[];
    marginUsed: number;
}
export interface HyperliquidOrderResult {
    success: boolean;
    orderId?: string;
    filledPrice?: number;
    filledSize?: number;
    status: string;
    error?: string;
}
interface OrderStats {
    submitted: number;
    filled: number;
    failed: number;
    lastFailureTime?: number;
    consecutiveFailures: number;
}
interface OrderAttempt {
    count: number;
    lastAttempt: number;
    consecutiveFailures: number;
    lastSuccess?: number;
}
export declare class HyperliquidClient {
    private transport;
    private publicClient;
    private walletClient;
    private wallet;
    private walletAddress;
    private userAddress;
    private isTestnet;
    private assetIndices;
    private assetNames;
    private assetSizeDecimals;
    private isInitialized;
    private readonly ORDER_TIMEOUT_MS;
    private pendingOrders;
    private pendingOrdersByDirection;
    private orderStats;
    private lastOrderTime;
    private readonly ORDER_COOLDOWN_MS;
    private readonly MIN_ORDER_COOLDOWN_MS;
    private readonly EXTENDED_COOLDOWN_MS;
    private readonly CANCEL_COOLDOWN_BASE_MS;
    private readonly CANCEL_COOLDOWN_MAX_MS;
    private cancelCooldownUntil;
    private orderAttemptCount;
    private readonly MAX_ORDERS_PER_MINUTE;
    private ordersPerMinuteWindow;
    private readonly DUPLICATE_ORDER_WINDOW_MS;
    private pendingOrderSignatures;
    private readonly SIGNATURE_TTL_MS;
    private readonly MAX_CONSECUTIVE_FAILURES;
    private readonly FAILURE_BACKOFF_MULTIPLIER;
    private readonly MAX_BACKOFF_MS;
    private readonly CANCELLED_WINDOW_MS;
    private readonly CANCELLED_THRESHOLD;
    private readonly CIRCUIT_BREAKER_DURATION_MS;
    private cancelledOrderWindow;
    private circuitBreakerUntil;
    private readonly MIN_ORDER_SIZES;
    private readonly MIN_CONFIDENCE;
    private readonly MIN_MARKET_CONFIDENCE;
    private readonly MARKET_ORDER_TIF;
    private hasWarnedIocFallback;
    private readonly MIN_ORDER_AGE_BEFORE_CANCEL_MS;
    private readonly MIN_ENTRY_NOTIONAL_USD;
    private readonly MIN_ORDER_BOOK_LEVELS;
    private readonly MIN_ORDER_BOOK_NOTIONAL_DEPTH_K;
    private readonly MAX_ALLOWED_SPREAD;
    private readonly MIN_FILL_RATE;
    private readonly CRITICAL_FILL_RATE;
    private symbolFillRates;
    constructor();
    /**
     * CRITICAL FIX: Periodic monitor to check for order timeouts
     * Ensures orders are properly tracked even when no new orders are being placed
     */
    private orderTimeoutMonitor;
    private readonly ORDER_TIMEOUT_CHECK_INTERVAL_MS;
    private startOrderTimeoutMonitor;
    initialize(): Promise<void>;
    isConfigured(): boolean;
    getWalletAddress(): string;
    getUserAddress(): string;
    getAssetIndex(symbol: string): number | undefined;
    private normalizeSymbol;
    private getMinimumSizeStep;
    private getMinimumOrderSize;
    private countSignificantFigures;
    private isPricePrecisionValid;
    private classifyOrderError;
    getAllMids(): Promise<Record<string, number>>;
    getAccountState(): Promise<HyperliquidAccountState>;
    getOpenOrders(): Promise<any[]>;
    /**
     * CRITICAL FIX: Check max orders per minute limit
     */
    private checkOrdersPerMinute;
    /**
     * ENHANCED: Calculate dynamic cooldown based on recent failure history
     */
    private calculateDynamicCooldown;
    /**
     * ENHANCED: Check if we should allow a new order for this symbol (comprehensive churn prevention)
     */
    private canPlaceNewOrder;
    /**
     * ENHANCED: Record order attempt result with comprehensive tracking
     */
    private recordOrderAttempt;
    private recordPendingAttempt;
    private clearCancelCooldown;
    private applyCancellationCooldown;
    /**
     * ENHANCED: Get fill rate for a symbol
     */
    private getSymbolFillRate;
    /**
     * ENHANCED: Update order stats with fill rate tracking
     */
    private updateOrderStats;
    private calculateDepthNotional;
    private validateOrderBookDepth;
    private checkSpread;
    private resolveOrderTif;
    private isIocCancellation;
    private getOpenOrderIdSet;
    private getDirectionKey;
    private trackPendingOrder;
    private clearPendingOrder;
    private getPendingOrderAgeMs;
    private getTrackedPendingOrder;
    private findRecentDuplicatePendingOrder;
    private findAnyPendingOrderByDirection;
    private recordCancelledOrder;
    isCircuitBreakerActive(): boolean;
    placeOrder(params: {
        symbol: string;
        side: 'BUY' | 'SELL';
        size: number;
        price?: number;
        reduceOnly?: boolean;
        bypassCooldown?: boolean;
        orderType?: 'limit' | 'market';
        clientOrderId?: string;
        confidence?: number;
    }): Promise<HyperliquidOrderResult>;
    placeStopOrder(params: {
        symbol: string;
        side: 'BUY' | 'SELL';
        size: number;
        triggerPrice: number;
        tpsl: 'sl' | 'tp';
        reduceOnly?: boolean;
    }): Promise<HyperliquidOrderResult>;
    private validateOrderSize;
    private getAggressiveMarketPrice;
    private getBufferedBookPrice;
    private isRetryableError;
    checkOrderTimeouts(): Promise<void>;
    cancelOrder(symbol: string, orderId: string, trackCancelledWindow?: boolean, forceCancel?: boolean): Promise<boolean>;
    cancelAllOrders(forceCancel?: boolean): Promise<boolean>;
    updateLeverage(symbol: string, leverage: number, isCross?: boolean): Promise<boolean>;
    private getSizeDecimals;
    private getPriceDecimals;
    private formatPrice;
    private formatSize;
    getL2Book(symbol: string): Promise<any>;
    getRecentTrades(symbol: string): Promise<any[]>;
    hasPendingOrder(symbol: string, side?: 'BUY' | 'SELL'): boolean;
    /**
     * Get anti-churn statistics for monitoring
     */
    getAntiChurnStats(): {
        orderStats: Record<string, OrderStats>;
        fillRates: Record<string, {
            rate: number;
            filled: number;
            total: number;
        }>;
        attemptCounts: Record<string, OrderAttempt>;
        pendingOrders: number;
        ordersPerMinute: Record<string, {
            count: number;
            windowStart: number;
        }>;
    };
}
declare const hyperliquidClient: HyperliquidClient;
export default hyperliquidClient;
//# sourceMappingURL=hyperliquid-client.d.ts.map