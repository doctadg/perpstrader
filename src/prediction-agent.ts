// Main Entry Point - Prediction Markets Agent
// Runs the autonomous prediction trading system (paper trading)

import { runPredictionCycle } from './prediction-markets';
import predictionStore from './data/prediction-store';
import traceStore from './data/trace-store';
import logger from './shared/logger';

const CYCLE_INTERVAL_MS = Number.parseInt(process.env.PREDICTION_CYCLE_INTERVAL_MS || '90000', 10) || 90000;

async function main() {
  logger.info('═══════════════════════════════════════════════════════════');
  logger.info('  Prediction Markets Agent - Starting');
  logger.info('═══════════════════════════════════════════════════════════');

  predictionStore.initialize();
  traceStore.initialize();

  let cycleCount = 0;
  while (true) {
    cycleCount++;
    logger.info(`\n╔══════════════════════════════════════════════════════════╗`);
    logger.info(`║  PREDICTION CYCLE ${cycleCount} - ${new Date().toISOString()}  ║`);
    logger.info(`╚══════════════════════════════════════════════════════════╝`);

    try {
      const result = await runPredictionCycle();

      const tradeExecuted = !!result.executionResult;
      traceStore.storeTrace({
        cycleId: result.cycleId,
        startTime: result.cycleStartTime,
        endTime: new Date(),
        symbol: result.selectedIdea?.marketId || 'PREDICTION_MARKETS',
        timeframe: result.selectedIdea?.timeHorizon || 'prediction',
        success: result.errors.length === 0,
        tradeExecuted,
        regime: null,
        indicators: null,
        candles: [],
        similarPatternsCount: 0,
        strategyIdeas: result.ideas,
        backtestResults: result.backtestResults,
        selectedStrategy: result.selectedIdea,
        signal: result.signal,
        riskAssessment: result.riskAssessment,
        executionResult: result.executionResult,
        thoughts: result.thoughts,
        errors: result.errors,
        agentType: 'PREDICTION',
      });

      logger.info(`[PredictionMain] Cycle complete: Ideas ${result.ideas.length}, Executed ${tradeExecuted ? 'yes' : 'no'}`);
    } catch (error) {
      logger.error('[PredictionMain] Cycle failed:', error);
    }

    logger.info(`[PredictionMain] Waiting ${CYCLE_INTERVAL_MS / 1000}s before next cycle...`);
    await sleep(CYCLE_INTERVAL_MS);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch((error) => {
  logger.error('[PredictionMain] Fatal error:', error);
  process.exit(1);
});
