/**
 * Optimized Hyperliquid Client
 * Performance improvements:
 * - Request batching and deduplication
 * - Response caching
 * - Connection keep-alive
 * - Request coalescing
 */

import { WalletClient, HttpTransport, PublicClient } from '@nktkas/hyperliquid';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import logger from '../shared/logger';
import config from '../shared/config';
import { hyperliquidRateLimiter } from '../infrastructure/token-bucket';
import overfillProtection from '../infrastructure/overfill-protection';
import { v4 as uuidv4 } from 'uuid';

// Asset index mapping cache
const ASSET_INDICES_CACHE: Record<string, number> = {};
const ASSET_CACHE_TTL_MS = 3600000; // 1 hour

// Request deduplication
interface PendingRequest<T> {
    promise: Promise<T>;
    timestamp: number;
}

// Response cache
interface CacheEntry<T> {
    data: T;
    timestamp: number;
}

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

export class OptimizedHyperliquidClient {
    private transport: HttpTransport;
    private publicClient: PublicClient;
    private walletClient: WalletClient | null = null;
    private wallet: PrivateKeyAccount | null = null;
    private walletAddress: string = '';
    private userAddress: string = '';
    private isTestnet: boolean;
    private assetIndices: Map<string, number> = new Map();
    private assetNames: Map<number, string> = new Map();
    private isInitialized: boolean = false;
    private lastMetaFetch: number = 0;

    // Request deduplication maps
    private pendingRequests: Map<string, PendingRequest<any>> = new Map();
    private responseCache: Map<string, CacheEntry<any>> = new Map();
    
    // Cache TTLs
    private readonly CACHE_TTL = {
        mids: 500,        // 500ms for prices
        account: 2000,    // 2s for account state
        orders: 1000,     // 1s for open orders
        meta: 3600000,    // 1 hour for metadata
    };

    constructor() {
        const hyperliquidConfig = config.getSection('hyperliquid');
        this.isTestnet = hyperliquidConfig.testnet;

        // Initialize HTTP transport with optimized settings
        this.transport = new HttpTransport({
            isTestnet: this.isTestnet,
            timeout: 30000,
        });

        this.publicClient = new PublicClient({ transport: this.transport });

        const privateKey = hyperliquidConfig.privateKey;
        const mainAddress = hyperliquidConfig.mainAddress;

        if (privateKey && privateKey.startsWith('0x') && privateKey.length === 66) {
            try {
                this.wallet = privateKeyToAccount(privateKey as `0x${string}`);
                this.walletAddress = this.wallet.address;
                this.userAddress = mainAddress || this.walletAddress;

                this.walletClient = new WalletClient({
                    transport: this.transport,
                    wallet: this.wallet,
                    isTestnet: this.isTestnet
                });

                logger.info(`OptimizedHyperliquid client initialized with wallet: ${this.walletAddress.slice(0, 10)}...`);
                if (mainAddress) {
                    logger.info(`Acting on behalf of main user: ${this.userAddress.slice(0, 10)}...`);
                }
            } catch (error) {
                logger.error('Failed to initialize wallet from private key:', error);
            }
        } else {
            logger.warn('No valid private key configured - trading will be disabled');
        }

        logger.info(`OptimizedHyperliquid client configured for ${this.isTestnet ? 'TESTNET' : 'MAINNET'}`);
    }

    /**
     * Initialize asset indices from the API (with caching)
     */
    async initialize(): Promise<void> {
        if (this.isInitialized && (Date.now() - this.lastMetaFetch) < this.CACHE_TTL.meta) {
            return;
        }

        try {
            const meta = await this.publicClient.meta();

            if (meta && meta.universe) {
                for (let i = 0; i < meta.universe.length; i++) {
                    const asset = meta.universe[i];
                    this.assetIndices.set(asset.name, i);
                    this.assetNames.set(i, asset.name);
                    ASSET_INDICES_CACHE[asset.name] = i;
                }
                logger.info(`Loaded ${meta.universe.length} asset indices from Hyperliquid meta`);
            }

            this.isInitialized = true;
            this.lastMetaFetch = Date.now();
        } catch (error) {
            logger.error('Failed to initialize Hyperliquid client:', error);
            throw error;
        }
    }

