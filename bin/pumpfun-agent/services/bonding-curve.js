"use strict";
// Bonding Curve Service - pump.fun bonding curve buy/sell execution
// Supports both paper and live modes
// Uses Helius RPC for on-chain transactions
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.bondingCurveService = exports.DEFAULT_TP_LEVELS = void 0;
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
const bs58_1 = __importDefault(require("bs58"));
const logger_1 = __importDefault(require("../../shared/logger"));
const config_1 = __importDefault(require("../../shared/config"));
// pump.fun Program ID
const PUMPFUN_PROGRAM_ID = new web3_js_1.PublicKey('6EF8rrecthR5Dkjon8nkdqXHDr3EbmLB4TqRASFjZxb');
// pump.fun Global state (holds fee recipient)
const PUMPFUN_GLOBAL = new web3_js_1.PublicKey('4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf');
// Associated token program
const ASSOCIATED_TOKEN_PROGRAM_ID = new web3_js_1.PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
// System program
const SYSTEM_PROGRAM_ID = web3_js_1.SystemProgram.programId;
// Rent sysvar
const RENT_SYSVAR = new web3_js_1.PublicKey('SysvarRent111111111111111111111111111111111');
// Event authority
const PUMPFUN_EVENT_AUTHORITY = new web3_js_1.PublicKey('Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1');
/**
 * Bonding Curve execution service
 */
