/**
 * pumpfun-launcher — Top-level entry point
 * Starts the orchestrator loop for autonomous token launches
 */

import { Orchestrator } from './orchestrator';
import pino from 'pino';

const logger = pino({ name: 'pumpfun-launcher' });

async function main() {
  logger.info('Starting pumpfun-launcher...');

  const orchestrator = new Orchestrator({
    // Override with env vars if set
    launchIntervalMs: parseInt(process.env.LAUNCH_INTERVAL_MS || '', 10) || undefined,
    dailyBudgetSol: parseFloat(process.env.DAILY_BUDGET_SOL || '') || undefined,
    buyAmountSolPerWallet: parseFloat(process.env.BUY_AMOUNT_SOL || '') || undefined,
    numBuyerWallets: parseInt(process.env.NUM_BUYER_WALLETS || '', 10) || undefined,
    printterminalUrl: process.env.PRINTTERMINAL_URL || undefined,
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down...');
    await orchestrator.stop();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  await orchestrator.start();
}

main().catch((err) => {
  logger.fatal({ err }, 'Fatal error');
  process.exit(1);
});
