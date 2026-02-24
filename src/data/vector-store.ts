// Vector Store Service - ChromaDB Integration
// Stores and retrieves pattern embeddings for market memory

import { ChromaClient, Collection } from 'chromadb';
import { MarketData, TechnicalIndicators } from '../shared/types';
import { PatternMatch } from '../langgraph/state';
import logger from '../shared/logger';

/**
 * Pattern metadata stored alongside embeddings
 */
interface PatternMetadata {
    symbol: string;
    timeframe: string;
    outcome: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    historicalReturn: number;
    regime: string;
    timestamp: string;
    indicators: string; // JSON stringified
}

/**
 * Vector Store Service for pattern recognition and memory
 */
export class VectorStore {
    private client: ChromaClient;
    private patternCollection: Collection | null = null;
    private tradeCollection: Collection | null = null;
    private initialized: boolean = false;

    constructor() {
        const chromaUrl = process.env.CHROMA_URL || process.env.CHROMADB_URL;
        let urlHost: string | undefined;
        let urlPort: number | undefined;

        if (chromaUrl) {
            try {
                const parsed = new URL(chromaUrl);
                urlHost = parsed.hostname;
                if (parsed.port) {
                    const parsedPort = Number.parseInt(parsed.port, 10);
                    if (Number.isFinite(parsedPort)) {
                        urlPort = parsedPort;
                    }
                }
            } catch {
                // Ignore malformed URL and fall back to explicit host/port vars.
            }
        }

        const host = process.env.CHROMA_HOST || urlHost || '127.0.0.1';
        const port = process.env.CHROMA_PORT ? Number.parseInt(process.env.CHROMA_PORT, 10) : (urlPort ?? 8001);
        const resolvedPort = Number.isFinite(port) ? port : 8001;

        this.client = new ChromaClient({ host, port: resolvedPort });
    }

    /**
     * Initialize collections
     */
    async initialize(): Promise<void> {
        if (this.initialized) return;

        try {
            logger.info('Initializing vector store...');

            // Collection for price patterns
            this.patternCollection = await this.client.getOrCreateCollection({
                name: 'price_patterns',
                metadata: { description: 'Historical price patterns with outcomes' },
                embeddingFunction: null,
            });

            // Collection for trade outcomes
            this.tradeCollection = await this.client.getOrCreateCollection({
                name: 'trade_outcomes',
                metadata: { description: 'Trade results for learning' },
                embeddingFunction: null,
            });

            this.initialized = true;
            logger.info('Vector store initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize vector store:', error);
            throw error;
        }
    }

    /**
     * Validate input arrays for embedding generation
     */
    private validateEmbeddingInputs(
        candles: MarketData[],
        indicators: TechnicalIndicators
    ): { valid: boolean; error: string | null } {
        if (!candles || candles.length < 20) {
            return { valid: false, error: `Insufficient candles: ${candles?.length || 0} < 20` };
        }

        if (!indicators) {
            return { valid: false, error: 'Indicators object is null or undefined' };
        }

        if (!indicators.rsi || indicators.rsi.length < 5) {
            return { valid: false, error: `Insufficient RSI data: ${indicators.rsi?.length || 0} < 5` };
        }

        if (!indicators.macd || !indicators.macd.histogram || indicators.macd.histogram.length < 5) {
            return { valid: false, error: `Insufficient MACD histogram data` };
        }

        if (!indicators.bollinger || !indicators.bollinger.upper || !indicators.bollinger.lower) {
            return { valid: false, error: 'Missing Bollinger bands data' };
        }

        // Check for null/NaN values in key indicators
        const hasNullRSI = indicators.rsi.some(v => v === null || v === undefined || !Number.isFinite(v));
        if (hasNullRSI) {
            return { valid: false, error: 'RSI contains null, NaN, or infinite values' };
        }

        const hasNullMACD = indicators.macd.histogram.some(v => v === null || v === undefined || !Number.isFinite(v));
        if (hasNullMACD) {
            return { valid: false, error: 'MACD histogram contains null, NaN, or infinite values' };
        }

        return { valid: true, error: null };
    }

