/**
 * AutoResearch Bridge — Standalone Entry Point
 * 
 * Runs the AutoResearch-PerpsTrader bridge as an independent service.
 * Spawns Python experiment agents, monitors results, feeds improvements
 * back into the PerpsTrader research pipeline.
 * 
 * Control via: research-control.sh autoresearch [start|stop|status|trigger|stats]
 * Environment vars (also settable in systemd unit):
 *   AUTORESEARCH_INTERVAL_MINUTES   — time between experiment cycles (default: 60)
 *   AUTORESEARCH_AUTO_ADOPT_THRESHOLD — min Sharpe ratio to auto-adopt (default: 1.5)
 *   AUTORESEARCH_MAX_CONCURRENT     — max parallel experiments (default: 2)
 *   AUTORESEARCH_TIMEOUT_SECONDS    — max experiment runtime (default: 3600)
 *   AUTORESEARCH_DIR                — path to autoresearch repo (default: ../../autoresearch)
 *   AUTORESEARCH_PYTHON             — python executable (default: python3)
 */

import path from 'path';
import { AutoResearchBridge, AutoResearchBridgeConfig } from './autoresearch-bridge';
import { experimentStore } from './experiment-store';

const logger = {
  info: (...args: any[]) => console.log('[INFO]', ...args),
  warn: (...args: any[]) => console.warn('[WARN]', ...args),
  error: (...args: any[]) => console.error('[ERROR]', ...args),
};

function loadConfig(): AutoResearchBridgeConfig {
  const intervalMinutes = parseInt(process.env.AUTORESEARCH_INTERVAL_MINUTES || '60', 10);
  return {
    experimentInterval: intervalMinutes * 60 * 1000,
    autoAdoptThreshold: parseFloat(process.env.AUTORESEARCH_AUTO_ADOPT_THRESHOLD || '1.5'),
    adoptMetric: 'sharpe_ratio',
    maxConcurrentExperiments: parseInt(process.env.AUTORESEARCH_MAX_CONCURRENT || '2', 10),
    gpuBudget: 0,
    triggerChannels: ['research:autoresearch:trigger'],
    experimentTimeoutMs: parseInt(process.env.AUTORESEARCH_TIMEOUT_SECONDS || '3600', 10) * 1000,
    resultPollIntervalMs: 10 * 1000,
  };
}

async function main(): Promise<void> {
  const config = loadConfig();
  
  logger.info('AutoResearch Bridge starting...');
  logger.info(`  Experiment interval: ${config.experimentInterval / 60000}min`);
  logger.info(`  Auto-adopt threshold (Sharpe): ${config.autoAdoptThreshold}`);
  logger.info(`  Max concurrent: ${config.maxConcurrentExperiments}`);
  logger.info(`  AutoResearch dir: ${process.env.AUTORESEARCH_DIR || path.join(__dirname, '../../autoresearch')}`);

  const bridge = new AutoResearchBridge(config);
  
  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down...`);
    await bridge.stop();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception:', err);
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection:', reason);
  });

  try {
    await bridge.start();
    logger.info('AutoResearch Bridge started successfully');
    
    // Health check loop — restart if bridge crashes
    setInterval(async () => {
      const status = bridge.getStatus();
      if (!status.isRunning) {
        logger.error('Bridge stopped unexpectedly, restarting...');
        try {
          await bridge.start();
          logger.info('Bridge restarted successfully');
        } catch (err) {
          logger.error('Failed to restart bridge:', err);
        }
      }
    }, 60000);
  } catch (err) {
    logger.error('Failed to start AutoResearch Bridge:', err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
