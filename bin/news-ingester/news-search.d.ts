import { NewsCategory, SearchResult } from '../shared/types';
interface ResearchResponse {
    search_results: SearchResult[];
    scraped_content: {
        url: string;
        title?: string;
        text?: string;
    }[];
}
declare class NewsSearchService {
    private baseUrl;
    private timeout;
    private seenUrls;
    private seenTitles;
    private queryHistory;
    private queryCooldownMs;
    private maxQueriesPerCategory;
    private maxResultsPerQuery;
    private queryConcurrency;
    private dedupeTtlMs;
    private researchEnabled;
    private researchThreshold;
    private researchPages;
    private contextRefreshMs;
    private contextLookback;
    private lastContextRefresh;
    private dynamicKeywordsByCategory;
    private dynamicKeywordsGlobal;
    private lastQueryPlan;
    constructor();
    private loadCache;
    private saveCache;
    private extractTargetUrl;
    private normalizeUrl;
    private normalizeTitle;
    private normalizeQuery;
    private buildTitleKey;
    private isSeen;
    private markSeen;
    private recordQuery;
    private shouldUseQuery;
    private extractKeywords;
    private refreshContext;
    private updateDynamicKeywords;
    private getDynamicKeywords;
    private buildQueryPool;
    private chooseQueries;
    private mapWithConcurrency;
    private mergeResults;
    search(query: string, numResults?: number): Promise<SearchResult[]>;
    research(query: string, maxPages?: number): Promise<ResearchResponse>;
    searchCategory(category: NewsCategory, numResultsPerQuery?: number, maxQueries?: number): Promise<SearchResult[]>;
    scrapeArticle(url: string): Promise<string | null>;
    searchAllCategories(categories?: NewsCategory[], numResultsPerQuery?: number, maxQueries?: number): Promise<Map<NewsCategory, SearchResult[]>>;
    getRandomQuery(category: NewsCategory): string;
    getLastQueryPlan(): Map<NewsCategory, string[]>;
    getAvailableCategories(): NewsCategory[];
    clearCache(): void;
    getCacheSize(): {
        urls: number;
        titles: number;
        queries: number;
    };
}
declare const newsSearchService: NewsSearchService;
export default newsSearchService;
//# sourceMappingURL=news-search.d.ts.map