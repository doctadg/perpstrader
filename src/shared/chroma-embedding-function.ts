// ChromaDB Manual Embedding Function
// A registered embedding function for collections that handle embeddings manually.
// This eliminates "No embedding function configuration found for collection schema deserialization" warnings.
//
// These collections always pass embeddings directly (via the `embeddings` parameter),
// so this function's generate() should never be called. It exists solely so ChromaDB
// can serialize/deserialize the collection schema without warnings.

import { registerEmbeddingFunction, ChromaClient } from 'chromadb';
import logger from './logger';

/**
 * Embedding function for price_patterns and trade_outcomes collections.
 * These use locally-computed 40-dim feature vectors from market indicators.
 */
export class ManualPatternEmbeddingFunction {
    readonly name = 'manual-pattern-embed';

    async generate(texts: string[]): Promise<number[][]> {
        logger.warn('[ManualPatternEmbeddingFunction] generate() called unexpectedly. Embeddings should be provided directly.');
        return texts.map(() => new Array(40).fill(0));
    }

    defaultSpace(): 'l2' {
        return 'l2';
    }

    supportedSpaces(): ('l2' | 'cosine' | 'ip')[] {
        return ['l2'];
    }

    getConfig(): Record<string, any> {
        return { dimension: 40, type: 'manual-pattern' };
    }

    static buildFromConfig(config: Record<string, any>, _client?: ChromaClient): ManualPatternEmbeddingFunction {
        return new ManualPatternEmbeddingFunction();
    }

    validateConfig(config: Record<string, any>): void {
        // No validation needed
    }
}

/**
 * Embedding function for news collections (e.g., global_news_local_64).
 * These use OpenRouter or local hash embeddings, always passed directly.
 */
export class ManualNewsEmbeddingFunction {
    readonly name = 'manual-news-embed';

    private readonly dim: number;

    constructor(dim?: number) {
        this.dim = dim || Number.parseInt(process.env.NEWS_EMBEDDING_DIM || '64', 10) || 64;
    }

    async generate(texts: string[]): Promise<number[][]> {
        logger.warn('[ManualNewsEmbeddingFunction] generate() called unexpectedly. Embeddings should be provided directly.');
        return texts.map(() => new Array(this.dim).fill(0));
    }

    defaultSpace(): 'l2' {
        return 'l2';
    }

    supportedSpaces(): ('l2' | 'cosine' | 'ip')[] {
        return ['l2'];
    }

    getConfig(): Record<string, any> {
        return { dimension: this.dim, type: 'manual-news' };
    }

    static buildFromConfig(config: Record<string, any>, _client?: ChromaClient): ManualNewsEmbeddingFunction {
        const dim = config?.dimension || Number.parseInt(process.env.NEWS_EMBEDDING_DIM || '64', 10) || 64;
        return new ManualNewsEmbeddingFunction(dim);
    }

    validateConfig(config: Record<string, any>): void {
        // No validation needed
    }
}

// Register both embedding functions with ChromaDB client so they can be
// serialized/deserialized during collection schema operations.
let registered = false;

export function ensureEmbeddingFunctionsRegistered(): void {
    if (registered) return;
    try {
        registerEmbeddingFunction('manual-pattern-embed', ManualPatternEmbeddingFunction as any);
        registerEmbeddingFunction('manual-news-embed', ManualNewsEmbeddingFunction as any);
        registered = true;
        logger.info('[ChromaDB] Custom embedding functions registered (manual-pattern-embed, manual-news-embed)');
    } catch (error: any) {
        // If already registered (e.g., HMR during dev), just mark as done
        if (error?.message?.includes('already registered')) {
            registered = true;
        } else {
            logger.warn(`[ChromaDB] Failed to register embedding functions: ${error?.message}`);
        }
    }
}