    /**
     * Safely get array value with bounds checking and null validation
     */
    private safeArrayGet(arr: number[], index: number, fallback: number): number {
        if (!arr || arr.length === 0) return fallback;
        if (index < 0 || index >= arr.length) return fallback;
        const value = arr[index];
        return (value !== null && value !== undefined && Number.isFinite(value)) ? value : fallback;
    }

    /**
     * Create an embedding from market data and indicators
     * This is a simplified approach - in production you'd use an embedding model
     */
    private createPatternEmbedding(
        candles: MarketData[],
        indicators: TechnicalIndicators
    ): number[] {
        // Validate inputs
        const validation = this.validateEmbeddingInputs(candles, indicators);
        if (!validation.valid) {
            logger.error(`[VectorStore] ${validation.error}, returning default embedding`);
            return new Array(40).fill(0);
        }

        // Normalize recent price action into a fixed-size vector
        const recentCandles = candles.slice(-20);
        const embedding: number[] = [];

        // Price changes (normalized)
        const firstClose = recentCandles[0]?.close || 1;
        const safeFirstClose = firstClose === 0 ? 1 : firstClose;
        for (const candle of recentCandles) {
            embedding.push((candle.close - safeFirstClose) / safeFirstClose);
        }

        // RSI values (last 5, normalized to 0-1)
        const recentRSI = indicators.rsi.slice(-5);
        for (const rsi of recentRSI) {
            const safeRSI = this.safeArrayGet(indicators.rsi, indicators.rsi.indexOf(rsi), 50);
            embedding.push(safeRSI / 100);
        }

        // MACD histogram (last 5, normalized)
        const absHistogram = indicators.macd.histogram.map(Math.abs);
        const maxHist = absHistogram.length > 0 ? Math.max(...absHistogram) : 1;
        const safeMaxHist = maxHist === 0 ? 1 : maxHist;
        const recentHist = indicators.macd.histogram.slice(-5);
        for (const hist of recentHist) {
            const safeHist = this.safeArrayGet(indicators.macd.histogram, indicators.macd.histogram.indexOf(hist), 0);
            embedding.push(safeHist / safeMaxHist);
        }

        // Bollinger position (last 5)
        for (let i = recentCandles.length - 5; i < recentCandles.length; i++) {
            if (i >= 0 && i < recentCandles.length) {
                const bbUpper = this.safeArrayGet(indicators.bollinger.upper, i, 0);
                const bbLower = this.safeArrayGet(indicators.bollinger.lower, i, 0);
                const bbRange = bbUpper - bbLower;
                const safeBBRange = Math.abs(bbRange) < 0.0001 ? 1 : bbRange;
                const position = (recentCandles[i].close - bbLower) / safeBBRange;
                embedding.push(Math.max(0, Math.min(1, position)));
            } else {
                embedding.push(0.5);
            }
        }

        // Volume trend (last 5, normalized)
        const avgVolume = recentCandles.reduce((sum, c) => sum + c.volume, 0) / recentCandles.length;
        const safeAvgVolume = avgVolume === 0 ? 1 : avgVolume;
        for (let i = recentCandles.length - 5; i < recentCandles.length; i++) {
            if (i >= 0 && i < recentCandles.length) {
                const vol = recentCandles[i].volume;
                embedding.push(vol / safeAvgVolume);
            } else {
                embedding.push(1);
            }
        }

        // Pad or truncate to fixed size (40 dimensions)
        while (embedding.length < 40) embedding.push(0);
        return embedding.slice(0, 40);
    }

