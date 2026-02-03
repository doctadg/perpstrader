import { AgentState } from '../state';
/**
 * Learner Node
 * Records trade outcomes and patterns for future learning
 * This enables the system to improve over time by remembering what worked
 */
export declare function learnerNode(state: AgentState): Promise<Partial<AgentState>>;
export default learnerNode;
//# sourceMappingURL=learner.d.ts.map