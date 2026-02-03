// pump.fun Agent - Main Entry Point
// Autonomous AI agent for vetting pump.fun token launches

import 'dotenv/config';
import configManager from '../shared/config';
import logger from '../shared/logger';
import { runPumpFunCycle } from './graph';
import pumpfunStore from '../data/pumpfun-store';

const config = configManager.get();
const cycleIntervalMs = config.pumpfun?.cycleIntervalMs || 60000;

/**
 * Main function - runs continuous pump.fun analysis cycles
 */
async function main() {
  logger.info('═════════════════════════════════════════════════════════');
  logger.info('  pump.fun Token Analysis Agent - Starting');
  logger.info('═════════════════════════════════════════════════════════');

  // Initialize storage
  try {
    await pumpfunStore.initialize();
    logger.info('[Main] Storage initialized');
  } catch (error) {
    logger.error('[Main] Failed to initialize storage:', error);
    process.exit(1);
  }

  // Publish start event
  try {
    const messageBus = (await import('../shared/message-bus')).default;
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
  } catch (error) {
    logger.warn('[Main] Failed to publish start event:', error);
  }

  let cycleCount = 0;

  // Main loop
  while (true) {
    cycleCount++;

    logger.info(``);
    logger.info(`╔════════════════════════════════════════════════════════╗`);
    logger.info(`║  PUMPFUN CYCLE ${cycleCount} - ${new Date().toISOString()}  ║`);
    logger.info(`╚════════════════════════════════════════════════════════╝`);

    try {
      const result = await runPumpFunCycle();

      logger.info(``);
      logger.info(`[Main] Cycle ${cycleCount} Summary:`);
      logger.info(`  ├─ Discovered:   ${result.stats.totalDiscovered}`);
      logger.info(`  ├─ Analyzed:     ${result.stats.totalAnalyzed}`);
      logger.info(`  ├─ Stored:       ${result.stats.totalStored}`);
      logger.info(`  ├─ Duplicates:   ${result.stats.totalDuplicates}`);
      logger.info(`  ├─ High Conf:    ${result.highConfidenceTokens.length}`);
      logger.info(`  ├─ Avg Score:    ${result.stats.averageScore.toFixed(2)}`);
      logger.info(`  └─ Step:         ${result.currentStep}`);

      // Log recommendation breakdown
      const rec = result.stats.byRecommendation;
      logger.info(`[Main] Recommendations: STRONG_BUY:${rec.STRONG_BUY} BUY:${rec.BUY} HOLD:${rec.HOLD} AVOID:${rec.AVOID} STRONG_AVOID:${rec.STRONG_AVOID}`);

      // Log high confidence tokens
      if (result.highConfidenceTokens.length > 0) {
        logger.info(`[Main] High Confidence Tokens:`);
        for (const token of result.highConfidenceTokens) {
          logger.info(`  - $${token.token.symbol} (${token.overallScore.toFixed(2)}) ${token.recommendation}`);
        }
      }

    } catch (error) {
      logger.error(`[Main] Cycle ${cycleCount} failed:`, error);
    }

    // Wait before next cycle
    logger.info(``);
    logger.info(`[Main] Waiting ${cycleIntervalMs / 1000}s before next cycle...`);

    await sleep(cycleIntervalMs);
  }
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Graceful shutdown handler
 */
async function shutdown(signal: string) {
  logger.info(``);
  logger.info(`[Main] Received ${signal}, shutting down...`);

  // Close storage
  pumpfunStore.close();

  // Publish shutdown event
  try {
    const messageBus = (await import('../shared/message-bus')).default;
    await messageBus.publish('pumpfun:cycle:complete', {
      timestamp: new Date(),
      shutdown: true,
    });
    await messageBus.disconnect();
  } catch (error) {
    // Ignore errors during shutdown
  }

  logger.info('[Main] Shutdown complete');
  process.exit(0);
}

// Register signal handlers
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('[Main] Uncaught exception:', error);
  shutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('[Main] Unhandled rejection at:', promise, 'reason:', reason);
});

// Start the agent
main().catch((error) => {
  logger.error('[Main] Fatal error:', error);
  process.exit(1);
});
