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

import { WalletClient, HttpTransport, PublicClient } from '@nktkas/hyperliquid';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import logger from '../shared/logger';
import config from '../shared/config';
import { hyperliquidRateLimiter } from '../infrastructure/token-bucket';
import overfillProtection from '../infrastructure/overfill-protection';
import snapshotService from '../infrastructure/snapshot-service';
import { Channel } from '../shared/message-bus';
import messageBus from '../shared/message-bus';
import { v4 as uuidv4 } from 'uuid';

// Asset index mapping (updated from meta on init)
const ASSET_INDICES: Record<string, number> = {
    'BTC': 0,
    'ETH': 4,
    'SOL': 7,
    // Will be populated dynamically from meta
};

// CRITICAL FIX: Lowered thresholds to allow more orders through
const DEFAULT_MIN_CONFIDENCE = 0.60;
const DEFAULT_MIN_MARKET_CONFIDENCE = 0.65;
const DEFAULT_MAX_ALLOWED_SPREAD = 0.01; // 1% - relaxed for crypto markets
const MIN_PRACTICAL_MAX_SPREAD = 0.005; // 0.5% minimum - anything lower blocks most crypto pairs
const MAX_PRACTICAL_MIN_CONFIDENCE = 0.80;
const MAX_PRACTICAL_MIN_MARKET_CONFIDENCE = 0.90;
const MAX_PRICE_SIG_FIGS = 5;
const MAX_PRICE_DECIMALS = 6;

function parseRatioEnv(envName: string, fallback: number): number {
    const raw = process.env[envName];
    if (!raw) {
        return fallback;
    }

    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1) {
        logger.warn(`[Config] Invalid ${envName}=${raw}. Falling back to ${fallback}`);
        return fallback;
    }

    return parsed;
}

function parsePositiveIntEnv(envName: string, fallback: number): number {
    const raw = process.env[envName];
    if (!raw) {
        return fallback;
    }

    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        logger.warn(`[Config] Invalid ${envName}=${raw}. Falling back to ${fallback}`);
        return fallback;
    }

    return parsed;
}

function parsePositiveFloatEnv(envName: string, fallback: number): number {
    const raw = process.env[envName];
    if (!raw) {
        return fallback;
    }

    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        logger.warn(`[Config] Invalid ${envName}=${raw}. Falling back to ${fallback}`);
        return fallback;
    }

    return parsed;
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

interface PendingOrderInfo {
    symbol: string;
    side: 'BUY' | 'SELL';
    submittedAt: number;
    orderType: 'limit' | 'market';
    tif: 'Ioc' | 'Gtc';
    reduceOnly: boolean;
}

interface PendingOrderDirectionInfo {
    orderId: string;
    submittedAt: number;
}

interface CancelledOrderWindow {
    cancelled: number;
    windowStart: number;
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

interface OrderPlacementOptions {
    requireConfidence: boolean;
}

interface SizeValidationResult {
    valid: boolean;
    adjustedSize: number;
    minSize: number;
    sizeStep: number;
    sizeDecimals: number;
    error?: string;
}

// Order signature for deduplication
interface OrderSignature {
    symbol: string;
    side: 'BUY' | 'SELL';
    sizeHash: string;  // Rounded size to prevent micro-diffs
    priceHash: string; // Rounded price to prevent micro-diffs
    timestamp: number;
}

// Global fill rate tracking
interface FillRateWindow {
    filled: number;
    submitted: number;
    windowStart: number;
}

export class HyperliquidClient {
    private transport: HttpTransport;
    private publicClient: PublicClient;
    private walletClient: WalletClient | null = null;
    private wallet: PrivateKeyAccount | null = null;
    private walletAddress: string = '';
    private userAddress: string = '';
    private isTestnet: boolean;
    private assetIndices: Map<string, number> = new Map();
    private assetNames: Map<number, string> = new Map();
    private assetSizeDecimals: Map<string, number> = new Map();
    private isInitialized: boolean = false;
    // CRITICAL FIX: Order timeout increased from 60s to 300s (5 minutes) to allow fills in volatile markets
    private readonly ORDER_TIMEOUT_MS = 300000; // 5 minutes (was 60s)
    private pendingOrders: Map<string, PendingOrderInfo> = new Map();
    private pendingOrdersByDirection: Map<string, PendingOrderDirectionInfo> = new Map();
    private orderStats: Map<string, OrderStats> = new Map();
    
    // ANTI-CHURN: Increased cooldowns to prevent churn and improve fill rates
    private lastOrderTime: Map<string, number> = new Map();
    private readonly ORDER_COOLDOWN_MS = 30000; // 30 seconds standard (anti-churn)
    private readonly MIN_ORDER_COOLDOWN_MS = 10000; // 10 seconds absolute minimum between any orders
    private readonly EXTENDED_COOLDOWN_MS = 300000; // 5 minutes after multiple failures
    private readonly CANCEL_COOLDOWN_BASE_MS = parsePositiveIntEnv(
        'HYPERLIQUID_CANCEL_COOLDOWN_BASE_MS',
        120000
    );
    private readonly CANCEL_COOLDOWN_MAX_MS = parsePositiveIntEnv(
        'HYPERLIQUID_CANCEL_COOLDOWN_MAX_MS',
        600000
    );
    private cancelCooldownUntil: Map<string, number> = new Map();
    private orderAttemptCount: Map<string, OrderAttempt> = new Map();
    
    // CRITICAL FIX: Max orders per minute limit (10 max as requested)
    private readonly MAX_ORDERS_PER_MINUTE = 10;
    private ordersPerMinuteWindow: Map<string, { count: number; windowStart: number }> = new Map();

    // ENHANCED: Pending duplicate protection by symbol + side
    private readonly DUPLICATE_ORDER_WINDOW_MS = 5000;
    
    // ENHANCED: Order deduplication tracking
    private pendingOrderSignatures: Map<string, OrderSignature> = new Map();
    private readonly SIGNATURE_TTL_MS = 60000; // 1 minute TTL for signatures
    
    // ENHANCED: Consecutive failure handling
    private readonly MAX_CONSECUTIVE_FAILURES = 3;
    private readonly FAILURE_BACKOFF_MULTIPLIER = 2;
    private readonly MAX_BACKOFF_MS = 300000; // 5 minutes max backoff

    // CRITICAL: Cancelled-order circuit breaker
    private readonly CANCELLED_WINDOW_MS = 600000; // 10 minutes
    private readonly CANCELLED_THRESHOLD = parsePositiveIntEnv(
        'HYPERLIQUID_CANCELLED_THRESHOLD',
        300
    );
    private readonly CIRCUIT_BREAKER_DURATION_MS = 1800000; // 30 minutes
    private cancelledOrderWindow: CancelledOrderWindow = { cancelled: 0, windowStart: Date.now() };
    private circuitBreakerUntil: number = 0;

    // Minimum order sizes by symbol to prevent "invalid size" errors
    private readonly MIN_ORDER_SIZES: Record<string, number> = {
        'BTC': 0.0001,
        'ETH': 0.001,
        'SOL': 0.01,
        'DEFAULT': 0.01
    };
    
