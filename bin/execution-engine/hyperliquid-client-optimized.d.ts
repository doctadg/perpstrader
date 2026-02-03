/**
 * Optimized Hyperliquid Client
 * Performance improvements:
 * - Request batching and deduplication
 * - Response caching
 * - Connection keep-alive
 * - Request coalescing
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
export declare class OptimizedHyperliquidClient {
    private transport;
    private publicClient;
    private walletClient;
    private wallet;
    private walletAddress;
    private userAddress;
    private isTestnet;
    private assetIndices;
    private assetNames;
    private isInitialized;
    private lastMetaFetch;
    private pendingRequests;
    private responseCache;
    private readonly CACHE_TTL;
    constructor();
    /**
     * Initialize asset indices from the API (with caching)
     */
    initialize(): Promise<void>;
    /**
     * Deduplicate concurrent requests
     */
    private dedupRequest;
    /**
     * Check if the client is configured for trading
     */
    isConfigured(): boolean;
    /**
     * Get the wallet address (signer)
     */
    getWalletAddress(): string;
    /**
     * Get the user address (target account)
     */
    getUserAddress(): string;
    /**
     * Get asset index by symbol
     */
    getAssetIndex(symbol: string): number | undefined;
    /**
     * Get all current mid prices (with caching and deduplication)
     */
    getAllMids(): Promise<Record<string, number>>;
    /**
     * Get account state (with caching and deduplication)
     */
    getAccountState(): Promise<HyperliquidAccountState>;
    /**
     * Get open orders (with caching)
     */
    getOpenOrders(): Promise<any[]>;
    /**
     * Place an order (with batching support)
     */
    placeOrder(params: {
        symbol: string;
        side: 'BUY' | 'SELL';
        size: number;
        price?: number;
        reduceOnly?: boolean;
        orderType?: 'limit' | 'market';
        clientOrderId?: string;
    }): Promise<HyperliquidOrderResult>;
    /**
     * Check if an error is retryable
     */
    private isRetryableError;
    /**
     * Cancel an order
     */
    cancelOrder(symbol: string, orderId: string): Promise<boolean>;
    /**
     * Cancel all open orders
     */
    cancelAllOrders(): Promise<boolean>;
    /**
     * Update leverage for a symbol
     */
    updateLeverage(symbol: string, leverage: number, isCross?: boolean): Promise<boolean>;
    /**
     * Format price to appropriate precision for the asset
     */
    private formatPrice;
    /**
     * Format size to appropriate precision for the asset
     */
    private formatSize;
    /**
     * Get L2 order book
     */
    getL2Book(symbol: string): Promise<any>;
    /**
     * Clear all caches
     */
    clearCaches(): void;
    /**
     * Get cache stats
     */
    getCacheStats(): {
        cachedEntries: number;
        pendingRequests: number;
    };
}
declare const optimizedHyperliquidClient: OptimizedHyperliquidClient;
export default optimizedHyperliquidClient;
//# sourceMappingURL=hyperliquid-client-optimized.d.ts.map