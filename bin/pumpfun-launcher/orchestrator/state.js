"use strict";
// Orchestrator State Management
// Manages run state transitions and persistence for the orchestrator
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRunState = createRunState;
exports.transitionStatus = transitionStatus;
exports.recordStepResult = recordStepResult;
exports.failRun = failRun;
exports.elapsedMs = elapsedMs;
exports.isTerminal = isTerminal;
exports.summarizeRun = summarizeRun;
const logger_1 = __importDefault(require("../../shared/logger"));
/**
 * Create initial run state from a validated plan
 */
function createRunState(plan) {
    return {
        runId: plan.runId,
        plan,
        status: 'pending',
        currentStepIndex: -1,
        stepResults: [],
        createdAt: Date.now(),
        signers: new Map(),
        currentSlot: 0,
    };
}
/**
 * Valid status transitions
 */
const VALID_TRANSITIONS = {
    pending: ['building', 'aborted'],
    building: ['simulated', 'failed', 'aborted'],
    simulated: ['sending', 'failed', 'aborted'],
    sending: ['confirmed', 'failed', 'aborted'],
    confirmed: [],
    failed: [],
    aborted: [],
};
/**
 * Transition run to a new status. Throws if transition is invalid.
 */
function transitionStatus(state, next) {
    const current = state.status;
    const allowed = VALID_TRANSITIONS[current];
    if (!allowed || !allowed.includes(next)) {
        throw new Error(`Invalid status transition: ${current} → ${next} (runId=${state.runId})`);
    }
    logger_1.default.info(`[Orchestrator] Run ${state.runId}: ${current} → ${next}`);
    return {
        ...state,
        status: next,
        startedAt: next === 'building' && !state.startedAt ? Date.now() : state.startedAt,
        completedAt: ['confirmed', 'failed', 'aborted'].includes(next)
            ? Date.now()
            : undefined,
    };
}
/**
 * Record a step result onto the run state
 */
function recordStepResult(state, result) {
    return {
        ...state,
        stepResults: [...state.stepResults, result],
        currentStepIndex: result.stepIndex,
    };
}
/**
 * Mark the run as failed with an error message
 */
function failRun(state, error) {
    return {
        ...transitionStatus(state, 'failed'),
        error,
        completedAt: Date.now(),
    };
}
/**
 * Get elapsed time since run started
 */
function elapsedMs(state) {
    if (!state.startedAt)
        return 0;
    return (state.completedAt || Date.now()) - state.startedAt;
}
/**
 * Check if run is in a terminal state
 */
function isTerminal(state) {
    return ['confirmed', 'failed', 'aborted'].includes(state.status);
}
/**
 * Summarize run for logging
 */
function summarizeRun(state) {
    const steps = state.stepResults;
    const succeeded = steps.filter(s => s.status === 'success').length;
    const failed = steps.filter(s => s.status === 'failed').length;
    const sigs = steps.flatMap(s => s.signatures ?? []);
    return [
        `Run ${state.runId} [${state.status}]`,
        `  Steps: ${succeeded}/${steps.length} succeeded, ${failed} failed`,
        `  Duration: ${elapsedMs(state)}ms`,
        `  Signatures: ${sigs.length}`,
        state.error ? `  Error: ${state.error}` : '',
    ].filter(Boolean).join('\n');
}
//# sourceMappingURL=state.js.map