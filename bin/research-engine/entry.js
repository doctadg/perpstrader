#!/usr/bin/env node
"use strict";
// Research Engine Entry Point
// Standalone process for running research orchestrator
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("../polyfills");
require("dotenv/config");
const orchestrator_1 = require("./orchestrator");
const logger_1 = __importDefault(require("../shared/logger"));
/**
 * Main research engine process
 */
async function main() {
    logger_1.default.info('═══════════════════════════════════════════════════════════');
    logger_1.default.info('  PerpsTrader Research Engine');
    logger_1.default.info('═══════════════════════════════════════════════════════════');
    try {
        // Start the research orchestrator
        await orchestrator_1.researchOrchestrator.start();
        logger_1.default.info('[ResearchEngine] Process running. Press Ctrl+C to stop.');
    }
    catch (error) {
        logger_1.default.error('[ResearchEngine] Failed to start:', error);
        process.exit(1);
    }
}
/**
 * Graceful shutdown handler
 */
function setupShutdown() {
    const shutdown = async (signal) => {
        logger_1.default.info(`\n[ResearchEngine] Received ${signal}, shutting down...`);
        try {
            orchestrator_1.researchOrchestrator.stop();
            logger_1.default.info('[ResearchEngine] Shutdown complete');
            process.exit(0);
        }
        catch (error) {
            logger_1.default.error('[ResearchEngine] Error during shutdown:', error);
            process.exit(1);
        }
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('uncaughtException', (error) => {
        logger_1.default.error('[ResearchEngine] Uncaught Exception:', error);
        process.exit(1);
    });
    process.on('unhandledRejection', (reason, promise) => {
        logger_1.default.error('[ResearchEngine] Unhandled Rejection at:', promise, 'reason:', reason);
    });
}
// Setup shutdown handlers
setupShutdown();
// Start the engine
main();
//# sourceMappingURL=entry.js.map