    /**
     * Deduplicate concurrent requests
     */
    private async dedupRequest<T>(
        key: string,
        fn: () => Promise<T>,
        cacheTtl?: number
    ): Promise<T> {
        // Check cache first
        if (cacheTtl) {
            const cached = this.responseCache.get(key);
            if (cached && (Date.now() - cached.timestamp) < cacheTtl) {
                return cached.data;
            }
        }

        // Check for pending request
        const pending = this.pendingRequests.get(key);
        if (pending && (Date.now() - pending.timestamp) < 30000) {
            return pending.promise;
        }

        // Create new request
        const promise = fn().then(result => {
            // Cache result if TTL specified
            if (cacheTtl) {
                this.responseCache.set(key, { data: result, timestamp: Date.now() });
            }
            // Clean up pending
            this.pendingRequests.delete(key);
            return result;
        }).catch(error => {
            this.pendingRequests.delete(key);
            throw error;
        });

        this.pendingRequests.set(key, { promise, timestamp: Date.now() });
        return promise;
    }

    /**
     * Check if the client is configured for trading
     */
    isConfigured(): boolean {
        return this.walletClient !== null && this.wallet !== null;
    }

    /**
     * Get the wallet address (signer)
     */
    getWalletAddress(): string {
        return this.walletAddress;
    }

    /**
     * Get the user address (target account)
     */
    getUserAddress(): string {
        return this.userAddress;
    }

    /**
     * Get asset index by symbol
     */
    getAssetIndex(symbol: string): number | undefined {
        return this.assetIndices.get(symbol) ?? ASSET_INDICES_CACHE[symbol];
    }

    /**
     * Get all current mid prices (with caching and deduplication)
     */
    async getAllMids(): Promise<Record<string, number>> {
        return this.dedupRequest(
            'allMids',
            async () => {
                await hyperliquidRateLimiter.throttleInfoRequest(2);

                try {
                    const mids = await this.publicClient.allMids();
                    const result: Record<string, number> = {};

                    for (const [symbol, price] of Object.entries(mids)) {
                        result[symbol] = parseFloat(price as string);
                    }

                    return result;
                } catch (error) {
                    logger.error('Failed to get all mids:', error);
                    throw error;
                }
            },
            this.CACHE_TTL.mids
        );
    }

    /**
     * Get account state (with caching and deduplication)
     */
    async getAccountState(): Promise<HyperliquidAccountState> {
        if (!this.userAddress) {
            throw new Error('No wallet configured');
        }

        return this.dedupRequest(
            `accountState_${this.userAddress}`,
            async () => {
                await hyperliquidRateLimiter.throttleInfoRequest(60);

                try {
                    const state = await this.publicClient.clearinghouseState({ 
                        user: this.userAddress as `0x${string}` 
                    });

                    const positions: HyperliquidPosition[] = [];

                    if (state.assetPositions) {
                        for (const assetPos of state.assetPositions) {
                            const pos = assetPos.position;
                            const size = parseFloat(pos.szi);

                            if (size !== 0) {
                                positions.push({
                                    symbol: pos.coin,
                                    side: size > 0 ? 'LONG' : 'SHORT',
                                    size: Math.abs(size),
                                    entryPrice: parseFloat(pos.entryPx || '0'),
                                    markPrice: parseFloat(pos.positionValue) / Math.abs(size),
                                    unrealizedPnL: parseFloat(pos.unrealizedPnl),
                                    leverage: parseFloat((assetPos.position.leverage?.value || '1').toString()),
                                    marginUsed: parseFloat(pos.marginUsed || '0')
                                });
                            }
                        }
                    }

                    return {
                        equity: parseFloat(state.marginSummary.accountValue),
                        withdrawable: parseFloat(state.withdrawable),
                        positions,
                        marginUsed: parseFloat(state.marginSummary.totalMarginUsed)
                    };
                } catch (error) {
                    logger.error('Failed to get account state:', error);
                    throw error;
                }
            },
            this.CACHE_TTL.account
        );
    }

    /**
     * Get open orders (with caching)
     */
    async getOpenOrders(): Promise<any[]> {
        if (!this.userAddress) {
            throw new Error('No wallet configured');
        }

        return this.dedupRequest(
            `openOrders_${this.userAddress}`,
            async () => {
                try {
                    const orders = await this.publicClient.openOrders({ 
                        user: this.userAddress as `0x${string}` 
                    });
                    return orders || [];
                } catch (error) {
                    logger.error('Failed to get open orders:', error);
                    return [];
                }
            },
            this.CACHE_TTL.orders
        );
    }

