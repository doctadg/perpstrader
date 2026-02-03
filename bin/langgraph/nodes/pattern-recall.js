"use strict";
// Pattern Recall Node
// Re-enabled with vector store for historical pattern matching
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.patternRecallNode = patternRecallNode;
const logger_1 = __importDefault(require("../../shared/logger"));
const vector_store_1 = __importDefault(require("../../data/vector-store"));
/**
 * Pattern Recall Node
 * Searches for similar historical market patterns in the vector store
 * This enables the system to learn from past market conditions and outcomes
 */
async function patternRecallNode(state) {
    logger_1.default.info(`[PatternRecallNode] Searching for similar patterns for ${state.symbol} ${state.timeframe}`);
    try {
        // Initialize vector store
        await vector_store_1.default.initialize();
        // Check if we have sufficient data
        if (!state.candles || state.candles.length < 20) {
            logger_1.default.warn('[PatternRecallNode] Insufficient candles for pattern matching');
            return {
                currentStep: 'PATTERN_RECALL_INSUFFICIENT_DATA',
                similarPatterns: [],
                thoughts: [
                    ...state.thoughts,
                    `Insufficient data for pattern matching: ${state.candles?.length || 0} candles (need 20+)`,
                ],
            };
        }
        if (!state.indicators) {
            logger_1.default.warn('[PatternRecallNode] No indicators available for pattern matching');
            return {
                currentStep: 'PATTERN_RECALL_NO_INDICATORS',
                similarPatterns: [],
                thoughts: [
                    ...state.thoughts,
                    'No technical indicators available for pattern matching',
                ],
            };
        }
        // Query for similar patterns
        const similarPatterns = await vector_store_1.default.querySimilarPatterns(state.symbol, state.timeframe, state.candles, state.indicators, 10 // Get top 10 similar patterns
        );
        // Analyze patterns for bias
        const bullishPatterns = similarPatterns.filter(p => p.outcome === 'BULLISH');
        const bearishPatterns = similarPatterns.filter(p => p.outcome === 'BEARISH');
        const neutralPatterns = similarPatterns.filter(p => p.outcome === 'NEUTRAL');
        let patternBias = 'NEUTRAL';
        if (bullishPatterns.length > bearishPatterns.length * 1.5) {
            patternBias = 'BULLISH';
        }
        else if (bearishPatterns.length > bullishPatterns.length * 1.5) {
            patternBias = 'BEARISH';
        }
        else if (bullishPatterns.length > 0 || bearishPatterns.length > 0) {
            patternBias = 'MIXED';
        }
        // Calculate average historical return for similar patterns
        const avgReturn = similarPatterns.length > 0
            ? similarPatterns.reduce((sum, p) => sum + p.historicalReturn, 0) / similarPatterns.length
            : 0;
        const thoughts = [
            ...state.thoughts,
            `Found ${similarPatterns.length} similar patterns`,
            `Pattern bias: ${patternBias} (${bullishPatterns.length} bullish, ${bearishPatterns.length} bearish, ${neutralPatterns.length} neutral)`,
            `Average historical return: ${(avgReturn * 100).toFixed(2)}%`,
        ];
        // Add high-similarity pattern details
        if (similarPatterns.length > 0) {
            const topPattern = similarPatterns[0];
            thoughts.push(`Top match: ${(topPattern.similarity * 100).toFixed(1)}% similar, outcome: ${topPattern.outcome}`);
        }
        logger_1.default.info(`[PatternRecallNode] Found ${similarPatterns.length} patterns, bias: ${patternBias}`);
        return {
            currentStep: 'PATTERN_RECALL_COMPLETE',
            similarPatterns,
            thoughts,
            patternBias,
            patternAvgReturn: avgReturn,
        };
    }
    catch (error) {
        logger_1.default.error('[PatternRecallNode] Pattern recall failed:', error);
        // Return empty patterns but don't fail the cycle
        return {
            currentStep: 'PATTERN_RECALL_ERROR',
            similarPatterns: [],
            thoughts: [
                ...state.thoughts,
                `Pattern recall failed: ${error instanceof Error ? error.message : String(error)}`,
            ],
            errors: [
                ...state.errors,
                `Pattern recall error: ${error instanceof Error ? error.message : String(error)}`,
            ],
        };
    }
}
exports.default = patternRecallNode;
//# sourceMappingURL=pattern-recall.js.map