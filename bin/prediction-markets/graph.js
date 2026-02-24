"use strict";
// Prediction Markets Orchestrator (Hardened)
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
const position_reconciler_1 = __importDefault(require("./position-reconciler"));
const risk_manager_1 = __importDefault(require("./risk-manager"));
const alerting_service_1 = __importDefault(require("./alerting-service"));
const logger_1 = __importDefault(require("../shared/logger"));
function updateStatus(state, status) {
    const portfolio = execution_engine_1.default.getPortfolio();
    const selectedIntel = state.selectedIdea ? state.marketIntel[state.selectedIdea.marketId] : null;
    const intelList = Object.values(state.marketIntel || {});
    const marketsWithNews = intelList.filter(intel => intel.linkedNewsCount > 0).length;
    const marketsWithHeat = intelList.filter(intel => intel.linkedClusterCount > 0).length;
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
            marketIntel: {
                selected: selectedIntel,
                coverage: {
                    marketsWithNews,
                    marketsWithHeat,
                },
            },
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
    stopLossCheckInterval = null;
    reconciliationInterval = null;
    constructor() {
        this.startBackgroundTasks();
    }
    startBackgroundTasks() {
        // Check stop losses every 30 seconds
        this.stopLossCheckInterval = setInterval(() => {
            this.checkStopLosses();
        }, 30000);
        // Reconcile positions every 5 minutes
        this.reconciliationInterval = setInterval(() => {
            position_reconciler_1.default.reconcile();
        }, 300000);
    }
    async checkStopLosses() {
        try {
            const exits = execution_engine_1.default.checkStopLosses();
            for (const exit of exits) {
                logger_1.default.warn(`[PredictionOrchestrator] Stop loss triggered: ${exit.position.marketTitle}`);
                // Send alert
                await alerting_service_1.default.stopLossTriggered(exit.position, exit.exitPrice, exit.pnl);
                // Execute stop loss (in real implementation)
                // For now, just log it - would need to create a sell signal
            }
        }
        catch (error) {
            logger_1.default.error('[PredictionOrchestrator] Stop loss check failed:', error);
        }
    }
    async invoke(initialState) {
        let state = { ...initialState };
        updateStatus(state, 'RUNNING');
        try {
            logger_1.default.info(`[PredictionOrchestrator] Starting prediction cycle ${state.cycleId}`);
            // Check emergency stop
            if (risk_manager_1.default.isEmergencyStop()) {
                logger_1.default.error('[PredictionOrchestrator] 🚨 EMERGENCY STOP ACTIVE - skipping cycle');
                return {
                    ...state,
                    currentStep: 'EMERGENCY_STOP',
                    errors: [...state.errors, 'Emergency stop is active'],
                };
            }
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
            // Send error alert
            await alerting_service_1.default.error(error, 'Prediction cycle');
            updateStatus(state, 'ERROR');
            return {
                ...state,
                errors: [...state.errors, `Orchestrator error: ${error}`],
                currentStep: 'ERROR',
            };
        }
    }
    /**
     * Trigger emergency stop - halt all trading
     */
    triggerEmergencyStop(reason) {
        risk_manager_1.default.triggerEmergencyStop(reason);
        alerting_service_1.default.emergencyStop(reason, execution_engine_1.default.getPortfolio());
    }
    /**
     * Reset emergency stop
     */
    resetEmergencyStop() {
        risk_manager_1.default.resetEmergencyStop();
    }
    /**
     * Emergency close all positions
     */
    async emergencyCloseAll() {
        await execution_engine_1.default.emergencyCloseAll();
    }
    /**
     * Get system health status
     */
    getHealth() {
        return {
            orchestrator: risk_manager_1.default.isEmergencyStop() ? 'CRITICAL' : 'HEALTHY',
            emergencyStop: risk_manager_1.default.isEmergencyStop(),
            reconciliation: position_reconciler_1.default.getHealth(),
            execution: execution_engine_1.default.getHealth(),
        };
    }
    /**
     * Clean up resources
     */
    destroy() {
        if (this.stopLossCheckInterval) {
            clearInterval(this.stopLossCheckInterval);
        }
        if (this.reconciliationInterval) {
            clearInterval(this.reconciliationInterval);
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