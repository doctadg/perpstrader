"use strict";
// pump.fun Agent State Management
// Manages the state of the pump.fun token analysis pipeline
Object.defineProperty(exports, "__esModule", { value: true });
exports.createInitialPumpFunState = createInitialPumpFunState;
exports.validateState = validateState;
exports.calculateAverageScore = calculateAverageScore;
exports.updateStats = updateStats;
exports.addThought = addThought;
exports.addError = addError;
exports.updateStep = updateStep;
const uuid_1 = require("uuid");
/**
 * Create initial state for a pump.fun analysis cycle
 */
function createInitialPumpFunState() {
    return {
        cycleId: (0, uuid_1.v4)(),
        cycleStartTime: new Date(),
        currentStep: 'INIT',
        discoveredTokens: [],
        queuedTokens: [],
        analyzedTokens: [],
        highConfidenceTokens: [],
        storedCount: 0,
        duplicateCount: 0,
        thoughts: [],
        errors: [],
        stats: {
            totalDiscovered: 0,
            totalAnalyzed: 0,
            totalStored: 0,
            totalDuplicates: 0,
            averageScore: 0,
            byRecommendation: {
                STRONG_BUY: 0,
                BUY: 0,
                HOLD: 0,
                AVOID: 0,
                STRONG_AVOID: 0,
            },
        },
    };
}
/**
 * Validate that the state is properly structured
 */
function validateState(state) {
    return !!(state.cycleId &&
        state.cycleStartTime &&
        state.stats &&
        Array.isArray(state.discoveredTokens) &&
        Array.isArray(state.analyzedTokens));
}
/**
 * Calculate average score from analyzed tokens
 */
function calculateAverageScore(state) {
    if (state.analyzedTokens.length === 0)
        return 0;
    const sum = state.analyzedTokens.reduce((acc, t) => acc + t.overallScore, 0);
    return sum / state.analyzedTokens.length;
}
/**
 * Update statistics based on current state
 */
function updateStats(state) {
    const analyzedTokens = state.analyzedTokens;
    // Count by recommendation
    const byRecommendation = {
        STRONG_BUY: 0,
        BUY: 0,
        HOLD: 0,
        AVOID: 0,
        STRONG_AVOID: 0,
    };
    for (const token of analyzedTokens) {
        byRecommendation[token.recommendation]++;
    }
    // Calculate high confidence tokens
    const highConfidenceTokens = analyzedTokens.filter(t => t.overallScore >= 0.7);
    return {
        ...state,
        highConfidenceTokens,
        stats: {
            ...state.stats,
            totalAnalyzed: analyzedTokens.length,
            averageScore: calculateAverageScore(state),
            byRecommendation,
        },
    };
}
/**
 * Add a thought to the state
 */
function addThought(state, thought) {
    return {
        ...state,
        thoughts: [...state.thoughts, thought],
    };
}
/**
 * Add an error to the state
 */
function addError(state, error) {
    return {
        ...state,
        errors: [...state.errors, error],
    };
}
/**
 * Update current step
 */
function updateStep(state, step) {
    return {
        ...state,
        currentStep: step,
    };
}
//# sourceMappingURL=state.js.map