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
        // Support both apiSecret (legacy) and privateKey naming
        const privateKey = hyperliquidConfig.privateKey || hyperliquidConfig.apiSecret;
        const mainAddress = hyperliquidConfig.mainAddress || hyperliquidConfig.apiKey;
        if (privateKey && privateKey.startsWith('0x') && privateKey.length === 66) {
            try {
                this.wallet = (0, accounts_1.privateKeyToAccount)(privateKey);
                this.walletAddress = this.wallet.address;
                // If mainAddress is configured, use it as the target user address
                // Otherwise use the signer's address
                this.userAddress = mainAddress || this.walletAddress;
                // Wallet client for trading
                this.walletClient = new hyperliquid_1.WalletClient({
                    transport: this.transport,
                    wallet: this.wallet,
                    isTestnet: this.isTestnet
                    // defaultVaultAddress: mainAddress ? (mainAddress as `0x${string}`) : undefined
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
    }
    /**
     * Initialize asset indices from the API
     */
    async initialize() {
        if (this.isInitialized)
            return;
        try {
            // Get metadata to build asset index mapping
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
        return this.assetIndices.get(symbol) ?? ASSET_INDICES[symbol];
    }
    /**
     * Get all current mid prices (with rate limiting)
     */
    async getAllMids() {
        // Apply rate limiting for info endpoint
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
    /**
     * Get account state (balance, positions) - with rate limiting
     */
    async getAccountState() {
        // Apply rate limiting for info endpoint
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
    /**
     * Get open orders
     */
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
     * Place an order (enhanced with rate limiting, retry logic, and overfill protection)
     */
    async placeOrder(params) {
        if (!this.walletClient) {
            return {
                success: false,
                status: 'NO_WALLET',
                error: 'No wallet configured for trading'
            };
        }
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
        // ULTRA-AGGRESSIVE: Retry logic with exponential backoff
        const maxRetries = 3;
        let lastError = null;
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                // Apply rate limiting before each attempt
                await token_bucket_1.hyperliquidRateLimiter.throttleExchangeRequest(1);
                // Get current price if not provided (for market-like orders)
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
                    // ULTRA-AGGRESSIVE: Increased slippage for better fill rates
                    // For buys, go 1% higher; for sells, go 1% lower
                    // On retries, increase slippage further
                    const slippageMultiplier = 1 + (attempt * 0.005); // 0.5%, 1%, 1.5%
                    orderPrice = params.side === 'BUY'
                        ? midPrice * (1.01 + (attempt * 0.005)) // More aggressive on retries
                        : midPrice * (0.99 - (attempt * 0.005));
                }
                // Format price to appropriate precision
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
                                ? { limit: { tif: 'Ioc' } } // IOC for market-like execution
                                : { limit: { tif: 'Gtc' } } // GTC for limit orders
                        }],
                    grouping: 'na'
                });
                if (result.status === 'ok') {
                    const response = result.response;
                    const orderStatus = response?.data?.statuses?.[0];
                    if (orderStatus?.filled) {
                        logger_1.default.info(`Order filled: ${params.side} ${formattedSize} ${params.symbol} @ ${orderStatus.filled.avgPx || formattedPrice}`);
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
                        // If error is retryable, continue; otherwise fail
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
                        // Status OK but no clear fill/resting - check response data
                        logger_1.default.warn(`Order response unclear: ${JSON.stringify(response)}`);
                        // Consider this a success for aggressive trading
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
            // Exponential backoff before retry
            if (attempt < maxRetries - 1) {
                const backoffMs = Math.min(1000 * Math.pow(2, attempt), 5000); // 1s, 2s, 4s max
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
     * Check if an error is retryable (temporary network/server issues)
     */
    isRetryableError(error) {
        const errorMessage = String(error?.message || error || '').toLowerCase();
        const retryablePatterns = [
            'timeout', 'timed out',
            'network', 'connection',
            '502', '503', '504', '500', // HTTP server errors
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
     * BTC uses $1 tick, ETH uses $0.1, SOL/others use $0.01
     */
    formatPrice(price, symbol) {
        // Different assets have different tick sizes on Hyperliquid
        if (symbol === 'BTC') {
            // BTC: $1 tick size - round to nearest integer
            return Math.round(price).toString();
        }
        else if (symbol === 'ETH') {
            // ETH: $0.1 tick size
            return (Math.round(price * 10) / 10).toFixed(1);
        }
        else {
            // Most other assets: $0.01 tick size
            return (Math.round(price * 100) / 100).toFixed(2);
        }
    }
    /**
     * Format size to appropriate precision for the asset
     */
    formatSize(size, symbol) {
        // Different assets have different size increments
        const decimals = symbol === 'BTC' ? 5 : 4;
        return size.toFixed(decimals);
    }
    /**
     * Get L2 order book
     */
    async getL2Book(symbol) {
        try {
            return await this.publicClient.l2Book({ coin: symbol });
        }
        catch (error) {
            logger_1.default.error(`Failed to get L2 book for ${symbol}:`, error);
            throw error;
        }
    }
    /**
     * Get recent trades
     */
    async getRecentTrades(symbol) {
        try {
            // recentTrades is not available in PublicClient, returning empty array for now
            // const result = await this.publicClient.recentTrades({ coin: symbol });
            return [];
        }
        catch (error) {
            logger_1.default.error(`Failed to get recent trades for ${symbol}:`, error);
            return [];
        }
    }
}
exports.HyperliquidClient = HyperliquidClient;
// Singleton instance
const hyperliquidClient = new HyperliquidClient();
exports.default = hyperliquidClient;
//# sourceMappingURL=hyperliquid-client.js.map