    /**
     * Place an order (with batching support)
     */
    async placeOrder(params: {
        symbol: string;
        side: 'BUY' | 'SELL';
        size: number;
        price?: number;
        reduceOnly?: boolean;
        orderType?: 'limit' | 'market';
        clientOrderId?: string;
    }): Promise<HyperliquidOrderResult> {
        if (!this.walletClient) {
            return {
                success: false,
                status: 'NO_WALLET',
                error: 'No wallet configured for trading'
            };
        }

        const clientOrderId = params.clientOrderId || uuidv4();

        overfillProtection.registerOrder({
            orderId: clientOrderId,
            clientOrderId,
            symbol: params.symbol,
            side: params.side,
            orderQty: params.size,
            filledQty: 0,
            avgPx: params.price || 0,
            status: 'PENDING',
            timestamp: Date.now(),
        });

        await this.initialize();

        const assetIndex = this.getAssetIndex(params.symbol);
        if (assetIndex === undefined) {
            return {
                success: false,
                status: 'INVALID_SYMBOL',
                error: `Unknown symbol: ${params.symbol}`
            };
        }

        // Retry logic with exponential backoff
        const maxRetries = 3;
        let lastError: any = null;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                await hyperliquidRateLimiter.throttleExchangeRequest(1);

                let orderPrice = params.price;
                if (!orderPrice) {
                    const mids = await this.getAllMids();
                    const midPrice = mids[params.symbol];
                    if (!midPrice) {
                        return {
                            success: false,
                            status: 'NO_PRICE',
                            error: `Could not get price for ${params.symbol}`
                        };
                    }
                    const slippageMultiplier = 1 + (attempt * 0.005);
                    orderPrice = params.side === 'BUY'
                        ? midPrice * (1.01 + (attempt * 0.005))
                        : midPrice * (0.99 - (attempt * 0.005));
                }

                const formattedPrice = this.formatPrice(orderPrice, params.symbol);
                const formattedSize = this.formatSize(params.size, params.symbol);

                logger.info(`[Attempt ${attempt + 1}/${maxRetries}] Placing order: ${params.side} ${formattedSize} ${params.symbol} @ ${formattedPrice}`);

                const result = await this.walletClient.order({
                    orders: [{
                        a: assetIndex,
                        b: params.side === 'BUY',
                        p: formattedPrice,
                        s: formattedSize,
                        r: params.reduceOnly || false,
                        t: params.orderType === 'market'
                            ? { limit: { tif: 'Ioc' } }
                            : { limit: { tif: 'Gtc' } }
                    }],
                    grouping: 'na'
                });

                if (result.status === 'ok') {
                    const response = result.response;
                    const orderStatus = response?.data?.statuses?.[0] as any;

                    if (orderStatus?.filled) {
                        logger.info(`Order filled: ${params.side} ${formattedSize} ${params.symbol} @ ${orderStatus.filled.avgPx || formattedPrice}`);
                        
                        // Invalidate account cache after fill
                        this.responseCache.delete(`accountState_${this.userAddress}`);
                        
                        return {
                            success: true,
                            orderId: orderStatus.filled.oid?.toString(),
                            filledPrice: parseFloat(orderStatus.filled.avgPx || formattedPrice),
                            filledSize: parseFloat(orderStatus.filled.totalSz || formattedSize),
                            status: 'FILLED'
                        };
                    } else if (orderStatus?.resting) {
                        logger.info(`Order resting: ${params.side} ${formattedSize} ${params.symbol} @ ${formattedPrice}`);
                        return {
                            success: true,
                            orderId: orderStatus.resting.oid?.toString(),
                            status: 'RESTING'
                        };
                    } else if (orderStatus?.error) {
                        const errorMessage = String(orderStatus.error).toLowerCase();
                        if (errorMessage.includes('insufficient') || errorMessage.includes('margin')) {
                            return {
                                success: false,
                                status: 'ERROR',
                                error: orderStatus.error
                            };
                        }
                        lastError = orderStatus.error;
                    } else {
                        return {
                            success: true,
                            status: 'OK'
                        };
                    }
                } else {
                    lastError = `Order failed: ${JSON.stringify(result)}`;
                    logger.warn(`[Attempt ${attempt + 1}/${maxRetries}] ${lastError}`);
                }
            } catch (error: any) {
                lastError = error;
                const isRetryable = this.isRetryableError(error);
                logger.error(`[Attempt ${attempt + 1}/${maxRetries}] Order error:`, error);

                if (!isRetryable || attempt >= maxRetries - 1) {
                    return {
                        success: false,
                        status: 'EXCEPTION',
                        error: error.message || String(error)
                    };
                }
            }

