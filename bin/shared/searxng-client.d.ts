interface SearXNGResult {
    title: string;
    url: string;
    content: string;
    publishedDate?: string;
    engine: string;
    score: number;
}
/**
 * Search using local SearXNG instance
 */
export declare function searchSearXNG(query: string, numResults?: number, category?: string): Promise<SearXNGResult[]>;
/**
 * Search multiple queries in parallel
 */
export declare function searchSearXNGParallel(queries: string[], numResults?: number): Promise<Map<string, SearXNGResult[]>>;
/**
 * Check SearXNG health
 */
export declare function checkSearXNGHealth(): Promise<{
    ok: boolean;
    latency: number;
    message: string;
}>;
export {};
//# sourceMappingURL=searxng-client.d.ts.map