class BondingCurveService {
    connection = null;
    wallet = null;
    paperMode = true;
    paperPositions = new Map();
    paperSolBalance = 10; // Start with 10 SOL in paper mode
    initialized = false;
    constructor() {
        this.paperMode = process.env.PUMPFUN_PAPER_MODE !== 'false'; // default paper
    }
    async initialize() {
        if (this.initialized)
            return;
        const config = config_1.default.get();
        const rpcUrl = process.env.HELIUS_RPC_URL || config.solana?.rpcUrl || 'https://api.mainnet-beta.solana.com';
        logger_1.default.info(`[BondingCurve] Initializing (mode: ${this.paperMode ? 'PAPER' : 'LIVE'})`);
        logger_1.default.info(`[BondingCurve] RPC: ${rpcUrl.replace(/\/\/[^:]+@/, '//***@')}`);
        if (!this.paperMode) {
            // Live mode: load wallet from private key
            const privateKey = process.env.SOLANA_PRIVATE_KEY;
            if (!privateKey) {
                logger_1.default.error('[BondingCurve] SOLANA_PRIVATE_KEY not set, falling back to paper mode');
                this.paperMode = true;
            }
            else {
                try {
                    // Try bs58 encoded first
                    if (privateKey.length < 100) {
                        const keypairBytes = bs58_1.default.decode(privateKey);
                        this.wallet = web3_js_1.Keypair.fromSecretKey(keypairBytes);
                    }
                    else {
                        // JSON array format
                        const keypairBytes = new Uint8Array(JSON.parse(privateKey));
                        this.wallet = web3_js_1.Keypair.fromSecretKey(keypairBytes);
                    }
                    logger_1.default.info(`[BondingCurve] Wallet loaded: ${this.wallet.publicKey.toString()}`);
                }
                catch (err) {
                    logger_1.default.error('[BondingCurve] Failed to load wallet:', err);
                    this.paperMode = true;
                }
            }
        }
        // Connect to Solana
        this.connection = new web3_js_1.Connection(rpcUrl, {
            commitment: 'confirmed',
            wsEndpoint: process.env.HELIUS_WS_URL || process.env.SOLANA_WS_URL,
        });
        try {
            const version = await this.connection.getVersion();
            logger_1.default.info(`[BondingCurve] Connected to Solana: ${version['solana-core']}`);
        }
        catch (err) {
            logger_1.default.warn(`[BondingCurve] RPC connection failed (paper mode still works): ${err}`);
        }
        this.initialized = true;
    }
    isPaperMode() {
        return this.paperMode;
    }
    isInitialized() {
        return this.initialized;
    }
    /**
     * Derive the bonding curve PDA for a token
     */
    async getBondingCurvePDA(tokenMint) {
        const [pda] = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('bonding-curve'), tokenMint.toBuffer()], PUMPFUN_PROGRAM_ID);
        return pda;
    }
    /**
     * Derive the associated bonding curve token account
     */
    async getAssociatedBondingCurve(tokenMint) {
        const bondingCurve = await this.getBondingCurvePDA(tokenMint);
        return (0, spl_token_1.getAssociatedTokenAddress)(tokenMint, bondingCurve, true, spl_token_1.TOKEN_PROGRAM_ID);
    }
    /**
     * Read bonding curve state from on-chain
     */
    async readBondingCurveState(tokenMint) {
        if (!this.connection) {
            logger_1.default.warn('[BondingCurve] No connection, cannot read bonding curve');
            return null;
        }
        try {
            const mint = new web3_js_1.PublicKey(tokenMint);
            const bondingCurve = await this.getBondingCurvePDA(mint);
            const data = await this.connection.getAccountInfo(bondingCurve);
            if (!data || !data.data) {
                return null;
            }
            // Bonding curve account layout:
            // 0-8: discriminator (u64)
            // 8-16: virtualTokenReserves (u64)
            // 16-24: virtualSolReserves (u64)
            // 24-32: realTokenReserves (u64)
            // 32-40: realSolReserves (u64)
            // 40-48: tokenTotalSupply (u64)
            // 48-49: complete (bool)
            const buf = data.data;
            return {
                virtualTokenReserves: buf.readBigUInt64LE(8),
                virtualSolReserves: buf.readBigUInt64LE(16),
                realTokenReserves: buf.readBigUInt64LE(24),
                realSolReserves: buf.readBigUInt64LE(32),
                tokenTotalSupply: buf.readBigUInt64LE(40),
                complete: buf[48] === 1,
            };
        }
        catch (err) {
            logger_1.default.debug(`[BondingCurve] Failed to read bonding curve for ${tokenMint}: ${err}`);
            return null;
        }
    }
    /**
     * Calculate buy quote (constant product AMM)
     */
    getBuyQuote(state, solAmount) {
        const fee = solAmount * 0.01; // 1% fee
        const solForCurve = solAmount - fee;
        // Constant product: k = virtualTokenReserves * virtualSolReserves
        // newSolReserves = virtualSolReserves + solForCurve
        // newTokenReserves = k / newSolReserves
        // tokensOut = virtualTokenReserves - newTokenReserves
        const k = Number(state.virtualTokenReserves) * Number(state.virtualSolReserves);
        const newSolReserves = Number(state.virtualSolReserves) + solForCurve * web3_js_1.LAMPORTS_PER_SOL;
        const newTokenReserves = k / newSolReserves;
        const tokensOut = (Number(state.virtualTokenReserves) - newTokenReserves) / 1e6; // pump.fun tokens are 6 decimals
        if (tokensOut <= 0)
            return null;
        // Market cap approximation (1B tokens = full supply)
        const totalTokens = Number(state.tokenTotalSupply) / 1e6;
        const pricePerToken = solForCurve / tokensOut;
        const marketCapSol = pricePerToken * totalTokens;
        // Bonding curve progress: how much SOL is in vs typical graduation (~85-120 SOL)
        const graduationTarget = 85 * web3_js_1.LAMPORTS_PER_SOL; // approximate
        const progress = Math.min(1, Number(state.realSolReserves) / graduationTarget);
        return {
            solAmount,
            tokenAmount: tokensOut,
            pricePerToken,
            marketCapSol,
            bondingCurveProgress: progress,
        };
    }
    /**
     * Calculate sell quote
     */
    getSellQuote(state, tokenAmount) {
        const tokenAmountLamports = tokenAmount * 1e6;
        const k = Number(state.virtualTokenReserves) * Number(state.virtualSolReserves);
        const newTokenReserves = Number(state.virtualTokenReserves) + tokenAmountLamports;
        const newSolReserves = k / newTokenReserves;
        const solOut = (Number(state.virtualSolReserves) - newSolReserves) / web3_js_1.LAMPORTS_PER_SOL;
        if (solOut <= 0)
            return null;
        const fee = solOut * 0.01;
        return {
            tokenAmount,
            solAmount: solOut - fee,
            pricePerToken: solOut / tokenAmount,
        };
    }
    /**
     * Execute a buy on the bonding curve
     */
    async buy(tokenMint, tokenSymbol, solAmount, tpLevels = DEFAULT_TP_LEVELS) {
        const timestamp = new Date();
        if (this.paperMode) {
            return this.paperBuy(tokenMint, tokenSymbol, solAmount, tpLevels, timestamp);
        }
        // Live buy not implemented yet (requires transaction building)
        // Will be added when going live
        logger_1.default.warn('[BondingCurve] Live buy not yet implemented, using paper fallback');
        return this.paperBuy(tokenMint, tokenSymbol, solAmount, tpLevels, timestamp);
    }
    /**
     * Paper mode buy
     */
    paperBuy(tokenMint, tokenSymbol, solAmount, tpLevels, timestamp) {
        if (this.paperSolBalance < solAmount) {
            return {
                success: false,
                tokenAddress: tokenMint,
                solSpent: 0,
                tokensReceived: 0,
                error: `Insufficient paper SOL balance (${this.paperSolBalance.toFixed(2)} < ${solAmount.toFixed(2)})`,
                paperMode: true,
                timestamp,
            };
        }
        // Simulate bonding curve pricing: start with ~1B supply, 30 SOL virtual reserves
        const virtualTokenReserves = 1_000_000_000 * 1e6;
        const virtualSolReserves = 30 * web3_js_1.LAMPORTS_PER_SOL;
        const mockState = {
            virtualTokenReserves: BigInt(virtualTokenReserves),
            virtualSolReserves: BigInt(virtualSolReserves),
            realTokenReserves: BigInt(0),
            realSolReserves: BigInt(0),
            tokenTotalSupply: BigInt(1_000_000_000_000_000), // 1B * 1e6
            complete: false,
        };
        const quote = this.getBuyQuote(mockState, solAmount);
        if (!quote) {
            return {
                success: false,
                tokenAddress: tokenMint,
                solSpent: 0,
                tokensReceived: 0,
                error: 'Quote returned zero tokens',
                paperMode: true,
                timestamp,
            };
        }
        this.paperSolBalance -= solAmount;
        this.paperPositions.set(tokenMint, {
            tokenMint,
            tokenSymbol,
            tokensOwned: quote.tokenAmount,
            solSpent: solAmount,
            entryPrice: quote.pricePerToken,
            buyTimestamp: timestamp,
            tpLevels: tpLevels.map(tp => ({ ...tp, triggered: false })),
            partialSells: [],
        });
        logger_1.default.info(`[PAPER BUY] ${tokenSymbol} | ${solAmount.toFixed(3)} SOL -> ${quote.tokenAmount.toFixed(0)} tokens @ ${quote.pricePerToken.toFixed(12)} SOL/token | MC: ${quote.marketCapSol.toFixed(2)} SOL`);
        return {
            success: true,
            tokenAddress: tokenMint,
            solSpent: solAmount,
            tokensReceived: quote.tokenAmount,
            paperMode: true,
            timestamp,
        };
    }
    /**
     * Sell tokens (or partial) from a position
     * Checks TP levels and sells the appropriate portion
     */
    async checkAndSell(tokenMint, currentPriceMultiplier) {
        const position = this.paperPositions.get(tokenMint);
        if (!position)
            return [];
        const results = [];
        for (const tp of position.tpLevels) {
            if (tp.triggered)
                continue;
            if (currentPriceMultiplier < tp.multiplier)
                continue;
            tp.triggered = true;
            const tokensToSell = position.tokensOwned * tp.pctToSell;
            const solToReceive = tokensToSell * currentPriceMultiplier * position.entryPrice;
            position.tokensOwned -= tokensToSell;
            position.partialSells.push({
                tokensSold: tokensToSell,
                solReceived: solToReceive,
                tpLevel: tp.name,
                timestamp: new Date(),
            });
            if (this.paperMode) {
                this.paperSolBalance += solToReceive;
            }
            logger_1.default.info(`[PAPER SELL] ${position.tokenSymbol} TP ${tp.name} | ${tokensToSell.toFixed(0)} tokens -> ${solToReceive.toFixed(4)} SOL (${(tp.multiplier * 100).toFixed(0)}x)`);
            results.push({
                success: true,
                tokenAddress: tokenMint,
                tokensSold: tokensToSell,
                solReceived: solToReceive,
                paperMode: true,
                timestamp: new Date(),
            });
        }
        // Clean up fully exited positions
        if (position.tokensOwned < 1) {
            this.paperPositions.delete(tokenMint);
            const totalPnl = position.partialSells.reduce((s, p) => s + p.solReceived, 0) - position.solSpent;
            logger_1.default.info(`[POSITION CLOSED] ${position.tokenSymbol} | PnL: ${totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(4)} SOL | ${position.partialSells.length} partial sells`);
        }
        return results;
    }
    /**
     * Force sell entire position (emergency exit / stop loss)
     */
    async emergencySell(tokenMint, currentPriceMultiplier) {
        const position = this.paperPositions.get(tokenMint);
        if (!position || position.tokensOwned < 1)
            return null;
        const solToReceive = position.tokensOwned * currentPriceMultiplier * position.entryPrice;
        this.paperPositions.delete(tokenMint);
        if (this.paperMode) {
            this.paperSolBalance += solToReceive;
        }
        logger_1.default.info(`[EMERGENCY SELL] ${position.tokenSymbol} | ${position.tokensOwned.toFixed(0)} tokens -> ${solToReceive.toFixed(4)} SOL`);
        return {
            success: true,
            tokenAddress: tokenMint,
            tokensSold: position.tokensOwned,
            solReceived: solToReceive,
            paperMode: true,
            timestamp: new Date(),
        };
    }
    /**
     * Get all open positions
     */
    getPositions() {
        return Array.from(this.paperPositions.values());
    }
    /**
     * Get portfolio summary
     */
    getPortfolioSummary() {
        const positions = this.getPositions();
        const totalInvested = positions.reduce((s, p) => s + p.solSpent, 0);
        const totalRealized = positions.reduce((s, p) => s + p.partialSells.reduce((ss, ps) => ss + ps.solReceived, 0), 0);
        return {
            mode: this.paperMode ? 'PAPER' : 'LIVE',
            solBalance: this.paperSolBalance,
            openPositions: positions.length,
            totalInvested,
            totalRealized,
            unrealizedPnl: 0, // Would need current prices to calculate
        };
    }
}
// Default TP levels: aggressive, get initial out ASAP
const DEFAULT_TP_LEVELS = [
    { name: 'INITIAL', multiplier: 1.5, pctToSell: 0.5, triggered: false }, // Sell 50% at 1.5x (get initial out)
    { name: 'SAFE', multiplier: 3.0, pctToSell: 0.5, triggered: false }, // Sell 50% remaining at 3x
    { name: 'MOON', multiplier: 10.0, pctToSell: 1.0, triggered: false }, // Sell all remaining at 10x
];
exports.DEFAULT_TP_LEVELS = DEFAULT_TP_LEVELS;
exports.bondingCurveService = new BondingCurveService();
exports.default = exports.bondingCurveService;
//# sourceMappingURL=bonding-curve.js.map