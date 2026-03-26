"use strict";
// pump.fun Agent - Main Entry Point
// Autonomous AI agent for vetting + sniping pump.fun token launches
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
require("dotenv/config");
const config_1 = __importDefault(require("../shared/config"));
const logger_1 = __importDefault(require("../shared/logger"));
const graph_1 = require("./graph");
const pumpfun_store_1 = __importDefault(require("../data/pumpfun-store"));
const bonding_curve_1 = __importStar(require("./services/bonding-curve"));
const snipe_service_1 = __importDefault(require("./services/snipe-service"));
const config = config_1.default.get();
const cycleIntervalMs = config.pumpfun?.cycleIntervalMs || 30000; // 30s (was 60s)
const minScoreThreshold = parseFloat(process.env.PUMPFUN_MIN_BUY_SCORE || '0.4');
/**
 * Main function - runs continuous pump.fun analysis cycles + snipe loop
 */
async function main() {
    logger_1.default.info('═════════════════════════════════════════════════════════');
    logger_1.default.info('  pump.fun Token Agent + Sniper - Starting');
    logger_1.default.info('═════════════════════════════════════════════════════════');
    // Initialize bonding curve service
    try {
        await bonding_curve_1.default.initialize();
        const portfolio = bonding_curve_1.default.getPortfolioSummary();
        logger_1.default.info(`[Main] Bonding curve service: ${portfolio.mode} mode | ${portfolio.solBalance.toFixed(2)} SOL`);
    }
    catch (error) {
        logger_1.default.error('[Main] Failed to initialize bonding curve service:', error);
        process.exit(1);
    }
    // Initialize storage
    try {
        await pumpfun_store_1.default.initialize();
        logger_1.default.info('[Main] Storage initialized');
    }
    catch (error) {
        logger_1.default.error('[Main] Failed to initialize storage:', error);
        process.exit(1);
    }
    // Start WebSocket snipe listener (real-time token detection + auto-buy)
    try {
        await snipe_service_1.default.start();
        // When a new token is detected via WS, feed it into the analysis pipeline
        snipe_service_1.default.onToken(async (event) => {
            logger_1.default.info(`[Main] WS detected: $${event.tokenSymbol} -- feeding to analysis pipeline`);
        });
        // Log snipe decisions
        snipe_service_1.default.onSnipe((candidate) => {
            const emoji = candidate.buyExecuted ? '[SNIPED]' : '[WATCH]';
            logger_1.default.info(`${emoji} $${candidate.event.tokenSymbol} | Score: ${candidate.score.toFixed(2)} | ${candidate.recommendation}`);
        });
    }
    catch (error) {
        logger_1.default.error('[Main] Failed to start snipe service:', error);
        // Continue without snipe service -- analysis pipeline still works
    }
    // Publish start event
    try {
        const messageBus = (await Promise.resolve().then(() => __importStar(require('../shared/message-bus')))).default;
        if (!messageBus.isConnected) {
            await messageBus.connect();
        }
        await messageBus.publish('pumpfun:cycle:start', {
            timestamp: new Date(),
            mode: bonding_curve_1.default.isPaperMode() ? 'PAPER' : 'LIVE',
            config: {
                subscribeDurationMs: config.pumpfun?.subscribeDurationMs,
                minScoreThreshold: config.pumpfun?.minScoreThreshold,
            },
        });
    }
    catch (error) {
        logger_1.default.warn('[Main] Failed to publish start event:', error);
    }
    let cycleCount = 0;
    // Main analysis loop (separate from the real-time snipe listener)
    while (true) {
        cycleCount++;
        logger_1.default.info(``);
        logger_1.default.info(`╔════════════════════════════════════════════════════════╗`);
        logger_1.default.info(`║  PUMPFUN CYCLE ${cycleCount} - ${new Date().toISOString()}  ║`);
        logger_1.default.info(`╚════════════════════════════════════════════════════════╝`);
        try {
            const result = await (0, graph_1.runPumpFunCycle)();
            logger_1.default.info(``);
            logger_1.default.info(`[Main] Cycle ${cycleCount} Summary:`);
            logger_1.default.info(`  ├─ Discovered:   ${result.stats.totalDiscovered}`);
            logger_1.default.info(`  ├─ Analyzed:     ${result.stats.totalAnalyzed}`);
            logger_1.default.info(`  ├─ Stored:       ${result.stats.totalStored}`);
            logger_1.default.info(`  ├─ Duplicates:   ${result.stats.totalDuplicates}`);
            logger_1.default.info(`  ├─ High Conf:    ${result.highConfidenceTokens.length}`);
            logger_1.default.info(`  ├─ Avg Score:    ${result.stats.averageScore.toFixed(2)}`);
            logger_1.default.info(`  └─ Step:         ${result.currentStep}`);
            // Log recommendation breakdown
            const rec = result.stats.byRecommendation;
            logger_1.default.info(`[Main] Recommendations: STRONG_BUY:${rec.STRONG_BUY} BUY:${rec.BUY} HOLD:${rec.HOLD} AVOID:${rec.AVOID} STRONG_AVOID:${rec.STRONG_AVOID}`);
            // Log high confidence tokens
            if (result.highConfidenceTokens.length > 0) {
                logger_1.default.info(`[Main] High Confidence Tokens:`);
                for (const token of result.highConfidenceTokens) {
                    logger_1.default.info(`  - $${token.token.symbol} (${token.overallScore.toFixed(2)}) ${token.recommendation}`);
                }
            }
            // Snipe status
            const snipeStatus = snipe_service_1.default.getStatus();
            if (snipeStatus.running) {
                logger_1.default.info(`[Sniper] Positions: ${snipeStatus.openPositions} | Queue: ${snipeStatus.queueDepth} | Hour: ${snipeStatus.snipesThisHour}/${snipeStatus.maxSnipesPerHour}`);
                const portfolio = bonding_curve_1.default.getPortfolioSummary();
                logger_1.default.info(`[Portfolio] ${portfolio.mode} | Balance: ${portfolio.solBalance.toFixed(2)} SOL | Invested: ${portfolio.totalInvested.toFixed(2)} SOL | Realized: ${portfolio.totalRealized.toFixed(4)} SOL`);
            }
            // ── Fix 1: Sample real prices and trigger TP sells for all open positions ──
            try {
                const multipliers = await bonding_curve_1.default.sampleAndUpdatePositions();
                for (const [tokenMint, multiplier] of multipliers) {
                    // Check and execute TP levels
                    await bonding_curve_1.default.checkAndSell(tokenMint, multiplier);
                }
                // ── Fix 3: Time-based stop-loss for stale positions ──
                const positions = bonding_curve_1.default.getPositions();
                const now = Date.now();
                for (const pos of positions) {
                    const ageMs = now - new Date(pos.buyTimestamp).getTime();
                    const mult = multipliers.get(pos.tokenMint) || 1.0;
                    // ── Fix 4: Handle graduated/complete bonding curves ──
                    const state = await bonding_curve_1.default.readBondingCurveState(pos.tokenMint);
                    if (state?.complete) {
                        // Bonding curve graduated - force exit at current multiplier
                        await bonding_curve_1.default.emergencySell(pos.tokenMint, Math.max(mult, 1.0), 'GRADUATED');
                        logger_1.default.info(`[GRADUATED] ${pos.tokenSymbol}: bonding curve complete, exiting at ${mult.toFixed(2)}x`);
                        continue;
                    }
                    // ── PRICE-BASED STOP LOSS (must check BEFORE time-based exits) ──
                    const STOP_LOSS_MULTIPLIER = 0.4; // 60% down = exit
                    if (mult <= STOP_LOSS_MULTIPLIER) {
                        await bonding_curve_1.default.emergencySell(pos.tokenMint, mult);
                        logger_1.default.warn(`[STOP-LOSS] ${pos.tokenSymbol}: hit price stop at ${mult.toFixed(2)}x (${((mult - 1) * 100).toFixed(0)}%)`);
                        continue; // Skip further checks
                    }
                    // ── EXTENDED TIME-BASED EXITS (more patient for memecoin pumps) ──
                    if (ageMs > 3 * 60 * 60 * 1000) {
                        // Force exit anything over 3 hours (was 1 hour)
                        await bonding_curve_1.default.emergencySell(pos.tokenMint, mult, 'TIME_EXIT');
                        logger_1.default.info(`[TIME-EXIT] ${pos.tokenSymbol}: max age ${(ageMs / 60000).toFixed(0)}min`);
                    }
                    else if (ageMs > 90 * 60 * 1000 && mult < 1.3) {
                        // Exit underperformers after 90 min if < 30% gain (was 30 min at < 50% gain)
                        await bonding_curve_1.default.emergencySell(pos.tokenMint, mult, 'STALE_EXIT');
                        logger_1.default.info(`[STALE-EXIT] ${pos.tokenSymbol}: stale ${(ageMs / 60000).toFixed(0)}min @ ${mult.toFixed(2)}x`);
                    }
                    else if (mult >= 3.0) {
                        // Take profit early on 3x+ gains even if TP levels didn't trigger
                        await bonding_curve_1.default.emergencySell(pos.tokenMint, mult, 'TAKE_PROFIT');
                        logger_1.default.info(`[TAKE-PROFIT] ${pos.tokenSymbol}: early exit at ${mult.toFixed(2)}x (3x+)`);
                    }
                }
            }
            catch (error) {
                logger_1.default.warn('[Main] Position sampling/sell check failed:', error);
            }
            // ── Bridge: feed high-confidence tokens to snipe service ──
            // The batch analysis pipeline and WS snipe service are separate paths.
            // This bridge ensures batch-analyzed tokens get evaluated for buying.
            if (result.highConfidenceTokens.length > 0) {
                for (const token of result.highConfidenceTokens) {
                    if (!token.token?.mintAddress)
                        continue;
                    // Skip if already queued or processed
                }
                // For now, directly buy the top token if it scores above snipe threshold
                const topToken = result.highConfidenceTokens[0];
                if (topToken && topToken.overallScore >= minScoreThreshold && snipeStatus.openPositions < 3) {
                    const solAmount = parseFloat(process.env.PUMPFUN_SNIPER_SOL_AMOUNT || '0.3');
                    const buyResult = await bonding_curve_1.default.buy(topToken.token.mintAddress, topToken.token.symbol, solAmount, bonding_curve_1.DEFAULT_TP_LEVELS, topToken.overallScore);
                    if (buyResult.success) {
                        logger_1.default.info(`[CYCLE BUY] ${topToken.token.symbol} | Score: ${topToken.overallScore.toFixed(2)} | ` +
                            `${solAmount} SOL | Tokens: ${buyResult.tokensReceived.toFixed(0)}`);
                    }
                    else {
                        logger_1.default.warn(`[CYCLE BUY] Failed for ${topToken.token.symbol}: ${buyResult.error}`);
                    }
                }
            }
        }
        catch (error) {
            logger_1.default.error(`[Main] Cycle ${cycleCount} failed:`, error);
        }
        // Wait before next cycle
        logger_1.default.info(``);
        logger_1.default.info(`[Main] Waiting ${cycleIntervalMs / 1000}s before next cycle...`);
        await sleep(cycleIntervalMs);
    }
}
/**
 * Sleep for specified milliseconds
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
/**
 * Graceful shutdown handler
 */
