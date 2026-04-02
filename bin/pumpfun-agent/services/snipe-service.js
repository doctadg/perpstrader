"use strict";
// WebSocket Snipe Service - Real-time pump.fun token launch detection
// Subscribes to pump.fun program logs via Helius/Solana WebSocket
// Detects new token creations within milliseconds of on-chain event
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
const web3_js_1 = require("@solana/web3.js");
const logger_1 = __importDefault(require("../../shared/logger"));
const config_1 = __importDefault(require("../../shared/config"));
const bonding_curve_1 = __importStar(require("./bonding-curve"));
const rugcheck_service_1 = require("./rugcheck-service");
const dexscreener_service_1 = require("./dexscreener-service");
// pump.fun Program ID
const PUMPFUN_PROGRAM_ID = '6EF8rrecthR5Dkjon8nkdqXHDr3EbmLB4TqRASFjZxb';
/**
 * WebSocket-based pump.fun token snipe service
 * Detects new launches and optionally auto-buys high-confidence tokens
 */
class SnipeService {
    connection = null;
    wsSubscription = null;
    running = false;
    tokenCallbacks = [];
    snipeCallbacks = [];
    processedMints = new Set();
    recentTokens = [];
    snipeQueue = [];
    analysisQueue = [];
    // Config
    maxSnipePerHour = 10;
    snipeCountThisHour = 0;
    lastHourReset = Date.now();
    minScoreToBuy = 0.7;
    solPerSnipe = 0.5;
    cooldownMs = 3000; // 3s between snipes to avoid spam
    lastSnipeTime = 0;
    permanentBlacklist = new Set(); // Tokens we've traded and exited (never re-buy)
    // Paper mode pricing - NO LONGER USED, kept for reference only
    tokenPrices = new Map(); // tokenMint -> price multiplier vs entry
    constructor() {
        this.minScoreToBuy = parseFloat(process.env.PUMPFUN_MIN_BUY_SCORE || '0.4');
        this.solPerSnipe = parseFloat(process.env.PUMPFUN_SNIPER_SOL_AMOUNT || '0.3');
        this.maxSnipePerHour = parseInt(process.env.PUMPFUN_MAX_SNIPE_PER_HOUR || '15');
        this.cooldownMs = parseInt(process.env.PUMPFUN_SNIPER_COOLDOWN_MS || '2000');
    }
    onToken(callback) {
        this.tokenCallbacks.push(callback);
    }
    onSnipe(callback) {
        this.snipeCallbacks.push(callback);
    }
    /**
     * Start the WebSocket listener
     */
    async start() {
        if (this.running)
            return;
        const config = config_1.default.get();
        const rpcUrl = process.env.HELIUS_RPC_URL || config.solana?.rpcUrl || 'https://api.mainnet-beta.solana.com';
        const wsUrl = process.env.HELIUS_WS_URL || process.env.SOLANA_WS_URL || rpcUrl.replace('https://', 'wss://').replace('http://', 'ws://');
        logger_1.default.info(`[SnipeService] Starting WebSocket listener on ${wsUrl.replace(/\/\/[^:]+@/, '//***@')}`);
        this.connection = new web3_js_1.Connection(rpcUrl, {
            commitment: 'confirmed',
            wsEndpoint: wsUrl,
        });
        try {
            const version = await this.connection.getVersion();
            logger_1.default.info(`[SnipeService] Connected: ${version['solana-core']}`);
        }
        catch (err) {
            logger_1.default.warn(`[SnipeService] RPC check failed (will still try WebSocket): ${err}`);
        }
        // Subscribe to pump.fun program logs
        await this.subscribeToPumpFunLogs();
        this.running = true;
        logger_1.default.info('[SnipeService] WebSocket listener started');
        // Start the analysis + snipe processing loop
        this.processAnalysisQueue();
        // Start price simulation for paper mode (simulates price movement)
        if (bonding_curve_1.default.isPaperMode()) {
            this.startPriceSimulation();
        }
    }
    /**
     * Subscribe to pump.fun program logs via WebSocket
     * Detects Create event which fires on new token launches
     */
    async subscribeToPumpFunLogs() {
        if (!this.connection)
            return;
        try {
            this.wsSubscription = this.connection.onLogs(new web3_js_1.PublicKey(PUMPFUN_PROGRAM_ID), (logs, ctx) => {
                if (!logs.logs)
                    return;
                const logStr = logs.logs.join('\n');
                // Look for Create event discriminator
                // pump.fun Create event log signature: "Program log: Instruction: Create"
                // The event data follows after
                if (!logStr.includes('Instruction: Create'))
                    return;
                try {
                    const event = this.parseCreateEvent(logs.signature, logStr);
                    if (event && !this.processedMints.has(event.tokenMint)) {
                        this.processedMints.add(event.tokenMint);
                        this.recentTokens.unshift(event);
                        if (this.recentTokens.length > 100)
                            this.recentTokens.pop();
                        logger_1.default.info(`[SnipeService] NEW TOKEN: ${event.tokenSymbol} (${event.tokenName}) | Mint: ${event.tokenMint.slice(0, 8)}... | Creator: ${event.creator.slice(0, 8)}...`);
                        // Notify all token callbacks
                        for (const cb of this.tokenCallbacks) {
                            try {
                                cb(event);
                            }
                            catch (e) { /* ignore */ }
                        }
                        // Queue for analysis
                        this.analysisQueue.push(event);
                    }
                }
                catch (parseErr) {
                    logger_1.default.debug(`[SnipeService] Failed to parse create event: ${parseErr}`);
                }
            }, 'confirmed');
            logger_1.default.info('[SnipeService] Subscribed to pump.fun program logs');
        }
        catch (err) {
            logger_1.default.error(`[SnipeService] Failed to subscribe to logs: ${err}`);
            // Fall back to HTTP polling
            logger_1.default.info('[SnipeService] Falling back to HTTP polling mode');
            this.startHttpPolling();
        }
    }
    /**
     * Parse a Create event from program logs
     * Extracts token mint, name, symbol from the log data
     */
    parseCreateEvent(signature, logStr) {
        try {
            // The mint address appears in accountKeys
            // We also try to extract from log data
            // For now, we'll use the account keys from the transaction
            // This is a simplified parser -- real implementation would decode the event data
            // Extract any base58 addresses that look like mints
            // The Create instruction creates: mint account, bonding curve, associated token accounts
            // We need the token mint specifically
            // Fallback: use a combined approach
            // The first non-system, non-pumpfun account is typically the mint
            const accounts = logStr.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/g) || [];
            // Filter out known program IDs
            const knownAddresses = new Set([
                PUMPFUN_PROGRAM_ID,
                '11111111111111111111111111111111',
                'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
                'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
                'SysvarRent111111111111111111111111111111111',
                'Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1',
                '4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf',
                'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s',
            ]);
            const candidateMints = accounts.filter(a => !knownAddresses.has(a) && a.length >= 32 && a.length <= 44);
            if (candidateMints.length === 0)
                return null;
            // For now, generate a placeholder event
            // The full implementation would decode the Anchor event from the transaction
            const tokenMint = candidateMints[0];
            return {
                tokenMint,
                tokenSymbol: 'UNKNOWN',
                tokenName: 'UNKNOWN',
                uri: '',
                creator: candidateMints[candidateMints.length - 1] || '',
                timestamp: new Date(),
                bondingCurveAddress: '',
            };
        }
        catch (err) {
            logger_1.default.debug(`[SnipeService] Parse error: ${err}`);
            return null;
        }
    }
    /**
     * HTTP polling fallback when WebSocket fails
     * Checks pump.fun frontend API every few seconds
     */
    async startHttpPolling() {
        const pollIntervalMs = parseInt(process.env.PUMPFUN_POLL_INTERVAL_MS || '5000');
        const poll = async () => {
            if (!this.running)
                return;
            try {
                const response = await fetch('https://frontend-api-v3.pump.fun/coins/new', {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (compatible; PerpsTrader/1.0)',
                        'Accept': 'application/json',
                    },
                });
                if (!response.ok) {
                    logger_1.default.debug(`[SnipeService] HTTP poll failed: ${response.status}`);
                    return;
                }
                const coins = (await response.json());
                for (const coin of coins) {
                    if (!coin?.mint || this.processedMints.has(coin.mint))
                        continue;
                    this.processedMints.add(coin.mint);
                    const event = {
                        tokenMint: coin.mint,
                        tokenSymbol: coin.symbol || coin.ticker || '???',
                        tokenName: coin.name || 'Unknown',
                        uri: coin.uri || '',
                        creator: coin.creator || '',
                        timestamp: new Date(),
                        bondingCurveAddress: coin.bondingCurveKey || '',
                    };
                    this.recentTokens.unshift(event);
                    if (this.recentTokens.length > 100)
                        this.recentTokens.pop();
                    logger_1.default.info(`[SnipeService] [HTTP] NEW: ${event.tokenSymbol} (${event.tokenName}) | ${event.tokenMint.slice(0, 8)}...`);
                    for (const cb of this.tokenCallbacks) {
                        try {
                            cb(event);
                        }
                        catch (e) { /* ignore */ }
                    }
                    this.analysisQueue.push(event);
                }
            }
            catch (err) {
                logger_1.default.debug(`[SnipeService] HTTP poll error: ${err}`);
            }
        };
        // Poll immediately, then on interval
        await poll();
        setInterval(poll, pollIntervalMs);
        logger_1.default.info(`[SnipeService] HTTP polling started (every ${pollIntervalMs}ms)`);
    }
    /**
     * Process the analysis queue -- scores tokens and decides whether to snipe
     * Runs in background, processing one token at a time
     */
    processAnalysisQueue() {
        const processNext = async () => {
            if (!this.running)
                return;
            if (this.analysisQueue.length > 0) {
                const event = this.analysisQueue.shift();
                await this.evaluateAndSnipe(event);
            }
            // Check every 2 seconds
            setTimeout(processNext, 2000);
        };
        processNext();
    }
    /**
     * Evaluate a token using quick heuristics and decide whether to snipe
     * This is the fast path -- full AI analysis happens in the background pipeline
     *
     * CRITICAL: Heuristic scores are INFLATED. We now require:
     * 1. Stored AI analysis (preferred) OR
     * 2. Very high heuristic threshold (0.65+) with no red flags
     */
    async evaluateAndSnipe(event) {
        let score = 0;
        let hasStoredAnalysis = false;
        let recommendation = 'WATCH';
        let redFlags = [];
        // ── RED FLAGS (instant disqualifiers) ─────────────────────────────────────
        const symbol = event.tokenSymbol.toUpperCase();
        // Obvious test/garbage tokens
        const garbagePatterns = [
            /^TEST$/i, /^AAA$/i, /^BBB$/i, /^XXX$/i, /^YYY$/i, /^ZZZ$/i,
            /^COIN$/i, /^TOKEN$/i, /^MEME$/i, /^NEW$/i, /^HELLO$/i,
            /^\d+%$/, /^<\d+%$/, />?\d+%$/, // "4%", "<50%", etc
            /^[a-z]$/i, // Single letter
            /^(an|the|in|on|at|to|by)$/i, // Random words
        ];
        for (const pattern of garbagePatterns) {
            if (pattern.test(symbol)) {
                redFlags.push('garbage_symbol');
                break;
            }
        }
        // Symbol too long (looks like spam)
        if (event.tokenSymbol.length > 10) {
            redFlags.push('symbol_too_long');
        }
        // Name is just symbol repeated or garbage
        if (event.tokenName === event.tokenSymbol || event.tokenName.length < 3) {
            redFlags.push('lazy_naming');
        }
        // ── CHECK FOR STORED AI ANALYSIS ─────────────────────────────────────────
        try {
            const { default: pumpfunStore } = await Promise.resolve().then(() => __importStar(require('../../data/pumpfun-store')));
            const stored = pumpfunStore.getTokenByMint(event.tokenMint);
            if (stored) {
                score = stored.overallScore;
                hasStoredAnalysis = true;
                recommendation = stored.recommendation;
                logger_1.default.info(`[SnipeService] AI analysis for ${event.tokenSymbol}: ${score.toFixed(2)} (${recommendation})`);
                // Add red flags from AI analysis
                if (stored.redFlags && stored.redFlags.length > 0) {
                    redFlags.push(...stored.redFlags);
                }
            }
        }
        catch (e) {
            // Store not available
        }
        // ── HEURISTIC FALLBACK (only if no AI analysis) ───────────────────────────
        if (!hasStoredAnalysis) {
            // Much more conservative baseline
            score = 0.1; // Start LOW, not 0.3
            // Quality signals (smaller bonuses)
            if (event.tokenName && event.tokenName !== 'UNKNOWN' && event.tokenName.length > 3)
                score += 0.05;
            if (event.tokenSymbol && event.tokenSymbol !== 'UNKNOWN' && event.tokenSymbol.length >= 2)
                score += 0.03;
            if (event.uri && event.uri.includes('ipfs'))
                score += 0.05; // IPFS is better than random
            if (event.bondingCurveAddress)
                score += 0.05;
            // Good symbol length (typical ticker)
            if (event.tokenSymbol.length >= 3 && event.tokenSymbol.length <= 5)
                score += 0.07;
            // Name different from symbol (shows effort)
            if (event.tokenName !== event.tokenSymbol && event.tokenName.length > event.tokenSymbol.length + 3) {
                score += 0.05;
            }
            // Clamp heuristic score
            score = Math.min(0.5, Math.max(0, score)); // Cap heuristic at 0.5 max
            logger_1.default.debug(`[SnipeService] Heuristic for ${event.tokenSymbol}: ${score.toFixed(2)}`);
        }
        // ── RED FLAG PENALTIES ────────────────────────────────────────────────────
        const redFlagPenalty = redFlags.length * 0.15;
        score = Math.max(0, score - redFlagPenalty);
        if (redFlags.length > 0) {
            logger_1.default.info(`[SnipeService] Red flags for ${event.tokenSymbol}: ${redFlags.join(', ')} (-${redFlagPenalty.toFixed(2)})`);
        }
        // ── RUGCHECK + DEXSCREENER PRE-BUY GATE ──────────────────────────────────
        // Multi-layered on-chain safety check before committing capital.
        // Layer 1: RugCheck (holder concentration, insider networks, LP locks, mint/freeze auth)
        // Layer 2: DexScreener (sell pressure, price dumps, liquidity)
        // Brand new tokens (<30s) may not be indexed yet — let them through (optimistic).
        const effectiveThreshold = this.minScoreToBuy;
        const tokenAgeMs = Date.now() - event.timestamp.getTime();
        let rugGatePassed = true;
        let dexGatePassed = true;
        const preliminaryScore = score >= effectiveThreshold;
        if (tokenAgeMs > 30_000 && preliminaryScore) {
            // Layer 1: RugCheck
            try {
                const rcResult = await (0, rugcheck_service_1.evaluateToken)(event.tokenMint);
                if (rcResult.verdict === 'RUGGED') {
                    rugGatePassed = false;
                    redFlags.push('rugcheck:RUGGED');
                    logger_1.default.warn(`[SnipeService] RUGCHECK RUGGED: ${event.tokenSymbol} — confirmed rug pull`);
                }
                else if (rcResult.verdict === 'HIGH_RISK') {
                    rugGatePassed = false;
                    redFlags.push(`rugcheck:HIGH_RISK`);
                    logger_1.default.warn(`[SnipeService] RUGCHECK BLOCK: ${event.tokenSymbol} — ${rcResult.rejectReasons.slice(0, 3).join('; ')}`);
                }
                else if (rcResult.scorePenalty > 0.5) {
                    rugGatePassed = false;
                    redFlags.push(`rugcheck:score_penalty`);
                    logger_1.default.warn(`[SnipeService] RUGCHECK BLOCK: ${event.tokenSymbol} — penalty ${rcResult.scorePenalty.toFixed(2)}`);
                }
                else if (rcResult.rejectReasons.length > 0) {
                    // Soft warnings — don't block but add to red flags
                    for (const reason of rcResult.rejectReasons.slice(0, 3)) {
                        redFlags.push(`rugcheck:${reason.split(':')[0]}`);
                    }
                    logger_1.default.info(`[SnipeService] RugCheck warnings for ${event.tokenSymbol}: ${rcResult.rejectReasons.join('; ')}`);
                }
            }
            catch (err) {
                logger_1.default.debug(`[SnipeService] RugCheck pre-buy error for ${event.tokenSymbol}: ${err}`);
                // Don't block on RugCheck failures — network errors shouldn't prevent trades
            }
            // Layer 2: DexScreener (only if RugCheck passed)
            if (rugGatePassed) {
                try {
                    const dsResult = await (0, dexscreener_service_1.evaluateMarket)(event.tokenMint);
                    if (dsResult.dumpDetected) {
                        dexGatePassed = false;
                        redFlags.push('dexscreener:DUMP');
                        logger_1.default.warn(`[SnipeService] DEXSCREENER BLOCK: ${event.tokenSymbol} — price dump ${dsResult.metrics.priceChange1h.toFixed(1)}%`);
                    }
                    else if (dsResult.sellPressureDetected) {
                        dexGatePassed = false;
                        redFlags.push('dexscreener:SELL_PRESSURE');
                        logger_1.default.warn(`[SnipeService] DEXSCREENER BLOCK: ${event.tokenSymbol} — sell pressure (buy/sell ratio: ${(dsResult.metrics.buySellRatio1h * 100).toFixed(0)}%)`);
                    }
                    else if (dsResult.rejectReasons.length > 0) {
                        for (const reason of dsResult.rejectReasons.slice(0, 2)) {
                            redFlags.push(`dexscreener:${reason.split(':')[0]}`);
                        }
                    }
                }
                catch (err) {
                    logger_1.default.debug(`[SnipeService] DexScreener pre-buy error for ${event.tokenSymbol}: ${err}`);
                }
            }
        }
        // ── BUY DECISION ──────────────────────────────────────────────────────────
        const shouldBuy = score >= effectiveThreshold && redFlags.length < 3 && rugGatePassed && dexGatePassed;
        const candidate = {
            event,
            score,
            recommendation: shouldBuy ? 'BUY' : (hasStoredAnalysis ? recommendation : 'WATCH'),
            buyExecuted: false,
        };
        // Auto-snipe if score exceeds threshold
        if (shouldBuy) {
            // Check rate limits
            this.resetHourlyCountIfNeeded();
            if (this.snipeCountThisHour >= this.maxSnipePerHour) {
                logger_1.default.warn(`[SnipeService] Hourly limit reached (${this.maxSnipePerHour}), skipping ${event.tokenSymbol}`);
                candidate.recommendation = 'LIMITED';
            }
            else if (Date.now() - this.lastSnipeTime < this.cooldownMs) {
                logger_1.default.debug(`[SnipeService] Cooldown active, queuing ${event.tokenSymbol}`);
                this.snipeQueue.push(candidate);
            }
            else {
                await this.executeSnipe(candidate);
            }
        }
        // Notify callbacks
        for (const cb of this.snipeCallbacks) {
            try {
                cb(candidate);
            }
            catch (e) { /* ignore */ }
        }
    }
    /**
     * Execute a snipe (buy on bonding curve)
     */
    async executeSnipe(candidate) {
        if (!bonding_curve_1.default.isInitialized()) {
            await bonding_curve_1.default.initialize();
        }
        this.lastSnipeTime = Date.now();
        this.snipeCountThisHour++;
        const result = await bonding_curve_1.default.buy(candidate.event.tokenMint, candidate.event.tokenSymbol, this.solPerSnipe, bonding_curve_1.DEFAULT_TP_LEVELS, candidate.score);
        candidate.buyExecuted = result.success;
        candidate.buyResult = result;
        if (result.success) {
            // Set initial price for simulation
            this.tokenPrices.set(candidate.event.tokenMint, 1.0);
            logger_1.default.info(`[SnipeService] SNIPED ${candidate.event.tokenSymbol} | Score: ${candidate.score.toFixed(2)} | ${this.solPerSnipe} SOL | Tokens: ${result.tokensReceived.toFixed(0)}`);
        }
        else {
            logger_1.default.warn(`[SnipeService] Snipe failed for ${candidate.event.tokenSymbol}: ${result.error}`);
        }
    }
    /**
     * Process queued snipes (ones that were rate-limited)
     */
    processSnipeQueue() {
        if (this.snipeQueue.length === 0)
            return;
        if (Date.now() - this.lastSnipeTime < this.cooldownMs)
            return;
        const candidate = this.snipeQueue.shift();
        if (candidate) {
            this.executeSnipe(candidate);
        }
    }
    /**
     * Monitor open positions using REAL on-chain bonding curve data.
     * No more random walk simulation — prices come from the actual blockchain.
     * Applies slippage on sells, stop loss, and time-based exits.
     */
    startPriceSimulation() {
        const simulate = async () => {
            if (!this.running)
                return;
            // Process any queued snipes first
            this.processSnipeQueue();
            const positions = bonding_curve_1.default.getPositions();
            if (positions.length === 0) {
                setTimeout(simulate, 5000);
                return;
            }
            // Always use real on-chain price sampling
            let realMultipliers = null;
            try {
                realMultipliers = await bonding_curve_1.default.sampleAndUpdatePositions();
            }
            catch (err) {
                logger_1.default.warn(`[PriceMonitor] On-chain sampling failed: ${err}`);
            }
            for (const position of positions) {
                const newMultiplier = realMultipliers?.get(position.tokenMint) ?? 1.0;
                if (realMultipliers && realMultipliers.has(position.tokenMint)) {
                    logger_1.default.debug(`[PriceMonitor] ${position.tokenSymbol} on-chain: ${newMultiplier.toFixed(3)}x`);
                }
                // ── STOP LOSS at 0.6x (40% down) ──
                if (newMultiplier <= 0.6) {
                    logger_1.default.warn(`[PriceMonitor] STOP LOSS: ${position.tokenSymbol} at ${newMultiplier.toFixed(2)}x`);
                    await bonding_curve_1.default.emergencySell(position.tokenMint, newMultiplier, 'STOP_LOSS');
                    this.permanentBlacklist.add(position.tokenMint);
                    continue;
                }
                // ── TIME EXIT: kill stale positions ──
                const ageMinutes = (Date.now() - position.buyTimestamp.getTime()) / 60000;
                // Check if position never pumped (max mult from partial sells history or current)
                const hasPumped = position.partialSells.length > 0; // Already hit a TP
                const isFlat = newMultiplier < 0.8 && !hasPumped; // Underwater with no TP hits
                if (ageMinutes >= bonding_curve_1.TIME_EXIT_MINUTES && isFlat) {
                    logger_1.default.warn(`[PriceMonitor] TIME_EXIT: ${position.tokenSymbol} at ${newMultiplier.toFixed(2)}x after ${ageMinutes.toFixed(0)}min (never pumped)`);
                    await bonding_curve_1.default.emergencySell(position.tokenMint, newMultiplier, 'TIME_EXIT');
                    this.permanentBlacklist.add(position.tokenMint);
                    continue;
                }
                // ── BONDING CURVE GONE + NO PUMP = rug ──
                if (newMultiplier <= 0.05 && ageMinutes > 2) {
                    logger_1.default.warn(`[PriceMonitor] RUG DETECTED: ${position.tokenSymbol} at ${newMultiplier.toFixed(3)}x after ${ageMinutes.toFixed(0)}min`);
                    await bonding_curve_1.default.emergencySell(position.tokenMint, newMultiplier, 'RUG');
                    this.permanentBlacklist.add(position.tokenMint);
                    continue;
                }
                // ── RUGCHECK LIVE MONITORING (every ~2 min via 5s loop interval) ──
                // Only check RugCheck if position is older than 1 min and check every ~24th iteration
                // This avoids hammering the API while still catching rugs in real-time
                if (ageMinutes > 1 && position.rugChecksPerformed === undefined) {
                    position.rugChecksPerformed = 0;
                }
                const rugCheckInterval = 24; // Every ~2 minutes at 5s polling
                const rugChecksDone = position.rugChecksPerformed || 0;
                if (ageMinutes > 1 && rugChecksDone < 30 && (rugChecksDone === 0 || rugChecksDone % rugCheckInterval === 0)) {
                    try {
                        const rcResult = await (0, rugcheck_service_1.evaluateToken)(position.tokenMint);
                        position.rugChecksPerformed = rugChecksDone + 1;
                        if (rcResult.verdict === 'RUGGED') {
                            logger_1.default.warn(`[PriceMonitor] RUGCHECK LIVE: ${position.tokenSymbol} CONFIRMED RUGGED — emergency sell`);
                            await bonding_curve_1.default.emergencySell(position.tokenMint, newMultiplier, 'RUGCHECK_RUGGED');
                            this.permanentBlacklist.add(position.tokenMint);
                            continue;
                        }
                        // Soft rug signal: significant score degradation
                        if (rcResult.scorePenalty > 0.6 && newMultiplier < 0.9) {
                            logger_1.default.warn(`[PriceMonitor] RUGCHECK LIVE: ${position.tokenSymbol} high penalty (${rcResult.scorePenalty.toFixed(2)}) ` +
                                `at ${newMultiplier.toFixed(2)}x — emergency sell`);
                            await bonding_curve_1.default.emergencySell(position.tokenMint, newMultiplier, 'RUGCHECK_HIGH_RISK');
                            this.permanentBlacklist.add(position.tokenMint);
                            continue;
                        }
                    }
                    catch (err) {
                        // Don't let RugCheck monitoring errors crash the loop
                        logger_1.default.debug(`[PriceMonitor] RugCheck monitor error for ${position.tokenSymbol}: ${err}`);
                    }
                }
                // ── DEXSCREENER LIVE MONITORING (sell pressure detection) ──
                // Check at the same interval as RugCheck but offset by half
                const dexCheckInterval = 24;
                if (ageMinutes > 1 && rugChecksDone > 0 && rugChecksDone % dexCheckInterval === 12) {
                    try {
                        const dsResult = await (0, dexscreener_service_1.evaluateMarket)(position.tokenMint);
                        if (dsResult.dumpDetected && dsResult.metrics.priceChange1h < -30) {
                            logger_1.default.warn(`[PriceMonitor] DEXSCREENER LIVE: ${position.tokenSymbol} dumping ${dsResult.metrics.priceChange1h.toFixed(1)}% ` +
                                `at ${newMultiplier.toFixed(2)}x — emergency sell`);
                            await bonding_curve_1.default.emergencySell(position.tokenMint, newMultiplier, 'DEXSCREENER_DUMP');
                            this.permanentBlacklist.add(position.tokenMint);
                            continue;
                        }
                        if (dsResult.sellPressureDetected && newMultiplier < 0.95) {
                            logger_1.default.warn(`[PriceMonitor] DEXSCREENER LIVE: ${position.tokenSymbol} heavy sell pressure ` +
                                `(ratio: ${(dsResult.metrics.buySellRatio1h * 100).toFixed(0)}%) at ${newMultiplier.toFixed(2)}x`);
                            // Don't auto-sell on sell pressure alone — log for awareness
                            // But if also declining, trigger emergency sell
                            if (newMultiplier < 0.8) {
                                await bonding_curve_1.default.emergencySell(position.tokenMint, newMultiplier, 'DEXSCREENER_SELL_PRESSURE');
                                this.permanentBlacklist.add(position.tokenMint);
                                continue;
                            }
                        }
                    }
                    catch (err) {
                        logger_1.default.debug(`[PriceMonitor] DexScreener monitor error for ${position.tokenSymbol}: ${err}`);
                    }
                }
                // Check TP levels
                await bonding_curve_1.default.checkAndSell(position.tokenMint, newMultiplier);
            }
            // Log portfolio summary periodically
            setTimeout(simulate, 5000);
        };
        simulate();
    }
    resetHourlyCountIfNeeded() {
        const now = Date.now();
        if (now - this.lastHourReset > 3600000) {
            this.snipeCountThisHour = 0;
            this.lastHourReset = now;
            // Do NOT clear processedMints — tokens are processed once, never re-evaluated
            // Permanent blacklist prevents re-buying tokens we've already exited
            logger_1.default.info(`[SnipeService] Hourly snipe counter reset. Seen: ${this.processedMints.size}, Blacklisted: ${this.permanentBlacklist.size}`);
        }
    }
    stop() {
        this.running = false;
        if (this.wsSubscription !== null && this.connection) {
            try {
                this.connection.removeOnLogsListener(this.wsSubscription);
            }
            catch (e) { /* ignore */ }
            this.wsSubscription = null;
        }
        logger_1.default.info('[SnipeService] Stopped');
    }
    getStatus() {
        return {
            running: this.running,
            recentTokensCount: this.recentTokens.length,
            openPositions: bonding_curve_1.default.getPositions().length,
            snipesThisHour: this.snipeCountThisHour,
            maxSnipesPerHour: this.maxSnipePerHour,
            mode: bonding_curve_1.default.isPaperMode() ? 'PAPER' : 'LIVE',
            queueDepth: this.analysisQueue.length + this.snipeQueue.length,
            processedMintsCount: this.processedMints.size,
        };
    }
}
const snipeService = new SnipeService();
exports.default = snipeService;
//# sourceMappingURL=snipe-service.js.map