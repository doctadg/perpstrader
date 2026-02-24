"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HyperliquidClient = void 0;
const hyperliquid_1 = require("@nktkas/hyperliquid");
const accounts_1 = require("viem/accounts");
const logger_1 = __importDefault(require("../shared/logger"));
const config_1 = __importDefault(require("../shared/config"));
const token_bucket_1 = require("../infrastructure/token-bucket");
const overfill_protection_1 = __importDefault(require("../infrastructure/overfill-protection"));
const uuid_1 = require("uuid");
// Asset index mapping (updated from meta on init)
const ASSET_INDICES = {
    'BTC': 0,
    'ETH': 4,
    'SOL': 7,
    // Will be populated dynamically from meta
};
class HyperliquidClient {
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
    ORDER_TIMEOUT_MS = 60000;
    pendingOrders = new Map();
    orderStats = new Map();
    // ENHANCED: Stricter cooldowns to prevent churn
    lastOrderTime = new Map();
    ORDER_COOLDOWN_MS = 60000; // 1 minute (was 10s)
    MIN_ORDER_COOLDOWN_MS = 30000; // 30 seconds minimum
    EXTENDED_COOLDOWN_MS = 300000; // 5 minutes after multiple failures
    orderAttemptCount = new Map();
    // ENHANCED: Consecutive failure handling
    MAX_CONSECUTIVE_FAILURES = 3;
    FAILURE_BACKOFF_MULTIPLIER = 2;
    MAX_BACKOFF_MS = 300000; // 5 minutes max backoff
    // Minimum order sizes by symbol to prevent "invalid size" errors
    MIN_ORDER_SIZES = {
        'BTC': 0.0001,
        'ETH': 0.001,
        'SOL': 0.01,
        'DEFAULT': 0.01
    };
    // ENHANCED: Confidence threshold
    MIN_CONFIDENCE = 0.80; // Increased from 0.75
    MIN_ORDER_BOOK_LEVELS = 5;
    MIN_ORDER_BOOK_NOTIONAL_DEPTH_K = 0;
    MAX_ALLOWED_SPREAD = 0.001; // 0.1%
    // ENHANCED: Fill rate monitoring
    MIN_FILL_RATE = 0.10; // 10% minimum fill rate before warnings
    CRITICAL_FILL_RATE = 0.05; // 5% critical threshold
    symbolFillRates = new Map();
    constructor() {
        const hyperliquidConfig = config_1.default.getSection('hyperliquid');
        this.isTestnet = hyperliquidConfig.testnet;
        // Initialize HTTP transport with testnet flag
        this.transport = new hyperliquid_1.HttpTransport({
            isTestnet: this.isTestnet,
            timeout: 30000
        });
        // Public client for reading data (no wallet needed)
        this.publicClient = new hyperliquid_1.PublicClient({ transport: this.transport });
        // Try to initialize wallet from private key
        const privateKey = hyperliquidConfig.privateKey || hyperliquidConfig.apiSecret;
        const mainAddress = hyperliquidConfig.mainAddress || hyperliquidConfig.apiKey;
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
                logger_1.default.info(`Hyperliquid client initialized with wallet: ${this.walletAddress.slice(0, 10)}...`);
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
        logger_1.default.info(`Hyperliquid client configured for ${this.isTestnet ? 'TESTNET' : 'MAINNET'}`);
        logger_1.default.info(`[ChurnPrevention] Cooldowns: min=${this.MIN_ORDER_COOLDOWN_MS}ms, standard=${this.ORDER_COOLDOWN_MS}ms, extended=${this.EXTENDED_COOLDOWN_MS}ms`);
        logger_1.default.info(`[ChurnPrevention] Max consecutive failures: ${this.MAX_CONSECUTIVE_FAILURES}, Max backoff: ${this.MAX_BACKOFF_MS}ms`);
    }
    async initialize() {
        if (this.isInitialized)
            return;
        try {
            const meta = await this.publicClient.meta();
            if (meta && meta.universe) {
                for (let i = 0; i < meta.universe.length; i++) {
                    const asset = meta.universe[i];
                    this.assetIndices.set(asset.name, i);
                    this.assetNames.set(i, asset.name);
                    ASSET_INDICES[asset.name] = i;
                }
                logger_1.default.info(`Loaded ${meta.universe.length} asset indices from Hyperliquid meta`);
            }
            this.isInitialized = true;
        }
        catch (error) {
            logger_1.default.error('Failed to initialize Hyperliquid client:', error);
            throw error;
        }
    }
    isConfigured() {
        return this.walletClient !== null && this.wallet !== null;
    }
    getWalletAddress() {
        return this.walletAddress;
    }
    getUserAddress() {
        return this.userAddress;
    }
    getAssetIndex(symbol) {
        return this.assetIndices.get(symbol) ?? ASSET_INDICES[symbol];
    }
    async getAllMids() {
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
    }
    async getAccountState() {
        await token_bucket_1.hyperliquidRateLimiter.throttleInfoRequest(60);
        if (!this.userAddress) {
            throw new Error('No wallet configured');
        }
        try {
            const state = await this.publicClient.clearinghouseState({ user: this.userAddress });
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
    }
    async getOpenOrders() {
        if (!this.userAddress) {
            throw new Error('No wallet configured');
        }
        try {
            const orders = await this.publicClient.openOrders({ user: this.userAddress });
            return orders || [];
        }
        catch (error) {
            logger_1.default.error('Failed to get open orders:', error);
            return [];
        }
    }
    /**
     * ENHANCED: Calculate dynamic cooldown based on recent failure history
     */
    calculateDynamicCooldown(symbol) {
        const symbolKey = symbol.toUpperCase();
        const attempts = this.orderAttemptCount.get(symbolKey);
        if (!attempts)
            return this.ORDER_COOLDOWN_MS;
        // If we have consecutive failures, apply exponential backoff
        if (attempts.consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES) {
            const backoffMultiplier = Math.pow(this.FAILURE_BACKOFF_MULTIPLIER, attempts.consecutiveFailures - this.MAX_CONSECUTIVE_FAILURES + 1);
            const dynamicCooldown = Math.min(this.EXTENDED_COOLDOWN_MS * backoffMultiplier, this.MAX_BACKOFF_MS);
            logger_1.default.warn(`[ChurnPrevention] ${symbol} has ${attempts.consecutiveFailures} consecutive failures. ` +
                `Applying extended cooldown: ${dynamicCooldown}ms`);
            return dynamicCooldown;
        }
        return this.ORDER_COOLDOWN_MS;
    }
    /**
     * ENHANCED: Check if we should allow a new order for this symbol (comprehensive churn prevention)
     */
    canPlaceNewOrder(symbol, confidence) {
        const now = Date.now();
        const symbolKey = symbol.toUpperCase();
        // Check minimum confidence threshold
        if (confidence !== undefined && confidence < this.MIN_CONFIDENCE) {
            return {
                allowed: false,
                reason: `Confidence ${confidence.toFixed(2)} below threshold ${this.MIN_CONFIDENCE}`
            };
        }
        // Get current attempt data
        const attempts = this.orderAttemptCount.get(symbolKey);
        if (attempts) {
            const timeSinceLastAttempt = now - attempts.lastAttempt;
            // Enforce absolute minimum cooldown between any order attempts
            if (timeSinceLastAttempt < this.MIN_ORDER_COOLDOWN_MS) {
                const remainingMs = this.MIN_ORDER_COOLDOWN_MS - timeSinceLastAttempt;
                return {
                    allowed: false,
                    reason: `Minimum cooldown not met: ${remainingMs}ms remaining`
                };
            }
            // Check dynamic cooldown based on failure history
            const dynamicCooldown = this.calculateDynamicCooldown(symbol);
            if (timeSinceLastAttempt < dynamicCooldown) {
                const remainingSec = Math.ceil((dynamicCooldown - timeSinceLastAttempt) / 1000);
                return {
                    allowed: false,
                    reason: `Dynamic cooldown active: ${remainingSec}s remaining (${attempts.consecutiveFailures} consecutive failures)`
                };
            }
            // Check fill rate - if too low, extend cooldown
            const fillRate = this.getSymbolFillRate(symbol);
            if (fillRate < this.CRITICAL_FILL_RATE && attempts.count > 5) {
                return {
                    allowed: false,
                    reason: `Critical fill rate ${(fillRate * 100).toFixed(1)}% - extended cooldown applied`
                };
            }
        }
        return { allowed: true };
    }
    /**
     * ENHANCED: Record order attempt result with comprehensive tracking
     */
    recordOrderAttempt(symbol, success) {
        const symbolKey = symbol.toUpperCase();
        const now = Date.now();
        const current = this.orderAttemptCount.get(symbolKey);
        if (success) {
            this.orderAttemptCount.set(symbolKey, {
                count: (current?.count || 0) + 1,
                lastAttempt: now,
                consecutiveFailures: 0,
                lastSuccess: now
            });
            logger_1.default.info(`[ChurnPrevention] ${symbol} order succeeded. Consecutive failures reset.`);
        }
        else {
            this.orderAttemptCount.set(symbolKey, {
                count: (current?.count || 0) + 1,
                lastAttempt: now,
                consecutiveFailures: (current?.consecutiveFailures || 0) + 1
            });
            logger_1.default.warn(`[ChurnPrevention] ${symbol} order failed. Consecutive failures: ${(current?.consecutiveFailures || 0) + 1}`);
        }
    }
    /**
     * ENHANCED: Get fill rate for a symbol
     */
    getSymbolFillRate(symbol) {
        const symbolKey = symbol.toUpperCase();
        const stats = this.orderStats.get(symbolKey);
        if (!stats || stats.submitted === 0)
            return 1.0;
        return stats.filled / stats.submitted;
    }
    /**
     * ENHANCED: Update order stats with fill rate tracking
     */
    updateOrderStats(symbol, filled) {
        const symbolKey = symbol.toUpperCase();
        const stats = this.orderStats.get(symbolKey) || {
            submitted: 0,
            filled: 0,
            failed: 0,
            consecutiveFailures: 0
        };
        stats.submitted += 1;
        if (filled) {
            stats.filled += 1;
            stats.consecutiveFailures = 0;
        }
        else {
            stats.failed += 1;
            stats.consecutiveFailures += 1;
            stats.lastFailureTime = Date.now();
        }
        this.orderStats.set(symbolKey, stats);
        const fillRate = stats.submitted > 0 ? stats.filled / stats.submitted : 0;
        // Log with appropriate severity based on fill rate
        const logMessage = `[OrderStats] ${symbolKey} fillRate=${(fillRate * 100).toFixed(2)}% (${stats.filled}/${stats.submitted})`;
        if (fillRate < this.CRITICAL_FILL_RATE) {
            logger_1.default.error(`[ChurnPrevention] ${logMessage} - CRITICAL: Churn detected!`);
        }
        else if (fillRate < this.MIN_FILL_RATE) {
            logger_1.default.warn(`[ChurnPrevention] ${logMessage} - WARNING: Low fill rate`);
        }
        else {
            logger_1.default.info(logMessage);
        }
    }
    calculateDepthNotional(levels) {
        return levels.reduce((total, level) => {
            const price = Number.parseFloat(level?.px ?? '');
            const size = Number.parseFloat(level?.sz ?? '');
            if (!Number.isFinite(price) || !Number.isFinite(size) || price <= 0 || size < 0) {
                return total;
            }
            return total + (price * size);
        }, 0);
    }
    validateOrderBookDepth(symbol, book) {
        const bids = Array.isArray(book?.levels?.[0]) ? book.levels[0] : [];
        const asks = Array.isArray(book?.levels?.[1]) ? book.levels[1] : [];
        if (bids.length < this.MIN_ORDER_BOOK_LEVELS || asks.length < this.MIN_ORDER_BOOK_LEVELS) {
            return {
                valid: false,
                reason: `Order book depth too shallow for ${symbol}: bids=${bids.length}, asks=${asks.length}, required=${this.MIN_ORDER_BOOK_LEVELS}`
            };
        }
        const topBids = bids.slice(0, this.MIN_ORDER_BOOK_LEVELS);
        const topAsks = asks.slice(0, this.MIN_ORDER_BOOK_LEVELS);
        const minNotionalDepth = this.MIN_ORDER_BOOK_NOTIONAL_DEPTH_K * 1000;
        const bidDepthNotional = this.calculateDepthNotional(topBids);
        const askDepthNotional = this.calculateDepthNotional(topAsks);
        if (bidDepthNotional < minNotionalDepth || askDepthNotional < minNotionalDepth) {
            return {
                valid: false,
                reason: `Insufficient notional depth for ${symbol}: bid=${bidDepthNotional.toFixed(2)}, ask=${askDepthNotional.toFixed(2)}, required=${minNotionalDepth.toFixed(2)}`
            };
        }
        const bestBid = Number.parseFloat(topBids[0]?.px ?? '');
        const bestAsk = Number.parseFloat(topAsks[0]?.px ?? '');
        if (!Number.isFinite(bestBid) || !Number.isFinite(bestAsk) || bestBid <= 0 || bestAsk <= 0) {
            return { valid: false, reason: `Invalid best bid/ask for ${symbol}` };
        }
        return { valid: true, bestBid, bestAsk };
    }
    checkSpread(bestBid, bestAsk) {
        const mid = (bestBid + bestAsk) / 2;
        if (!Number.isFinite(mid) || mid <= 0 || bestAsk < bestBid) {
            return { allowed: false, reason: 'Invalid spread inputs from order book' };
        }
        const spreadRatio = (bestAsk - bestBid) / mid;
        if (spreadRatio >= this.MAX_ALLOWED_SPREAD) {
            return {
                allowed: false,
                reason: `Spread ${(spreadRatio * 100).toFixed(4)}% exceeds ${(this.MAX_ALLOWED_SPREAD * 100).toFixed(3)}%`
            };
        }
        return { allowed: true };
    }
    async placeOrder(params) {
        if (!this.walletClient) {
            return {
                success: false,
                status: 'NO_WALLET',
                error: 'No wallet configured for trading'
            };
        }
        // Validate order size
        const sizeValidation = this.validateOrderSize(params.size, params.symbol);
        if (!sizeValidation.valid) {
            return { success: false, status: 'INVALID_SIZE', error: sizeValidation.error };
        }
        const validatedSize = sizeValidation.adjustedSize;
        const bypassChurnGuards = params.bypassCooldown === true || params.reduceOnly === true;
        if (!bypassChurnGuards) {
            // ENHANCED: Comprehensive churn prevention check
            const orderCheck = this.canPlaceNewOrder(params.symbol, params.confidence);
            if (!orderCheck.allowed) {
                logger_1.default.warn(`[ChurnPrevention] Blocking order for ${params.symbol}: ${orderCheck.reason}`);
                return { success: false, status: 'CHURN_PREVENTION', error: orderCheck.reason };
            }
            const orderBook = await this.getL2Book(params.symbol);
            const depthCheck = this.validateOrderBookDepth(params.symbol, orderBook);
            if (!depthCheck.valid) {
                logger_1.default.warn(`[ChurnPrevention] Blocking order for ${params.symbol}: ${depthCheck.reason}`);
                return { success: false, status: 'CHURN_PREVENTION', error: depthCheck.reason };
            }
            if (depthCheck.bestBid === undefined || depthCheck.bestAsk === undefined) {
                logger_1.default.warn(`[ChurnPrevention] Blocking order for ${params.symbol}: Missing top-of-book prices`);
                return { success: false, status: 'CHURN_PREVENTION', error: 'Missing top-of-book prices' };
            }
            const spreadCheck = this.checkSpread(depthCheck.bestBid, depthCheck.bestAsk);
            if (!spreadCheck.allowed) {
                logger_1.default.warn(`[ChurnPrevention] Blocking order for ${params.symbol}: ${spreadCheck.reason}`);
                return { success: false, status: 'CHURN_PREVENTION', error: spreadCheck.reason };
            }
        }
        else {
            logger_1.default.warn(`[ChurnPrevention] Bypassing cooldown and churn guards for reduce-only exit on ${params.symbol}`);
        }
        await this.checkOrderTimeouts();
        const now = Date.now();
        const symbolKey = params.symbol.toUpperCase();
        const lastTime = this.lastOrderTime.get(symbolKey) || 0;
        if (!bypassChurnGuards) {
            // Legacy cooldown check (redundant but kept for safety)
            if (now - lastTime < this.MIN_ORDER_COOLDOWN_MS) {
                const remainingSec = Math.ceil((this.MIN_ORDER_COOLDOWN_MS - (now - lastTime)) / 1000);
                logger_1.default.warn(`[ChurnPrevention] Minimum cooldown active for ${params.symbol}, ${remainingSec}s remaining`);
                return { success: false, status: 'CHURN_PREVENTION', error: `Minimum cooldown active: ${remainingSec}s remaining` };
            }
            const dynamicCooldown = this.calculateDynamicCooldown(params.symbol);
            if (now - lastTime < dynamicCooldown) {
                const remainingSec = Math.ceil((dynamicCooldown - (now - lastTime)) / 1000);
                logger_1.default.warn(`[ChurnPrevention] Order cooldown active for ${params.symbol}, ${remainingSec}s remaining`);
                return { success: false, status: 'COOLDOWN', error: `Cooldown active: ${remainingSec}s remaining` };
            }
        }
        this.lastOrderTime.set(symbolKey, now);
        // Generate client order ID for tracking
        const clientOrderId = params.clientOrderId || (0, uuid_1.v4)();
        // Register order for overfill protection
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
        const maxRetries = 0; // No retries: max 1 order attempt per signal
        const maxAttempts = maxRetries + 1;
        let lastError = null;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            try {
                await token_bucket_1.hyperliquidRateLimiter.throttleExchangeRequest(1);
                let orderPrice = params.price;
                const requestedOrderType = params.orderType || 'limit';
                const marketLikeOrder = requestedOrderType === 'market' || params.reduceOnly === true;
                // For market/reduce-only orders, force executable aggressive pricing instead of
                // trusting a potentially stale mark price from upstream.
                if (!orderPrice || marketLikeOrder) {
                    try {
                        orderPrice = await this.getAggressiveMarketPrice(params.symbol, params.side);
                    }
                    catch (priceError) {
                        logger_1.default.warn(`[PlaceOrder] Failed to get aggressive price: ${priceError}`);
                        orderPrice = await this.getBufferedBookPrice(params.symbol, params.side);
                    }
                }
                const formattedPrice = this.formatPrice(orderPrice, params.symbol);
                const formattedSize = this.formatSize(validatedSize, params.symbol);
                const orderTypeConfig = {
                    limit: { tif: marketLikeOrder ? 'Ioc' : 'Gtc' }
                };
                logger_1.default.info(`[Attempt ${attempt + 1}/${maxAttempts}] Placing order: ${params.side} ${formattedSize} ${params.symbol} @ ${formattedPrice}`);
                const result = await this.walletClient.order({
                    orders: [{
                            a: assetIndex,
                            b: params.side === 'BUY',
                            p: formattedPrice,
                            s: formattedSize,
                            r: params.reduceOnly || false,
                            t: orderTypeConfig
                        }],
                    grouping: 'na'
                });
                if (result.status === 'ok') {
                    const response = result.response;
                    const orderStatus = response?.data?.statuses?.[0];
                    const isFilled = Boolean(orderStatus?.filled);
                    this.updateOrderStats(params.symbol, isFilled);
                    if (isFilled) {
                        const filledOrderId = orderStatus.filled.oid?.toString();
                        if (filledOrderId) {
                            this.pendingOrders.delete(filledOrderId);
                        }
                        logger_1.default.info(`[PlaceOrder] Order FILLED: ${params.side} ${formattedSize} ${params.symbol}`);
                        this.recordOrderAttempt(params.symbol, true);
                        return {
                            success: true,
                            orderId: filledOrderId,
                            filledPrice: parseFloat(orderStatus.filled.avgPx || formattedPrice),
                            filledSize: parseFloat(orderStatus.filled.totalSz || formattedSize),
                            status: 'FILLED'
                        };
                    }
                    else if (orderStatus?.resting) {
                        const restingOrderId = orderStatus.resting.oid?.toString();
                        if (restingOrderId) {
                            this.pendingOrders.set(restingOrderId, {
                                symbol: params.symbol,
                                side: params.side,
                                submittedAt: Date.now()
                            });
                        }
                        logger_1.default.info(`[PlaceOrder] Order RESTING: ${params.side} ${formattedSize} ${params.symbol}`);
                        this.recordOrderAttempt(params.symbol, true);
                        return {
                            success: true,
                            orderId: restingOrderId,
                            status: 'RESTING'
                        };
                    }
                    else if (orderStatus?.error) {
                        this.recordOrderAttempt(params.symbol, false);
                        this.updateOrderStats(params.symbol, false);
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
                        logger_1.default.warn(`[PlaceOrder] Order response unclear: ${JSON.stringify(response)}`);
                        this.recordOrderAttempt(params.symbol, true);
                        return {
                            success: true,
                            status: 'OK'
                        };
                    }
                }
                else {
                    this.updateOrderStats(params.symbol, false);
                    this.recordOrderAttempt(params.symbol, false);
                    lastError = `Order failed: ${JSON.stringify(result)}`;
                    logger_1.default.warn(`[Attempt ${attempt + 1}/${maxAttempts}] ${lastError}`);
                }
            }
            catch (error) {
                lastError = error;
                const isRetryable = this.isRetryableError(error);
                logger_1.default.error(`[Attempt ${attempt + 1}/${maxAttempts}] Order error:`, error);
                if (!isRetryable || attempt >= maxAttempts - 1) {
                    this.recordOrderAttempt(params.symbol, false);
                    return {
                        success: false,
                        status: 'EXCEPTION',
                        error: error.message || String(error)
                    };
                }
            }
            // Exponential backoff before retry
            if (attempt < maxAttempts - 1) {
                const backoffMs = Math.min(1000 * Math.pow(2, attempt), 3000);
                logger_1.default.info(`Retrying in ${backoffMs}ms...`);
                await new Promise(resolve => setTimeout(resolve, backoffMs));
            }
        }
        this.recordOrderAttempt(params.symbol, false);
        return {
            success: false,
            status: 'RETRY_EXHAUSTED',
            error: lastError?.message || String(lastError) || 'Max retries exceeded'
        };
    }
    validateOrderSize(size, symbol) {
        const minSize = this.MIN_ORDER_SIZES[symbol] || this.MIN_ORDER_SIZES['DEFAULT'];
        if (size <= 0) {
            return { valid: false, adjustedSize: 0, error: 'Order size must be positive' };
        }
        if (size < minSize) {
            logger_1.default.warn(`[SizeValidation] Order size ${size} below minimum ${minSize} for ${symbol}, adjusting up`);
            return { valid: true, adjustedSize: minSize };
        }
        const decimals = symbol === 'BTC' ? 5 : symbol === 'ETH' ? 4 : 3;
        const adjustedSize = Math.ceil(size * Math.pow(10, decimals)) / Math.pow(10, decimals);
        return { valid: true, adjustedSize };
    }
    async getAggressiveMarketPrice(symbol, side) {
        const book = await this.getL2Book(symbol);
        const bids = Array.isArray(book?.levels?.[0]) ? book.levels[0] : [];
        const asks = Array.isArray(book?.levels?.[1]) ? book.levels[1] : [];
        const bestBid = Number.parseFloat(bids[0]?.px ?? '');
        const bestAsk = Number.parseFloat(asks[0]?.px ?? '');
        if (!Number.isFinite(bestBid) || !Number.isFinite(bestAsk) || bestBid <= 0 || bestAsk <= 0) {
            throw new Error(`Invalid order book for ${symbol}`);
        }
        const slippageBuffer = 0.005;
        const aggressivePrice = side === 'BUY'
            ? bestAsk * (1 + slippageBuffer)
            : bestBid * (1 - slippageBuffer);
        return aggressivePrice;
    }
    async getBufferedBookPrice(symbol, side) {
        const mids = await this.getAllMids();
        const midPrice = mids[symbol];
        if (!midPrice || midPrice <= 0) {
            throw new Error(`Could not get mid price for ${symbol}`);
        }
        const buffer = 0.002;
        return side === 'BUY'
            ? midPrice * (1 + buffer)
            : midPrice * (1 - buffer);
    }
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
    async checkOrderTimeouts() {
        if (this.pendingOrders.size === 0) {
            return;
        }
        const now = Date.now();
        for (const [orderId, pendingOrder] of this.pendingOrders.entries()) {
            const ageMs = now - pendingOrder.submittedAt;
            if (ageMs > 30000 && ageMs <= this.ORDER_TIMEOUT_MS) {
                logger_1.default.warn(`[OrderTimeout] Order ${orderId} (${pendingOrder.symbol}) pending for ${(ageMs / 1000).toFixed(1)}s`);
            }
            if (ageMs > this.ORDER_TIMEOUT_MS) {
                logger_1.default.warn(`[OrderTimeout] Cancelling stale order ${orderId} (${pendingOrder.symbol}) after ${(ageMs / 1000).toFixed(1)}s`);
                const cancelled = await this.cancelOrder(pendingOrder.symbol, orderId);
                if (cancelled) {
                    this.pendingOrders.delete(orderId);
                    this.recordOrderAttempt(pendingOrder.symbol, false);
                    this.updateOrderStats(pendingOrder.symbol, false);
                }
                else {
                    logger_1.default.error(`[OrderTimeout] Failed to cancel stale order ${orderId} (${pendingOrder.symbol})`);
                }
            }
        }
    }
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
                this.pendingOrders.delete(orderId);
            }
            return result.status === 'ok';
        }
        catch (error) {
            logger_1.default.error('Failed to cancel order:', error);
            return false;
        }
    }
    async cancelAllOrders() {
        try {
            const openOrders = await this.getOpenOrders();
            for (const order of openOrders) {
                await this.cancelOrder(order.coin, order.oid.toString());
            }
            return true;
        }
        catch (error) {
            logger_1.default.error('Failed to cancel all orders:', error);
            return false;
        }
    }
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
    formatSize(size, symbol) {
        const decimals = symbol === 'BTC' ? 5 : 4;
        return size.toFixed(decimals);
    }
    async getL2Book(symbol) {
        try {
            return await this.publicClient.l2Book({ coin: symbol });
        }
        catch (error) {
            logger_1.default.error(`Failed to get L2 book for ${symbol}:`, error);
            throw error;
        }
    }
    async getRecentTrades(symbol) {
        try {
            return [];
        }
        catch (error) {
            logger_1.default.error(`Failed to get recent trades for ${symbol}:`, error);
            return [];
        }
    }
    /**
     * Get anti-churn statistics for monitoring
     */
    getAntiChurnStats() {
        const fillRates = {};
        for (const [symbol, stats] of this.orderStats.entries()) {
            fillRates[symbol] = {
                rate: stats.submitted > 0 ? stats.filled / stats.submitted : 0,
                filled: stats.filled,
                total: stats.submitted
            };
        }
        const attemptCounts = {};
        for (const [symbol, attempts] of this.orderAttemptCount.entries()) {
            attemptCounts[symbol] = attempts;
        }
        const orderStats = {};
        for (const [symbol, stats] of this.orderStats.entries()) {
            orderStats[symbol] = stats;
        }
        return {
            orderStats,
            fillRates,
            attemptCounts,
            pendingOrders: this.pendingOrders.size
        };
    }
}
exports.HyperliquidClient = HyperliquidClient;
const hyperliquidClient = new HyperliquidClient();
exports.default = hyperliquidClient;
//# sourceMappingURL=hyperliquid-client.js.map