    // Lower default threshold to reduce over-filtering while keeping env override support
    private readonly MIN_CONFIDENCE = (() => {
        const configured = parseRatioEnv('HYPERLIQUID_MIN_CONFIDENCE', DEFAULT_MIN_CONFIDENCE);
        if (configured > MAX_PRACTICAL_MIN_CONFIDENCE) {
            logger.warn(
                `[Config] HYPERLIQUID_MIN_CONFIDENCE=${configured} is overly strict for live fills; ` +
                `clamping to ${MAX_PRACTICAL_MIN_CONFIDENCE.toFixed(2)}`
            );
            return MAX_PRACTICAL_MIN_CONFIDENCE;
        }
        return configured;
    })();
    private readonly MIN_MARKET_CONFIDENCE = (() => {
        const fallback = Math.min(
            0.99,
            Math.max(DEFAULT_MIN_MARKET_CONFIDENCE, this.MIN_CONFIDENCE + 0.05)
        );
        const configured = parseRatioEnv('HYPERLIQUID_MIN_MARKET_CONFIDENCE', fallback);
        const maxPractical = Math.min(MAX_PRACTICAL_MIN_MARKET_CONFIDENCE, this.MIN_CONFIDENCE + 0.10);

        if (configured > maxPractical) {
            logger.warn(
                `[Config] HYPERLIQUID_MIN_MARKET_CONFIDENCE=${configured} is overly strict for live fills; ` +
                `clamping to ${maxPractical.toFixed(2)}`
            );
            return maxPractical;
        }

        return Math.max(this.MIN_CONFIDENCE, configured);
    })();
    // Use GTC for market-intent signals by default so they can rest and fill instead of immediate IOC churn.
    private readonly MARKET_ORDER_TIF: 'Ioc' | 'Gtc' =
        process.env.HYPERLIQUID_MARKET_ORDER_TIF?.toLowerCase() === 'ioc' ? 'Ioc' : 'Gtc';
    private hasWarnedIocFallback: boolean = false;
    private readonly MIN_ORDER_AGE_BEFORE_CANCEL_MS = parsePositiveIntEnv(
        'HYPERLIQUID_MIN_ORDER_AGE_BEFORE_CANCEL_MS',
        15000
    );
    private readonly MIN_ENTRY_NOTIONAL_USD = parsePositiveFloatEnv(
        'HYPERLIQUID_MIN_ENTRY_NOTIONAL_USD',
        10
    );
    private readonly MIN_ORDER_BOOK_LEVELS = 5;
    private readonly MIN_ORDER_BOOK_NOTIONAL_DEPTH_K = 0;
    private readonly MAX_ALLOWED_SPREAD = (() => {
        const configured = parseRatioEnv('HYPERLIQUID_MAX_ALLOWED_SPREAD', DEFAULT_MAX_ALLOWED_SPREAD);
        if (configured < MIN_PRACTICAL_MAX_SPREAD) {
            logger.warn(
                `[Config] HYPERLIQUID_MAX_ALLOWED_SPREAD=${configured} is too strict for live fills; ` +
                `clamping to ${(MIN_PRACTICAL_MAX_SPREAD * 100).toFixed(3)}%`
            );
            return MIN_PRACTICAL_MAX_SPREAD;
        }
        return configured;
    })();
    
    // ENHANCED: Fill rate monitoring
    private readonly MIN_FILL_RATE = 0.10; // 10% minimum fill rate before warnings
    private readonly CRITICAL_FILL_RATE = 0.05; // 5% critical threshold
    private symbolFillRates: Map<string, { filled: number; total: number; lastCalculated: number }> = new Map();

    constructor() {
        const hyperliquidConfig = config.getSection('hyperliquid');
        this.isTestnet = hyperliquidConfig.testnet;

        // Initialize HTTP transport with testnet flag
        this.transport = new HttpTransport({
            isTestnet: this.isTestnet,
            timeout: 30000
        });

        // Public client for reading data (no wallet needed)
        this.publicClient = new PublicClient({ transport: this.transport });

        // Try to initialize wallet from private key
        const privateKey = hyperliquidConfig.privateKey || (hyperliquidConfig as any).apiSecret;
        const mainAddress = hyperliquidConfig.mainAddress || (hyperliquidConfig as any).apiKey;

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

                logger.info(`Hyperliquid client initialized with wallet: ${this.walletAddress.slice(0, 10)}...`);
                if (mainAddress) {
                    logger.info(`Acting on behalf of main user: ${this.userAddress.slice(0, 10)}...`);
                }
            } catch (error) {
                logger.error('Failed to initialize wallet from private key:', error);
            }
        } else {
            logger.warn('No valid private key configured - trading will be disabled');
        }

        logger.info(`Hyperliquid client configured for ${this.isTestnet ? 'TESTNET' : 'MAINNET'}`);
        logger.info(`[CRITICAL FIX] Cooldowns: min=${this.MIN_ORDER_COOLDOWN_MS}ms, standard=${this.ORDER_COOLDOWN_MS}ms, extended=${this.EXTENDED_COOLDOWN_MS}ms, maxOrdersPerMin=${this.MAX_ORDERS_PER_MINUTE}`);
        logger.info(`[CRITICAL FIX] Confidence threshold: ${this.MIN_CONFIDENCE}, Max spread: ${(this.MAX_ALLOWED_SPREAD * 100).toFixed(3)}%, Order timeout: ${this.ORDER_TIMEOUT_MS/1000}s`);
        logger.info(
            `[CRITICAL FIX] Market confidence threshold: ${this.MIN_MARKET_CONFIDENCE}, market TIF=${this.MARKET_ORDER_TIF}, ` +
            `minOrderAgeBeforeCancel=${this.MIN_ORDER_AGE_BEFORE_CANCEL_MS}ms, cancelCooldownBase=${this.CANCEL_COOLDOWN_BASE_MS}ms, ` +
            `minEntryNotional=$${this.MIN_ENTRY_NOTIONAL_USD.toFixed(2)}`
        );
        
