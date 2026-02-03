"use strict";
// Prediction Markets Agent State
Object.defineProperty(exports, "__esModule", { value: true });
exports.createInitialPredictionState = createInitialPredictionState;
function createInitialPredictionState() {
    return {
        cycleId: crypto.randomUUID(),
        cycleStartTime: new Date(),
        currentStep: 'INIT',
        marketUniverse: [],
        activeMarkets: [],
        marketNews: {},
        ideas: [],
        backtestResults: [],
        selectedIdea: null,
        signal: null,
        riskAssessment: null,
        executionResult: null,
        portfolio: null,
        thoughts: [],
        errors: [],
        shouldExecute: false,
        shouldLearn: false,
    };
}
//# sourceMappingURL=state.js.map