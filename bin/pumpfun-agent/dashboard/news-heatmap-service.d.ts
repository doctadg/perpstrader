import { NewsCategory, NewsImportance, NewsSentiment } from '../shared/types';
type ClusterCategory = NewsCategory | 'GENERAL';
type TrendDirection = 'UP' | 'DOWN' | 'NEUTRAL';
type ClusterUrgency = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
interface BuildOptions {
    hours?: number;
    category?: string;
    limit?: number;
    force?: boolean;
    articleLimit?: number;
}
export interface NewsHeatmapClusterArticle {
    id: string;
    title: string;
    source: string;
    url: string;
    publishedAt: string | null;
    sentiment: NewsSentiment;
    importance: NewsImportance;
    snippet: string;
    summary: string;
}
export interface NewsHeatmapCluster {
    id: string;
    topic: string;
    topicKey: string;
    summary: string;
    category: ClusterCategory;
    keywords: string[];
    heatScore: number;
    articleCount: number;
    sourceCount: number;
    sentimentScore: number;
    sentiment: NewsSentiment;
    trendDirection: TrendDirection;
    urgency: ClusterUrgency;
    velocity: number;
    freshnessMinutes: number;
    llmCoverage: number;
    firstSeen: string;
    updatedAt: string;
    articles: NewsHeatmapClusterArticle[];
}
export interface NewsHeatmapResult {
    generatedAt: string;
    hours: number;
    category: string;
    totalArticles: number;
    totalClusters: number;
    clusters: NewsHeatmapCluster[];
    byCategory: Record<string, NewsHeatmapCluster[]>;
    llm: {
        enabled: boolean;
        model: string;
        labeledArticles: number;
        coverage: number;
    };
}
export interface NewsHeatmapTimelinePoint {
    bucketStart: string;
    bucketEnd: string;
    avgHeat: number;
    articleCount: number;
    clusterObservations: number;
    byCategory: Record<string, number>;
}
export interface NewsHeatmapTimeline {
    generatedAt: string;
    hours: number;
    bucketHours: number;
    points: NewsHeatmapTimelinePoint[];
}
declare class NewsHeatmapService {
    private db;
    private initialized;
    private readonly dbPath;
    private readonly cacheTtlMs;
    private readonly maxArticleScan;
    private readonly maxLlmLabelArticles;
    private readonly llmTimeoutMs;
    private readonly cache;
    private readonly inFlight;
    private readonly clusterDetailCache;
    private readonly configuredLabelingModel;
    private llmBlockedUntil;
    private llmConsecutiveEmpty;
    constructor();
    initialize(): Promise<void>;
    private ensureSchema;
    private normalizeCategory;
    private parseDate;
    private parseJsonArray;
    private normalizeToken;
    private extractTokens;
    private normalizeTopicKey;
    private jaccardSimilarity;
    private sentimentToScore;
    private importanceWeight;
    private calculateArticleWeight;
    private chooseTopic;
    private chooseKeywords;
    private toSentimentLabel;
    private resolveTrendDirection;
    private resolveUrgency;
    private stableFallbackKey;
    private createAccumulator;
    private addArticleToAccumulator;
    private findBestCluster;
    private mergeAccumulators;
    private getRecentArticles;
    private labelArticlesWithLlm;
    private withTimeout;
    private getPreviousState;
    private buildClusters;
    private persistState;
    private normalizeOptions;
    private buildCacheKey;
    private projectResult;
    private buildInternal;
    getHeatmap(options?: BuildOptions): Promise<NewsHeatmapResult>;
    rebuild(options?: BuildOptions): Promise<NewsHeatmapResult>;
    getClusterDetails(clusterId: string, hours?: number): Promise<NewsHeatmapCluster | null>;
    getTimeline(hours?: number, bucketHours?: number, category?: string): Promise<NewsHeatmapTimeline>;
}
declare const newsHeatmapService: NewsHeatmapService;
export default newsHeatmapService;
//# sourceMappingURL=news-heatmap-service.d.ts.map