#!/usr/bin/env node
/**
 * Funding Rate Update Script (One-shot)
 *
 * Quick update script for use with cron:
 * Run every 5 minutes via cron
 */

import fundingArbitrageScanner from '../market-ingester/funding-arbitrage-scanner';
import logger from '../shared/logger';
import * as dotenv from 'dotenv';

dotenv.config();

const EXTREME_THRESHOLD = 0.5; // 50% APR

async function main() {
  logger.info('[FundingUpdate] Starting one-shot funding rate update...');

  try {
    // Initialize scanner
    await fundingArbitrageScanner.initialize();

    // Scan all funding rates
    const rates = await fundingArbitrageScanner.scanAllFundingRates();
    logger.info(`[FundingUpdate] Scanned ${rates.length} markets`);

    // Identify opportunities
    const opportunities = await fundingArbitrageScanner.identifyOpportunities(EXTREME_THRESHOLD);
    logger.info(`[FundingUpdate] Found ${opportunities.length} opportunities`);

    // Compare similar assets
    await fundingArbitrageScanner.compareSimilarAssets();

    // Log extreme opportunities
    const extreme = opportunities.filter(o => Math.abs(o.annualizedRate) >= 100);
    if (extreme.length > 0) {
      logger.warn(`[FundingUpdate] ${extreme.length} EXTREME opportunities detected!`);
      for (const opp of extreme) {
        logger.warn(`[FundingUpdate] ${opp.type.toUpperCase()} ${opp.symbol}: ${opp.annualizedRate.toFixed(2)}% APR`);
      }
    }

    // Get stats
    const stats = await fundingArbitrageScanner.getFundingStats();
    logger.info(`[FundingUpdate] Stats: Avg=${stats.averageFunding.toFixed(2)}%, Extreme=${stats.extremeMarketsCount} markets`);

    logger.info('[FundingUpdate] Update completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error('[FundingUpdate] Update failed:', error);
    process.exit(1);
  }
}

main();