"use strict";
// pump.fun Agent - Main Entry Point
// Autonomous AI agent for vetting pump.fun token launches
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
const config = config_1.default.get();
const cycleIntervalMs = config.pumpfun?.cycleIntervalMs || 60000;
/**
 * Main function - runs continuous pump.fun analysis cycles
 */
async function main() {
    logger_1.default.info('═════════════════════════════════════════════════════════');
    logger_1.default.info('  pump.fun Token Analysis Agent - Starting');
    logger_1.default.info('═════════════════════════════════════════════════════════');
    // Initialize storage
    try {
        await pumpfun_store_1.default.initialize();
        logger_1.default.info('[Main] Storage initialized');
    }
    catch (error) {
        logger_1.default.error('[Main] Failed to initialize storage:', error);
        process.exit(1);
    }
    // Publish start event
    try {
        const messageBus = (await Promise.resolve().then(() => __importStar(require('../shared/message-bus')))).default;
        if (!messageBus.isConnected) {
            await messageBus.connect();
        }
        await messageBus.publish('pumpfun:cycle:start', {
            timestamp: new Date(),
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
    // Main loop
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