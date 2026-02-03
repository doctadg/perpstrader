import { AgentState } from '../state';
/**
 * Pattern Recall Node
 * Searches for similar historical market patterns in the vector store
 * This enables the system to learn from past market conditions and outcomes
 */
export declare function patternRecallNode(state: AgentState): Promise<Partial<AgentState>>;
export default patternRecallNode;
//# sourceMappingURL=pattern-recall.d.ts.map