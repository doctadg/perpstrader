"use strict";
// Main Entry Point - News Agent
// Runs the autonomous newsfeed system 24/7
// Category Rotation Mode: cycles through 1 category at a time
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
const dotenv = __importStar(require("dotenv"));
dotenv.config();
const graph_1 = require("./news-agent/graph");
const news_store_1 = __importDefault(require("./data/news-store"));
const logger_1 = __importDefault(require("./shared/logger"));
// All available categories
const ALL_CATEGORIES = [
    'CRYPTO', 'STOCKS', 'ECONOMICS', 'GEOPOLITICS', 'TECH', 'COMMODITIES',
    'SPORTS', 'FOOTBALL', 'BASKETBALL', 'TENNIS', 'MMA', 'GOLF'
];
// Configuration
const CYCLE_INTERVAL_MS = Number.parseInt(process.env.NEWS_CYCLE_INTERVAL_MS || '60000', 10) || 60000;
const ROTATION_MODE = process.env.NEWS_ROTATION_MODE !== 'false'; // Default: true (rotate categories)
const QUERIES_PER_CATEGORY = Number.parseInt(process.env.NEWS_QUERIES_PER_CATEGORY || '3', 10) || 3;
async function main() {
    logger_1.default.info('═════════════════════════════════════════════════════════');
    logger_1.default.info('  Global Newsfeed Agent - Starting');
    logger_1.default.info('═════════════════════════════════════════════════════════');
    try {
        logger_1.default.info('[Main] Initializing services...');
        await news_store_1.default.initialize();
        const stats = await news_store_1.default.getStats();
        logger_1.default.info(`[Main] News store initialized: ${stats.total} articles`);
        logger_1.default.info(`[Main] Mode: ${ROTATION_MODE ? 'CATEGORY ROTATION' : 'ALL CATEGORIES'}`);
        logger_1.default.info(`[Main] Cycle interval: ${CYCLE_INTERVAL_MS / 1000}s`);
        logger_1.default.info(`[Main] Queries per category: ${QUERIES_PER_CATEGORY}`);
        logger_1.default.info('');
        await sleep(3000);
        let cycleCount = 0;
        let categoryIndex = 0;
        while (true) {
            cycleCount++;
            const currentCategory = ALL_CATEGORIES[categoryIndex];
            logger_1.default.info(`\n╔════════════════════════════════════════════════════════╗`);
            if (ROTATION_MODE) {
                logger_1.default.info(`║  CYCLE ${cycleCount} - ${currentCategory} - ${new Date().toISOString()}  ║`);
            }
            else {
                logger_1.default.info(`║  NEWS CYCLE ${cycleCount} - ${new Date().toISOString()}  ║`);
            }
            logger_1.default.info(`╚════════════════════════════════════════════════════════╝`);
            try {
                let result;
                if (ROTATION_MODE) {
                    // Rotate through one category at a time
                    result = await (0, graph_1.runSingleCategoryCycle)(currentCategory, QUERIES_PER_CATEGORY);
                    // Move to next category
                    categoryIndex = (categoryIndex + 1) % ALL_CATEGORIES.length;
                }
                else {
                    // Legacy mode: all categories at once
                    result = await (0, graph_1.runNewsCycle)();
                }
                logger_1.default.info(`[Main] Cycle ${cycleCount} complete:`);
                logger_1.default.info(`  - Category: ${ROTATION_MODE ? currentCategory : 'ALL'}`);
                logger_1.default.info(`  - Found: ${result.stats.totalFound}`);
                logger_1.default.info(`  - Scraped: ${result.stats.totalScraped}`);
                logger_1.default.info(`  - Stored: ${result.stats.totalStored}`);
                logger_1.default.info(`  - Duplicates: ${result.stats.totalDuplicates}`);
                if (result.errors.length > 0) {
                    logger_1.default.warn(`  - Errors: ${result.errors.length}`);
                    for (const err of result.errors) {
                        logger_1.default.warn(`    → ${err}`);
                    }
                }
            }
            catch (error) {
                logger_1.default.error(`[Main] Cycle ${cycleCount} failed:`, error);
            }
            logger_1.default.info(`\n[Main] Waiting ${CYCLE_INTERVAL_MS / 1000}s before next cycle...`);
            await sleep(CYCLE_INTERVAL_MS);
        }
    }
    catch (error) {
        logger_1.default.error('[Main] Fatal error:', error);
        process.exit(1);
    }
}
function setupShutdown() {
    const shutdown = async (signal) => {
        logger_1.default.info(`\n[Main] Received ${signal}, shutting down...`);
        logger_1.default.info('[Main] Shutdown complete');
        process.exit(0);
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('uncaughtException', (error) => {
        logger_1.default.error('[Main] Uncaught Exception:', error);
    });
    process.on('unhandledRejection', (reason, promise) => {
        logger_1.default.error('[Main] Unhandled Rejection at:', promise, 'reason:', reason);
    });
}
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
setupShutdown();
main();
//# sourceMappingURL=news-agent.js.map