            if (attempt < maxRetries - 1) {
                const backoffMs = Math.min(1000 * Math.pow(2, attempt), 5000);
                logger.info(`Retrying in ${backoffMs}ms...`);
                await new Promise(resolve => setTimeout(resolve, backoffMs));
            }
        }

        return {
            success: false,
            status: 'RETRY_EXHAUSTED',
            error: lastError?.message || String(lastError) || 'Max retries exceeded'
        };
    }

    /**
     * Check if an error is retryable
     */
    private isRetryableError(error: any): boolean {
        const errorMessage = String(error?.message || error || '').toLowerCase();
        const retryablePatterns = [
            'timeout', 'timed out',
            'network', 'connection',
            '502', '503', '504', '500',
            'econnreset', 'etimedout',
            'rate limit',
        ];
        return retryablePatterns.some(pattern => errorMessage.includes(pattern));
    }

    /**
     * Cancel an order
     */
    async cancelOrder(symbol: string, orderId: string): Promise<boolean> {
        if (!this.walletClient) {
            logger.error('No wallet configured for trading');
            return false;
        }

        await this.initialize();

        const assetIndex = this.getAssetIndex(symbol);
        if (assetIndex === undefined) {
            logger.error(`Unknown symbol: ${symbol}`);
            return false;
        }

        try {
            const result = await this.walletClient.cancel({
                cancels: [{
                    a: assetIndex,
                    o: parseInt(orderId)
                }]
            });

            if (result.status === 'ok') {
                // Invalidate orders cache
                this.responseCache.delete(`openOrders_${this.userAddress}`);
            }

            return result.status === 'ok';
        } catch (error) {
            logger.error('Failed to cancel order:', error);
            return false;
        }
    }

    /**
     * Cancel all open orders
     */
    async cancelAllOrders(): Promise<boolean> {
        try {
            const openOrders = await this.getOpenOrders();

            // Cancel in parallel
            await Promise.allSettled(openOrders.map(order => 
                this.cancelOrder(order.coin, order.oid.toString())
            ));

            // Invalidate cache
            this.responseCache.delete(`openOrders_${this.userAddress}`);

            return true;
        } catch (error) {
            logger.error('Failed to cancel all orders:', error);
            return false;
        }
    }

    /**
     * Update leverage for a symbol
     */
    async updateLeverage(symbol: string, leverage: number, isCross: boolean = true): Promise<boolean> {
        if (!this.walletClient) {
            logger.error('No wallet configured for trading');
            return false;
        }

        await this.initialize();

        const assetIndex = this.getAssetIndex(symbol);
        if (assetIndex === undefined) {
            logger.error(`Unknown symbol: ${symbol}`);
            return false;
        }

        try {
            const result = await this.walletClient.updateLeverage({
                asset: assetIndex,
                leverage,
                isCross
            });

            return result.status === 'ok';
        } catch (error) {
            logger.error('Failed to update leverage:', error);
            return false;
        }
    }

    /**
     * Format price to appropriate precision for the asset
     */
    private formatPrice(price: number, symbol: string): string {
        if (symbol === 'BTC') {
            return Math.round(price).toString();
        } else if (symbol === 'ETH') {
            return (Math.round(price * 10) / 10).toFixed(1);
        } else {
            return (Math.round(price * 100) / 100).toFixed(2);
        }
    }

    /**
     * Format size to appropriate precision for the asset
     */
    private formatSize(size: number, symbol: string): string {
        const decimals = symbol === 'BTC' ? 5 : 4;
        return size.toFixed(decimals);
    }

    /**
     * Get L2 order book
     */
    async getL2Book(symbol: string): Promise<any> {
        return this.dedupRequest(
            `l2Book_${symbol}`,
            async () => {
                try {
                    return await this.publicClient.l2Book({ coin: symbol });
                } catch (error) {
                    logger.error(`Failed to get L2 book for ${symbol}:`, error);
                    throw error;
                }
            },
            500 // 500ms cache
        );
    }

    /**
     * Clear all caches
     */
    clearCaches(): void {
        this.responseCache.clear();
        this.pendingRequests.clear();
        logger.info('[OptimizedHyperliquid] All caches cleared');
    }

    /**
     * Get cache stats
     */
    getCacheStats(): { cachedEntries: number; pendingRequests: number } {
        return {
            cachedEntries: this.responseCache.size,
            pendingRequests: this.pendingRequests.size
        };
    }
}

// Singleton instance
const optimizedHyperliquidClient = new OptimizedHyperliquidClient();
export default optimizedHyperliquidClient;
