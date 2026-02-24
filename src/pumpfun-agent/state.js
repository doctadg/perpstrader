"use strict";
// pump.fun Agent State Management
// Manages the state of the pump.fun token analysis pipeline
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createInitialPumpFunState = createInitialPumpFunState;
exports.validateState = validateState;
exports.calculateAverageScore = calculateAverageScore;
exports.updateStats = updateStats;
exports.addThought = addThought;
exports.addError = addError;
exports.updateStep = updateStep;
var uuid_1 = require("uuid");
var config_1 = require("../shared/config");
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
    var sum = state.analyzedTokens.reduce(function (acc, t) { return acc + t.overallScore; }, 0);
    return sum / state.analyzedTokens.length;
}
/**
 * Update statistics based on current state
 */
function updateStats(state) {
    var _a, _b;
    var analyzedTokens = state.analyzedTokens;
    var minScoreThreshold = (_b = (_a = config_1.default.get().pumpfun) === null || _a === void 0 ? void 0 : _a.minScoreThreshold) !== null && _b !== void 0 ? _b : 0.7;
    // Count by recommendation
    var byRecommendation = {
        STRONG_BUY: 0,
        BUY: 0,
        HOLD: 0,
        AVOID: 0,
        STRONG_AVOID: 0,
    };
    for (var _i = 0, analyzedTokens_1 = analyzedTokens; _i < analyzedTokens_1.length; _i++) {
        var token = analyzedTokens_1[_i];
        byRecommendation[token.recommendation]++;
    }
    // Calculate high confidence tokens
    var highConfidenceTokens = analyzedTokens.filter(function (t) { return t.overallScore >= minScoreThreshold; });
    return __assign(__assign({}, state), { highConfidenceTokens: highConfidenceTokens, stats: __assign(__assign({}, state.stats), { totalAnalyzed: analyzedTokens.length, averageScore: calculateAverageScore(state), byRecommendation: byRecommendation }) });
}
/**
 * Add a thought to the state
 */
function addThought(state, thought) {
    return __assign(__assign({}, state), { thoughts: __spreadArray(__spreadArray([], state.thoughts, true), [thought], false) });
}
/**
 * Add an error to the state
 */
function addError(state, error) {
    return __assign(__assign({}, state), { errors: __spreadArray(__spreadArray([], state.errors, true), [error], false) });
}
/**
 * Update current step
 */
function updateStep(state, step) {
    return __assign(__assign({}, state), { currentStep: step });
}