        // CRITICAL FIX: Start periodic order timeout monitor (every 30 seconds)
        this.startOrderTimeoutMonitor();
    }
    
    /**
     * CRITICAL FIX: Periodic monitor to check for order timeouts
     * Ensures orders are properly tracked even when no new orders are being placed
     */
    private orderTimeoutMonitor: NodeJS.Timeout | null = null;
    private readonly ORDER_TIMEOUT_CHECK_INTERVAL_MS = 30000; // Check every 30 seconds
    
    private startOrderTimeoutMonitor(): void {
        if (this.orderTimeoutMonitor) {
            clearInterval(this.orderTimeoutMonitor);
        }
        
        this.orderTimeoutMonitor = setInterval(async () => {
            try {
                await this.checkOrderTimeouts();
            } catch (error) {
                logger.error('[OrderTimeoutMonitor] Error checking order timeouts:', error);
            }
        }, this.ORDER_TIMEOUT_CHECK_INTERVAL_MS);
        
        logger.info(`[CRITICAL FIX] Order timeout monitor started (interval: ${this.ORDER_TIMEOUT_CHECK_INTERVAL_MS/1000}s)`);
    }

    async initialize(): Promise<void> {
        if (this.isInitialized) return;

        try {
            const meta = await this.publicClient.meta();

            if (meta && meta.universe) {
                this.assetIndices.clear();
                this.assetNames.clear();
                this.assetSizeDecimals.clear();

                for (let i = 0; i < meta.universe.length; i++) {
                    const asset = meta.universe[i];
                    const symbolKey = asset.name.toUpperCase();
                    this.assetIndices.set(symbolKey, i);
                    this.assetNames.set(i, asset.name);
                    ASSET_INDICES[symbolKey] = i;

                    const rawDecimals = Number((asset as any).szDecimals);
                    const szDecimals = Number.isFinite(rawDecimals)
                        ? Math.max(0, Math.min(8, Math.floor(rawDecimals)))
                        : 4;
                    this.assetSizeDecimals.set(symbolKey, szDecimals);
                }
                logger.info(`Loaded ${meta.universe.length} asset indices from Hyperliquid meta`);
            }

            this.isInitialized = true;
        } catch (error) {
            logger.error('Failed to initialize Hyperliquid client:', error);
            throw error;
        }
    }

    isConfigured(): boolean {
        return this.walletClient !== null && this.wallet !== null;
    }

    getWalletAddress(): string {
        return this.walletAddress;
    }

    getUserAddress(): string {
        return this.userAddress;
    }

    getAssetIndex(symbol: string): number | undefined {
        const symbolKey = symbol.toUpperCase();
        return this.assetIndices.get(symbolKey) ?? ASSET_INDICES[symbolKey];
    }

    private normalizeSymbol(symbol: string): string {
        return symbol.trim().toUpperCase();
    }

    private getMinimumSizeStep(symbol: string): number {
        const decimals = this.getSizeDecimals(symbol);
        return 1 / Math.pow(10, decimals);
    }

    private getMinimumOrderSize(symbol: string): number {
        const symbolKey = this.normalizeSymbol(symbol);
        const configuredMin = this.MIN_ORDER_SIZES[symbolKey] ?? this.MIN_ORDER_SIZES['DEFAULT'];
        return Math.max(configuredMin, this.getMinimumSizeStep(symbolKey));
    }

    private countSignificantFigures(value: number): number {
        if (!Number.isFinite(value) || value === 0) {
            return 1;
        }

        const [coefficient] = Math.abs(value).toExponential(15).split('e');
        const digits = coefficient.replace('.', '').replace(/^0+/, '').replace(/0+$/, '');
        return digits.length > 0 ? digits.length : 1;
    }

    private isPricePrecisionValid(price: number, symbol: string): boolean {
        if (!Number.isFinite(price) || price <= 0) {
            return false;
        }

        const normalized = Number.parseFloat(price.toFixed(12));
        const decimals = this.getPriceDecimals(symbol, normalized);
        const multiplier = Math.pow(10, decimals);
        const quantized = Math.round(normalized * multiplier) / multiplier;
        const diff = Math.abs(normalized - quantized);
        const tolerance = 1 / Math.pow(10, Math.max(decimals + 2, 8));
        if (diff > tolerance) {
            return false;
        }

        if (Number.isInteger(normalized)) {
            return true;
        }

        return this.countSignificantFigures(normalized) <= MAX_PRICE_SIG_FIGS;
    }

    private classifyOrderError(errorMessage: string): string {
        const errorLower = errorMessage.toLowerCase();

        if (errorLower.includes('insufficient') || errorLower.includes('margin')) {
            return 'INSUFFICIENT_MARGIN';
        }

        if (errorLower.includes('price') || errorLower.includes('tick')) {
            return 'PRICE_ERROR';
        }

        if (errorLower.includes('size')) {
            return 'SIZE_ERROR';
        }

        if (errorLower.includes('minimum value') || errorLower.includes('minimum notional')) {
            return 'MIN_NOTIONAL';
        }

        if (errorLower.includes('rate') || errorLower.includes('limit') || errorLower.includes('throttle')) {
            return 'RATE_LIMITED';
        }

        if (errorLower.includes('ioc') || errorLower.includes('immediate')) {
            return 'IOC_UNFILLED';
        }

        if (errorLower.includes('network')) {
            return 'NETWORK_ERROR';
        }

        if (errorLower.includes('timeout') || errorLower.includes('timed out')) {
            return 'TIMEOUT';
        }

        return 'REJECTED';
    }

    async getAllMids(): Promise<Record<string, number>> {
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
    }

    async getAccountState(): Promise<HyperliquidAccountState> {
        await hyperliquidRateLimiter.throttleInfoRequest(60);

        if (!this.userAddress) {
            throw new Error('No wallet configured');
        }

        try {
            const state = await this.publicClient.clearinghouseState({ user: this.userAddress as `0x${string}` });

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
    }

    async getOpenOrders(): Promise<any[]> {
        if (!this.userAddress) {
            throw new Error('No wallet configured');
        }

        try {
            const orders = await this.publicClient.openOrders({ user: this.userAddress as `0x${string}` });
            return orders || [];
        } catch (error) {
            logger.error('Failed to get open orders:', error);
            return [];
        }
    }

    /**
     * CRITICAL FIX: Check max orders per minute limit
     */
    private checkOrdersPerMinute(symbol: string): { allowed: boolean; reason?: string } {
        const now = Date.now();
        const symbolKey = symbol.toUpperCase();
        const windowData = this.ordersPerMinuteWindow.get(symbolKey);

        if (!windowData) {
            this.ordersPerMinuteWindow.set(symbolKey, { count: 1, windowStart: now });
            return { allowed: true };
        }

        // Reset window if 1 minute has passed
        if (now - windowData.windowStart > 60000) {
            this.ordersPerMinuteWindow.set(symbolKey, { count: 1, windowStart: now });
            return { allowed: true };
        }

        // Check if we've exceeded max orders per minute
        if (windowData.count >= this.MAX_ORDERS_PER_MINUTE) {
            return { 
                allowed: false, 
                reason: `Max orders per minute exceeded: ${windowData.count}/${this.MAX_ORDERS_PER_MINUTE}` 
            };
        }

        windowData.count++;
        return { allowed: true };
    }

    /**
     * ENHANCED: Calculate dynamic cooldown based on recent failure history
     */
    private calculateDynamicCooldown(symbol: string): number {
        const symbolKey = symbol.toUpperCase();
        const attempts = this.orderAttemptCount.get(symbolKey);
        
        if (!attempts) return this.ORDER_COOLDOWN_MS;
        
        // If we have consecutive failures, apply exponential backoff
        if (attempts.consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES) {
            const backoffMultiplier = Math.pow(this.FAILURE_BACKOFF_MULTIPLIER, 
                attempts.consecutiveFailures - this.MAX_CONSECUTIVE_FAILURES + 1);
            const dynamicCooldown = Math.min(
                this.EXTENDED_COOLDOWN_MS * backoffMultiplier,
                this.MAX_BACKOFF_MS
            );
            
            logger.warn(`[ChurnPrevention] ${symbol} has ${attempts.consecutiveFailures} consecutive failures. ` +
                `Applying extended cooldown: ${dynamicCooldown}ms`);
            
            return dynamicCooldown;
        }
        
        return this.ORDER_COOLDOWN_MS;
    }

    /**
     * ENHANCED: Check if we should allow a new order for this symbol (comprehensive churn prevention)
     */
    private canPlaceNewOrder(
        symbol: string,
        confidence: number | undefined,
        orderType: 'limit' | 'market' = 'limit',
        options: OrderPlacementOptions = { requireConfidence: true }
    ): { allowed: boolean; reason?: string } {
        const now = Date.now();
        const symbolKey = symbol.toUpperCase();
        
        // CRITICAL FIX: Check max orders per minute limit first
        const perMinuteCheck = this.checkOrdersPerMinute(symbol);
        if (!perMinuteCheck.allowed) {
            return perMinuteCheck;
        }

        const cancelCooldownUntil = this.cancelCooldownUntil.get(symbolKey) || 0;
        if (cancelCooldownUntil > now) {
            const remainingSec = Math.ceil((cancelCooldownUntil - now) / 1000);
            return {
                allowed: false,
                reason: `Post-cancel cooldown active: ${remainingSec}s remaining`
            };
        }
        
        const requiredConfidence = orderType === 'market'
            ? this.MIN_MARKET_CONFIDENCE
            : this.MIN_CONFIDENCE;

        // Confidence is required for all non-bypassed entry orders.
        if (options.requireConfidence && (confidence === undefined || !Number.isFinite(confidence))) {
            return {
                allowed: false,
                reason: `Missing confidence for ${orderType.toUpperCase()} order`
            };
        }

        // Check minimum confidence threshold
        if (options.requireConfidence && confidence! < requiredConfidence) {
            return { 
                allowed: false, 
                reason: `Confidence ${confidence!.toFixed(2)} below ${orderType.toUpperCase()} threshold ${requiredConfidence}` 
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
            if (options.requireConfidence && fillRate < this.CRITICAL_FILL_RATE && attempts.count > 5) {
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
    private recordOrderAttempt(symbol: string, success: boolean): void {
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
            this.clearCancelCooldown(symbolKey);
            logger.info(`[ChurnPrevention] ${symbol} order succeeded. Consecutive failures reset.`);
        } else {
            this.orderAttemptCount.set(symbolKey, { 
                count: (current?.count || 0) + 1, 
                lastAttempt: now,
                consecutiveFailures: (current?.consecutiveFailures || 0) + 1
            });
            logger.warn(`[ChurnPrevention] ${symbol} order failed. Consecutive failures: ${(current?.consecutiveFailures || 0) + 1}`);
        }
    }

    private recordPendingAttempt(symbol: string): void {
        const symbolKey = symbol.toUpperCase();
        const now = Date.now();
        const current = this.orderAttemptCount.get(symbolKey);
        this.orderAttemptCount.set(symbolKey, {
            count: (current?.count || 0) + 1,
            lastAttempt: now,
            consecutiveFailures: current?.consecutiveFailures || 0,
            lastSuccess: current?.lastSuccess
        });
    }

    private clearCancelCooldown(symbolKey: string): void {
        this.cancelCooldownUntil.delete(symbolKey);
    }

    private applyCancellationCooldown(symbol: string): void {
        const symbolKey = symbol.toUpperCase();
        const attempts = this.orderAttemptCount.get(symbolKey);
        const failureCount = Math.max(1, attempts?.consecutiveFailures || 1);
        const cooldownMs = Math.min(
            this.CANCEL_COOLDOWN_BASE_MS * Math.pow(2, Math.max(0, failureCount - 1)),
            this.CANCEL_COOLDOWN_MAX_MS
        );
        const until = Date.now() + cooldownMs;
        this.cancelCooldownUntil.set(symbolKey, until);
        logger.warn(
            `[ChurnPrevention] Applied cancel cooldown for ${symbolKey}: ${(cooldownMs / 1000).toFixed(0)}s`
        );
    }

    /**
     * ENHANCED: Get fill rate for a symbol
     */
    private getSymbolFillRate(symbol: string): number {
        const symbolKey = symbol.toUpperCase();
        const stats = this.orderStats.get(symbolKey);
        if (!stats || stats.submitted === 0) return 1.0;
        return stats.filled / stats.submitted;
    }

    /**
     * ENHANCED: Update order stats with fill rate tracking
     */
    private updateOrderStats(symbol: string, filled: boolean): void {
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
        } else {
            stats.failed += 1;
            stats.consecutiveFailures += 1;
            stats.lastFailureTime = Date.now();
        }

        this.orderStats.set(symbolKey, stats);

        const fillRate = stats.submitted > 0 ? stats.filled / stats.submitted : 0;
        
        // Log with appropriate severity based on fill rate
        const logMessage = `[OrderStats] ${symbolKey} fillRate=${(fillRate * 100).toFixed(2)}% (${stats.filled}/${stats.submitted})`;
        
        if (fillRate < this.CRITICAL_FILL_RATE) {
            logger.error(`[ChurnPrevention] ${logMessage} - CRITICAL: Churn detected!`);
        } else if (fillRate < this.MIN_FILL_RATE) {
            logger.warn(`[ChurnPrevention] ${logMessage} - WARNING: Low fill rate`);
        } else {
            logger.info(logMessage);
        }
    }

    private calculateDepthNotional(levels: any[]): number {
        return levels.reduce((total, level) => {
            const price = Number.parseFloat(level?.px ?? '');
            const size = Number.parseFloat(level?.sz ?? '');

            if (!Number.isFinite(price) || !Number.isFinite(size) || price <= 0 || size < 0) {
                return total;
            }

            return total + (price * size);
        }, 0);
    }

    private validateOrderBookDepth(symbol: string, book: any): { valid: boolean; reason?: string; bestBid?: number; bestAsk?: number } {
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

    private checkSpread(bestBid: number, bestAsk: number): { allowed: boolean; reason?: string } {
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

    private resolveOrderTif(orderType?: 'limit' | 'market'): 'Ioc' | 'Gtc' {
        if (orderType !== 'market') {
            return 'Gtc';
        }

        const allowIocMarket = process.env.HYPERLIQUID_ALLOW_IOC_MARKET?.toLowerCase() === 'true';
        if (this.MARKET_ORDER_TIF === 'Ioc' && !allowIocMarket) {
            if (!this.hasWarnedIocFallback) {
                logger.warn(
                    '[Config] HYPERLIQUID_MARKET_ORDER_TIF=IOC detected. ' +
                    'Falling back to GTC to avoid immediate non-fill cancellations. ' +
                    'Set HYPERLIQUID_ALLOW_IOC_MARKET=true to force IOC.'
                );
                this.hasWarnedIocFallback = true;
            }
            return 'Gtc';
        }

        return this.MARKET_ORDER_TIF;
    }

    private isIocCancellation(cancelReason: string, tif: 'Ioc' | 'Gtc'): boolean {
        if (tif === 'Ioc') {
            return true;
        }

        const normalizedReason = cancelReason.toLowerCase();
        return normalizedReason.includes('ioc') || normalizedReason.includes('immediate');
    }

    private async getOpenOrderIdSet(): Promise<Set<string> | null> {
        if (!this.userAddress) {
            return null;
        }

        try {
            const openOrders = await this.publicClient.openOrders({ user: this.userAddress as `0x${string}` });
            const ids = new Set<string>();
            for (const order of openOrders || []) {
                if (order?.oid !== undefined && order?.oid !== null) {
                    ids.add(order.oid.toString());
                }
            }
            return ids;
        } catch (error) {
            logger.error('[OrderTimeout] Failed to fetch open orders for timeout reconciliation:', error);
            return null;
        }
    }

    private getDirectionKey(symbol: string, side: 'BUY' | 'SELL'): string {
        return `${symbol.toUpperCase()}:${side}`;
    }

    private trackPendingOrder(
        orderId: string,
        symbol: string,
        side: 'BUY' | 'SELL',
        submittedAt: number,
        orderType: 'limit' | 'market',
        tif: 'Ioc' | 'Gtc',
        reduceOnly: boolean
    ): void {
        this.pendingOrders.set(orderId, { symbol, side, submittedAt, orderType, tif, reduceOnly });
        this.pendingOrdersByDirection.set(this.getDirectionKey(symbol, side), { orderId, submittedAt });
    }

    private clearPendingOrder(orderId: string): void {
        const pending = this.pendingOrders.get(orderId);
        if (pending) {
            const directionKey = this.getDirectionKey(pending.symbol, pending.side);
            const tracked = this.pendingOrdersByDirection.get(directionKey);
            if (tracked?.orderId === orderId) {
                this.pendingOrdersByDirection.delete(directionKey);
            }
        }
        this.pendingOrders.delete(orderId);
    }

    private getPendingOrderAgeMs(orderId: string): number | null {
        const pending = this.pendingOrders.get(orderId);
        if (!pending) {
            return null;
        }

        return Date.now() - pending.submittedAt;
    }

    private getTrackedPendingOrder(
        symbol: string,
        side: 'BUY' | 'SELL',
        now: number
    ): { orderId: string; ageMs: number; pending: PendingOrderInfo } | null {
        const directionKey = this.getDirectionKey(symbol, side);
        const tracked = this.pendingOrdersByDirection.get(directionKey);
        if (!tracked) {
            return null;
        }

        const pending = this.pendingOrders.get(tracked.orderId);
        if (!pending) {
            this.pendingOrdersByDirection.delete(directionKey);
            return null;
        }

        const ageMs = now - tracked.submittedAt;
        return { orderId: tracked.orderId, ageMs, pending };
    }

    private findRecentDuplicatePendingOrder(
        symbol: string,
        side: 'BUY' | 'SELL',
        now: number
    ): { orderId: string; ageMs: number } | null {
        const tracked = this.getTrackedPendingOrder(symbol, side, now);
        if (!tracked) {
            return null;
        }

        const ageMs = tracked.ageMs;
        if (ageMs < this.DUPLICATE_ORDER_WINDOW_MS) {
            return { orderId: tracked.orderId, ageMs };
        }

        return null;
    }

    private findAnyPendingOrderByDirection(
        symbol: string,
        side: 'BUY' | 'SELL',
        now: number
    ): { orderId: string; ageMs: number; pending: PendingOrderInfo } | null {
        return this.getTrackedPendingOrder(symbol, side, now);
    }

    private recordCancelledOrder(source: string): void {
        const now = Date.now();

        if (now - this.cancelledOrderWindow.windowStart > this.CANCELLED_WINDOW_MS) {
            this.cancelledOrderWindow = { cancelled: 0, windowStart: now };
        }

        this.cancelledOrderWindow.cancelled += 1;

        if (this.cancelledOrderWindow.cancelled > this.CANCELLED_THRESHOLD) {
            this.circuitBreakerUntil = Math.max(
                this.circuitBreakerUntil,
                now + this.CIRCUIT_BREAKER_DURATION_MS
            );

            logger.error(
                `[CRITICAL][CircuitBreaker] Triggered after ${this.cancelledOrderWindow.cancelled} cancellations in 10m. ` +
                `Blocking new orders until ${new Date(this.circuitBreakerUntil).toISOString()} (source=${source})`
            );

            // Reset window after trigger to avoid flooding logs while breaker is active.
            this.cancelledOrderWindow = { cancelled: 0, windowStart: now };
        }
    }

    isCircuitBreakerActive(): boolean {
        if (this.circuitBreakerUntil === 0) {
            return false;
        }

        if (Date.now() >= this.circuitBreakerUntil) {
            this.circuitBreakerUntil = 0;
            return false;
        }

        return true;
    }

    private createBlockedOrderResult(blockReason: string, details?: string): HyperliquidOrderResult {
        return {
            success: false,
            status: 'BLOCKED',
            error: details ? `${blockReason}: ${details}` : blockReason
        };
    }

    async placeOrder(params: {
        symbol: string;
        side: 'BUY' | 'SELL';
        size: number;
        price?: number;
        reduceOnly?: boolean;
        bypassCooldown?: boolean;
        orderType?: 'limit' | 'market';
        clientOrderId?: string;
        confidence?: number;
    }): Promise<HyperliquidOrderResult> {
        if (!this.walletClient) {
            return {
                success: false,
                status: 'NO_WALLET',
                error: 'No wallet configured for trading'
            };
        }

        const symbol = this.normalizeSymbol(params.symbol);
        if (!symbol) {
            return {
                success: false,
                status: 'INVALID_SYMBOL',
                error: `Invalid symbol: ${params.symbol}`
            };
        }

        if (this.isCircuitBreakerActive()) {
            const remainingMs = this.circuitBreakerUntil - Date.now();
            const remainingMinutes = Math.ceil(Math.max(remainingMs, 0) / 60000);
            logger.error(
                `[CRITICAL][CircuitBreaker] Blocking order ${params.side} ${symbol}: ` +
                `${remainingMinutes} minute(s) remaining`
            );
            return this.createBlockedOrderResult('CIRCUIT_BREAKER', 'CIRCUIT_BREAKER_ACTIVE');
        }

        await this.initialize();

        const assetIndex = this.getAssetIndex(symbol);
        if (assetIndex === undefined) {
            return {
                success: false,
                status: 'INVALID_SYMBOL',
                error: `Unknown symbol: ${symbol}`
            };
        }

        // Validate order size
        const sizeValidation = this.validateOrderSize(params.size, symbol);
        if (!sizeValidation.valid) {
            return { success: false, status: 'INVALID_SIZE', error: sizeValidation.error };
        }
        const validatedSize = sizeValidation.adjustedSize;
        const requestedOrderType = params.orderType || 'limit';

        const isReduceOnly = params.reduceOnly === true;
        const bypassChurnGuards = params.bypassCooldown === true;

        if (!bypassChurnGuards) {
            // ENHANCED: Comprehensive churn prevention check
            const orderCheck = this.canPlaceNewOrder(symbol, params.confidence, requestedOrderType, {
                requireConfidence: !isReduceOnly
            });
            if (!orderCheck.allowed) {
                logger.warn(`[ChurnPrevention] Blocking order for ${symbol}: ${orderCheck.reason}`);
                return this.createBlockedOrderResult(
                    'CHURN_PREVENTION',
                    orderCheck.reason || 'Order blocked by churn prevention'
                );
            }

            if (!isReduceOnly) {
                const orderBook = await this.getL2Book(symbol);
                const depthCheck = this.validateOrderBookDepth(symbol, orderBook);
                if (!depthCheck.valid) {
                    logger.warn(`[ChurnPrevention] Blocking order for ${symbol}: ${depthCheck.reason}`);
                    return this.createBlockedOrderResult(
                        'CHURN_PREVENTION',
                        depthCheck.reason || 'Order book depth check failed'
                    );
                }

                if (depthCheck.bestBid === undefined || depthCheck.bestAsk === undefined) {
                    logger.warn(`[ChurnPrevention] Blocking order for ${symbol}: Missing top-of-book prices`);
                    return this.createBlockedOrderResult('CHURN_PREVENTION', 'Missing top-of-book prices');
                }

                const spreadCheck = this.checkSpread(depthCheck.bestBid, depthCheck.bestAsk);
                if (!spreadCheck.allowed) {
                    logger.warn(`[ChurnPrevention] Blocking order for ${symbol}: ${spreadCheck.reason}`);
                    return this.createBlockedOrderResult(
                        'CHURN_PREVENTION',
                        spreadCheck.reason || 'Spread check failed'
                    );
                }
            }
        } else {
            const bypassReason = 'explicit bypassCooldown';
            logger.warn(`[ChurnPrevention] Bypassing cooldown and churn guards for ${symbol} (${bypassReason})`);
        }

        await this.checkOrderTimeouts();

        const now = Date.now();
        const symbolKey = symbol;
        const lastTime = this.lastOrderTime.get(symbolKey) || 0;

        const duplicatePending = this.findRecentDuplicatePendingOrder(symbol, params.side, now);
        if (duplicatePending) {
            logger.warn(
                `[DuplicateOrder] Rejecting ${params.side} ${symbol}. ` +
                `Pending order ${duplicatePending.orderId} is ${(duplicatePending.ageMs / 1000).toFixed(2)}s old`
            );
            return this.createBlockedOrderResult('DUPLICATE_ORDER', 'DUPLICATE_ORDER');
        }

        const pendingByDirection = this.findAnyPendingOrderByDirection(symbol, params.side, now);
        if (pendingByDirection && !bypassChurnGuards) {
            logger.warn(
                `[OrderLifecycle] Blocking ${params.side} ${symbol}: pending order ${pendingByDirection.orderId} ` +
                `already tracked for ${(pendingByDirection.ageMs / 1000).toFixed(1)}s`
            );
            return this.createBlockedOrderResult(
                'PENDING_ORDER',
                `Pending ${params.side} order exists: ${pendingByDirection.orderId}`
            );
        }

        if (!bypassChurnGuards) {
            // Legacy cooldown check (redundant but kept for safety)
            if (now - lastTime < this.MIN_ORDER_COOLDOWN_MS) {
                const remainingSec = Math.ceil((this.MIN_ORDER_COOLDOWN_MS - (now - lastTime)) / 1000);
                logger.warn(`[ChurnPrevention] Minimum cooldown active for ${symbol}, ${remainingSec}s remaining`);
                return this.createBlockedOrderResult(
                    'CHURN_PREVENTION',
                    `Minimum cooldown active: ${remainingSec}s remaining`
                );
            }

            const dynamicCooldown = this.calculateDynamicCooldown(symbol);
            if (now - lastTime < dynamicCooldown) {
                const remainingSec = Math.ceil((dynamicCooldown - (now - lastTime)) / 1000);
                logger.warn(`[ChurnPrevention] Order cooldown active for ${symbol}, ${remainingSec}s remaining`);
                return this.createBlockedOrderResult('COOLDOWN', `Cooldown active: ${remainingSec}s remaining`);
            }
        }
        
        this.lastOrderTime.set(symbolKey, now);

        // Generate client order ID for tracking
        const clientOrderId = params.clientOrderId || uuidv4();

        // Register order for overfill protection
        overfillProtection.registerOrder({
            orderId: clientOrderId,
            clientOrderId,
            symbol,
            side: params.side,
            orderQty: validatedSize,
            filledQty: 0,
            avgPx: params.price || 0,
            status: 'PENDING',
            timestamp: Date.now(),
        });

        // Retry logic with exponential backoff
        const maxRetries = 0; // No retries: max 1 order attempt per signal
        const maxAttempts = maxRetries + 1;
        let lastError: any = null;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            try {
                await hyperliquidRateLimiter.throttleExchangeRequest(1);

                let orderPrice = params.price;
                const isMarketOrder = requestedOrderType === 'market';
                const orderTif = this.resolveOrderTif(requestedOrderType);

                // For market orders, force executable aggressive pricing instead of
                // trusting a potentially stale mark price from upstream.
                // For limit orders (even reduce-only), use the provided price or get a reasonable price
                if (!orderPrice || isMarketOrder) {
                    try {
                        orderPrice = await this.getAggressiveMarketPrice(symbol, params.side);
                    } catch (priceError) {
                        logger.warn(`[PlaceOrder] Failed to get aggressive price: ${priceError}`);
                        orderPrice = await this.getBufferedBookPrice(symbol, params.side);
                    }
                }

                const formattedPrice = this.formatPrice(orderPrice, symbol);
                const formattedSize = this.formatSize(validatedSize, symbol);
                const numericPrice = Number.parseFloat(formattedPrice);
                const numericSize = Number.parseFloat(formattedSize);

                if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
                    this.recordOrderAttempt(symbol, false);
                    this.updateOrderStats(symbol, false);
                    this.applyCancellationCooldown(symbol);
                    return {
                        success: false,
                        status: 'PRICE_ERROR',
                        error: `Formatted price invalid for ${symbol}: ${formattedPrice}`
                    };
                }

                if (!Number.isFinite(numericSize) || numericSize <= 0) {
                    this.recordOrderAttempt(symbol, false);
                    this.updateOrderStats(symbol, false);
                    this.applyCancellationCooldown(symbol);
                    return {
                        success: false,
                        status: 'SIZE_ERROR',
                        error: `Formatted size invalid for ${symbol}: ${formattedSize}`
                    };
                }

                const orderNotional = numericPrice * numericSize;
                if (!isReduceOnly && orderNotional < this.MIN_ENTRY_NOTIONAL_USD) {
                    this.recordOrderAttempt(symbol, false);
                    this.updateOrderStats(symbol, false);
                    this.applyCancellationCooldown(symbol);
                    const minSizeForNotional = Number.parseFloat(
                        (
                            Math.ceil((this.MIN_ENTRY_NOTIONAL_USD / numericPrice) / sizeValidation.sizeStep) *
                            sizeValidation.sizeStep
                        ).toFixed(sizeValidation.sizeDecimals)
                    );
                    return {
                        success: false,
                        status: 'MIN_NOTIONAL',
                        error:
                            `Order notional $${orderNotional.toFixed(2)} below minimum $${this.MIN_ENTRY_NOTIONAL_USD.toFixed(2)} ` +
                            `(size=${numericSize}, minSizeForNotional=${minSizeForNotional})`
                    };
                }

                logger.info(
                    `[PlaceOrder][Preflight] ${symbol} ${params.side} rawSize=${params.size} normalizedSize=${numericSize} ` +
                    `(step=${sizeValidation.sizeStep}, szDecimals=${sizeValidation.sizeDecimals}) rawPrice=${orderPrice} ` +
                    `normalizedPrice=${numericPrice} tif=${orderTif} reduceOnly=${isReduceOnly ? 'true' : 'false'}`
                );

                const orderTypeConfig = {
                    limit: { tif: orderTif }
                };

                logger.info(
                    `[Attempt ${attempt + 1}/${maxAttempts}] Placing ${requestedOrderType.toUpperCase()} order: ` +
                    `${params.side} ${formattedSize} ${symbol} @ ${formattedPrice} ` +
                    `(tif=${orderTif}, reduceOnly=${params.reduceOnly ? 'true' : 'false'})`
                );

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
                    const orderStatus = response?.data?.statuses?.[0] as any;

                    if (orderStatus?.filled) {
                        this.updateOrderStats(symbol, true);
                        const filledOrderId = orderStatus.filled.oid?.toString();
                        if (filledOrderId) {
                            this.clearPendingOrder(filledOrderId);
                        }

                        logger.info(
                            `[PlaceOrder] Order FILLED: ${params.side} ${formattedSize} ${symbol} ` +
                            `(orderType=${requestedOrderType}, tif=${orderTif})`
                        );
                        this.recordOrderAttempt(symbol, true);
                        return {
                            success: true,
                            orderId: filledOrderId,
                            filledPrice: parseFloat(orderStatus.filled.avgPx || formattedPrice),
                            filledSize: parseFloat(orderStatus.filled.totalSz || formattedSize),
                            status: 'FILLED'
                        };
                    } else if (orderStatus?.resting) {
                        const restingOrderId = orderStatus.resting.oid?.toString();
                        if (restingOrderId) {
                            this.trackPendingOrder(
                                restingOrderId,
                                symbol,
                                params.side,
                                Date.now(),
                                requestedOrderType,
                                orderTif,
                                params.reduceOnly || false
                            );
                        }

                        logger.info(
                            `[PlaceOrder] Order RESTING on book: ${params.side} ${formattedSize} ${symbol} ` +
                            `(orderType=${requestedOrderType}, tif=${orderTif}, orderId=${restingOrderId || 'n/a'})`
                        );
                        this.recordPendingAttempt(symbol);
                        return {
                            success: true,
                            orderId: restingOrderId,
                            status: 'RESTING'
                        };
                    } else if (orderStatus?.error) {
                        this.recordOrderAttempt(symbol, false);
                        this.updateOrderStats(symbol, false);
                        this.applyCancellationCooldown(symbol);
                        
                        const errorMessage = String(orderStatus.error);
                        const classifiedStatus = this.classifyOrderError(errorMessage);
                        
                        logger.error(
                            `[PlaceOrder] Hyperliquid API ERROR for ${symbol}: ${errorMessage} ` +
                            `(classified=${classifiedStatus}, orderType=${requestedOrderType}, tif=${orderTif})`
                        );

                        if (classifiedStatus === 'IOC_UNFILLED') {
                            logger.warn(
                                `[PlaceOrder] IOC non-fill for ${symbol}: ${errorMessage} ` +
                                `(orderType=${requestedOrderType}, tif=${orderTif})`
                            );
                        }

                        return {
                            success: false,
                            status: classifiedStatus,
                            error: errorMessage
                        };
                    } else if (orderStatus?.cancelled) {
                        // CRITICAL FIX: Track cancelled orders explicitly
                        this.recordOrderAttempt(symbol, false);
                        this.updateOrderStats(symbol, false);
                        this.recordCancelledOrder(`api_rejection:${symbol}`);
                        this.applyCancellationCooldown(symbol);
                        
                        const cancelReason = orderStatus.cancelled?.reason || 'Unknown';
                        const iocCancellation = this.isIocCancellation(cancelReason, orderTif);
                        if (iocCancellation) {
                            logger.warn(
                                `[PlaceOrder] Order CANCELLED due to IOC non-fill for ${symbol}: ${cancelReason} ` +
                                `(orderType=${requestedOrderType}, tif=${orderTif})`
                            );
                        } else {
                            logger.error(
                                `[PlaceOrder] Order CANCELLED by Hyperliquid for ${symbol}: ${cancelReason} ` +
                                `(orderType=${requestedOrderType}, tif=${orderTif})`
                            );
                        }
                        
                        return {
                            success: false,
                            status: iocCancellation ? 'IOC_UNFILLED' : 'CANCELLED',
                            error: `Order cancelled: ${cancelReason}`
                        };
                    } else {
                        // CRITICAL FIX: Log unclear responses for debugging
                        logger.warn(`[PlaceOrder] Unclear order response for ${symbol}: ${JSON.stringify(response)}`);
                        this.recordPendingAttempt(symbol);
                        return {
                            success: true,
                            status: 'PENDING',
                            orderId: clientOrderId
                        };
                    }
                } else {
                    this.updateOrderStats(symbol, false);
                    this.recordOrderAttempt(symbol, false);
                    this.applyCancellationCooldown(symbol);
                    lastError = `Order failed: ${JSON.stringify(result)}`;
                    logger.warn(`[Attempt ${attempt + 1}/${maxAttempts}] ${lastError}`);
                }
            } catch (error: any) {
                lastError = error;
                const isRetryable = this.isRetryableError(error);
                
                const errorMessage = error?.message || String(error);
                const errorCode = error?.code || 'UNKNOWN';
                const classifiedStatus = this.classifyOrderError(errorMessage);
                logger.error(
                    `[Attempt ${attempt + 1}/${maxAttempts}] Order exception for ${symbol}: ` +
                    `[${errorCode}] ${errorMessage} (classified=${classifiedStatus})`
                );

                if (!isRetryable || attempt >= maxAttempts - 1) {
                    this.recordOrderAttempt(symbol, false);
                    this.updateOrderStats(symbol, false);
                    this.applyCancellationCooldown(symbol);
                    
                    return {
                        success: false,
                        status: classifiedStatus,
                        error: errorMessage
                    };
                }
            }

            // Exponential backoff before retry
            if (attempt < maxAttempts - 1) {
                const backoffMs = Math.min(1000 * Math.pow(2, attempt), 3000);
                logger.info(`Retrying in ${backoffMs}ms...`);
                await new Promise(resolve => setTimeout(resolve, backoffMs));
            }
        }

        this.recordOrderAttempt(symbol, false);
        this.updateOrderStats(symbol, false);
        this.applyCancellationCooldown(symbol);
        return {
            success: false,
            status: 'RETRY_EXHAUSTED',
            error: lastError?.message || String(lastError) || 'Max retries exceeded'
        };
    }

    async placeStopOrder(params: {
        symbol: string;
        side: 'BUY' | 'SELL';
        size: number;
        triggerPrice: number;
        tpsl: 'sl' | 'tp';
        reduceOnly?: boolean;
    }): Promise<HyperliquidOrderResult> {
        if (!this.walletClient) {
            return {
                success: false,
                status: 'NO_WALLET',
                error: 'No wallet configured for trading'
            };
        }

        const symbol = this.normalizeSymbol(params.symbol);
        if (!symbol) {
            return {
                success: false,
                status: 'INVALID_SYMBOL',
                error: `Invalid symbol: ${params.symbol}`
            };
        }

        await this.initialize();

        const assetIndex = this.getAssetIndex(symbol);
        if (assetIndex === undefined) {
            return {
                success: false,
                status: 'INVALID_SYMBOL',
                error: `Unknown symbol: ${symbol}`
            };
        }

        const sizeValidation = this.validateOrderSize(params.size, symbol);
        if (!sizeValidation.valid) {
            return {
                success: false,
                status: 'INVALID_SIZE',
                error: sizeValidation.error
            };
        }

        const isReduceOnly = params.reduceOnly !== false;

        try {
            await hyperliquidRateLimiter.throttleExchangeRequest(1);

            const formattedTriggerPrice = this.formatPrice(params.triggerPrice, symbol);
            const formattedSize = this.formatSize(sizeValidation.adjustedSize, symbol);

            logger.info(
                `[PlaceStopOrder] Submitting ${params.tpsl.toUpperCase()} trigger for ${symbol}: ` +
                `${params.side} ${formattedSize} @ trigger ${formattedTriggerPrice} ` +
                `(reduceOnly=${isReduceOnly ? 'true' : 'false'})`
            );

            const result = await this.walletClient.order({
                orders: [{
                    a: assetIndex,
                    b: params.side === 'BUY',
                    p: formattedTriggerPrice,
                    s: formattedSize,
                    r: isReduceOnly,
                    t: {
                        trigger: {
                            isMarket: true,
                            triggerPx: formattedTriggerPrice,
                            tpsl: params.tpsl
                        }
                    }
                }],
                grouping: 'na'
            });

            if (result.status !== 'ok') {
                const errorMessage = `Trigger order failed: ${JSON.stringify(result)}`;
                logger.error(`[PlaceStopOrder] ${errorMessage}`);
                return {
                    success: false,
                    status: 'REJECTED',
                    error: errorMessage
                };
            }

            const orderStatus = (result.response as any)?.data?.statuses?.[0] as any;

            if (orderStatus?.resting) {
                const orderId = orderStatus.resting.oid?.toString();
                logger.info(
                    `[PlaceStopOrder] ${params.tpsl.toUpperCase()} trigger resting for ${symbol} ` +
                    `(orderId=${orderId || 'n/a'})`
                );
                return {
                    success: true,
                    status: 'RESTING',
                    orderId
                };
            }

            if (orderStatus?.filled) {
                const orderId = orderStatus.filled.oid?.toString();
                return {
                    success: true,
                    status: 'FILLED',
                    orderId,
                    filledPrice: parseFloat(orderStatus.filled.avgPx || formattedTriggerPrice),
                    filledSize: parseFloat(orderStatus.filled.totalSz || formattedSize)
                };
            }

            if (orderStatus?.error) {
                const errorMessage = String(orderStatus.error);
                const classifiedStatus = this.classifyOrderError(errorMessage);
                logger.error(
                    `[PlaceStopOrder] Hyperliquid API error for ${symbol} ${params.tpsl.toUpperCase()}: ` +
                    `${errorMessage} (classified=${classifiedStatus})`
                );
                return {
                    success: false,
                    status: classifiedStatus,
                    error: errorMessage
                };
            }

            if (orderStatus?.cancelled) {
                const cancelReason = orderStatus.cancelled?.reason || 'Unknown';
                logger.warn(
                    `[PlaceStopOrder] Trigger cancelled for ${symbol} ${params.tpsl.toUpperCase()}: ${cancelReason}`
                );
                return {
                    success: false,
                    status: 'CANCELLED',
                    error: `Order cancelled: ${cancelReason}`
                };
            }

            logger.warn(`[PlaceStopOrder] Unclear trigger response for ${symbol}: ${JSON.stringify(result.response)}`);
            return {
                success: true,
                status: 'PENDING'
            };
        } catch (error: any) {
            const errorMessage = error?.message || String(error);
            const classifiedStatus = this.classifyOrderError(errorMessage);
            logger.error(`[PlaceStopOrder] Exception for ${symbol}: ${errorMessage}`);
            return {
                success: false,
                status: classifiedStatus,
                error: errorMessage
            };
        }
    }

    private validateOrderSize(size: number, symbol: string): SizeValidationResult {
        const symbolKey = this.normalizeSymbol(symbol);
        const sizeDecimals = this.getSizeDecimals(symbolKey);
        const sizeStep = this.getMinimumSizeStep(symbolKey);
        const minSize = this.getMinimumOrderSize(symbolKey);

        if (!Number.isFinite(size) || size <= 0) {
            return {
                valid: false,
                adjustedSize: 0,
                minSize,
                sizeStep,
                sizeDecimals,
                error: 'Order size must be positive'
            };
        }

        const minAdjusted = Math.max(size, minSize);
        const normalizedSteps = Math.ceil(minAdjusted / sizeStep);
        const normalizedSize = Number.parseFloat((normalizedSteps * sizeStep).toFixed(sizeDecimals));

        if (!Number.isFinite(normalizedSize) || normalizedSize <= 0) {
            return {
                valid: false,
                adjustedSize: 0,
                minSize,
                sizeStep,
                sizeDecimals,
                error: `Unable to normalize order size ${size} for ${symbolKey}`
            };
        }

        if (size < minSize) {
            logger.warn(
                `[SizeValidation] ${symbolKey} size ${size} below min ${minSize} ` +
                `(step=${sizeStep}, szDecimals=${sizeDecimals}); adjusted to ${normalizedSize}`
            );
        } else if (Math.abs(normalizedSize - size) > sizeStep / 10) {
            logger.info(
                `[SizeValidation] ${symbolKey} normalized size ${size} -> ${normalizedSize} ` +
                `(step=${sizeStep}, szDecimals=${sizeDecimals})`
            );
        }

        return { valid: true, adjustedSize: normalizedSize, minSize, sizeStep, sizeDecimals };
    }

    private async getAggressiveMarketPrice(symbol: string, side: 'BUY' | 'SELL'): Promise<number> {
        const symbolKey = this.normalizeSymbol(symbol);
        const book = await this.getL2Book(symbolKey);
        const bids = Array.isArray(book?.levels?.[0]) ? book.levels[0] : [];
        const asks = Array.isArray(book?.levels?.[1]) ? book.levels[1] : [];

        const bestBid = Number.parseFloat(bids[0]?.px ?? '');
        const bestAsk = Number.parseFloat(asks[0]?.px ?? '');

        if (!Number.isFinite(bestBid) || !Number.isFinite(bestAsk) || bestBid <= 0 || bestAsk <= 0) {
            throw new Error(`Invalid order book for ${symbolKey}`);
        }

        const slippageBuffer = 0.005;
        
        const aggressivePrice = side === 'BUY'
            ? bestAsk * (1 + slippageBuffer)
            : bestBid * (1 - slippageBuffer);

        return aggressivePrice;
    }

    private async getBufferedBookPrice(symbol: string, side: 'BUY' | 'SELL'): Promise<number> {
        const symbolKey = this.normalizeSymbol(symbol);
        const mids = await this.getAllMids();
        const midPrice = mids[symbolKey] ?? mids[symbol] ?? mids[symbolKey.toLowerCase()];
        
        if (!midPrice || midPrice <= 0) {
            throw new Error(`Could not get mid price for ${symbolKey}`);
        }
        
        const buffer = 0.002;
        return side === 'BUY' 
            ? midPrice * (1 + buffer) 
            : midPrice * (1 - buffer);
    }

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

    async checkOrderTimeouts(): Promise<void> {
        if (this.pendingOrders.size === 0) {
            return;
        }

        const now = Date.now();
        const openOrderIds = await this.getOpenOrderIdSet();

        for (const [orderId, pendingOrder] of this.pendingOrders.entries()) {
            const ageMs = now - pendingOrder.submittedAt;

            // Only cancel if still open on exchange. If it is no longer open, clear stale local tracking.
            if (openOrderIds && !openOrderIds.has(orderId)) {
                logger.info(
                    `[OrderTimeout] Clearing local pending order ${orderId} (${pendingOrder.symbol}) ` +
                    `because it is no longer open on exchange (orderType=${pendingOrder.orderType}, tif=${pendingOrder.tif})`
                );
                this.clearPendingOrder(orderId);
                continue;
            }
            
            // Warn for long-lived open orders well before timeout.
            if (ageMs > 180000 && ageMs <= this.ORDER_TIMEOUT_MS) {
                logger.warn(
                    `[OrderTimeout] Order ${orderId} (${pendingOrder.symbol}) pending for ${(ageMs / 1000).toFixed(1)}s ` +
                    `(orderType=${pendingOrder.orderType}, tif=${pendingOrder.tif})`
                );
            }
            
            if (ageMs >= this.ORDER_TIMEOUT_MS) {
                logger.warn(
                    `[OrderTimeout] Cancelling stale order ${orderId} (${pendingOrder.symbol}) after ${(ageMs / 1000).toFixed(1)}s ` +
                    `(timeout=${this.ORDER_TIMEOUT_MS / 1000}s, orderType=${pendingOrder.orderType}, tif=${pendingOrder.tif})`
                );

                const cancelled = await this.cancelOrder(pendingOrder.symbol, orderId, false);
                if (cancelled) {
                    this.recordCancelledOrder(`timeout:${pendingOrder.symbol}`);
                    this.recordOrderAttempt(pendingOrder.symbol, false);
                    this.updateOrderStats(pendingOrder.symbol, false);
                    this.applyCancellationCooldown(pendingOrder.symbol);
                } else {
                    logger.error(`[OrderTimeout] Failed to cancel stale order ${orderId} (${pendingOrder.symbol})`);
                }
            }
        }
    }

    async cancelOrder(
        symbol: string,
        orderId: string,
        trackCancelledWindow: boolean = true,
        forceCancel: boolean = false
    ): Promise<boolean> {
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

        const orderAgeMs = this.getPendingOrderAgeMs(orderId);
        if (!forceCancel && orderAgeMs !== null && orderAgeMs < this.MIN_ORDER_AGE_BEFORE_CANCEL_MS) {
            const remainingSec = Math.ceil((this.MIN_ORDER_AGE_BEFORE_CANCEL_MS - orderAgeMs) / 1000);
            logger.warn(
                `[CancelOrder] Skipping early cancellation for ${orderId} (${symbol}): ` +
                `age ${(orderAgeMs / 1000).toFixed(1)}s < ${(this.MIN_ORDER_AGE_BEFORE_CANCEL_MS / 1000).toFixed(1)}s ` +
                `(retry in ${remainingSec}s)`
            );
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
                this.clearPendingOrder(orderId);
                if (trackCancelledWindow) {
                    this.recordCancelledOrder(`cancel:${symbol}`);
                    this.applyCancellationCooldown(symbol);
                }
                logger.info(`[CancelOrder] Cancelled order ${orderId} (${symbol})`);
            }

            return result.status === 'ok';
        } catch (error) {
            logger.error('Failed to cancel order:', error);
            return false;
        }
    }

    async cancelAllOrders(forceCancel: boolean = false): Promise<boolean> {
        try {
            const openOrders = await this.getOpenOrders();

            for (const order of openOrders) {
                await this.cancelOrder(order.coin, order.oid.toString(), true, forceCancel);
            }

            return true;
        } catch (error) {
            logger.error('Failed to cancel all orders:', error);
            return false;
        }
    }

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

    private getSizeDecimals(symbol: string): number {
        const fromMeta = this.assetSizeDecimals.get(symbol.toUpperCase());
        if (fromMeta !== undefined) {
            return fromMeta;
        }

        if (symbol.toUpperCase() === 'BTC') return 5;
        if (symbol.toUpperCase() === 'ETH') return 4;
        return 4;
    }

    private getPriceDecimals(symbol: string, price: number): number {
        const maxDecimals = Math.max(0, MAX_PRICE_DECIMALS - this.getSizeDecimals(symbol));
        if (!Number.isFinite(price) || price <= 0) {
            return Math.min(maxDecimals, 2);
        }

        const magnitude = Math.floor(Math.log10(price));
        const decimalsFromSigFigs = Math.max(0, MAX_PRICE_SIG_FIGS - magnitude - 1);
        return Math.min(maxDecimals, decimalsFromSigFigs);
    }

    private formatPrice(price: number, symbol: string): string {
        if (!Number.isFinite(price) || price <= 0) {
            throw new Error(`Invalid price ${price} for ${symbol}`);
        }

        const preferredDecimals = this.getPriceDecimals(symbol, price);
        for (let decimals = preferredDecimals; decimals >= 0; decimals--) {
            const multiplier = Math.pow(10, decimals);
            const rounded = Math.round(price * multiplier) / multiplier;
            const normalized = rounded > 0 ? rounded : 1 / multiplier;

            if (this.isPricePrecisionValid(normalized, symbol)) {
                return normalized.toFixed(decimals);
            }
        }

        throw new Error(`Could not format price ${price} for ${symbol} to a valid tick`);
    }

    private formatSize(size: number, symbol: string): string {
        if (!Number.isFinite(size) || size <= 0) {
            throw new Error(`Invalid size ${size} for ${symbol}`);
        }

        const decimals = this.getSizeDecimals(symbol);
        const step = this.getMinimumSizeStep(symbol);
        const steps = Math.floor(size / step);
        const roundedDown = steps * step;
        const normalized = roundedDown > 0 ? roundedDown : step;
        return normalized.toFixed(decimals);
    }

    async getL2Book(symbol: string): Promise<any> {
        const symbolKey = this.normalizeSymbol(symbol);
        try {
            return await this.publicClient.l2Book({ coin: symbolKey });
        } catch (error) {
            logger.error(`Failed to get L2 book for ${symbolKey}:`, error);
            throw error;
        }
    }

    async getRecentTrades(symbol: string): Promise<any[]> {
        try {
            return [];
        } catch (error) {
            logger.error(`Failed to get recent trades for ${symbol}:`, error);
            return [];
        }
    }

    hasPendingOrder(symbol: string, side?: 'BUY' | 'SELL'): boolean {
        const symbolKey = symbol.toUpperCase();
        if (side) {
            const tracked = this.pendingOrdersByDirection.get(this.getDirectionKey(symbolKey, side));
            return Boolean(tracked && this.pendingOrders.has(tracked.orderId));
        }

        for (const pending of this.pendingOrders.values()) {
            if (pending.symbol.toUpperCase() === symbolKey) {
                return true;
            }
        }
        return false;
    }

    /**
     * Get anti-churn statistics for monitoring
     */
    getAntiChurnStats(): {
        orderStats: Record<string, OrderStats>;
        fillRates: Record<string, { rate: number; filled: number; total: number }>;
        attemptCounts: Record<string, OrderAttempt>;
        pendingOrders: number;
        ordersPerMinute: Record<string, { count: number; windowStart: number }>;
    } {
        const fillRates: Record<string, { rate: number; filled: number; total: number }> = {};
        
        for (const [symbol, stats] of this.orderStats.entries()) {
            fillRates[symbol] = {
                rate: stats.submitted > 0 ? stats.filled / stats.submitted : 0,
                filled: stats.filled,
                total: stats.submitted
            };
        }

        const attemptCounts: Record<string, OrderAttempt> = {};
        for (const [symbol, attempts] of this.orderAttemptCount.entries()) {
            attemptCounts[symbol] = attempts;
        }

        const orderStats: Record<string, OrderStats> = {};
        for (const [symbol, stats] of this.orderStats.entries()) {
            orderStats[symbol] = stats;
        }

        const ordersPerMinute: Record<string, { count: number; windowStart: number }> = {};
        for (const [symbol, data] of this.ordersPerMinuteWindow.entries()) {
            if (Date.now() - data.windowStart < 60000) {
                ordersPerMinute[symbol] = data;
            }
        }

        return {
            orderStats,
            fillRates,
            attemptCounts,
            pendingOrders: this.pendingOrders.size,
            ordersPerMinute
        };
    }
}

const hyperliquidClient = new HyperliquidClient();
export default hyperliquidClient;
