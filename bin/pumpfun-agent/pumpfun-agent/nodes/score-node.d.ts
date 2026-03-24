import { PumpFunAgentState } from '../../shared/types';
/**
 * Calculate final confidence scores for all analyzed tokens
 * using a multi-factor heuristic that works without LLM analysis.
 */
export declare function scoreNode(state: PumpFunAgentState): Promise<Partial<PumpFunAgentState>>;
export { addThought, updateStep } from '../state';
