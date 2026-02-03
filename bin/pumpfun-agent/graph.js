"use strict";
// pump.fun Agent Graph Orchestrator
// Coordinates all nodes in the pump.fun token analysis pipeline
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PumpFunOrchestrator = exports.createInitialPumpFunState = void 0;
exports.buildPumpFunGraph = buildPumpFunGraph;
exports.runPumpFunCycle = runPumpFunCycle;
const state_1 = require("./state");
Object.defineProperty(exports, "createInitialPumpFunState", { enumerable: true, get: function () { return state_1.createInitialPumpFunState; } });
const nodes_1 = require("./nodes");
const logger_1 = __importDefault(require("../shared/logger"));
/**
 * pump.fun Agent Orchestrator
 * Runs the complete analysis pipeline for pump.fun tokens
 */
class PumpFunOrchestrator {
    async invoke(initialState) {
        let state = { ...initialState };
        try {
            logger_1.default.info(`[PumpFunOrchestrator] Starting pump.fun cycle ${state.cycleId}`);
            // Step 1: Subscribe to pump.fun token launches
            state = { ...state, ...await (0, nodes_1.subscribeNode)(state) };
            if (state.discoveredTokens.length === 0) {
                logger_1.default.warn('[PumpFunOrchestrator] No tokens discovered, ending cycle');
                return {
                    ...state,
                    currentStep: 'NO_TOKENS_FOUND',
                };
            }
            // Step 2: Fetch metadata for discovered tokens
            state = { ...state, ...await (0, nodes_1.fetchMetadataNode)(state) };
            if (state.queuedTokens.length === 0) {
                logger_1.default.warn('[PumpFunOrchestrator] No tokens with metadata, ending cycle');
                return {
                    ...state,
                    currentStep: 'NO_METADATA',
                };
            }
            // Step 3: Scrape websites
            state = { ...state, ...await (0, nodes_1.scrapeNode)(state) };
            // Step 4: Analyze contract security
            state = { ...state, ...await (0, nodes_1.securityNode)(state) };
            // Step 5: Run GLM comprehensive analysis
            state = { ...state, ...await (0, nodes_1.analyzeNode)(state) };
            if (state.analyzedTokens.length === 0) {
                logger_1.default.warn('[PumpFunOrchestrator] No tokens analyzed, ending cycle');
                return {
                    ...state,
                    currentStep: 'NO_ANALYSIS',
                };
            }
            // Step 6: Calculate confidence scores
            state = { ...state, ...await (0, nodes_1.scoreNode)(state) };
            // Step 7: Store results to database
            state = { ...state, ...await (0, nodes_1.storeNode)(state) };
            // Step 8: Cleanup and publish events
            state = { ...state, ...await (0, nodes_1.cleanupNode)(state) };
            return state;
        }
        catch (error) {
            logger_1.default.error('[PumpFunOrchestrator] Cycle failed:', error);
            return {
                ...state,
                errors: [...state.errors, `Orchestrator error: ${error}`],
                currentStep: 'ERROR',
            };
        }
    }
}
exports.PumpFunOrchestrator = PumpFunOrchestrator;
// Singleton instance
const orchestrator = new PumpFunOrchestrator();
function buildPumpFunGraph() {
    return orchestrator;
}
/**
 * Run a single pump.fun analysis cycle
 */
async function runPumpFunCycle() {
    logger_1.default.info('[PumpFunOrchestrator] Starting pump.fun cycle');
    const initialState = (0, state_1.createInitialPumpFunState)();
    const result = await orchestrator.invoke(initialState);
    logger_1.default.info(`[PumpFunOrchestrator] Cycle completed. ` +
        `Discovered: ${result.stats.totalDiscovered}, ` +
        `Analyzed: ${result.stats.totalAnalyzed}, ` +
        `Stored: ${result.stats.totalStored}, ` +
        `High Confidence: ${result.highConfidenceTokens.length}`);
    return result;
}
exports.default = buildPumpFunGraph;
//# sourceMappingURL=graph.js.map