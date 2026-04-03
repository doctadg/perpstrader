import { NewsAgentState } from '../state';
/**
 * Topic Generation Node
 * Generates topics with strict validation for categorized articles
 * Uses circuit-breaker pattern: if 3 consecutive LLM calls fail, use fallback for all remaining
 */
export declare function topicGenerationNode(state: NewsAgentState): Promise<Partial<NewsAgentState>>;
//# sourceMappingURL=topic-generation-node.d.ts.map