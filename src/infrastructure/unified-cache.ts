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

import logger from '../shared/logger';

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
    bids: Map<number, number>; // price -> size
    asks: Map<number, number>;
    lastUpdate: number;
    midPrice?: number;
    spread?: number;
}

/**
 * Cache index for fast lookups
 */
interface CacheIndex {
    // Orders
    ordersById: Map<string, CachedOrder>;
    ordersBySymbol: Map<string, Set<string>>;
    ordersByVenue: Map<string, Set<string>>;

    // Positions
    positionsBySymbol: Map<string, Set<CachedPosition>>;

    // Instruments
    instrumentsById: Map<string, Instrument>;
    instrumentsBySymbol: Map<string, Instrument>;

    // Order books
    orderBooks: Map<string, CachedOrderBook>;

    // Market data
    marketData: Map<string, MarketDataCache>;
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
    bids: [number, number][]; // [price, size]
    asks: [number, number][];
    lastTrade: { price: number; size: number; timestamp: number } | null;
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
export class UnifiedCache {
    private index: CacheIndex;
    private config: CacheConfig;
    private cleanupTimer: NodeJS.Timeout | null = null;
    private cacheHits: Map<string, number> = new Map();
    private cacheMisses: Map<string, number> = new Map();

    constructor(config: Partial<CacheConfig> = {}) {
        this.config = {
            defaultTtl: config.defaultTtl ?? 60000, // 1 minute
            maxOrders: config.maxOrders ?? 10000,
            maxMarketDataHistory: config.maxMarketDataHistory ?? 1000,
            autoCleanup: config.autoCleanup ?? true,
            cleanupInterval: config.cleanupInterval ?? 30000, // 30 seconds
        };

        this.index = {
            ordersById: new Map(),
            ordersBySymbol: new Map(),
            ordersByVenue: new Map(),
            positionsBySymbol: new Map(),
            instrumentsById: new Map(),
            instrumentsBySymbol: new Map(),
            orderBooks: new Map(),
            marketData: new Map(),
        };

        if (this.config.autoCleanup) {
            this.startCleanup();
        }
    }

    // ==================== Instrument Operations ====================

    /**
     * Add or update an instrument
     */
    addInstrument(instrument: Instrument): void {
        this.index.instrumentsById.set(instrument.id, instrument);
        this.index.instrumentsBySymbol.set(instrument.symbol, instrument);
        logger.debug(`[Cache] Added instrument: ${instrument.symbol}`);
    }

    /**
     * Get instrument by ID
     */
    getInstrument(id: string): Instrument | undefined {
        const instrument = this.index.instrumentsById.get(id);
        this.recordHit('instrument', instrument !== undefined);
        return instrument;
    }

    /**
     * Get instrument by symbol
     */
    getInstrumentBySymbol(symbol: string): Instrument | undefined {
        const instrument = this.index.instrumentsBySymbol.get(symbol);
        this.recordHit('instrument', instrument !== undefined);
        return instrument;
    }

    /**
     * Get all instruments
     */
    getAllInstruments(): Instrument[] {
        return Array.from(this.index.instrumentsById.values());
    }

    // ==================== Order Operations ====================

    /**
     * Add or update an order
     */
    addOrder(order: CachedOrder): void {
        // Remove old order if exists
        const existing = this.index.ordersById.get(order.orderId);
        if (existing) {
            this.removeOrder(order.orderId);
        }

        // Enforce limits
        if (this.index.ordersById.size >= this.config.maxOrders) {
            // Remove oldest order
            const oldest = Array.from(this.index.ordersById.values())
                .sort((a, b) => a.timestamp - b.timestamp)[0];
            if (oldest) {
                this.removeOrder(oldest.orderId);
            }
        }

        // Add order
        this.index.ordersById.set(order.orderId, order);

        // Index by symbol
        if (!this.index.ordersBySymbol.has(order.symbol)) {
            this.index.ordersBySymbol.set(order.symbol, new Set());
        }
        this.index.ordersBySymbol.get(order.symbol)!.add(order.orderId);

        // Index by venue
        if (order.venue) {
            if (!this.index.ordersByVenue.has(order.venue)) {
                this.index.ordersByVenue.set(order.venue, new Set());
            }
            this.index.ordersByVenue.get(order.venue)!.add(order.orderId);
        }

        logger.debug(`[Cache] Added order: ${order.orderId}`);
    }

    /**
     * Get order by ID
     */
    getOrder(orderId: string): CachedOrder | undefined {
        const order = this.index.ordersById.get(orderId);
        this.recordHit('order', order !== undefined);
        return order;
    }

