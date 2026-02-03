"use strict";
// Main Entry Point - Prediction Markets Agent
// Runs the autonomous prediction trading system (paper trading)
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const prediction_markets_1 = require("./prediction-markets");
const prediction_store_1 = __importDefault(require("./data/prediction-store"));
const trace_store_1 = __importDefault(require("./data/trace-store"));
const logger_1 = __importDefault(require("./shared/logger"));
const CYCLE_INTERVAL_MS = Number.parseInt(process.env.PREDICTION_CYCLE_INTERVAL_MS || '90000', 10) || 90000;
async function main() {
    logger_1.default.info('═══════════════════════════════════════════════════════════');
    logger_1.default.info('  Prediction Markets Agent - Starting');
    logger_1.default.info('═══════════════════════════════════════════════════════════');
    prediction_store_1.default.initialize();
    trace_store_1.default.initialize();
    let cycleCount = 0;
    while (true) {
        cycleCount++;
        logger_1.default.info(`\n╔══════════════════════════════════════════════════════════╗`);
        logger_1.default.info(`║  PREDICTION CYCLE ${cycleCount} - ${new Date().toISOString()}  ║`);
        logger_1.default.info(`╚══════════════════════════════════════════════════════════╝`);
        try {
            const result = await (0, prediction_markets_1.runPredictionCycle)();
            const tradeExecuted = !!result.executionResult;
            trace_store_1.default.storeTrace({
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
            logger_1.default.info(`[PredictionMain] Cycle complete: Ideas ${result.ideas.length}, Executed ${tradeExecuted ? 'yes' : 'no'}`);
        }
        catch (error) {
            logger_1.default.error('[PredictionMain] Cycle failed:', error);
        }
        logger_1.default.info(`[PredictionMain] Waiting ${CYCLE_INTERVAL_MS / 1000}s before next cycle...`);
        await sleep(CYCLE_INTERVAL_MS);
    }
}
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
main().catch((error) => {
    logger_1.default.error('[PredictionMain] Fatal error:', error);
    process.exit(1);
});
//# sourceMappingURL=prediction-agent.js.map