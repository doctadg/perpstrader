import { TradingSignal, Trade, Portfolio, Position, RiskAssessment } from '../shared/types';
interface SignalFingerprint {
    action: 'BUY' | 'SELL' | 'HOLD';
    price: number;
    confidence: number;
    reason: string;
    timestamp: number;
}
export declare class ExecutionEngine {
    private readonly MIN_SIGNAL_CONFIDENCE;
    private readonly MIN_MARKET_SIGNAL_CONFIDENCE;
    private readonly ORDER_COOLDOWN_MS;
    private readonly MIN_ORDER_COOLDOWN_MS;
    private readonly FAILURE_COOLDOWN_BASE_MS;
    private readonly FAILURE_COOLDOWN_MAX_MS;
    private readonly MIN_ENTRY_NOTIONAL_USD;
    private readonly SIGNAL_DEDUP_WINDOW_MS;
    private readonly SIGNAL_PRICE_THRESHOLD;
    private readonly MAX_SIGNALS_PER_MINUTE;
    private readonly EXIT_PLAN_CHECK_INTERVAL_MS;
    private orderStats;
    private lastOrderTime;
    private lastSignalFingerprint;
    private signalCountWindow;
    private failureCooldownUntil;
    private lastCancellationTime;
    private readonly CANCELLATION_COOLDOWN_MS;
    private hourlyOrderAttempts;
    private readonly MAX_ORDERS_PER_COIN_PER_HOUR;
    private positionExitPlans;
    private nativeStopOrders;
    private pendingManagedExitSymbols;
    private exitPlanMonitor;
    private lastPaperExitLogTime;
    private isTestnet;
    private isEnforcing;
    private static priceSubscriptionInitialized;
    private marketDataHandler;
    private orderBookHandler;
    constructor();
    private initializeClient;
    /**
     * Subscribe to MARKET_DATA and ORDER_BOOK_UPDATE channels to keep
     * currentPrices fresh for SL/TP exit monitoring. Uses a static flag
     * so the singleton never double-subscribes.
     */
    private subscribeToMarketPrices;
    /**
     * Unsubscribe from market price channels (call on shutdown)
     */
    unsubscribeFromMarketPrices(): Promise<void>;
    /**
     * Generate a fingerprint for a signal to detect duplicates
     */
    private generateSignalFingerprint;
    /**
     * Check if a signal is a duplicate of a recent signal
     */
    private isDuplicateSignal;
    /**
     * Check signal rate limiting (signals per minute)
     */
    private checkSignalRateLimit;
    private applyFailureCooldown;
    private clearFailureCooldown;
    private classifyOrderFailure;
    /**
     * Update current price for a symbol (for portfolio valuation)
     */
    updatePrice(symbol: string, price: number): void;
    private isExitSignalForPosition;
    private registerManagedExitPlan;
    private clearManagedExitPlan;
    private submitNativeStopOrders;
    private cancelTrackedNativeStopOrders;
    private startExitPlanMonitor;
    private enforceManagedExitPlans;
    executeSignal(signal: TradingSignal, riskAssessment: RiskAssessment): Promise<Trade>;
    getPortfolio(): Promise<Portfolio>;
    cancelOrder(orderId: string, symbol?: string): Promise<boolean>;
    getOpenOrders(symbol?: string): Promise<any[]>;
    getHistoricalTrades(symbol: string, limit?: number): Promise<any[]>;
    getMarketData(symbol: string): Promise<any>;
    subscribeToWebSocket(callback: (data: any) => void): Promise<void>;
    unsubscribeFromWebSocket(): void;
    emergencyStop(): Promise<void>;
    validateCredentials(): Promise<boolean>;
    isConfigured(): boolean;
    getEnvironment(): string;
    /**
     * Get recently executed trades from DB
     * Replaces getPaperTrades
     */
    getRecentTrades(limit?: number): Promise<Trade[]>;
    /**
     * Get current positions from Hyperliquid
     * Replaces getPaperPositions
     */
    getPositions(): Promise<Position[]>;
    /**
     * Get realized P&L from DB
     * Replaces getPaperRealizedPnL (Approximation)
     */
    getRealizedPnL(): Promise<number>;
    /**
     * Get the wallet address being used
     */
    getWalletAddress(): string;
    /**
     * Get anti-churn statistics for monitoring
     */
    getAntiChurnStats(): {
        cooldownActive: string[];
        failureCooldownActive: string[];
        cancellationCooldownActive: string[];
        recentSignals: Record<string, SignalFingerprint>;
        signalRateLimits: Record<string, {
            count: number;
            windowStart: number;
        }>;
        orderStats: Record<string, {
            submitted: number;
            filled: number;
            cancelled: number;
            fillRate: number;
            cancelRatio: number;
        }>;
    };
}
declare const executionEngine: ExecutionEngine;
export default executionEngine;
//# sourceMappingURL=execution-engine.d.ts.map