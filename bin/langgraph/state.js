"use strict";
// LangGraph Agent State Definition
// This defines the shared state that flows through all nodes in the graph
Object.defineProperty(exports, "__esModule", { value: true });
exports.stateChannels = void 0;
exports.createInitialState = createInitialState;
/**
 * Creates an initial empty state for a new cycle
 */
function createInitialState(symbol, timeframe) {
    return {
        cycleId: crypto.randomUUID(),
        cycleStartTime: new Date(),
        currentStep: 'INIT',
        symbol,
        timeframe,
        candles: [],
        indicators: null,
        regime: null,
        similarPatterns: [],
        patternBias: null,
        patternAvgReturn: 0,
        portfolio: null,
        strategyIdeas: [],
        backtestResults: [],
        selectedStrategy: null,
        signal: null,
        riskAssessment: null,
        executionResult: null,
        thoughts: [],
        errors: [],
        shouldExecute: false,
        shouldLearn: false,
    };
}
/**
 * Channels define how state updates are merged
 * For arrays, we typically want to append; for objects, we want to replace
 */
exports.stateChannels = {
    // Replace channels (last write wins)
    cycleId: { default: () => '' },
    cycleStartTime: { default: () => new Date() },
    currentStep: { default: () => 'INIT' },
    symbol: { default: () => 'BTC' },
    timeframe: { default: () => '1h' },
    indicators: { default: () => null },
    regime: { default: () => null },
    patternBias: { default: () => null },
    patternAvgReturn: { default: () => 0 },
    portfolio: { default: () => null },
    selectedStrategy: { default: () => null },
    signal: { default: () => null },
    riskAssessment: { default: () => null },
    executionResult: { default: () => null },
    shouldExecute: { default: () => false },
    shouldLearn: { default: () => false },
    // Array channels (append)
    candles: { default: () => [] },
    similarPatterns: { default: () => [] },
    strategyIdeas: { default: () => [] },
    backtestResults: { default: () => [] },
    thoughts: { default: () => [] },
    errors: { default: () => [] },
};
//# sourceMappingURL=state.js.map