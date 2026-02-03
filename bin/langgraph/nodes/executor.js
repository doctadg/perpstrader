"use strict";
// Executor Node
// Executes approved trading signals
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.executorNode = executorNode;
const execution_engine_1 = __importDefault(require("../../execution-engine/execution-engine"));
const data_manager_1 = __importDefault(require("../../data-manager/data-manager"));
const logger_1 = __importDefault(require("../../shared/logger"));
/**
 * Executor Node
 * Executes approved trading signals through the execution engine
 */
async function executorNode(state) {
    logger_1.default.info(`[ExecutorNode] Executing signal for ${state.signal?.symbol}`);
    if (!state.signal || !state.riskAssessment || !state.shouldExecute) {
        return {
            currentStep: 'EXECUTION_SKIPPED',
            executionResult: null,
            shouldLearn: false,
            thoughts: [...state.thoughts, 'No signal to execute'],
        };
    }
    try {
        const signal = state.signal;
        const riskAssessment = state.riskAssessment;
        logger_1.default.info(`[ExecutorNode] Executing: ${signal.action} ${signal.symbol} x${signal.size.toFixed(4)}`);
        // Execute through execution engine
        const trade = await execution_engine_1.default.executeSignal(signal, riskAssessment);
        // Save trade to database
        await data_manager_1.default.saveTrade(trade);
        const isPaperTrade = !execution_engine_1.default.isConfigured() || process.env.PAPER_TRADING === 'true';
        const modeLabel = isPaperTrade ? '[PAPER]' : '[LIVE]';
        logger_1.default.info(`${modeLabel} Trade executed: ${trade.side} ${trade.size} ${trade.symbol} @ ${trade.price}`);
        return {
            currentStep: 'EXECUTION_COMPLETE',
            executionResult: trade,
            shouldLearn: true,
            thoughts: [
                ...state.thoughts,
                `${modeLabel} Executed: ${trade.side} ${trade.size.toFixed(4)} ${trade.symbol} @ ${trade.price.toFixed(2)}`,
                `Trade ID: ${trade.id}`,
                `Status: ${trade.status}`,
            ],
        };
    }
    catch (error) {
        logger_1.default.error('[ExecutorNode] Execution failed:', error);
        return {
            currentStep: 'EXECUTION_ERROR',
            executionResult: null,
            shouldLearn: false,
            errors: [...state.errors, `Execution error: ${error}`],
        };
    }
}
exports.default = executorNode;
//# sourceMappingURL=executor.js.map