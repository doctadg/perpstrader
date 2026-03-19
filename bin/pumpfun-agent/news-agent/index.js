"use strict";
// Main Entry Point - News Agent
// Runs the autonomous newsfeed system 24/7
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const graph_1 = require("./graph");
const news_store_1 = __importDefault(require("../data/news-store"));
const logger_1 = __importDefault(require("../shared/logger"));
const CYCLE_INTERVAL_MS = Number.parseInt(process.env.NEWS_CYCLE_INTERVAL_MS || '60000', 10) || 60000;
async function main() {
    logger_1.default.info('═══════════════════════════════════════════════════════════');
    logger_1.default.info('  Global Newsfeed Agent - Starting');
    logger_1.default.info('═══════════════════════════════════════════════════════════');
    try {
        logger_1.default.info('[Main] Initializing services...');
        await news_store_1.default.initialize();
        const stats = await news_store_1.default.getStats();
        logger_1.default.info(`[Main] News store initialized: ${stats.total} articles`);
        logger_1.default.info(`[Main] Cycle interval: ${CYCLE_INTERVAL_MS / 1000}s`);
        logger_1.default.info('');
        await sleep(3000);
        let cycleCount = 0;
        while (true) {
            cycleCount++;
            logger_1.default.info(`\n╔══════════════════════════════════════════════════════════╗`);
            logger_1.default.info(`║  NEWS CYCLE ${cycleCount} - ${new Date().toISOString()}  ║`);
            logger_1.default.info(`╚══════════════════════════════════════════════════════════╝`);
            try {
                const result = await (0, graph_1.runNewsCycle)();
                logger_1.default.info(`[Main] Cycle ${cycleCount} complete:`);
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
//# sourceMappingURL=index.js.map