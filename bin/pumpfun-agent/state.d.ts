import { PumpFunAgentState, TokenRecommendation } from '../shared/types';
export type { PumpFunAgentState, TokenRecommendation };
/**
 * Create initial state for a pump.fun analysis cycle
 */
export declare function createInitialPumpFunState(): PumpFunAgentState;
/**
 * Validate that the state is properly structured
 */
export declare function validateState(state: PumpFunAgentState): boolean;
/**
 * Calculate average score from analyzed tokens
 */
export declare function calculateAverageScore(state: PumpFunAgentState): number;
/**
 * Update statistics based on current state
 */
export declare function updateStats(state: PumpFunAgentState): PumpFunAgentState;
/**
 * Add a thought to the state
 */
export declare function addThought(state: PumpFunAgentState, thought: string): PumpFunAgentState;
/**
 * Add an error to the state
 */
export declare function addError(state: PumpFunAgentState, error: string): PumpFunAgentState;
/**
 * Update current step
 */
export declare function updateStep(state: PumpFunAgentState, step: string): PumpFunAgentState;
//# sourceMappingURL=state.d.ts.map