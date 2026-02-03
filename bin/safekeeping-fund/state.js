"use strict";
// Safekeeping Fund System - Agent State
// State management for the LangGraph-based safekeeping fund agent
Object.defineProperty(exports, "__esModule", { value: true });
exports.createInitialState = createInitialState;
exports.updateState = updateState;
exports.addThought = addThought;
exports.addError = addError;
exports.addWarning = addWarning;
exports.isStateHealthy = isStateHealthy;
exports.shouldRebalance = shouldRebalance;
exports.calculateSuccessRate = calculateSuccessRate;
exports.getStateSummary = getStateSummary;
exports.transitionTo = transitionTo;
exports.createFromPrevious = createFromPrevious;
/**
 * Create initial state for a new cycle
 */
function createInitialState(cycleNumber = 0) {
    return {
        // Cycle metadata
        cycleId: crypto.randomUUID(),
        cycleStartTime: new Date(),
        currentStep: 'INIT',
        cycleNumber,
        // Portfolio state
        positions: [],
        totalValue: 0,
        totalEffectiveAPR: 0,
        reserveBalance: 0,
        chainBreakdown: new Map(),
        dexBreakdown: new Map(),
        // Market opportunities
        poolOpportunities: [],
        bestOpportunity: null,
        topOpportunities: [],
        // Chain status
        chainStatus: new Map(),
        // Rebalancing state
        rebalanceTrigger: null,
        rebalanceActions: [],
        selectedRebalance: null,
        executionResults: [],
        pendingRebalances: [],
        // Safety & risk
        safetyChecks: [],
        isPaused: false,
        pauseReason: undefined,
        emergencyHaltActive: false,
        // AI analysis
        marketAnalysis: null,
        aiRecommendations: [],
        aiRiskLevel: 'MEDIUM',
        detectedAnomalies: [],
        marketRegime: 'SIDEWAYS',
        // APR analysis
        currentAPRBreakdown: null,
        weightedAverageAPR: 0,
        aprTrend: 'STABLE',
        historicalAPR: [],
        // Execution context
        executionPlan: null,
        estimatedGasCost: 0,
        expectedAPRImprovement: 0,
        confidence: 0,
        // Learning & metrics
        totalRebalances: 0,
        successfulRebalances: 0,
        totalGasSpent: 0,
        totalProfitGenerated: 0,
        averageRebalanceDuration: 0,
        // Logging
        thoughts: [],
        errors: [],
        warnings: [],
        // Health & monitoring
        componentHealth: new Map(),
        lastHealthCheck: null,
    };
}
/**
 * Update state with a partial state update
 * Ensures Maps are properly merged
 */
function updateState(current, updates) {
    const newState = { ...current };
    // Handle Map merges with proper type handling
    for (const key of Object.keys(updates)) {
        const value = updates[key];
        if (value instanceof Map && newState[key] instanceof Map) {
            // Merge Maps properly - spread after converting to array
            const currentMap = newState[key];
            const updateMap = value;
            const mergedMap = new Map([...Array.from(currentMap.entries()), ...Array.from(updateMap.entries())]);
            newState[key] = mergedMap;
        }
        else if (value !== undefined) {
            newState[key] = value;
        }
    }
    return newState;
}
/**
 * Add a thought to the state's thoughts array
 */
function addThought(state, thought) {
    return {
        ...state,
        thoughts: [...state.thoughts, `[${new Date().toISOString()}] ${thought}`],
    };
}
/**
 * Add an error to the state's errors array
 */
function addError(state, error) {
    return {
        ...state,
        errors: [...state.errors, `[${new Date().toISOString()}] ${error}`],
    };
}
/**
 * Add a warning to the state's warnings array
 */
function addWarning(state, warning) {
    return {
        ...state,
        warnings: [...state.warnings, `[${new Date().toISOString()}] ${warning}`],
    };
}
/**
 * Check if state indicates a healthy condition
 */
function isStateHealthy(state) {
    return (!state.isPaused &&
        !state.emergencyHaltActive &&
        state.errors.length === 0 &&
        state.detectedAnomalies.filter(a => a.severity === 'CRITICAL').length === 0);
}
/**
 * Check if rebalancing should proceed
 */
function shouldRebalance(state) {
    return (isStateHealthy(state) &&
        state.selectedRebalance !== null &&
        state.safetyChecks.every(check => check.passed));
}
/**
 * Calculate success rate
 */
function calculateSuccessRate(state) {
    if (state.totalRebalances === 0)
        return 1;
    return state.successfulRebalances / state.totalRebalances;
}
/**
 * Get state summary for logging
 */
function getStateSummary(state) {
    return `
Safekeeping Fund State Summary
===============================
Cycle ID: ${state.cycleId}
Step: ${state.currentStep}
Total Value: $${state.totalValue.toFixed(2)}
Effective APR: ${state.totalEffectiveAPR.toFixed(2)}%
Positions: ${state.positions.length}
Opportunities Found: ${state.poolOpportunities.length}
Best APR: ${state.bestOpportunity?.effectiveAPR.toFixed(2) || 0}%
Paused: ${state.isPaused}
Errors: ${state.errors.length}
Thoughts: ${state.thoughts.length}
`.trim();
}
/**
 * State transition helper for moving to next step
 */
function transitionTo(state, nextStep, thought) {
    let newState = {
        ...state,
        currentStep: nextStep,
    };
    if (thought) {
        newState = addThought(newState, thought);
    }
    return newState;
}
/**
 * Create state from previous cycle (for learning)
 */
function createFromPrevious(previous, cycleNumber) {
    const newState = createInitialState(cycleNumber);
    // Preserve historical data
    newState.historicalAPR = [...previous.historicalAPR];
    if (previous.totalEffectiveAPR > 0) {
        newState.historicalAPR.push(previous.totalEffectiveAPR);
        // Keep only last 100 data points
        if (newState.historicalAPR.length > 100) {
            newState.historicalAPR = newState.historicalAPR.slice(-100);
        }
    }
    // Preserve cumulative metrics
    newState.totalRebalances = previous.totalRebalances;
    newState.successfulRebalances = previous.successfulRebalances;
    newState.totalGasSpent = previous.totalGasSpent;
    newState.totalProfitGenerated = previous.totalProfitGenerated;
    return newState;
}
//# sourceMappingURL=state.js.map