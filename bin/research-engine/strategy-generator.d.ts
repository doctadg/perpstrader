import { MarketRegime } from './market-analyzer';
import { StrategyIdea } from './idea-queue';
export interface GeneratedStrategy {
    name: string;
    description: string;
    type: 'TREND_FOLLOWING' | 'MEAN_REVERSION' | 'MARKET_MAKING' | 'ARBITRAGE' | 'AI_PREDICTION';
    symbols: string[];
    timeframe: string;
    parameters: Record<string, any>;
    entryConditions: string[];
    exitConditions: string[];
    riskParameters: {
        maxPositionSize: number;
        stopLoss: number;
        takeProfit: number;
        maxLeverage: number;
    };
    confidence: number;
    rationale: string;
}
export declare class StrategyGenerator {
    private glmService;
    constructor();
    /**
     * Generate strategy ideas based on current market conditions
     */
    generateIdeas(marketRegime: MarketRegime, count?: number): Promise<StrategyIdea[]>;
    /**
     * Generate strategies using GLM AI service
     */
    private generateWithGLM;
    /**
     * Build the strategy generation prompt for GLM
     */
    private buildStrategyPrompt;
    /**
     * Parse GLM response into strategy ideas
     */
    private parseStrategyResponse;
    /**
     * Generate fallback ideas when GLM is unavailable
     */
    private generateFallbackIdeas;
    /**
     * Validate strategy type
     */
    private validateStrategyType;
}
export default StrategyGenerator;
//# sourceMappingURL=strategy-generator.d.ts.map