async function shutdown(signal) {
    logger_1.default.info(``);
    logger_1.default.info(`[Main] Received ${signal}, shutting down...`);
    // Stop snipe service
    snipe_service_1.default.stop();
    // Log final portfolio
    const portfolio = bonding_curve_1.default.getPortfolioSummary();
    logger_1.default.info(`[Portfolio] Final: ${portfolio.solBalance.toFixed(2)} SOL | ${portfolio.openPositions} positions | Realized: ${portfolio.totalRealized.toFixed(4)} SOL`);
    // Close storage
    pumpfun_store_1.default.close();
    // Publish shutdown event
    try {
        const messageBus = (await Promise.resolve().then(() => __importStar(require('../shared/message-bus')))).default;
        await messageBus.publish('pumpfun:cycle:complete', {
            timestamp: new Date(),
            shutdown: true,
        });
        await messageBus.disconnect();
    }
    catch (error) {
        // Ignore errors during shutdown
    }
    logger_1.default.info('[Main] Shutdown complete');
    process.exit(0);
}
// Register signal handlers
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
// Handle uncaught errors
process.on('uncaughtException', (error) => {
    logger_1.default.error('[Main] Uncaught exception:', error);
    shutdown('UNCAUGHT_EXCEPTION');
});
process.on('unhandledRejection', (reason, promise) => {
    logger_1.default.error('[Main] Unhandled rejection at:', promise, 'reason:', reason);
});
// Start the agent
main().catch((error) => {
    logger_1.default.error('[Main] Fatal error:', error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map