    /**
     * Store a pattern with its outcome
     */
    async storePattern(
        symbol: string,
        timeframe: string,
        candles: MarketData[],
        indicators: TechnicalIndicators,
        outcome: 'BULLISH' | 'BEARISH' | 'NEUTRAL',
        historicalReturn: number,
        regime: string
    ): Promise<string> {
        await this.initialize();
        if (!this.patternCollection) throw new Error('Pattern collection not initialized');

        const id = crypto.randomUUID();
        const embedding = this.createPatternEmbedding(candles, indicators);

        const metadata: PatternMetadata = {
            symbol,
            timeframe,
            outcome,
            historicalReturn,
            regime,
            timestamp: new Date().toISOString(),
            indicators: JSON.stringify({
                rsi: indicators.rsi.slice(-5),
                macdHist: indicators.macd.histogram.slice(-5),
            }),
        };

        await this.patternCollection.add({
            ids: [id],
            embeddings: [embedding],
            metadatas: [metadata as any],
            documents: [`${symbol} ${timeframe} pattern at ${metadata.timestamp}`],
        });

        logger.debug(`Stored pattern ${id} with outcome ${outcome}`);
        return id;
    }

    /**
     * Query for similar patterns
     */
    async querySimilarPatterns(
        symbol: string,
        timeframe: string,
        candles: MarketData[],
        indicators: TechnicalIndicators,
        limit: number = 5
    ): Promise<PatternMatch[]> {
        await this.initialize();
        if (!this.patternCollection) return [];

        const embedding = this.createPatternEmbedding(candles, indicators);

        try {
            const results = await this.patternCollection.query({
                queryEmbeddings: [embedding],
                nResults: limit,
                where: {
                    $and: [
                        { symbol: { $eq: symbol } },
                        { timeframe: { $eq: timeframe } },
                    ],
                },
            });

            if (!results.ids || !results.ids[0]) return [];

            const matches: PatternMatch[] = [];
            for (let i = 0; i < results.ids[0].length; i++) {
                const metadata = results.metadatas?.[0]?.[i] as unknown as PatternMetadata | undefined;
                const distance = results.distances?.[0]?.[i] || 1;

                if (metadata) {
                    matches.push({
                        id: results.ids[0][i],
                        pattern: results.documents?.[0]?.[i] || '',
                        similarity: 1 - distance, // Convert distance to similarity
                        outcome: metadata.outcome as PatternMatch['outcome'],
                        historicalReturn: metadata.historicalReturn,
                        timestamp: new Date(metadata.timestamp),
                        context: { regime: metadata.regime },
                    });
                }
            }

            logger.debug(`Found ${matches.length} similar patterns for ${symbol} ${timeframe}`);
            return matches;
        } catch (error) {
            logger.error('Failed to query similar patterns:', error);
            return [];
        }
    }

    /**
     * Store a trade outcome for learning
     */
    async storeTradeOutcome(
        strategyId: string,
        symbol: string,
        entryIndicators: TechnicalIndicators,
        candles: MarketData[],
        pnl: number,
        metadata: Record<string, any>
    ): Promise<void> {
        await this.initialize();
        if (!this.tradeCollection) return;

        const id = crypto.randomUUID();
        const embedding = this.createPatternEmbedding(candles, entryIndicators);

        await this.tradeCollection.add({
            ids: [id],
            embeddings: [embedding],
            metadatas: [{
                strategyId,
                symbol,
                pnl,
                profitable: pnl > 0,
                timestamp: new Date().toISOString(),
                ...metadata,
            }],
            documents: [`Trade on ${symbol}: PnL ${pnl.toFixed(4)}`],
        });

        logger.debug(`Stored trade outcome ${id} with PnL ${pnl}`);
    }

    /**
     * Get statistics about stored patterns
     */
    async getStats(): Promise<{ patterns: number; trades: number }> {
        await this.initialize();

        const patternCount = await this.patternCollection?.count() || 0;
        const tradeCount = await this.tradeCollection?.count() || 0;

        return { patterns: patternCount, trades: tradeCount };
    }
}

// Singleton instance
const vectorStore = new VectorStore();
export default vectorStore;
