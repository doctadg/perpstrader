import type { SafekeepingFundState } from '../state';
/**
 * AI Analysis Node
 * Leverages OpenRouter to analyze market conditions and provide recommendations
 */
export declare function aiAnalysisNode(state: SafekeepingFundState): Promise<Partial<SafekeepingFundState>>;
/**
 * Quick confidence score for a rebalance decision
 */
export declare function calculateRebalanceConfidence(state: SafekeepingFundState): number;
//# sourceMappingURL=ai-analysis.d.ts.map