import { ScoredNarrative, CoinConcept, GeneratorConfig } from './types';
export declare class CoinGenerator {
    private config;
    constructor(config?: Partial<GeneratorConfig>);
    /**
     * Generate a complete coin concept from a scored narrative.
     */
    generate(narrative: ScoredNarrative): Promise<CoinConcept>;
    /**
     * Call LLM to generate coin name/symbol/description/tweet.
     */
    private generateCoinConcept;
    /**
     * Fallback generation when no LLM API key is available.
     */
    private fallbackGeneration;
}
//# sourceMappingURL=coin-generator.d.ts.map