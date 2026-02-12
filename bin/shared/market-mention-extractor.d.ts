export interface ExtractedMarketMention {
    marketId: string;
    marketName: string;
    marketType: 'hyperliquid' | 'polymarket';
    relevanceScore: number;
    mentionCount: number;
    context: string;
    extractedKeywords: string[];
    sentiment: 'very_negative' | 'negative' | 'neutral' | 'positive' | 'very_positive';
    sentimentScore: number;
    position: 'title' | 'headline' | 'first_paragraph' | 'body' | 'conclusion';
    extractionMethod: 'keyword' | 'nlp_entity' | 'semantic' | 'manual';
}
declare class MarketMentionExtractor {
    private db;
    private initialized;
    private dbPath;
    private keywordCache;
    private lastKeywordRefresh;
    private readonly KEYWORD_CACHE_TTL;
    constructor();
    initialize(): Promise<void>;
    /**
     * Refresh the keyword cache from database
     */
    private refreshKeywordCache;
    /**
     * Extract market mentions from an article
     */
    extractMentions(articleId: string, title: string, content: string, snippet: string): Promise<ExtractedMarketMention[]>;
    /**
     * Store extracted mentions in database
     */
    storeMentions(articleId: string, mentions: ExtractedMarketMention[]): Promise<number>;
    /**
     * Get mentions for a specific market
     */
    getMentionsForMarket(marketId: string, hours?: number, minRelevance?: number): Promise<Array<{
        articleId: string;
        title: string;
        relevanceScore: number;
        sentimentScore: number;
        extractedAt: Date;
    }>>;
    /**
     * Get top mentioned markets in timeframe
     */
    getTopMentionedMarkets(hours?: number, limit?: number): Promise<Array<{
        marketId: string;
        marketName: string;
        marketType: string;
        category: string;
        mentionCount: number;
        articleCount: number;
        avgRelevance: number;
        avgSentiment: number;
    }>>;
    private countOccurrences;
    private escapeRegex;
    private extractFirstParagraph;
    private calculateRelevanceScore;
    private extractContext;
    private analyzeSentiment;
}
export declare const marketMentionExtractor: MarketMentionExtractor;
export default marketMentionExtractor;
//# sourceMappingURL=market-mention-extractor.d.ts.map