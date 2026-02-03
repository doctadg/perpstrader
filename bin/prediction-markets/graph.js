"use strict";
// Prediction Markets Orchestrator
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PredictionOrchestrator = exports.createInitialPredictionState = void 0;
exports.buildPredictionGraph = buildPredictionGraph;
exports.runPredictionCycle = runPredictionCycle;
const state_1 = require("./state");
Object.defineProperty(exports, "createInitialPredictionState", { enumerable: true, get: function () { return state_1.createInitialPredictionState; } });
const nodes_1 = require("./nodes");
const prediction_store_1 = __importDefault(require("../data/prediction-store"));
const execution_engine_1 = __importDefault(require("./execution-engine"));
const logger_1 = __importDefault(require("../shared/logger"));
function updateStatus(state, status) {
    const portfolio = execution_engine_1.default.getPortfolio();
    prediction_store_1.default.updateAgentStatus({
        status,
        currentCycleId: state.cycleId,
        currentStep: state.currentStep,
        lastUpdate: new Date(),
        lastCycleStart: state.cycleStartTime,
        lastCycleEnd: status === 'IDLE' || status === 'ERROR' ? new Date() : null,
        lastTradeId: state.executionResult?.id || null,
        lastTradeAt: state.executionResult?.timestamp || null,
        activeMarkets: state.activeMarkets.length,
        openPositions: portfolio.positions.length,
        metadata: {
            selectedMarket: state.selectedIdea?.marketTitle,
            tradeOutcome: state.executionResult?.outcome,
            portfolio: {
                totalValue: portfolio.totalValue,
                availableBalance: portfolio.availableBalance,
                realizedPnL: portfolio.realizedPnL,
                unrealizedPnL: portfolio.unrealizedPnL,
            },
        },
    });
}
class PredictionOrchestrator {
    async invoke(initialState) {
        let state = { ...initialState };
        updateStatus(state, 'RUNNING');
        try {
            logger_1.default.info(`[PredictionOrchestrator] Starting prediction cycle ${state.cycleId}`);
            state = { ...state, ...await (0, nodes_1.marketDataNode)(state) };
            updateStatus(state, 'RUNNING');
            if (state.activeMarkets.length === 0) {
                return {
                    ...state,
                    currentStep: 'NO_MARKETS',
                };
            }
            state = { ...state, ...await (0, nodes_1.newsContextNode)(state) };
            updateStatus(state, 'RUNNING');
            state = { ...state, ...await (0, nodes_1.theorizerNode)(state) };
            updateStatus(state, 'RUNNING');
            state = { ...state, ...await (0, nodes_1.backtesterNode)(state) };
            updateStatus(state, 'RUNNING');
            state = { ...state, ...await (0, nodes_1.ideaSelectorNode)(state) };
            updateStatus(state, 'RUNNING');
            state = { ...state, ...await (0, nodes_1.riskGateNode)(state) };
            updateStatus(state, 'RUNNING');
            if (state.shouldExecute && state.signal && state.riskAssessment?.approved) {
                state = { ...state, ...await (0, nodes_1.executorNode)(state) };
                updateStatus(state, 'RUNNING');
                if (state.executionResult) {
                    state = { ...state, ...await (0, nodes_1.learnerNode)(state) };
                    updateStatus(state, 'RUNNING');
                }
            }
            else {
                logger_1.default.info('[PredictionOrchestrator] Skipping execution (no approved signal)');
            }
            updateStatus(state, 'IDLE');
            return state;
        }
        catch (error) {
            logger_1.default.error('[PredictionOrchestrator] Cycle failed:', error);
            updateStatus(state, 'ERROR');
            return {
                ...state,
                errors: [...state.errors, `Orchestrator error: ${error}`],
                currentStep: 'ERROR',
            };
        }
    }
}
exports.PredictionOrchestrator = PredictionOrchestrator;
const orchestrator = new PredictionOrchestrator();
function buildPredictionGraph() {
    return orchestrator;
}
async function runPredictionCycle() {
    logger_1.default.info('[PredictionOrchestrator] Starting prediction cycle');
    const initialState = (0, state_1.createInitialPredictionState)();
    const result = await orchestrator.invoke(initialState);
    logger_1.default.info(`[PredictionOrchestrator] Cycle completed. Ideas: ${result.ideas.length}, Errors: ${result.errors.length}`);
    return result;
}
exports.default = buildPredictionGraph;
//# sourceMappingURL=graph.js.map