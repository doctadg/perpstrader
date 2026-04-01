import { Plan, RunStatus } from '../../shared/types';
import { RunState, StepResult } from './types';
/**
 * Create initial run state from a validated plan
 */
export declare function createRunState(plan: Plan): RunState;
/**
 * Transition run to a new status. Throws if transition is invalid.
 */
export declare function transitionStatus(state: RunState, next: RunStatus): RunState;
/**
 * Record a step result onto the run state
 */
export declare function recordStepResult(state: RunState, result: StepResult): RunState;
/**
 * Mark the run as failed with an error message
 */
export declare function failRun(state: RunState, error: string): RunState;
/**
 * Get elapsed time since run started
 */
export declare function elapsedMs(state: RunState): number;
/**
 * Check if run is in a terminal state
 */
export declare function isTerminal(state: RunState): boolean;
/**
 * Summarize run for logging
 */
export declare function summarizeRun(state: RunState): string;
//# sourceMappingURL=state.d.ts.map