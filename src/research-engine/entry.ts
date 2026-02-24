#!/usr/bin/env node
// Research Engine Entry Point
// Standalone process for running research orchestrator

import '../polyfills';
import 'dotenv/config';

import { researchOrchestrator } from './orchestrator';
import logger from '../shared/logger';

/**
 * Main research engine process
 */
async function main() {
    logger.info('═══════════════════════════════════════════════════════════');
    logger.info('  PerpsTrader Research Engine');
    logger.info('═══════════════════════════════════════════════════════════');

    try {
        // Start the research orchestrator
        await researchOrchestrator.start();

        logger.info('[ResearchEngine] Process running. Press Ctrl+C to stop.');

    } catch (error) {
        logger.error('[ResearchEngine] Failed to start:', error);
        process.exit(1);
    }
}

/**
 * Graceful shutdown handler
 */
function setupShutdown() {
    const shutdown = async (signal: string) => {
        logger.info(`\n[ResearchEngine] Received ${signal}, shutting down...`);

        try {
            researchOrchestrator.stop();
            logger.info('[ResearchEngine] Shutdown complete');
            process.exit(0);
        } catch (error) {
            logger.error('[ResearchEngine] Error during shutdown:', error);
            process.exit(1);
        }
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    process.on('uncaughtException', (error) => {
        logger.error('[ResearchEngine] Uncaught Exception:', error);
        process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
        logger.error('[ResearchEngine] Unhandled Rejection at:', promise, 'reason:', reason);
    });
}

// Setup shutdown handlers
setupShutdown();

// Start the engine
main();
