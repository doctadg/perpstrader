"use strict";
// Safekeeping Fund System - Base DEX Client
// Abstract base class for all DEX client implementations
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEXUtils = exports.BaseDEXClient = void 0;
const logger_1 = __importDefault(require("../../shared/logger"));
/**
 * Abstract base class for DEX clients
 * All DEX-specific clients should extend this class
 */
class BaseDEXClient {
    chain;
    dex;
    rpcUrl;
    isConnected;
    lastError;
    connectionLatency;
    constructor(chain, dex, rpcUrl) {
        this.chain = chain;
        this.dex = dex;
        this.rpcUrl = rpcUrl;
        this.isConnected = false;
        this.connectionLatency = 0;
    }
    // =========================================================================
    // COMMON METHODS - Shared across all DEX clients
    // =========================================================================
    /**
     * Check if client is connected and healthy
     */
    async checkConnection() {
        const startTime = Date.now();
        try {
            await this.healthCheck();
            this.isConnected = true;
            this.connectionLatency = Date.now() - startTime;
            const gasData = await this.getGasPrice().catch(() => ({ gasPrice: 0, gasPriceUsd: 0 }));
            return {
                chain: this.chain,
                isConnected: true,
                gasPrice: gasData.gasPrice,
                gasPriceUsd: gasData.gasPriceUsd,
                latency: this.connectionLatency,
                lastUpdated: new Date(),
            };
        }
        catch (error) {
            this.isConnected = false;
            this.lastError = error;
            this.connectionLatency = Date.now() - startTime;
            logger_1.default.error(`[DEX:${this.chain}] Connection check failed: ${error}`);
            return {
                chain: this.chain,
                isConnected: false,
                latency: this.connectionLatency,
                lastUpdated: new Date(),
            };
        }
    }
    /**
     * Calculate effective APR considering all factors
     */
    async calculateEffectiveAPR(pool, gasCost) {
        // Trading fee APR (from pool fees)
        const tradingFeeAPR = pool.feeAPR;
        // Calculate impermanent loss risk based on pool volatility
        const ilRisk = await this.estimateImpermanentLossRisk(pool);
        // Annualized gas cost impact
        const gasCostAPR = pool.tvl > 0 ? (gasCost / pool.tvl) * 365 : 0;
        // Effective APR after all costs
        const effectiveAPR = Math.max(0, tradingFeeAPR - ilRisk - gasCostAPR);
        return {
            tradingFeeAPR,
            rewardAPR: 0, // Most pools don't have additional rewards
            impermanentLoss: ilRisk,
            gasCostAPR,
            effectiveAPR,
        };
    }
    /**
     * Calculate impermanent loss given price change
     */
    calculateIL(priceRatioStart, priceRatioEnd) {
        // Standard IL formula for 50/50 pools
        const priceRatioChange = priceRatioEnd / priceRatioStart;
        const sqrtRatio = Math.sqrt(priceRatioChange);
        const impermanentLoss = (2 * sqrtRatio) / (1 + priceRatioChange) - 1;
        return {
            currentPriceRatio: priceRatioEnd,
            entryPriceRatio: priceRatioStart,
            impermanentLoss,
            hodlValue: priceRatioEnd,
            lpValue: 1 + impermanentLoss,
        };
    }
    /**
     * Validate pool address
     */
    isValidPoolAddress(address) {
        // EVM address check (0x + 40 hex chars)
        if (this.chain === 'ethereum' || this.chain === 'bsc') {
            return /^0x[a-fA-F0-9]{40}$/.test(address);
        }
        // Solana address check (base58, 32-44 chars)
        if (this.chain === 'solana') {
            return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
        }
        return false;
    }
    /**
     * Get chain identifier
     */
    getChain() {
        return this.chain;
    }
    /**
     * Get DEX identifier
     */
    getDEX() {
        return this.dex;
    }
    /**
     * Check if connected
     */
    getConnectionStatus() {
        return this.isConnected;
    }
    /**
     * Get last error
     */
    getLastError() {
        return this.lastError;
    }
    /**
     * Get connection latency
     */
    getLatency() {
        return this.connectionLatency;
    }
    /**
     * Execute with retry logic
     */
    async executeWithRetry(operation, fn, maxRetries = 3, baseDelay = 1000) {
        let lastError;
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                return await fn();
            }
            catch (error) {
                lastError = error;
                const delay = baseDelay * Math.pow(2, attempt);
                logger_1.default.warn(`[DEX:${this.chain}] ${operation} failed (attempt ${attempt + 1}/${maxRetries}), ` +
                    `retrying in ${delay}ms: ${error}`);
                if (attempt < maxRetries - 1) {
                    await sleep(delay);
                }
            }
        }
        throw new Error(`${operation} failed after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`);
    }
}
exports.BaseDEXClient = BaseDEXClient;
/**
 * Sleep utility
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
/**
 * Export utility functions
 */
exports.DEXUtils = {
    /**
     * Calculate price from sqrtPriceX96 (Uniswap V3 format)
     */
    sqrtPriceX96ToPrice(sqrtPriceX96, token0Decimals, token1Decimals) {
        const sqrtPrice = Number(sqrtPriceX96) / (2 ** 96);
        const price = sqrtPrice * sqrtPrice;
        const decimalAdjustment = 10 ** (token0Decimals - token1Decimals);
        return price * decimalAdjustment;
    },
    /**
     * Convert price to sqrtPriceX96
     */
    priceToSqrtPriceX96(price, token0Decimals, token1Decimals) {
        const decimalAdjustment = 10 ** (token0Decimals - token1Decimals);
        const adjustedPrice = price / decimalAdjustment;
        const sqrtPrice = Math.sqrt(adjustedPrice);
        const sqrtPriceX96 = sqrtPrice * (2 ** 96);
        return BigInt(Math.floor(sqrtPriceX96));
    },
    /**
     * Calculate tick from sqrtPriceX96
     */
    sqrtPriceX96ToTick(sqrtPriceX96) {
        const sqrtPrice = Number(sqrtPriceX96) / (2 ** 96);
        return Math.floor(Math.log(sqrtPrice) / Math.log(Math.sqrt(1.0001)));
    },
    /**
     * Calculate sqrtPriceX96 from tick
     */
    tickToSqrtPriceX96(tick) {
        const sqrtPrice = Math.sqrt(1.0001) ** tick;
        const sqrtPriceX96 = sqrtPrice * (2 ** 96);
        return BigInt(Math.floor(sqrtPriceX96));
    },
    /**
     * Format token amount with decimals
     */
    formatTokenAmount(amount, decimals) {
        return Number(amount) / (10 ** decimals);
    },
    /**
     * Parse token amount to bigint
     */
    parseTokenAmount(amount, decimals) {
        return BigInt(Math.floor(amount * (10 ** decimals)));
    },
    /**
     * Calculate minimum amount out with slippage
     */
    calculateMinAmountOut(amountOut, slippageTolerance) {
        const minAmount = amountOut * (1 - slippageTolerance);
        return BigInt(Math.floor(minAmount * (10 ** 18))); // Assuming 18 decimals
    },
    /**
     * Estimate gas cost in USD
     */
    estimateGasCostUsd(gasUsed, gasPrice, nativeTokenPrice) {
        const gasCostNative = (gasUsed * gasPrice) / 1e9; // Convert to token units
        return gasCostNative * nativeTokenPrice;
    },
};
//# sourceMappingURL=base-dex-client.js.map