import { NewsAgentState } from '../state';
/**
 * Redundancy Filter Node
 * Removes near-duplicate articles using vector similarity
 */
export declare function redundancyFilterNode(state: NewsAgentState): Promise<Partial<NewsAgentState>>;
/**
 * Calculate similarity between two articles based on title and content
 * Returns 0-1 score where 1 is identical
 */
export declare function calculateArticleSimilarity(article1: {
    title: string;
    content?: string;
}, article2: {
    title: string;
    content?: string;
}): number;
/**
 * Check if two articles are considered duplicates
 */
export declare function areDuplicates(article1: {
    title: string;
    content?: string;
}, article2: {
    title: string;
    content?: string;
}): boolean;
//# sourceMappingURL=redundancy-filter-node.d.ts.map