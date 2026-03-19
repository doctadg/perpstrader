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
// pump.fun Program ID
const PUMPFUN_PROGRAM_ID = '6EF8rrecthR5Dkjon8nkdqXHDr3EbmLB4TqRASFjxb';
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
    // Paper mode pricing simulation
    tokenPrices = new Map(); // tokenMint -> price multiplier vs entry
    constructor() {
        this.minScoreToBuy = parseFloat(process.env.PUMPFUN_MIN_BUY_SCORE || '0.7');
        this.solPerSnipe = parseFloat(process.env.PUMPFUN_SNIPER_SOL_AMOUNT || '0.5');
        this.maxSnipePerHour = parseInt(process.env.PUMPFUN_MAX_SNIPE_PER_HOUR || '10');
        this.cooldownMs = parseInt(process.env.PUMPFUN_SNIPER_COOLDOWN_MS || '3000');
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
                const coins = await response.json();
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
     */
    async evaluateAndSnipe(event) {
        // Quick heuristic score (0-1)
        let score = 0.5; // baseline
        // Has a name and symbol (not empty)
        if (event.tokenName && event.tokenName !== 'UNKNOWN' && event.tokenName.length > 2)
            score += 0.1;
        if (event.tokenSymbol && event.tokenSymbol !== 'UNKNOWN' && event.tokenSymbol.length > 1)
            score += 0.05;
        // Has URI (metadata exists)
        if (event.uri)
            score += 0.1;
        // Has creator (not deployer wallet pattern)
        if (event.creator && event.creator.length > 30)
            score += 0.05;
        // Symbol is reasonable length (3-10 chars)
        if (event.tokenSymbol.length >= 2 && event.tokenSymbol.length <= 10)
            score += 0.05;
        // Name is reasonable (not just the symbol)
        if (event.tokenName !== event.tokenSymbol && event.tokenName.length > event.tokenSymbol.length)
            score += 0.05;
        // Check if we already have an AI analysis from the pumpfun-agent pipeline
        // (The analysis pipeline runs separately and stores results in pumpfun-store)
        try {
            const { default: pumpfunStore } = await Promise.resolve().then(() => __importStar(require('../../data/pumpfun-store')));
            const stored = pumpfunStore.getTokenByMint(event.tokenMint);
            if (stored) {
                // Use the stored analysis score if available
                score = stored.overallScore;
                logger_1.default.info(`[SnipeService] Using stored analysis for ${event.tokenSymbol}: ${score.toFixed(2)} (${stored.recommendation})`);
            }
        }
        catch (e) {
            // Store not available, continue with heuristic
        }
        score = Math.min(1, Math.max(0, score));
        const candidate = {
            event,
            score,
            recommendation: score >= this.minScoreToBuy ? 'BUY' : 'WATCH',
            buyExecuted: false,
        };
        // Auto-snipe if score exceeds threshold
        if (score >= this.minScoreToBuy) {
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
        const result = await bonding_curve_1.default.buy(candidate.event.tokenMint, candidate.event.tokenSymbol, this.solPerSnipe, bonding_curve_1.DEFAULT_TP_LEVELS);
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
     * Paper mode: simulate price movements for open positions
     * Random walk with drift, checking TP levels
     */
    startPriceSimulation() {
        const simulate = () => {
            if (!this.running)
                return;
            // Process any queued snipes first
            this.processSnipeQueue();
            const positions = bonding_curve_1.default.getPositions();
            for (const position of positions) {
                const currentMultiplier = this.tokenPrices.get(position.tokenMint) || 1.0;
                // Random walk: most pump.fun tokens either go to 0 or moon
                // 30% chance of significant pump, 50% chance of gradual decline, 20% flat/slight up
                const rand = Math.random();
                let change;
                if (rand < 0.3) {
                    // Pump: 5-20% increase
                    change = 1 + (Math.random() * 0.15 + 0.05);
                }
                else if (rand < 0.8) {
                    // Decline: 1-5% decrease
                    change = 1 - (Math.random() * 0.04 + 0.01);
                }
                else {
                    // Flat/slight up: -1% to +3%
                    change = 1 + (Math.random() * 0.04 - 0.01);
                }
                // 10% chance of rug (instant crash)
                if (Math.random() < 0.002) {
                    change = 0.01; // 99% loss
                    logger_1.default.warn(`[PAPER SIM] RUG DETECTED: ${position.tokenSymbol}`);
                }
                const newMultiplier = currentMultiplier * change;
                this.tokenPrices.set(position.tokenMint, newMultiplier);
                // Check stop loss at 0.5x (50% down)
                if (newMultiplier <= 0.5) {
                    logger_1.default.warn(`[PAPER SIM] STOP LOSS: ${position.tokenSymbol} at ${newMultiplier.toFixed(2)}x`);
                    bonding_curve_1.default.emergencySell(position.tokenMint, newMultiplier);
                    this.tokenPrices.delete(position.tokenMint);
                    continue;
                }
                // Check TP levels
                bonding_curve_1.default.checkAndSell(position.tokenMint, newMultiplier);
            }
            // Log portfolio summary every 30 seconds (check modulo)
            setTimeout(simulate, 5000);
        };
        simulate();
    }
    resetHourlyCountIfNeeded() {
        const now = Date.now();
        if (now - this.lastHourReset > 3600000) {
            this.snipeCountThisHour = 0;
            this.lastHourReset = now;
            this.processedMints.clear(); // Clear seen mints to re-evaluate
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