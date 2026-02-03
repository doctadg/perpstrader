import { PumpFunAgentState } from '../../shared/types';
/**
 * Calculate final confidence scores for all analyzed tokens
 */
export declare function scoreNode(state: PumpFunAgentState): Promise<Partial<PumpFunAgentState>>;
export { addThought, updateStep } from '../state';
//# sourceMappingURL=score-node.d.ts.map