// Main Entry Point - News Agent
// Runs the autonomous newsfeed system 24/7

import { runNewsCycle } from './graph';
import newsStore from '../data/news-store';
import logger from '../shared/logger';

const CYCLE_INTERVAL_MS = Number.parseInt(process.env.NEWS_CYCLE_INTERVAL_MS || '60000', 10) || 60000;

async function main() {
  logger.info('═══════════════════════════════════════════════════════════');
  logger.info('  Global Newsfeed Agent - Starting');
  logger.info('═══════════════════════════════════════════════════════════');

  try {
    logger.info('[Main] Initializing services...');

    await newsStore.initialize();
    const stats = await newsStore.getStats();
    logger.info(`[Main] News store initialized: ${stats.total} articles`);

    logger.info(`[Main] Cycle interval: ${CYCLE_INTERVAL_MS / 1000}s`);
    logger.info('');

    await sleep(3000);

    let cycleCount = 0;
    while (true) {
      cycleCount++;
      logger.info(`\n╔══════════════════════════════════════════════════════════╗`);
      logger.info(`║  NEWS CYCLE ${cycleCount} - ${new Date().toISOString()}  ║`);
      logger.info(`╚══════════════════════════════════════════════════════════╝`);

      try {
        const result = await runNewsCycle();

        logger.info(`[Main] Cycle ${cycleCount} complete:`);
        logger.info(`  - Found: ${result.stats.totalFound}`);
        logger.info(`  - Scraped: ${result.stats.totalScraped}`);
        logger.info(`  - Stored: ${result.stats.totalStored}`);
        logger.info(`  - Duplicates: ${result.stats.totalDuplicates}`);

        if (result.errors.length > 0) {
          logger.warn(`  - Errors: ${result.errors.length}`);
          for (const err of result.errors) {
            logger.warn(`    → ${err}`);
          }
        }
      } catch (error) {
        logger.error(`[Main] Cycle ${cycleCount} failed:`, error);
      }

      logger.info(`\n[Main] Waiting ${CYCLE_INTERVAL_MS / 1000}s before next cycle...`);
      await sleep(CYCLE_INTERVAL_MS);
    }
  } catch (error) {
    logger.error('[Main] Fatal error:', error);
    process.exit(1);
  }
}

function setupShutdown() {
  const shutdown = async (signal: string) => {
    logger.info(`\n[Main] Received ${signal}, shutting down...`);
    logger.info('[Main] Shutdown complete');
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  process.on('uncaughtException', (error) => {
    logger.error('[Main] Uncaught Exception:', error);
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('[Main] Unhandled Rejection at:', promise, 'reason:', reason);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

setupShutdown();
main();
