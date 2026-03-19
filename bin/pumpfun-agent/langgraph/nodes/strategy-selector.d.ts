import { AgentState } from '../state';
/**
 * Strategy Selector Node
 * Ranks strategies by risk-adjusted returns and selects the best one
 *
 * ENHANCED: Added minimum quality thresholds to prevent spam from untested strategies
 */
export declare function strategySelectorNode(state: AgentState): Promise<Partial<AgentState>>;
export default strategySelectorNode;
//# sourceMappingURL=strategy-selector.d.ts.map