    /**
     * Get all orders for a symbol
     */
    getOrdersForSymbol(symbol: string): CachedOrder[] {
        const orderIds = this.index.ordersBySymbol.get(symbol);
        if (!orderIds) return [];

        return Array.from(orderIds)
            .map(id => this.index.ordersById.get(id))
            .filter(o => o !== undefined) as CachedOrder[];
    }

    /**
     * Get all orders for a venue
     */
    getOrdersForVenue(venue: string): CachedOrder[] {
        const orderIds = this.index.ordersByVenue.get(venue);
        if (!orderIds) return [];

        return Array.from(orderIds)
            .map(id => this.index.ordersById.get(id))
            .filter(o => o !== undefined) as CachedOrder[];
    }

    /**
     * Remove an order
     */
    removeOrder(orderId: string): void {
        const order = this.index.ordersById.get(orderId);
        if (!order) return;

        this.index.ordersById.delete(orderId);

        // Remove from symbol index
        const symbolOrders = this.index.ordersBySymbol.get(order.symbol);
        if (symbolOrders) {
            symbolOrders.delete(orderId);
            if (symbolOrders.size === 0) {
                this.index.ordersBySymbol.delete(order.symbol);
            }
        }

        // Remove from venue index
        if (order.venue) {
            const venueOrders = this.index.ordersByVenue.get(order.venue);
            if (venueOrders) {
                venueOrders.delete(orderId);
                if (venueOrders.size === 0) {
                    this.index.ordersByVenue.delete(order.venue);
                }
            }
        }
    }

    // ==================== Position Operations ====================

    /**
     * Add or update a position
     */
    addPosition(position: CachedPosition): void {
        if (!this.index.positionsBySymbol.has(position.symbol)) {
            this.index.positionsBySymbol.set(position.symbol, new Set());
        }
        this.index.positionsBySymbol.get(position.symbol)!.add(position);
        logger.debug(`[Cache] Added position: ${position.symbol} ${position.side} ${position.quantity}`);
    }

    /**
     * Get positions for a symbol
     */
    getPositions(symbol: string): CachedPosition[] {
        return Array.from(this.index.positionsBySymbol.get(symbol) || []);
    }

    /**
     * Get all positions
     */
    getAllPositions(): CachedPosition[] {
        const positions: CachedPosition[] = [];
        for (const set of this.index.positionsBySymbol.values()) {
            positions.push(...Array.from(set));
        }
        return positions;
    }

    /**
     * Remove position
     */
    removePosition(symbol: string, side: 'LONG' | 'SHORT'): void {
        const positions = this.index.positionsBySymbol.get(symbol);
        if (!positions) return;

        for (const pos of positions) {
            if (pos.side === side) {
                positions.delete(pos);
                break;
            }
        }

        if (positions.size === 0) {
            this.index.positionsBySymbol.delete(symbol);
        }
    }

    // ==================== Order Book Operations ====================

    /**
     * Update order book
     */
    updateOrderBook(symbol: string, bids: [number, number][], asks: [number, number][]): void {
        const book: CachedOrderBook = {
            symbol,
            bids: new Map(bids),
            asks: new Map(asks),
            lastUpdate: Date.now(),
        };

        // Calculate mid price and spread
        if (bids.length > 0 && asks.length > 0) {
            const bestBid = bids[0][0];
            const bestAsk = asks[0][0];
            book.midPrice = (bestBid + bestAsk) / 2;
            book.spread = bestAsk - bestBid;
        }

        this.index.orderBooks.set(symbol, book);
    }

    /**
     * Get order book
     */
    getOrderBook(symbol: string): CachedOrderBook | undefined {
        return this.index.orderBooks.get(symbol);
    }

    /**
     * Get best bid
     */
    getBestBid(symbol: string): number | undefined {
        const book = this.index.orderBooks.get(symbol);
        if (!book || book.bids.size === 0) return undefined;

        const prices = Array.from(book.bids.keys()).sort((a, b) => b - a);
        return prices[0];
    }

    /**
     * Get best ask
     */
    getBestAsk(symbol: string): number | undefined {
        const book = this.index.orderBooks.get(symbol);
        if (!book || book.asks.size === 0) return undefined;

        const prices = Array.from(book.asks.keys()).sort((a, b) => a - b);
        return prices[0];
    }

