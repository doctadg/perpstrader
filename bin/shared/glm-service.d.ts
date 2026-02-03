import { Strategy, ResearchData, PredictionIdea, PredictionMarket, NewsItem } from '../shared/types';
/**
 * GLM AI Service for strategy generation
 */
export declare class GLMAIService {
    private baseUrl;
    private apiKey;
    private model;
    private labelingModel;
    private timeout;
    constructor();
    /**
     * Check if the service is configured
     */
    canUseService(): boolean;
    private safeErrorMessage;
    /**
     * Generate trading strategies based on research data
     */
    generateTradingStrategies(researchData: ResearchData): Promise<Strategy[]>;
    /**
     * Generate prediction market ideas based on linked news and market prices
     */
    generatePredictionIdeas(context: {
        markets: PredictionMarket[];
        marketNews: Record<string, NewsItem[]>;
    }): Promise<PredictionIdea[]>;
    /**
     * Call the GLM API
     * @param prompt - The prompt to send
     * @param retries - Number of retry attempts
     * @param modelOverride - Optional model override (defaults to this.model)
     * @param temperature - Temperature for generation (default 0.7)
     */
    private callAPI;
    /**
     * Build the strategy generation prompt
     */
    private buildStrategyPrompt;
    private buildPredictionPrompt;
    private parsePredictionIdeas;
    /**
     * Parse strategies from LLM response
     */
    private parseStrategies;
    /**
     * Fallback strategies when API is unavailable
     */
    private generateFallbackStrategies;
    /**
     * Optimize a strategy based on its performance (stub for compatibility)
     */
    optimizeStrategy(strategy: Strategy, performance: Strategy['performance']): Promise<Strategy>;
    /**
     * Generate a trading signal (stub for compatibility)
     */
    generateTradingSignal(indicators: any[], patterns: any[]): Promise<any>;
    /**
     * Summarize an article content into 1-3 paragraphs.
     */
    summarizeArticle(content: string): Promise<string>;
    private buildSummarizationPrompt;
    private generateFallbackSummary;
    /**
     * Generate vector embedding for text using GLM API
     */
    generateEmbedding(text: string): Promise<number[] | null>;
    /**
     * Generate a specific event label for a single news event.
     * Used for individual article clustering with trend direction.
     */
    generateEventLabel(input: {
        title: string;
        content?: string;
        category?: string;
        tags?: string[];
    }): Promise<{
        topic: string;
        subEventType: string;
        trendDirection: 'UP' | 'DOWN' | 'NEUTRAL';
        urgency: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
        keywords: string[];
    } | null>;
    /**
     * Generate a broad-but-specific trend label for a cluster of related news.
     * Returns null if GLM is not configured.
     */
    generateNewsTrendLabel(input: {
        titles: string[];
        category?: string;
        tags?: string[];
    }): Promise<{
        topic: string;
        summary: string;
        keywords: string[];
    } | null>;
    /**
     * Generate text using GLM (public method for agent tools)
     * @param prompt - The prompt to send
     * @param temperature - Temperature for generation (default 0.7)
     */
    generateText(prompt: string, temperature?: number): Promise<string>;
}
declare const glmService: GLMAIService;
export default glmService;
//# sourceMappingURL=glm-service.d.ts.map