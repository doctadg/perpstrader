"use strict";
// Prediction Market Executor Node
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.executorNode = executorNode;
const execution_engine_1 = __importDefault(require("../execution-engine"));
const logger_1 = __importDefault(require("../../shared/logger"));
async function executorNode(state) {
    logger_1.default.info('[PredictionExecutor] Executing prediction trade');
    if (!state.shouldExecute || !state.signal || !state.riskAssessment?.approved) {
        return {
            currentStep: 'EXECUTION_SKIPPED',
            executionResult: null,
            thoughts: [...state.thoughts, 'Execution skipped (no approved signal)'],
        };
    }
    const marketTitle = state.activeMarkets.find(m => m.id === state.signal?.marketId)?.title || 'Unknown Market';
    try {
        const trade = await execution_engine_1.default.executeSignal(state.signal, state.riskAssessment, marketTitle);
        return {
            currentStep: 'EXECUTION_COMPLETE',
            executionResult: trade,
            portfolio: execution_engine_1.default.getPortfolio(),
            thoughts: [
                ...state.thoughts,
                `Executed ${trade.side} ${trade.outcome} on ${trade.marketTitle}`,
            ],
        };
    }
    catch (error) {
        logger_1.default.error('[PredictionExecutor] Execution failed:', error);
        return {
            currentStep: 'EXECUTION_ERROR',
            executionResult: null,
            errors: [...state.errors, `Execution error: ${error}`],
        };
    }
}
exports.default = executorNode;
//# sourceMappingURL=executor.js.map