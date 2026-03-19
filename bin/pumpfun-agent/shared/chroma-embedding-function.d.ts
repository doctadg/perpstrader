import { ChromaClient } from 'chromadb';
/**
 * Embedding function for price_patterns and trade_outcomes collections.
 * These use locally-computed 40-dim feature vectors from market indicators.
 */
export declare class ManualPatternEmbeddingFunction {
    readonly name = "manual-pattern-embed";
    generate(texts: string[]): Promise<number[][]>;
    defaultSpace(): 'l2';
    supportedSpaces(): ('l2' | 'cosine' | 'ip')[];
    getConfig(): Record<string, any>;
    static buildFromConfig(config: Record<string, any>, _client?: ChromaClient): ManualPatternEmbeddingFunction;
    validateConfig(config: Record<string, any>): void;
}
/**
 * Embedding function for news collections (e.g., global_news_local_64).
 * These use OpenRouter or local hash embeddings, always passed directly.
 */
export declare class ManualNewsEmbeddingFunction {
    readonly name = "manual-news-embed";
    private readonly dim;
    constructor(dim?: number);
    generate(texts: string[]): Promise<number[][]>;
    defaultSpace(): 'l2';
    supportedSpaces(): ('l2' | 'cosine' | 'ip')[];
    getConfig(): Record<string, any>;
    static buildFromConfig(config: Record<string, any>, _client?: ChromaClient): ManualNewsEmbeddingFunction;
    validateConfig(config: Record<string, any>): void;
}
export declare function ensureEmbeddingFunctionsRegistered(): void;
//# sourceMappingURL=chroma-embedding-function.d.ts.map