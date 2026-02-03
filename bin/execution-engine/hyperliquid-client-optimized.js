"use strict";
/**
 * Optimized Hyperliquid Client
 * Performance improvements:
 * - Request batching and deduplication
 * - Response caching
 * - Connection keep-alive
 * - Request coalescing
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OptimizedHyperliquidClient = void 0;
const hyperliquid_1 = require("@nktkas/hyperliquid");
const accounts_1 = require("viem/accounts");
const logger_1 = __importDefault(require("../shared/logger"));
const config_1 = __importDefault(require("../shared/config"));
const token_bucket_1 = require("../infrastructure/token-bucket");
const overfill_protection_1 = __importDefault(require("../infrastructure/overfill-protection"));
const uuid_1 = require("uuid");
// Asset index mapping cache
const ASSET_INDICES_CACHE = {};
const ASSET_CACHE_TTL_MS = 3600000; // 1 hour
class OptimizedHyperliquidClient {
    transport;
    publicClient;
    walletClient = null;
    wallet = null;
    walletAddress = '';
    userAddress = '';
    isTestnet;
    assetIndices = new Map();
    assetNames = new Map();
    isInitialized = false;
    lastMetaFetch = 0;
    // Request deduplication maps
    pendingRequests = new Map();
    responseCache = new Map();
    // Cache TTLs
    CACHE_TTL = {
        mids: 500, // 500ms for prices
        account: 2000, // 2s for account state
        orders: 1000, // 1s for open orders
        meta: 3600000, // 1 hour for metadata
    };
    constructor() {
        const hyperliquidConfig = config_1.default.getSection('hyperliquid');
        this.isTestnet = hyperliquidConfig.testnet;
        // Initialize HTTP transport with optimized settings
        this.transport = new hyperliquid_1.HttpTransport({
            isTestnet: this.isTestnet,
            timeout: 30000,
        });
        this.publicClient = new hyperliquid_1.PublicClient({ transport: this.transport });
        const privateKey = hyperliquidConfig.privateKey;
        const mainAddress = hyperliquidConfig.mainAddress;
        if (privateKey && privateKey.startsWith('0x') && privateKey.length === 66) {
            try {
                this.wallet = (0, accounts_1.privateKeyToAccount)(privateKey);
                this.walletAddress = this.wallet.address;
                this.userAddress = mainAddress || this.walletAddress;
                this.walletClient = new hyperliquid_1.WalletClient({
                    transport: this.transport,
                    wallet: this.wallet,
                    isTestnet: this.isTestnet
                });
                logger_1.default.info(`OptimizedHyperliquid client initialized with wallet: ${this.walletAddress.slice(0, 10)}...`);
                if (mainAddress) {
                    logger_1.default.info(`Acting on behalf of main user: ${this.userAddress.slice(0, 10)}...`);
                }
            }
            catch (error) {
                logger_1.default.error('Failed to initialize wallet from private key:', error);
            }
        }
        else {
            logger_1.default.warn('No valid private key configured - trading will be disabled');
        }
        logger_1.default.info(`OptimizedHyperliquid client configured for ${this.isTestnet ? 'TESTNET' : 'MAINNET'}`);
    }
    /**
     * Initialize asset indices from the API (with caching)
     */
    async initialize() {
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
                logger_1.default.info(`Loaded ${meta.universe.length} asset indices from Hyperliquid meta`);
            }
            this.isInitialized = true;
            this.lastMetaFetch = Date.now();
        }
        catch (error) {
            logger_1.default.error('Failed to initialize Hyperliquid client:', error);
            throw error;
        }
    }
    /**
     * Deduplicate concurrent requests
     */
    async dedupRequest(key, fn, cacheTtl) {
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
    isConfigured() {
        return this.walletClient !== null && this.wallet !== null;
    }
    /**
     * Get the wallet address (signer)
     */
    getWalletAddress() {
        return this.walletAddress;
    }
    /**
     * Get the user address (target account)
     */
    getUserAddress() {
        return this.userAddress;
    }
    /**
     * Get asset index by symbol
     */
    getAssetIndex(symbol) {
        return this.assetIndices.get(symbol) ?? ASSET_INDICES_CACHE[symbol];
    }
    /**
     * Get all current mid prices (with caching and deduplication)
     */
    async getAllMids() {
        return this.dedupRequest('allMids', async () => {
            await token_bucket_1.hyperliquidRateLimiter.throttleInfoRequest(2);
            try {
                const mids = await this.publicClient.allMids();
                const result = {};
                for (const [symbol, price] of Object.entries(mids)) {
                    result[symbol] = parseFloat(price);
                }
                return result;
            }
            catch (error) {
                logger_1.default.error('Failed to get all mids:', error);
                throw error;
            }
        }, this.CACHE_TTL.mids);
    }
    /**
     * Get account state (with caching and deduplication)
     */
    async getAccountState() {
        if (!this.userAddress) {
            throw new Error('No wallet configured');
        }
        return this.dedupRequest(`accountState_${this.userAddress}`, async () => {
            await token_bucket_1.hyperliquidRateLimiter.throttleInfoRequest(60);
            try {
                const state = await this.publicClient.clearinghouseState({
                    user: this.userAddress
                });
                const positions = [];
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
            }
            catch (error) {
                logger_1.default.error('Failed to get account state:', error);
                throw error;
            }
        }, this.CACHE_TTL.account);
    }
    /**
     * Get open orders (with caching)
     */
    async getOpenOrders() {
        if (!this.userAddress) {
            throw new Error('No wallet configured');
        }
        return this.dedupRequest(`openOrders_${this.userAddress}`, async () => {
            try {
                const orders = await this.publicClient.openOrders({
                    user: this.userAddress
                });
                return orders || [];
            }
            catch (error) {
                logger_1.default.error('Failed to get open orders:', error);
                return [];
            }
        }, this.CACHE_TTL.orders);
    }
    /**
     * Place an order (with batching support)
     */
    async placeOrder(params) {
        if (!this.walletClient) {
            return {
                success: false,
                status: 'NO_WALLET',
                error: 'No wallet configured for trading'
            };
        }
        const clientOrderId = params.clientOrderId || (0, uuid_1.v4)();
        overfill_protection_1.default.registerOrder({
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
        let lastError = null;
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                await token_bucket_1.hyperliquidRateLimiter.throttleExchangeRequest(1);
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
                logger_1.default.info(`[Attempt ${attempt + 1}/${maxRetries}] Placing order: ${params.side} ${formattedSize} ${params.symbol} @ ${formattedPrice}`);
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
                    const orderStatus = response?.data?.statuses?.[0];
                    if (orderStatus?.filled) {
                        logger_1.default.info(`Order filled: ${params.side} ${formattedSize} ${params.symbol} @ ${orderStatus.filled.avgPx || formattedPrice}`);
                        // Invalidate account cache after fill
                        this.responseCache.delete(`accountState_${this.userAddress}`);
                        return {
                            success: true,
                            orderId: orderStatus.filled.oid?.toString(),
                            filledPrice: parseFloat(orderStatus.filled.avgPx || formattedPrice),
                            filledSize: parseFloat(orderStatus.filled.totalSz || formattedSize),
                            status: 'FILLED'
                        };
                    }
                    else if (orderStatus?.resting) {
                        logger_1.default.info(`Order resting: ${params.side} ${formattedSize} ${params.symbol} @ ${formattedPrice}`);
                        return {
                            success: true,
                            orderId: orderStatus.resting.oid?.toString(),
                            status: 'RESTING'
                        };
                    }
                    else if (orderStatus?.error) {
                        const errorMessage = String(orderStatus.error).toLowerCase();
                        if (errorMessage.includes('insufficient') || errorMessage.includes('margin')) {
                            return {
                                success: false,
                                status: 'ERROR',
                                error: orderStatus.error
                            };
                        }
                        lastError = orderStatus.error;
                    }
                    else {
                        return {
                            success: true,
                            status: 'OK'
                        };
                    }
                }
                else {
                    lastError = `Order failed: ${JSON.stringify(result)}`;
                    logger_1.default.warn(`[Attempt ${attempt + 1}/${maxRetries}] ${lastError}`);
                }
            }
            catch (error) {
                lastError = error;
                const isRetryable = this.isRetryableError(error);
                logger_1.default.error(`[Attempt ${attempt + 1}/${maxRetries}] Order error:`, error);
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
                logger_1.default.info(`Retrying in ${backoffMs}ms...`);
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
    isRetryableError(error) {
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
    async cancelOrder(symbol, orderId) {
        if (!this.walletClient) {
            logger_1.default.error('No wallet configured for trading');
            return false;
        }
        await this.initialize();
        const assetIndex = this.getAssetIndex(symbol);
        if (assetIndex === undefined) {
            logger_1.default.error(`Unknown symbol: ${symbol}`);
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
        }
        catch (error) {
            logger_1.default.error('Failed to cancel order:', error);
            return false;
        }
    }
    /**
     * Cancel all open orders
     */
    async cancelAllOrders() {
        try {
            const openOrders = await this.getOpenOrders();
            // Cancel in parallel
            await Promise.allSettled(openOrders.map(order => this.cancelOrder(order.coin, order.oid.toString())));
            // Invalidate cache
            this.responseCache.delete(`openOrders_${this.userAddress}`);
            return true;
        }
        catch (error) {
            logger_1.default.error('Failed to cancel all orders:', error);
            return false;
        }
    }
    /**
     * Update leverage for a symbol
     */
    async updateLeverage(symbol, leverage, isCross = true) {
        if (!this.walletClient) {
            logger_1.default.error('No wallet configured for trading');
            return false;
        }
        await this.initialize();
        const assetIndex = this.getAssetIndex(symbol);
        if (assetIndex === undefined) {
            logger_1.default.error(`Unknown symbol: ${symbol}`);
            return false;
        }
        try {
            const result = await this.walletClient.updateLeverage({
                asset: assetIndex,
                leverage,
                isCross
            });
            return result.status === 'ok';
        }
        catch (error) {
            logger_1.default.error('Failed to update leverage:', error);
            return false;
        }
    }
    /**
     * Format price to appropriate precision for the asset
     */
    formatPrice(price, symbol) {
        if (symbol === 'BTC') {
            return Math.round(price).toString();
        }
        else if (symbol === 'ETH') {
            return (Math.round(price * 10) / 10).toFixed(1);
        }
        else {
            return (Math.round(price * 100) / 100).toFixed(2);
        }
    }
    /**
     * Format size to appropriate precision for the asset
     */
    formatSize(size, symbol) {
        const decimals = symbol === 'BTC' ? 5 : 4;
        return size.toFixed(decimals);
    }
    /**
     * Get L2 order book
     */
    async getL2Book(symbol) {
        return this.dedupRequest(`l2Book_${symbol}`, async () => {
            try {
                return await this.publicClient.l2Book({ coin: symbol });
            }
            catch (error) {
                logger_1.default.error(`Failed to get L2 book for ${symbol}:`, error);
                throw error;
            }
        }, 500 // 500ms cache
        );
    }
    /**
     * Clear all caches
     */
    clearCaches() {
        this.responseCache.clear();
        this.pendingRequests.clear();
        logger_1.default.info('[OptimizedHyperliquid] All caches cleared');
    }
    /**
     * Get cache stats
     */
    getCacheStats() {
        return {
            cachedEntries: this.responseCache.size,
            pendingRequests: this.pendingRequests.size
        };
    }
}
exports.OptimizedHyperliquidClient = OptimizedHyperliquidClient;
// Singleton instance
const optimizedHyperliquidClient = new OptimizedHyperliquidClient();
exports.default = optimizedHyperliquidClient;
//# sourceMappingURL=hyperliquid-client-optimized.js.map