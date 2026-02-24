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
        symbol: symbol,
        timeframe: timeframe,
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
    cycleId: { default: function () { return ''; } },
    cycleStartTime: { default: function () { return new Date(); } },
    currentStep: { default: function () { return 'INIT'; } },
    symbol: { default: function () { return 'BTC'; } },
    timeframe: { default: function () { return '1h'; } },
    indicators: { default: function () { return null; } },
    regime: { default: function () { return null; } },
    patternBias: { default: function () { return null; } },
    patternAvgReturn: { default: function () { return 0; } },
    portfolio: { default: function () { return null; } },
    selectedStrategy: { default: function () { return null; } },
    signal: { default: function () { return null; } },
    riskAssessment: { default: function () { return null; } },
    executionResult: { default: function () { return null; } },
    shouldExecute: { default: function () { return false; } },
    shouldLearn: { default: function () { return false; } },
    // Array channels (append)
    candles: { default: function () { return []; } },
    similarPatterns: { default: function () { return []; } },
    strategyIdeas: { default: function () { return []; } },
    backtestResults: { default: function () { return []; } },
    thoughts: { default: function () { return []; } },
    errors: { default: function () { return []; } },
};
