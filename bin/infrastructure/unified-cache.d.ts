/**
 * Unified Cache Layer
 *
 * Inspired by Nautilus Trader's centralized cache system.
 * Provides a unified interface for all trading data with indexing and fast lookups.
 *
 * Features:
 * - Multi-type data storage (orders, positions, instruments, market data)
 * - Fast indexed lookups
 * - Automatic expiration
 * - Integrity checking
 * - Snapshot support
 */
/**
 * Instrument data
 */
export interface Instrument {
    id: string;
    symbol: string;
    baseCurrency: string;
    quoteCurrency: string;
    pricePrecision: number;
    sizePrecision: number;
    minQuantity: number;
    maxQuantity: number;
    tickSize: number;
    multiplier: number;
}
/**
 * Cached order book
 */
export interface CachedOrderBook {
    symbol: string;
    bids: Map<number, number>;
    asks: Map<number, number>;
    lastUpdate: number;
    midPrice?: number;
    spread?: number;
}
export interface CachedOrder {
    orderId: string;
    clientOrderId: string;
    venueOrderId?: string;
    symbol: string;
    side: 'BUY' | 'SELL';
    quantity: number;
    price: number;
    filledQuantity: number;
    avgFillPrice: number;
    status: string;
    timestamp: number;
    venue?: string;
}
export interface CachedPosition {
    symbol: string;
    side: 'LONG' | 'SHORT';
    quantity: number;
    entryPrice: number;
    markPrice: number;
    unrealizedPnL: number;
    leverage: number;
    marginUsed: number;
    timestamp: number;
}
export interface MarketDataCache {
    symbol: string;
    bids: [number, number][];
    asks: [number, number][];
    lastTrade: {
        price: number;
        size: number;
        timestamp: number;
    } | null;
    lastUpdate: number;
}
export interface CacheConfig {
    /** Default TTL for cached items (ms) */
    defaultTtl: number;
    /** Maximum orders to cache */
    maxOrders: number;
    /** Maximum market data history per symbol */
    maxMarketDataHistory: number;
    /** Whether to enable automatic cleanup */
    autoCleanup: boolean;
    /** Cleanup interval (ms) */
    cleanupInterval: number;
}
/**
 * Unified Cache for all trading data
 */
export declare class UnifiedCache {
    private index;
    private config;
    private cleanupTimer;
    private cacheHits;
    private cacheMisses;
    constructor(config?: Partial<CacheConfig>);
    /**
     * Add or update an instrument
     */
    addInstrument(instrument: Instrument): void;
    /**
     * Get instrument by ID
     */
    getInstrument(id: string): Instrument | undefined;
    /**
     * Get instrument by symbol
     */
    getInstrumentBySymbol(symbol: string): Instrument | undefined;
    /**
     * Get all instruments
     */
    getAllInstruments(): Instrument[];
    /**
     * Add or update an order
     */
    addOrder(order: CachedOrder): void;
    /**
     * Get order by ID
     */
    getOrder(orderId: string): CachedOrder | undefined;
    /**
     * Get all orders for a symbol
     */
    getOrdersForSymbol(symbol: string): CachedOrder[];
    /**
     * Get all orders for a venue
     */
    getOrdersForVenue(venue: string): CachedOrder[];
    /**
     * Remove an order
     */
    removeOrder(orderId: string): void;
    /**
     * Add or update a position
     */
    addPosition(position: CachedPosition): void;
    /**
     * Get positions for a symbol
     */
    getPositions(symbol: string): CachedPosition[];
    /**
     * Get all positions
     */
    getAllPositions(): CachedPosition[];
    /**
     * Remove position
     */
    removePosition(symbol: string, side: 'LONG' | 'SHORT'): void;
    /**
     * Update order book
     */
    updateOrderBook(symbol: string, bids: [number, number][], asks: [number, number][]): void;
    /**
     * Get order book
     */
    getOrderBook(symbol: string): CachedOrderBook | undefined;
    /**
     * Get best bid
     */
    getBestBid(symbol: string): number | undefined;
    /**
     * Get best ask
     */
    getBestAsk(symbol: string): number | undefined;
    /**
     * Get mid price
     */
    getMidPrice(symbol: string): number | undefined;
    /**
     * Update market data
     */
    updateMarketData(data: MarketDataCache): void;
    /**
     * Get market data
     */
    getMarketData(symbol: string): MarketDataCache | undefined;
    /**
     * Record cache hit/miss
     */
    private recordHit;
    /**
     * Get cache statistics
     */
    getStatistics(): {
        orders: number;
        positions: number;
        instruments: number;
        orderBooks: number;
        hitRate: number;
        hits: number;
        misses: number;
    };
    /**
     * Check cache integrity
     */
    checkIntegrity(): {
        valid: boolean;
        errors: string[];
    };
    /**
     * Start automatic cleanup
     */
    private startCleanup;
    /**
     * Cleanup expired entries
     */
    private cleanup;
    /**
     * Clear all cache
     */
    clear(): void;
    /**
     * Shutdown
     */
    shutdown(): void;
    /**
     * Export cache state
     */
    export(): {
        orders: CachedOrder[];
        positions: CachedPosition[];
        instruments: Instrument[];
    };
    /**
     * Import cache state
     */
    import(data: {
        orders?: CachedOrder[];
        positions?: CachedPosition[];
        instruments?: Instrument[];
    }): void;
}
declare const unifiedCache: UnifiedCache;
export default unifiedCache;
//# sourceMappingURL=unified-cache.d.ts.map