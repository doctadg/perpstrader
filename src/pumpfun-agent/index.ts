// pump.fun Agent - Main Entry Point
// Autonomous AI agent for vetting + sniping pump.fun token launches

import 'dotenv/config';
import configManager from '../shared/config';
import logger from '../shared/logger';
import { runPumpFunCycle } from './graph';
import pumpfunStore from '../data/pumpfun-store';
import bondingCurveService from './services/bonding-curve';
import snipeService from './services/snipe-service';

const config = configManager.get();
const cycleIntervalMs = config.pumpfun?.cycleIntervalMs || 60000;

/**
 * Main function - runs continuous pump.fun analysis cycles + snipe loop
 */
async function main() {
  logger.info('═════════════════════════════════════════════════════════');
  logger.info('  pump.fun Token Agent + Sniper - Starting');
  logger.info('═════════════════════════════════════════════════════════');

  // Initialize bonding curve service
  try {
    await bondingCurveService.initialize();
    const portfolio = bondingCurveService.getPortfolioSummary();
    logger.info(`[Main] Bonding curve service: ${portfolio.mode} mode | ${portfolio.solBalance.toFixed(2)} SOL`);
  } catch (error) {
    logger.error('[Main] Failed to initialize bonding curve service:', error);
    process.exit(1);
  }

  // Initialize storage
  try {
    await pumpfunStore.initialize();
    logger.info('[Main] Storage initialized');
  } catch (error) {
    logger.error('[Main] Failed to initialize storage:', error);
    process.exit(1);
  }

  // Start WebSocket snipe listener (real-time token detection + auto-buy)
  try {
    await snipeService.start();

    // When a new token is detected via WS, feed it into the analysis pipeline
    snipeService.onToken(async (event) => {
      logger.info(`[Main] WS detected: $${event.tokenSymbol} -- feeding to analysis pipeline`);
    });

    // Log snipe decisions
    snipeService.onSnipe((candidate) => {
      const emoji = candidate.buyExecuted ? '[SNIPED]' : '[WATCH]';
      logger.info(
        `${emoji} $${candidate.event.tokenSymbol} | Score: ${candidate.score.toFixed(2)} | ${candidate.recommendation}`
      );
    });

  } catch (error) {
    logger.error('[Main] Failed to start snipe service:', error);
    // Continue without snipe service -- analysis pipeline still works
  }

  // Publish start event
  try {
    const messageBus = (await import('../shared/message-bus')).default;
    if (!messageBus.isConnected) {
      await messageBus.connect();
    }
    await messageBus.publish('pumpfun:cycle:start', {
      timestamp: new Date(),
      mode: bondingCurveService.isPaperMode() ? 'PAPER' : 'LIVE',
      config: {
        subscribeDurationMs: config.pumpfun?.subscribeDurationMs,
        minScoreThreshold: config.pumpfun?.minScoreThreshold,
      },
    });
  } catch (error) {
    logger.warn('[Main] Failed to publish start event:', error);
  }

  let cycleCount = 0;

  // Main analysis loop (separate from the real-time snipe listener)
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

      // Snipe status
      const snipeStatus = snipeService.getStatus();
      if (snipeStatus.running) {
        logger.info(`[Sniper] Positions: ${snipeStatus.openPositions} | Queue: ${snipeStatus.queueDepth} | Hour: ${snipeStatus.snipesThisHour}/${snipeStatus.maxSnipesPerHour}`);
        const portfolio = bondingCurveService.getPortfolioSummary();
        logger.info(`[Portfolio] ${portfolio.mode} | Balance: ${portfolio.solBalance.toFixed(2)} SOL | Invested: ${portfolio.totalInvested.toFixed(2)} SOL | Realized: ${portfolio.totalRealized.toFixed(4)} SOL`);
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

  // Stop snipe service
  snipeService.stop();

  // Log final portfolio
  const portfolio = bondingCurveService.getPortfolioSummary();
  logger.info(`[Portfolio] Final: ${portfolio.solBalance.toFixed(2)} SOL | ${portfolio.openPositions} positions | Realized: ${portfolio.totalRealized.toFixed(4)} SOL`);

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