    /**
     * Get mid price
     */
    getMidPrice(symbol: string): number | undefined {
        const book = this.index.orderBooks.get(symbol);
        return book?.midPrice;
    }

    // ==================== Market Data Operations ====================

    /**
     * Update market data
     */
    updateMarketData(data: MarketDataCache): void {
        this.index.marketData.set(data.symbol, data);
    }

    /**
     * Get market data
     */
    getMarketData(symbol: string): MarketDataCache | undefined {
        return this.index.marketData.get(symbol);
    }

    // ==================== Cache Operations ====================

    /**
     * Record cache hit/miss
     */
    private recordHit(type: string, hit: boolean): void {
        const key = type;
        if (hit) {
            this.cacheHits.set(key, (this.cacheHits.get(key) || 0) + 1);
        } else {
            this.cacheMisses.set(key, (this.cacheMisses.get(key) || 0) + 1);
        }
    }

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
    } {
        const totalHits = Array.from(this.cacheHits.values()).reduce((sum, v) => sum + v, 0);
        const totalMisses = Array.from(this.cacheMisses.values()).reduce((sum, v) => sum + v, 0);
        const total = totalHits + totalMisses;

        return {
            orders: this.index.ordersById.size,
            positions: this.getAllPositions().length,
            instruments: this.index.instrumentsById.size,
            orderBooks: this.index.orderBooks.size,
            hitRate: total > 0 ? totalHits / total : 0,
            hits: totalHits,
            misses: totalMisses,
        };
    }

    /**
     * Check cache integrity
     */
    checkIntegrity(): { valid: boolean; errors: string[] } {
        const errors: string[] = [];

        // Check order indexes
        for (const [orderId, order] of this.index.ordersById) {
            const symbolOrders = this.index.ordersBySymbol.get(order.symbol);
            if (!symbolOrders || !symbolOrders.has(orderId)) {
                errors.push(`Order ${orderId} missing from symbol index`);
            }
        }

        // Check for orphaned symbol index entries
        for (const [symbol, orderIds] of this.index.ordersBySymbol) {
            for (const orderId of orderIds) {
                if (!this.index.ordersById.has(orderId)) {
                    errors.push(`Orphaned order reference ${orderId} in symbol ${symbol}`);
                }
            }
        }

        return {
            valid: errors.length === 0,
            errors,
        };
    }

    /**
     * Start automatic cleanup
     */
    private startCleanup(): void {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
        }

        this.cleanupTimer = setInterval(() => {
            this.cleanup();
        }, this.config.cleanupInterval);

        logger.info('[Cache] Auto-cleanup started');
    }

    /**
     * Cleanup expired entries
     */
    private cleanup(): void {
        const now = Date.now();
        const cutoff = now - this.config.defaultTtl;
        let removed = 0;

        // Clean old orders
        for (const [id, order] of this.index.ordersById) {
            if (order.timestamp < cutoff && (order.status === 'FILLED' || order.status === 'CANCELED')) {
                this.removeOrder(id);
                removed++;
            }
        }

        if (removed > 0) {
            logger.debug(`[Cache] Cleanup: removed ${removed} expired entries`);
        }
    }

    /**
     * Clear all cache
     */
    clear(): void {
        this.index.ordersById.clear();
        this.index.ordersBySymbol.clear();
        this.index.ordersByVenue.clear();
        this.index.positionsBySymbol.clear();
        this.index.orderBooks.clear();
        this.index.marketData.clear();
        logger.info('[Cache] Cleared all data');
    }

    /**
     * Shutdown
     */
    shutdown(): void {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
        logger.info('[Cache] Shutdown complete');
    }

    /**
     * Export cache state
     */
    export(): {
        orders: CachedOrder[];
        positions: CachedPosition[];
        instruments: Instrument[];
    } {
        return {
            orders: Array.from(this.index.ordersById.values()),
            positions: this.getAllPositions(),
            instruments: this.getAllInstruments(),
        };
    }

    /**
     * Import cache state
     */
    import(data: {
        orders?: CachedOrder[];
        positions?: CachedPosition[];
        instruments?: Instrument[];
    }): void {
        if (data.orders) {
            for (const order of data.orders) {
                this.addOrder(order);
            }
        }

        if (data.positions) {
            for (const position of data.positions) {
                this.addPosition(position);
            }
        }

        if (data.instruments) {
            for (const instrument of data.instruments) {
                this.addInstrument(instrument);
            }
        }

        logger.info('[Cache] Imported data');
    }
}

// Singleton instance
const unifiedCache = new UnifiedCache();

export default unifiedCache;
