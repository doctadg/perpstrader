"use strict";
// Bonding Curve Service - pump.fun bonding curve buy/sell execution
// Supports both paper and live modes
// Uses Helius RPC for on-chain transactions
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.bondingCurveService = exports.DEFAULT_TP_LEVELS = exports.TIME_EXIT_MINUTES = void 0;
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
const bs58_1 = __importDefault(require("bs58"));
const logger_1 = __importDefault(require("../../shared/logger"));
const config_1 = __importDefault(require("../../shared/config"));
// pump.fun Program ID
const PUMPFUN_PROGRAM_ID = new web3_js_1.PublicKey('6EF8rrecthR5Dkjon8nkdqXHDr3EbmLB4TqRASFjZxb');
// pump.fun Global state (holds fee recipient)
const PUMPFUN_GLOBAL = new web3_js_1.PublicKey('4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf');
// pump.fun Fee recipient (derived from global state, but hardcoded for speed)
const PUMPFUN_FEE_RECIPIENT = new web3_js_1.PublicKey('CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbCfKUrXB2v6Mc');
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
// Realistic cost simulation for paper trading
const SLIPPAGE_BUY_MIN = 0.03; // 3% minimum buy slippage (MEV bots)
const SLIPPAGE_BUY_MAX = 0.12; // 12% worst case buy slippage
const SLIPPAGE_SELL_MIN = 0.05; // 5% minimum sell slippage
const SLIPPAGE_SELL_MAX = 0.25; // 25% worst case sell slippage (illiquid exits)
const PRIORITY_FEE_SOL = 0.0005; // Priority fee per tx (~0.0005 SOL)
const STOP_LOSS_MULTIPLIER = 0.6; // Exit at 40% down (was 0.4 = 60% down)
exports.TIME_EXIT_MINUTES = 45; // Kill stale positions after 45 min flat
const MAX_CONCURRENT_POSITIONS = parseInt(process.env.PUMPFUN_MAX_POSITIONS || '5');
const DAILY_LOSS_LIMIT_SOL = parseFloat(process.env.PUMPFUN_DAILY_LOSS_LIMIT || '2.0'); // Kill switch
// ── Live Trading Constants ──
const COMMITMENT_LEVEL = 'confirmed'; // same as paper mode uses
const TX_CONFIRM_TIMEOUT_S = 15; // seconds to wait for tx confirmation
const COMPUTE_UNIT_LIMIT = 200_000; // compute units for buy/sell
const COMPUTE_UNIT_PRICE_MICROLAMPORTS = 100_000; // priority fee ~0.0001 SOL per tx
const JITO_TIP_LAMPORTS = 100_000; // Jito tip amount (0.0001 SOL) for MEV protection
const JITO_TIP_ACCOUNTS = [
    '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5',
    'HFqU5x63VTqvQss8hp11i4bVqkfRtQ7NmXwkiNPLNiVZ',
    'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY',
    'ADaUMid9yfUC67HyGY2avCA952rrXy1RLKmH6iW6eNsL',
    'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh',
    'ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt',
    'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL',
    '3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT',
];
// ── Anchor Instruction Discriminators ──
const BUY_DISCRIMINATOR = Buffer.from([102, 6, 61, 18, 1, 218, 235, 234]);
const SELL_DISCRIMINATOR = Buffer.from([51, 230, 133, 164, 1, 127, 131, 173]);
function simulateSlippage(min, max) {
    // More slippage = more common (exponential distribution weighted toward min)
    const raw = Math.random();
    return min + (max - min) * (raw * raw); // Quadratic bias toward lower end
}
class BondingCurveService {
    connection = null;
    wallet = null;
    paperMode = true;
    paperPositions = new Map();
    paperSolBalance = 10; // Start with 10 SOL in paper mode
    initialized = false;
    entryScores = new Map();
    maxMultipliers = new Map(); // track max multiplier per position
    dailyPnl = 0; // Track daily P&L for kill switch
    lastDailyReset = Date.now();
    killSwitchTriggered = false;
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
    isKillSwitchActive() {
        this.resetDailyIfNeeded();
        return this.killSwitchTriggered;
    }
    getOpenPositionCount() {
        return this.paperPositions.size;
    }
    getDailyPnl() {
        this.resetDailyIfNeeded();
        return this.dailyPnl;
    }
    resetDailyIfNeeded() {
        const now = Date.now();
        if (now - this.lastDailyReset > 24 * 60 * 60 * 1000) {
            this.dailyPnl = 0;
            this.killSwitchTriggered = false;
            this.lastDailyReset = now;
            logger_1.default.info('[BondingCurve] Daily P&L reset. Kill switch deactivated.');
        }
    }
    recordDailyPnl(amount) {
        this.resetDailyIfNeeded();
        this.dailyPnl += amount;
        if (this.dailyPnl <= -DAILY_LOSS_LIMIT_SOL && !this.killSwitchTriggered) {
            this.killSwitchTriggered = true;
            logger_1.default.error(`[BondingCurve] DAILY LOSS LIMIT HIT: ${this.dailyPnl.toFixed(4)} SOL <= -${DAILY_LOSS_LIMIT_SOL} SOL. Kill switch ON.`);
            // Emergency close all open positions
            this.emergencyCloseAll('DAILY_LOSS_LIMIT');
        }
    }
    /**
     * Lazy-import pumpfunStore (may not be available if module loaded standalone)
     */
    async getStore() {
        try {
            const { default: store } = await Promise.resolve().then(() => __importStar(require('../../data/pumpfun-store')));
            return store;
        }
        catch {
            return null;
        }
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
    async buy(tokenMint, tokenSymbol, solAmount, tpLevels = DEFAULT_TP_LEVELS, entryScore) {
        const timestamp = new Date();
        // Kill switch check
        if (this.isKillSwitchActive()) {
            return {
                success: false,
                tokenAddress: tokenMint,
                solSpent: 0,
                tokensReceived: 0,
                error: 'Daily loss limit reached, buy blocked',
                paperMode: this.paperMode,
                timestamp,
            };
        }
        // Max concurrent position check
        if (this.paperPositions.size >= MAX_CONCURRENT_POSITIONS) {
            return {
                success: false,
                tokenAddress: tokenMint,
                solSpent: 0,
                tokensReceived: 0,
                error: `Max positions reached (${MAX_CONCURRENT_POSITIONS}), buy blocked`,
                paperMode: this.paperMode,
                timestamp,
            };
        }
        if (this.paperMode) {
            return this.paperBuy(tokenMint, tokenSymbol, solAmount, tpLevels, timestamp, entryScore);
        }
        // Live buy
        return this.liveBuy(tokenMint, tokenSymbol, solAmount, tpLevels, timestamp, entryScore);
    }
    /**
     * Paper mode buy
     */
    paperBuy(tokenMint, tokenSymbol, solAmount, tpLevels, timestamp, entryScore) {
        // Simulate realistic buy slippage
        const slippage = simulateSlippage(SLIPPAGE_BUY_MIN, SLIPPAGE_BUY_MAX);
        const effectiveSol = solAmount * (1 - slippage);
        const txCost = PRIORITY_FEE_SOL;
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
        const quote = this.getBuyQuote(mockState, effectiveSol);
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
        // Prevent re-entry: skip if already holding this token
        if (this.paperPositions.has(tokenMint)) {
            logger_1.default.warn(`[DUPLICATE BUY] Skipping re-entry on ${tokenSymbol} (${tokenMint.slice(0, 8)}) — already holding position`);
            return {
                success: false,
                tokenAddress: tokenMint,
                solSpent: 0,
                tokensReceived: 0,
                error: 'already_holding',
                paperMode: true,
                timestamp,
            };
        }
        this.paperSolBalance -= (solAmount + txCost);
        this.paperPositions.set(tokenMint, {
            tokenMint,
            tokenSymbol,
            tokensOwned: quote.tokenAmount,
            solSpent: solAmount, // Track full amount for P&L calculation (slippage is "real cost")
            entryPrice: quote.pricePerToken,
            buyTimestamp: timestamp,
            tpLevels: tpLevels.map(tp => ({ ...tp, triggered: false })),
            partialSells: [],
        });
        // Track entry score
        if (entryScore !== undefined) {
            this.entryScores.set(tokenMint, entryScore);
        }
        this.maxMultipliers.set(tokenMint, 1.0);
        // Persist to DB (additive, non-blocking)
        this.persistBuyToDb(tokenMint, tokenSymbol, solAmount, quote, tpLevels, timestamp, entryScore, slippage, txCost).catch(() => { });
        logger_1.default.info(`[PAPER BUY] ${tokenSymbol} | ${solAmount.toFixed(3)} SOL -> ${quote.tokenAmount.toFixed(0)} tokens @ ${quote.pricePerToken.toFixed(12)} SOL/token | MC: ${quote.marketCapSol.toFixed(2)} SOL | SLIPPAGE: ${(slippage * 100).toFixed(1)}% | FEE: ${txCost.toFixed(4)} SOL`);
        return {
            success: true,
            tokenAddress: tokenMint,
            solSpent: solAmount,
            tokensReceived: quote.tokenAmount,
            paperMode: true,
            timestamp,
        };
    }
    // ==========================================
    // LIVE TRADING — Real On-Chain Execution
    // ==========================================
    /**
     * Live buy: execute a real pump.fun bonding curve buy transaction.
     * Builds the transaction with compute budget, Jito tip, and pump.fun buy instruction.
     */
    async liveBuy(tokenMint, tokenSymbol, solAmount, tpLevels, timestamp, entryScore) {
        if (!this.connection || !this.wallet) {
            logger_1.default.error('[LIVE] No connection or wallet, falling back to paper');
            return this.paperBuy(tokenMint, tokenSymbol, solAmount, tpLevels, timestamp, entryScore);
        }
        const mint = new web3_js_1.PublicKey(tokenMint);
        // ── 1. Read real bonding curve state ──
        const state = await this.readBondingCurveState(tokenMint);
        if (!state) {
            logger_1.default.warn(`[LIVE] Cannot read bonding curve for ${tokenSymbol}, falling back to paper`);
            return this.paperBuy(tokenMint, tokenSymbol, solAmount, tpLevels, timestamp, entryScore);
        }
        if (state.complete) {
            return { success: false, tokenAddress: tokenMint, solSpent: 0, tokensReceived: 0, error: 'Bonding curve complete', paperMode: false, timestamp };
        }
        // ── 2. Calculate quote from real state ──
        const quote = this.getBuyQuote(state, solAmount);
        if (!quote || quote.tokenAmount <= 0) {
            return { success: false, tokenAddress: tokenMint, solSpent: 0, tokensReceived: 0, error: 'Quote returned zero tokens', paperMode: false, timestamp };
        }
        // ── 3. Derive PDAs ──
        const bondingCurve = await this.getBondingCurvePDA(mint);
        const associatedBondingCurve = await this.getAssociatedBondingCurve(mint);
        const buyerAta = (0, spl_token_1.getAssociatedTokenAddressSync)(mint, this.wallet.publicKey);
        const buyerPubkey = this.wallet.publicKey;
        // ── 4. Build transaction instructions ──
        const instructions = [];
        // Compute budget
        instructions.push(web3_js_1.ComputeBudgetProgram.setComputeUnitLimit({ units: COMPUTE_UNIT_LIMIT }), web3_js_1.ComputeBudgetProgram.setComputeUnitPrice({ microLamports: COMPUTE_UNIT_PRICE_MICROLAMPORTS }));
        // Create ATA if it doesn't exist
        try {
            await (0, spl_token_1.getAccount)(this.connection, buyerAta, 'confirmed');
            logger_1.default.debug(`[LIVE] ATA already exists for ${tokenSymbol}`);
        }
        catch {
            logger_1.default.info(`[LIVE] Creating ATA for ${tokenSymbol}`);
            instructions.push((0, spl_token_1.createAssociatedTokenAccountInstruction)(buyerPubkey, // payer
            buyerAta, // ata
            buyerPubkey, // owner
            mint));
        }
        // ── 5. Build pump.fun buy instruction ──
        // Anchor discriminator + amount (u64) + maxSolCost (u64) with 15% slippage buffer
        const maxSolCost = BigInt(Math.floor(solAmount * 1.15 * web3_js_1.LAMPORTS_PER_SOL));
        const amount = BigInt(Math.floor(solAmount * web3_js_1.LAMPORTS_PER_SOL));
        const buyData = Buffer.alloc(8 + 8 + 8);
        BUY_DISCRIMINATOR.copy(buyData, 0);
        buyData.writeBigUInt64LE(amount, 8);
        buyData.writeBigUInt64LE(maxSolCost, 16);
        const buyIx = {
            programId: PUMPFUN_PROGRAM_ID,
            keys: [
                { pubkey: buyerPubkey, isSigner: true, isWritable: true }, // global
                { pubkey: PUMPFUN_FEE_RECIPIENT, isSigner: false, isWritable: true }, // fee_recipient
                { pubkey: mint, isSigner: false, isWritable: false }, // mint
                { pubkey: bondingCurve, isSigner: false, isWritable: true }, // bonding_curve
                { pubkey: associatedBondingCurve, isSigner: false, isWritable: true }, // associated_bonding_curve
                { pubkey: buyerAta, isSigner: false, isWritable: true }, // associated_user
                { pubkey: buyerPubkey, isSigner: true, isWritable: true }, // user
                { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false }, // system_program
                { pubkey: spl_token_1.TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // token_program
                { pubkey: RENT_SYSVAR, isSigner: false, isWritable: false }, // rent
                { pubkey: PUMPFUN_EVENT_AUTHORITY, isSigner: false, isWritable: false }, // event_authority
                { pubkey: PUMPFUN_PROGRAM_ID, isSigner: false, isWritable: false }, // program
            ],
            data: buyData,
        };
        instructions.push(buyIx);
        // ── 6. Jito tip (random tip account for MEV protection) ──
        const tipAccount = JITO_TIP_ACCOUNTS[Math.floor(Math.random() * JITO_TIP_ACCOUNTS.length)];
        instructions.push(web3_js_1.SystemProgram.transfer({
            fromPubkey: buyerPubkey,
            toPubkey: new web3_js_1.PublicKey(tipAccount),
            lamports: JITO_TIP_LAMPORTS,
        }));
        // ── 7. Build, sign, and send transaction ──
        try {
            const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash(COMMITMENT_LEVEL);
            const tx = new web3_js_1.Transaction();
            tx.recentBlockhash = blockhash;
            tx.feePayer = buyerPubkey;
            tx.add(...instructions);
            tx.sign(this.wallet);
            const serialized = tx.serialize();
            logger_1.default.info(`[LIVE BUY] ${tokenSymbol} | ${solAmount.toFixed(3)} SOL | tx size: ${serialized.length} bytes | sending...`);
            const txid = await this.connection.sendRawTransaction(serialized, {
                skipPreflight: true,
                maxRetries: 2,
            });
            logger_1.default.info(`[LIVE BUY] ${tokenSymbol} | tx: ${txid} | confirming...`);
            // ── 8. Confirm transaction ──
            const confirmation = await this.connection.confirmTransaction({
                signature: txid,
                blockhash,
                lastValidBlockHeight,
            }, COMMITMENT_LEVEL);
            if (confirmation.value.err) {
                logger_1.default.error(`[LIVE BUY] ${tokenSymbol} FAILED: ${JSON.stringify(confirmation.value.err)}`);
                return {
                    success: false, tokenAddress: tokenMint, solSpent: 0, tokensReceived: 0,
                    error: `Transaction failed: ${JSON.stringify(confirmation.value.err)}`,
                    paperMode: false, timestamp,
                };
            }
            const actualCost = (await this.connection.getTransaction(txid, { commitment: 'confirmed' }))?.meta?.preBalances?.[0]
                ? 0 // We'll compute from balance diff
                : solAmount;
            logger_1.default.info(`[LIVE BUY] CONFIRMED ${tokenSymbol} | tx: ${txid} | ~${quote.tokenAmount.toFixed(0)} tokens`);
            // ── 9. Track position in memory (same as paper) ──
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
            if (entryScore !== undefined) {
                this.entryScores.set(tokenMint, entryScore);
            }
            this.maxMultipliers.set(tokenMint, 1.0);
            // Persist to DB
            const txFee = (COMPUTE_UNIT_PRICE_MICROLAMPORTS * COMPUTE_UNIT_LIMIT + JITO_TIP_LAMPORTS) / web3_js_1.LAMPORTS_PER_SOL;
            this.persistBuyToDb(tokenMint, tokenSymbol, solAmount, quote, tpLevels, timestamp, entryScore, 0, txFee).catch(() => { });
            return {
                success: true,
                tokenAddress: tokenMint,
                solSpent: solAmount,
                tokensReceived: quote.tokenAmount,
                txSignature: txid,
                paperMode: false,
                timestamp,
            };
        }
        catch (err) {
            logger_1.default.error(`[LIVE BUY] ${tokenSymbol} ERROR: ${err?.message || err}`);
            return {
                success: false, tokenAddress: tokenMint, solSpent: 0, tokensReceived: 0,
                error: `Live buy error: ${err?.message || String(err)}`,
                paperMode: false, timestamp,
            };
        }
    }
    /**
     * Live sell: execute a real pump.fun bonding curve sell transaction.
     */
    async liveSellAll(tokenMint, tokenSymbol, position, currentMultiplier, reason) {
        if (!this.connection || !this.wallet)
            return null;
        const mint = new web3_js_1.PublicKey(tokenMint);
        const buyerAta = (0, spl_token_1.getAssociatedTokenAddressSync)(mint, this.wallet.publicKey);
        const buyerPubkey = this.wallet.publicKey;
        // Check token balance in ATA
        let tokenBalance;
        try {
            const account = await (0, spl_token_1.getAccount)(this.connection, buyerAta, 'confirmed');
            tokenBalance = Number(account.amount) / 1e6;
        }
        catch {
            logger_1.default.warn(`[LIVE SELL] No ATA found for ${tokenSymbol}, may already be sold`);
            return null;
        }
        if (tokenBalance < 1) {
            logger_1.default.warn(`[LIVE SELL] ${tokenSymbol} has zero token balance, skipping`);
            return null;
        }
        // Derive PDAs
        const bondingCurve = await this.getBondingCurvePDA(mint);
        const associatedBondingCurve = await this.getAssociatedBondingCurve(mint);
        // Build instructions
        const instructions = [];
        // Compute budget
        instructions.push(web3_js_1.ComputeBudgetProgram.setComputeUnitLimit({ units: COMPUTE_UNIT_LIMIT }), web3_js_1.ComputeBudgetProgram.setComputeUnitPrice({ microLamports: COMPUTE_UNIT_PRICE_MICROLAMPORTS }));
        // ── Build pump.fun sell instruction ──
        // Anchor discriminator + amount (u64)
        const tokenAmountLamports = BigInt(Math.floor(tokenBalance * 1e6));
        const sellData = Buffer.alloc(8 + 8);
        SELL_DISCRIMINATOR.copy(sellData, 0);
        sellData.writeBigUInt64LE(tokenAmountLamports, 8);
        const sellIx = {
            programId: PUMPFUN_PROGRAM_ID,
            keys: [
                { pubkey: buyerPubkey, isSigner: true, isWritable: true }, // global
                { pubkey: PUMPFUN_FEE_RECIPIENT, isSigner: false, isWritable: true }, // fee_recipient
                { pubkey: mint, isSigner: false, isWritable: false }, // mint
                { pubkey: bondingCurve, isSigner: false, isWritable: true }, // bonding_curve
                { pubkey: associatedBondingCurve, isSigner: false, isWritable: true }, // associated_bonding_curve
                { pubkey: buyerAta, isSigner: false, isWritable: true }, // associated_user
                { pubkey: buyerPubkey, isSigner: true, isWritable: true }, // user
                { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false }, // system_program
                { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // associated_token_program
                { pubkey: PUMPFUN_EVENT_AUTHORITY, isSigner: false, isWritable: false }, // event_authority
                { pubkey: PUMPFUN_PROGRAM_ID, isSigner: false, isWritable: false }, // program
            ],
            data: sellData,
        };
        instructions.push(sellIx);
        // Jito tip
        const tipAccount = JITO_TIP_ACCOUNTS[Math.floor(Math.random() * JITO_TIP_ACCOUNTS.length)];
        instructions.push(web3_js_1.SystemProgram.transfer({
            fromPubkey: buyerPubkey,
            toPubkey: new web3_js_1.PublicKey(tipAccount),
            lamports: JITO_TIP_LAMPORTS,
        }));
        // Build, sign, send
        try {
            const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash(COMMITMENT_LEVEL);
            const tx = new web3_js_1.Transaction();
            tx.recentBlockhash = blockhash;
            tx.feePayer = buyerPubkey;
            tx.add(...instructions);
            tx.sign(this.wallet);
            const serialized = tx.serialize();
            logger_1.default.info(`[LIVE SELL] ${tokenSymbol} | ${tokenBalance.toFixed(0)} tokens (${reason}) | sending...`);
            const txid = await this.connection.sendRawTransaction(serialized, {
                skipPreflight: true,
                maxRetries: 2,
            });
            logger_1.default.info(`[LIVE SELL] ${tokenSymbol} | tx: ${txid} | confirming...`);
            const confirmation = await this.connection.confirmTransaction({
                signature: txid,
                blockhash,
                lastValidBlockHeight,
            }, COMMITMENT_LEVEL);
            if (confirmation.value.err) {
                logger_1.default.error(`[LIVE SELL] ${tokenSymbol} FAILED: ${JSON.stringify(confirmation.value.err)}`);
                return null;
            }
            // Calculate actual SOL received from the transaction
            const txDetails = await this.connection.getTransaction(txid, { commitment: 'confirmed' });
            const preBalance = txDetails?.meta?.preBalances?.[0] ?? 0;
            const postBalance = txDetails?.meta?.postBalances?.[0] ?? 0;
            const solReceived = Math.max(0, (postBalance - preBalance)) / web3_js_1.LAMPORTS_PER_SOL;
            logger_1.default.info(`[LIVE SELL] CONFIRMED ${tokenSymbol} | tx: ${txid} | ${solReceived.toFixed(4)} SOL received`);
            // Save values before cleaning up tracking maps
            const entryScore = this.entryScores.get(tokenMint);
            const positionMaxMultiplier = this.maxMultipliers.get(tokenMint) || currentMultiplier;
            // Clean up position tracking
            this.paperPositions.delete(tokenMint);
            this.entryScores.delete(tokenMint);
            this.maxMultipliers.delete(tokenMint);
            // Persist to DB
            const totalPnl = solReceived + position.partialSells.reduce((s, p) => s + p.solReceived, 0) - position.solSpent;
            const exitSol = solReceived + position.partialSells.reduce((s, p) => s + p.solReceived, 0);
            const holdTimeMinutes = (Date.now() - position.buyTimestamp.getTime()) / 60000;
            const pnlPct = position.solSpent > 0 ? ((exitSol - position.solSpent) / position.solSpent) * 100 : 0;
            const tpLevelsHit = position.partialSells.map(p => p.tpLevel);
            // Determine outcome
            let outcome;
            if (pnlPct > 0)
                outcome = 'PROFIT_' + reason;
            else if (position.partialSells.length > 0)
                outcome = 'PROFIT_PARTIAL';
            else if (reason === 'TIME_EXIT' || reason === 'STALE_EXIT')
                outcome = reason;
            else
                outcome = 'LOSS_STOP';
            this.persistSellToDb(tokenMint, tokenSymbol, tokenBalance, solReceived, reason, totalPnl, entryScore, currentMultiplier).catch(() => { });
            this.persistPositionUpdate(tokenMint, position, 'CLOSED', positionMaxMultiplier, currentMultiplier, entryScore).catch(() => { });
            this.persistOutcomeToDb(tokenMint, tokenSymbol, entryScore, position.solSpent, exitSol, totalPnl, pnlPct, positionMaxMultiplier, outcome, holdTimeMinutes, position.partialSells.length, tpLevelsHit).catch(() => { });
            this.recordDailyPnl(totalPnl);
            return {
                success: true,
                tokenAddress: tokenMint,
                tokensSold: tokenBalance,
                solReceived,
                txSignature: txid,
                paperMode: false,
                timestamp: new Date(),
            };
        }
        catch (err) {
            logger_1.default.error(`[LIVE SELL] ${tokenSymbol} ERROR: ${err?.message || err}`);
            return null;
        }
    }
    /**
     * Sell tokens (or partial) from a position
     * Checks TP levels and sells the appropriate portion
     */
    async checkAndSell(tokenMint, currentPriceMultiplier) {
        const position = this.paperPositions.get(tokenMint);
        if (!position)
            return [];
        // ── LIVE MODE: sell all remaining tokens when any TP triggers ──
        // pump.fun bonding curve sell-all is simpler and safer than partial sells
        if (!this.paperMode && this.wallet && this.connection) {
            for (const tp of position.tpLevels) {
                if (tp.triggered)
                    continue;
                if (currentPriceMultiplier < tp.multiplier)
                    continue;
                tp.triggered = true;
                const result = await this.liveSellAll(tokenMint, position.tokenSymbol, position, currentPriceMultiplier, `TP_${tp.name}`);
                if (result)
                    return [result];
                // If live sell failed, fall through to paper to keep tracking
                logger_1.default.warn(`[LIVE] TP sell failed for ${position.tokenSymbol}, falling to paper tracking`);
                return [];
            }
            return [];
        }
        // ── PAPER MODE: simulated partial TP sells ──
        const results = [];
        const entryScore = this.entryScores.get(tokenMint);
        const positionMaxMultiplier = this.maxMultipliers.get(tokenMint) || 1.0;
        for (const tp of position.tpLevels) {
            if (tp.triggered)
                continue;
            if (currentPriceMultiplier < tp.multiplier)
                continue;
            tp.triggered = true;
            const tokensToSell = position.tokensOwned * tp.pctToSell;
            const grossSol = tokensToSell * currentPriceMultiplier * position.entryPrice;
            // Apply sell slippage + priority fee
            const sellSlippage = simulateSlippage(SLIPPAGE_SELL_MIN, SLIPPAGE_SELL_MAX);
            const solToReceive = grossSol * (1 - sellSlippage) - PRIORITY_FEE_SOL;
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
            // Persist sell trade to DB (additive, non-blocking)
            const pnl = solToReceive - (position.solSpent * tp.pctToSell);
            this.persistSellToDb(tokenMint, position.tokenSymbol, tokensToSell, solToReceive, tp.name, pnl, entryScore, currentPriceMultiplier).catch(() => { });
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
            // Record daily P&L
            this.recordDailyPnl(totalPnl);
            // Persist position update and outcome to DB (additive, non-blocking)
            const holdTimeMinutes = (Date.now() - position.buyTimestamp.getTime()) / 60000;
            const exitSol = position.partialSells.reduce((s, p) => s + p.solReceived, 0);
            const tpLevelsHit = position.partialSells.map(p => p.tpLevel);
            const pnlPct = position.solSpent > 0 ? ((exitSol - position.solSpent) / position.solSpent) * 100 : 0;
            this.persistPositionUpdate(tokenMint, position, 'CLOSED', positionMaxMultiplier, 0, entryScore).catch(() => { });
            this.persistOutcomeToDb(tokenMint, position.tokenSymbol, entryScore, position.solSpent, exitSol, totalPnl, pnlPct, positionMaxMultiplier, 'PROFIT_TP', holdTimeMinutes, position.partialSells.length, tpLevelsHit).catch(() => { });
            // Clean up tracking maps
            this.entryScores.delete(tokenMint);
            this.maxMultipliers.delete(tokenMint);
        }
        return results;
    }
    /**
     * Force sell entire position (emergency exit / stop loss / time-based exit)
     * @param reason - 'STOP_LOSS' | 'TIME_EXIT' | 'STALE_EXIT' | 'TAKE_PROFIT'
     */
    async emergencySell(tokenMint, currentPriceMultiplier, reason = 'STOP_LOSS') {
        const position = this.paperPositions.get(tokenMint);
        if (!position || position.tokensOwned < 1)
            return null;
        // ── LIVE MODE: execute real on-chain sell ──
        if (!this.paperMode && this.wallet && this.connection) {
            return this.liveSellAll(tokenMint, position.tokenSymbol, position, currentPriceMultiplier, reason);
        }
        // ── PAPER MODE: simulate sell ──
        const grossSol = position.tokensOwned * currentPriceMultiplier * position.entryPrice;
        const sellSlippage = simulateSlippage(SLIPPAGE_SELL_MIN, SLIPPAGE_SELL_MAX);
        const solToReceive = Math.max(0, grossSol * (1 - sellSlippage) - PRIORITY_FEE_SOL);
        this.paperPositions.delete(tokenMint);
        if (this.paperMode) {
            this.paperSolBalance += solToReceive;
        }
        logger_1.default.info(`[EMERGENCY SELL] ${position.tokenSymbol} | ${position.tokensOwned.toFixed(0)} tokens -> ${solToReceive.toFixed(4)} SOL | SLIPPAGE: ${(sellSlippage * 100).toFixed(1)}% | Reason: ${reason}`);
        // Persist emergency sell to DB (additive, non-blocking)
        const entryScore = this.entryScores.get(tokenMint);
        const positionMaxMultiplier = this.maxMultipliers.get(tokenMint) || 1.0;
        const totalPnl = solToReceive + position.partialSells.reduce((s, p) => s + p.solReceived, 0) - position.solSpent;
        const exitSol = solToReceive + position.partialSells.reduce((s, p) => s + p.solReceived, 0);
        const holdTimeMinutes = (Date.now() - position.buyTimestamp.getTime()) / 60000;
        const pnlPct = position.solSpent > 0 ? ((exitSol - position.solSpent) / position.solSpent) * 100 : 0;
        const tpLevelsHit = position.partialSells.map(p => p.tpLevel);
        // Determine outcome based on reason and PnL
        let outcome;
        let sellType;
        const hasHitTpLevels = tpLevelsHit.length > 0;
        if (reason === 'TAKE_PROFIT') {
            outcome = 'PROFIT_TP';
            sellType = 'TAKE_PROFIT';
        }
        else if (pnlPct > 0) {
            // Positive PnL = profit, regardless of exit reason
            outcome = 'PROFIT_' + reason;
            sellType = reason;
        }
        else if (hasHitTpLevels) {
            // Hit TP levels but final exit at loss = still counted as profit cycle
            outcome = 'PROFIT_PARTIAL';
            sellType = reason;
        }
        else if (reason === 'TIME_EXIT' || reason === 'STALE_EXIT') {
            outcome = reason;
            sellType = reason;
        }
        else {
            outcome = 'LOSS_STOP';
            sellType = 'STOP_LOSS';
        }
        this.persistSellToDb(tokenMint, position.tokenSymbol, position.tokensOwned, solToReceive, sellType, totalPnl, entryScore, currentPriceMultiplier).catch(() => { });
        this.persistPositionUpdate(tokenMint, position, 'CLOSED', positionMaxMultiplier, currentPriceMultiplier, entryScore).catch(() => { });
        this.persistOutcomeToDb(tokenMint, position.tokenSymbol, entryScore, position.solSpent, exitSol, totalPnl, pnlPct, positionMaxMultiplier, outcome, holdTimeMinutes, position.partialSells.length, tpLevelsHit).catch(() => { });
        // Record daily P&L for emergency exits too
        this.recordDailyPnl(totalPnl);
        // Clean up tracking maps (emergency sell)
        this.entryScores.delete(tokenMint);
        this.maxMultipliers.delete(tokenMint);
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
            unrealizedPnl: 0,
        };
    }
    // ==========================================
    // Real On-Chain Price Sampling
    // ==========================================
    /**
     * Sample real on-chain bonding curve prices for all open positions.
     * Updates maxMultipliers, persists price samples to DB, and returns
     * a map of tokenMint -> currentMultiplier for use by TP/SL logic.
     */
    async sampleAndUpdatePositions() {
        const multipliers = new Map();
        const store = await this.getStore();
        for (const [tokenMint, position] of this.paperPositions) {
            try {
                // ── PAPER MODE WITH REAL ON-CHAIN PRICES ──
                // Instead of biased random walk, sample real on-chain bonding curve data.
                // This makes paper results reflect actual market conditions.
                const state = await this.readBondingCurveState(tokenMint);
                if (state) {
                    // Calculate current price from real bonding curve state
                    const k = Number(state.virtualTokenReserves) * Number(state.virtualSolReserves);
                    const virtualSol = Number(state.virtualSolReserves) / web3_js_1.LAMPORTS_PER_SOL;
                    const totalTokens = Number(state.tokenTotalSupply) / 1e6;
                    const currentPricePerToken = virtualSol / (Number(state.virtualTokenReserves) / 1e6);
                    const currentMultiplier = position.entryPrice > 0 ? currentPricePerToken / position.entryPrice : 1.0;
                    // Track max multiplier
                    const prevMax = this.maxMultipliers.get(tokenMint) || 1.0;
                    const newMax = Math.max(prevMax, currentMultiplier);
                    this.maxMultipliers.set(tokenMint, newMax);
                    multipliers.set(tokenMint, currentMultiplier);
                    // Calculate market cap
                    const marketCapSol = currentPricePerToken * totalTokens;
                    // Persist price sample
                    if (store) {
                        store.recordPriceSample(tokenMint, currentMultiplier, marketCapSol, state.complete).catch(() => { });
                    }
                    // Update position in DB
                    if (store) {
                        store.upsertPosition({
                            mintAddress: tokenMint,
                            tokenSymbol: position.tokenSymbol,
                            tokensOwned: position.tokensOwned,
                            solSpent: position.solSpent,
                            entryPrice: position.entryPrice,
                            entryScore: this.entryScores.get(tokenMint),
                            buyTimestamp: position.buyTimestamp,
                            tpLevels: position.tpLevels,
                            partialSells: position.partialSells,
                            status: 'OPEN',
                            maxMultiplier: newMax,
                            currentMultiplier: currentMultiplier,
                        }).catch(() => { });
                    }
                    logger_1.default.debug(`[PAPER REAL] ${position.tokenSymbol}: ${currentMultiplier.toFixed(3)}x (max: ${newMax.toFixed(3)}x, MC: ${marketCapSol.toFixed(2)} SOL${state.complete ? ', GRADUATED' : ''})`);
                    continue;
                }
                // Bonding curve gone (graduated or rugged) - use last known with decay
                const lastKnown = this.maxMultipliers.get(tokenMint) || 1.0;
                const ageMs = Date.now() - position.buyTimestamp.getTime();
                const ageMinutes = ageMs / 60000;
                // If bonding curve disappeared and we never pumped, likely a rug
                if (lastKnown < 1.05 && ageMinutes > 3) {
                    // Treat as rug - bonding curve gone with no price movement
                    multipliers.set(tokenMint, 0.01);
                    logger_1.default.warn(`[PAPER REAL] ${position.tokenSymbol}: bonding curve gone with no pump, treating as rug`);
                    continue;
                }
                // Otherwise graduated - use last known price
                multipliers.set(tokenMint, lastKnown);
                logger_1.default.debug(`[PAPER REAL] ${position.tokenSymbol}: bonding curve graduated, using last known: ${lastKnown.toFixed(2)}x`);
                continue;
            }
            catch (err) {
                logger_1.default.debug(`[BondingCurve] Failed to sample ${position.tokenSymbol}: ${err}`);
                // Use last known multiplier as fallback
                const lastKnown = this.maxMultipliers.get(tokenMint) || 1.0;
                multipliers.set(tokenMint, lastKnown);
            }
        }
        return multipliers;
    }
    /**
     * Emergency close ALL open positions (used by kill switch)
     */
    async emergencyCloseAll(reason) {
        const positions = Array.from(this.paperPositions.keys());
        for (const tokenMint of positions) {
            const lastKnown = this.maxMultipliers.get(tokenMint) || 1.0;
            await this.emergencySell(tokenMint, lastKnown, reason);
        }
        logger_1.default.warn(`[BondingCurve] Emergency closed ${positions.length} positions. Reason: ${reason}`);
    }
    // ==========================================
    // DB Persistence Helpers (non-blocking)
    // ==========================================
    async persistBuyToDb(tokenMint, tokenSymbol, solAmount, quote, tpLevels, timestamp, entryScore, slippage, txFee) {
        const store = await this.getStore();
        if (!store)
            return;
        try {
            // Record the BUY trade
            store.recordTrade({
                mintAddress: tokenMint,
                tokenSymbol,
                side: 'BUY',
                solAmount,
                tokenAmount: quote.tokenAmount,
                pricePerToken: quote.pricePerToken,
                entryScore,
                tradeReason: `SNIPER${slippage ? ` SLIP:${(slippage * 100).toFixed(1)}%` : ''}${txFee ? ` FEE:${txFee.toFixed(4)}` : ''}`,
                paperMode: this.paperMode,
                timestamp,
            });
            // Upsert position
            store.upsertPosition({
                mintAddress: tokenMint,
                tokenSymbol,
                tokensOwned: quote.tokenAmount,
                solSpent: solAmount,
                entryPrice: quote.pricePerToken,
                entryScore,
                buyTimestamp: timestamp,
                tpLevels: tpLevels.map(tp => ({ ...tp, triggered: false })),
                partialSells: [],
                status: 'OPEN',
                maxMultiplier: 1.0,
                currentMultiplier: 1.0,
            });
        }
        catch (err) {
            logger_1.default.debug(`[BondingCurve] Failed to persist buy to DB: ${err}`);
        }
    }
    async persistSellToDb(tokenMint, tokenSymbol, tokensSold, solReceived, tpLevel, pnl, entryScore, currentMultiplier) {
        const store = await this.getStore();
        if (!store)
            return;
        try {
            store.recordTrade({
                mintAddress: tokenMint,
                tokenSymbol,
                side: 'SELL',
                solAmount: solReceived,
                tokenAmount: tokensSold,
                pricePerToken: tokensSold > 0 ? solReceived / tokensSold : 0,
                entryScore,
                tpLevel,
                tradeReason: `TP_${tpLevel}`,
                pnl,
                paperMode: this.paperMode,
                timestamp: new Date(),
            });
        }
        catch (err) {
            logger_1.default.debug(`[BondingCurve] Failed to persist sell to DB: ${err}`);
        }
    }
    async persistPositionUpdate(tokenMint, position, status, maxMultiplier, currentMultiplier, entryScore) {
        const store = await this.getStore();
        if (!store)
            return;
        try {
            store.upsertPosition({
                mintAddress: tokenMint,
                tokenSymbol: position.tokenSymbol,
                tokensOwned: position.tokensOwned,
                solSpent: position.solSpent,
                entryPrice: position.entryPrice,
                entryScore,
                buyTimestamp: position.buyTimestamp,
                tpLevels: position.tpLevels,
                partialSells: position.partialSells,
                status,
                maxMultiplier,
                currentMultiplier,
            });
        }
        catch (err) {
            logger_1.default.debug(`[BondingCurve] Failed to update position in DB: ${err}`);
        }
    }
    async persistOutcomeToDb(tokenMint, tokenSymbol, entryScore, entrySol, exitSol, pnlSol, pnlPct, maxMultiplier, outcome, holdTimeMinutes, partialSellsCount, tpLevelsHit) {
        const store = await this.getStore();
        if (!store)
            return;
        try {
            store.recordOutcome({
                mintAddress: tokenMint,
                tokenSymbol,
                entryScore,
                entrySol,
                exitSol,
                pnlSol,
                pnlPct,
                maxMultiplier,
                outcome,
                holdTimeMinutes,
                partialSellsCount,
                tpLevelsHit,
                closedAt: new Date(),
            });
        }
        catch (err) {
            logger_1.default.debug(`[BondingCurve] Failed to persist outcome to DB: ${err}`);
        }
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