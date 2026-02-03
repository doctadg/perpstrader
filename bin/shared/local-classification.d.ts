import { NewsArticle } from '../shared/types';
export interface LocalClassification {
    topic: string;
    subEventType: string;
    trendDirection: 'UP' | 'DOWN' | 'NEUTRAL';
    urgency: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    keywords: string[];
    confidence: number;
}
export declare function classifyArticleLocally(article: NewsArticle): LocalClassification;
export declare function classifyBatch(articles: NewsArticle[]): LocalClassification[];
export declare function enhanceWithLocalClassification(article: NewsArticle, derivedTopic: string, derivedKeywords: string[]): {
    topic: string;
    trendDirection: string;
    urgency: string;
    keywords: string[];
};
//# sourceMappingURL=local-classification.d.ts.map