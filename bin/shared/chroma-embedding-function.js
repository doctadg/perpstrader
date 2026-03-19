"use strict";
// ChromaDB Manual Embedding Function
// A registered embedding function for collections that handle embeddings manually.
// This eliminates "No embedding function configuration found for collection schema deserialization" warnings.
//
// These collections always pass embeddings directly (via the `embeddings` parameter),
// so this function's generate() should never be called. It exists solely so ChromaDB
// can serialize/deserialize the collection schema without warnings.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ManualNewsEmbeddingFunction = exports.ManualPatternEmbeddingFunction = void 0;
exports.ensureEmbeddingFunctionsRegistered = ensureEmbeddingFunctionsRegistered;
const chromadb_1 = require("chromadb");
const logger_1 = __importDefault(require("./logger"));
/**
 * Embedding function for price_patterns and trade_outcomes collections.
 * These use locally-computed 40-dim feature vectors from market indicators.
 */
class ManualPatternEmbeddingFunction {
    name = 'manual-pattern-embed';
    async generate(texts) {
        logger_1.default.warn('[ManualPatternEmbeddingFunction] generate() called unexpectedly. Embeddings should be provided directly.');
        return texts.map(() => new Array(40).fill(0));
    }
    defaultSpace() {
        return 'l2';
    }
    supportedSpaces() {
        return ['l2'];
    }
    getConfig() {
        return { dimension: 40, type: 'manual-pattern' };
    }
    static buildFromConfig(config, _client) {
        return new ManualPatternEmbeddingFunction();
    }
    validateConfig(config) {
        // No validation needed
    }
}
exports.ManualPatternEmbeddingFunction = ManualPatternEmbeddingFunction;
/**
 * Embedding function for news collections (e.g., global_news_local_64).
 * These use OpenRouter or local hash embeddings, always passed directly.
 */
class ManualNewsEmbeddingFunction {
    name = 'manual-news-embed';
    dim;
    constructor(dim) {
        this.dim = dim || Number.parseInt(process.env.NEWS_EMBEDDING_DIM || '64', 10) || 64;
    }
    async generate(texts) {
        logger_1.default.warn('[ManualNewsEmbeddingFunction] generate() called unexpectedly. Embeddings should be provided directly.');
        return texts.map(() => new Array(this.dim).fill(0));
    }
    defaultSpace() {
        return 'l2';
    }
    supportedSpaces() {
        return ['l2'];
    }
    getConfig() {
        return { dimension: this.dim, type: 'manual-news' };
    }
    static buildFromConfig(config, _client) {
        const dim = config?.dimension || Number.parseInt(process.env.NEWS_EMBEDDING_DIM || '64', 10) || 64;
        return new ManualNewsEmbeddingFunction(dim);
    }
    validateConfig(config) {
        // No validation needed
    }
}
exports.ManualNewsEmbeddingFunction = ManualNewsEmbeddingFunction;
// Register both embedding functions with ChromaDB client so they can be
// serialized/deserialized during collection schema operations.
let registered = false;
function ensureEmbeddingFunctionsRegistered() {
    if (registered)
        return;
    try {
        (0, chromadb_1.registerEmbeddingFunction)('manual-pattern-embed', ManualPatternEmbeddingFunction);
        (0, chromadb_1.registerEmbeddingFunction)('manual-news-embed', ManualNewsEmbeddingFunction);
        registered = true;
        logger_1.default.info('[ChromaDB] Custom embedding functions registered (manual-pattern-embed, manual-news-embed)');
    }
    catch (error) {
        // If already registered (e.g., HMR during dev), just mark as done
        if (error?.message?.includes('already registered')) {
            registered = true;
        }
        else {
            logger_1.default.warn(`[ChromaDB] Failed to register embedding functions: ${error?.message}`);
        }
    }
}
//# sourceMappingURL=chroma-embedding-function.js.map