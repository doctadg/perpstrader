"use strict";
// Market Mention Extractor
// Extracts market mentions from article content using keyword matching and NLP
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.marketMentionExtractor = void 0;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const logger_1 = __importDefault(require("../shared/logger"));
class MarketMentionExtractor {
    db = null;
    initialized = false;
    dbPath;
    keywordCache = [];
    lastKeywordRefresh = 0;
    KEYWORD_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
    constructor() {
        this.dbPath = process.env.NEWS_DB_PATH || './data/news.db';
    }
    async initialize() {
        if (this.initialized)
            return;
        try {
            this.db = new better_sqlite3_1.default(this.dbPath);
            this.db.pragma('journal_mode = WAL');
            await this.refreshKeywordCache();
            this.initialized = true;
            logger_1.default.info('[MarketMentionExtractor] Initialized successfully');
        }
        catch (error) {
            logger_1.default.error('[MarketMentionExtractor] Initialization failed:', error);
            throw error;
        }
    }
    /**
     * Refresh the keyword cache from database
     */
    async refreshKeywordCache() {
        if (!this.db)
            return;
        const now = Date.now();
        if (now - this.lastKeywordRefresh < this.KEYWORD_CACHE_TTL && this.keywordCache.length > 0) {
            return;
        }
        try {
            const rows = this.db.prepare(`
        SELECT 
          mk.market_id,
          m.name as market_name,
          m.type as market_type,
          mk.keyword,
          mk.keyword_type,
          mk.weight
        FROM market_keywords mk
        JOIN markets m ON mk.market_id = m.id
        WHERE m.active = 1
        ORDER BY mk.weight DESC
      `).all();
            this.keywordCache = rows.map(r => ({
                marketId: r.market_id,
                marketName: r.market_name,
                marketType: r.market_type,
                keyword: r.keyword.toLowerCase(),
                keywordType: r.keyword_type,
                weight: r.weight,
            }));
            this.lastKeywordRefresh = now;
            logger_1.default.info(`[MarketMentionExtractor] Loaded ${this.keywordCache.length} keywords`);
        }
        catch (error) {
            logger_1.default.error('[MarketMentionExtractor] Failed to refresh keyword cache:', error);
        }
    }
    /**
     * Extract market mentions from an article
     */
    async extractMentions(articleId, title, content, snippet) {
        await this.initialize();
        await this.refreshKeywordCache();
        if (!this.db || this.keywordCache.length === 0) {
            return [];
        }
        try {
            // Combine text for analysis
            const fullText = `${title} ${content || snippet}`.toLowerCase();
            const titleLower = title.toLowerCase();
            const firstParagraph = this.extractFirstParagraph(content || snippet).toLowerCase();
            // Track matches per market
            const marketMatches = new Map();
            // Find all keyword matches
            for (const kw of this.keywordCache) {
                const keyword = kw.keyword.toLowerCase();
                // Check for keyword presence
                let position = 'body';
                let matchCount = 0;
                // Check title (highest priority)
                const titleMatches = this.countOccurrences(titleLower, keyword);
                if (titleMatches > 0) {
                    position = 'title';
                    matchCount += titleMatches;
                }
                // Check first paragraph
                if (matchCount === 0) {
                    const fpMatches = this.countOccurrences(firstParagraph, keyword);
                    if (fpMatches > 0) {
                        position = 'first_paragraph';
                        matchCount += fpMatches;
                    }
                }
                // Check full text (body)
                if (matchCount === 0) {
                    const bodyMatches = this.countOccurrences(fullText, keyword);
                    if (bodyMatches > 0) {
                        position = 'body';
                        matchCount += bodyMatches;
                    }
                }
                // If we found matches, record them
                if (matchCount > 0) {
                    if (!marketMatches.has(kw.marketId)) {
                        marketMatches.set(kw.marketId, {
                            marketId: kw.marketId,
                            marketName: kw.marketName,
                            marketType: kw.marketType,
                            matches: [],
                        });
                    }
                    const market = marketMatches.get(kw.marketId);
                    market.matches.push({
                        keyword: kw.keyword,
                        weight: kw.weight,
                        position,
                    });
                }
            }
            // Convert matches to structured mentions
            const mentions = [];
            for (const [_, market] of marketMatches) {
                // Calculate relevance score (0-100)
                let relevanceScore = this.calculateRelevanceScore(market.matches);
                // Skip low-relevance mentions
                if (relevanceScore < 30)
                    continue;
                // Calculate sentiment
                const context = this.extractContext(fullText, market.matches[0].keyword);
                const sentiment = this.analyzeSentiment(context);
                // Determine best position
                const positions = market.matches.map(m => m.position);
                const bestPosition = positions.includes('title') ? 'title' :
                    positions.includes('first_paragraph') ? 'first_paragraph' : 'body';
                mentions.push({
                    marketId: market.marketId,
                    marketName: market.marketName,
                    marketType: market.marketType,
                    relevanceScore,
                    mentionCount: market.matches.length,
                    context: context.slice(0, 500),
                    extractedKeywords: [...new Set(market.matches.map(m => m.keyword))],
                    sentiment: sentiment.label,
                    sentimentScore: sentiment.score,
                    position: bestPosition,
                    extractionMethod: 'keyword',
                });
            }
            // Sort by relevance score
            mentions.sort((a, b) => b.relevanceScore - a.relevanceScore);
            logger_1.default.debug(`[MarketMentionExtractor] Found ${mentions.length} market mentions for article ${articleId}`);
            return mentions;
        }
        catch (error) {
            logger_1.default.error(`[MarketMentionExtractor] Failed to extract mentions for ${articleId}:`, error);
            return [];
        }
    }
    /**
     * Store extracted mentions in database
     */
    async storeMentions(articleId, mentions) {
        await this.initialize();
        if (!this.db || mentions.length === 0)
            return 0;
        try {
            const now = new Date().toISOString();
            const insertStmt = this.db.prepare(`
        INSERT OR REPLACE INTO market_mentions (
          article_id, market_id, relevance_score, mention_count,
          mention_context, extracted_keywords, mention_sentiment, sentiment_score,
          mention_position, extraction_method, extracted_at
        ) VALUES (
          @articleId, @marketId, @relevanceScore, @mentionCount,
          @context, @keywords, @sentiment, @sentimentScore,
          @position, @method, @extractedAt
        )
      `);
            const txn = this.db.transaction(() => {
                let count = 0;
                for (const mention of mentions) {
                    insertStmt.run({
                        articleId,
                        marketId: mention.marketId,
                        relevanceScore: mention.relevanceScore,
                        mentionCount: mention.mentionCount,
                        context: mention.context,
                        keywords: JSON.stringify(mention.extractedKeywords),
                        sentiment: mention.sentiment,
                        sentimentScore: mention.sentimentScore,
                        position: mention.position,
                        method: mention.extractionMethod,
                        extractedAt: now,
                    });
                    count++;
                }
                return count;
            });
            const result = txn();
            logger_1.default.debug(`[MarketMentionExtractor] Stored ${result} mentions for article ${articleId}`);
            return result;
        }
        catch (error) {
            logger_1.default.error(`[MarketMentionExtractor] Failed to store mentions for ${articleId}:`, error);
            return 0;
        }
    }
    /**
     * Get mentions for a specific market
     */
    async getMentionsForMarket(marketId, hours = 24, minRelevance = 30) {
        await this.initialize();
        if (!this.db)
            return [];
        try {
            const rows = this.db.prepare(`
        SELECT 
          mm.article_id,
          na.title,
          mm.relevance_score,
          mm.sentiment_score,
          mm.extracted_at
        FROM market_mentions mm
        JOIN news_articles na ON mm.article_id = na.id
        WHERE mm.market_id = ?
        AND mm.relevance_score >= ?
        AND mm.extracted_at > datetime('now', '-${hours} hours')
        ORDER BY mm.relevance_score DESC, mm.extracted_at DESC
      `).all(marketId, minRelevance);
            return rows.map(r => ({
                articleId: r.article_id,
                title: r.title,
                relevanceScore: r.relevance_score,
                sentimentScore: r.sentiment_score,
                extractedAt: new Date(r.extracted_at),
            }));
        }
        catch (error) {
            logger_1.default.error(`[MarketMentionExtractor] Failed to get mentions for market ${marketId}:`, error);
            return [];
        }
    }
    /**
     * Get top mentioned markets in timeframe
     */
    async getTopMentionedMarkets(hours = 24, limit = 20) {
        await this.initialize();
        if (!this.db)
            return [];
        try {
            const rows = this.db.prepare(`
        SELECT 
          m.id as market_id,
          m.name as market_name,
          m.type as market_type,
          m.category,
          COUNT(mm.id) as mention_count,
          COUNT(DISTINCT mm.article_id) as article_count,
          AVG(mm.relevance_score) as avg_relevance,
          AVG(mm.sentiment_score) as avg_sentiment
        FROM markets m
        JOIN market_mentions mm ON m.id = mm.market_id
        WHERE mm.extracted_at > datetime('now', '-${hours} hours')
        AND m.active = 1
        GROUP BY m.id
        ORDER BY mention_count DESC, article_count DESC
        LIMIT ?
      `).all(limit);
            return rows.map(r => ({
                marketId: r.market_id,
                marketName: r.market_name,
                marketType: r.market_type,
                category: r.category,
                mentionCount: r.mention_count,
                articleCount: r.article_count,
                avgRelevance: r.avg_relevance,
                avgSentiment: r.avg_sentiment,
            }));
        }
        catch (error) {
            logger_1.default.error('[MarketMentionExtractor] Failed to get top mentioned markets:', error);
            return [];
        }
    }
    // ============================================================================
    // Private Helpers
    // ============================================================================
    countOccurrences(text, keyword) {
        const regex = new RegExp(`\\b${this.escapeRegex(keyword)}\\b`, 'gi');
        const matches = text.match(regex);
        return matches ? matches.length : 0;
    }
    escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    extractFirstParagraph(text) {
        const paragraphs = text.split(/\n\n+/);
        return paragraphs[0] || '';
    }
    calculateRelevanceScore(matches) {
        let score = 0;
        for (const match of matches) {
            // Base weight
            let matchScore = match.weight * 20; // Scale to 0-100 range
            // Position multiplier
            const positionMultiplier = {
                title: 2.0,
                headline: 1.8,
                first_paragraph: 1.5,
                body: 1.0,
            }[match.position] || 1.0;
            matchScore *= positionMultiplier;
            score += matchScore;
        }
        // Cap at 100
        return Math.min(100, Math.round(score));
    }
    extractContext(text, keyword, windowSize = 100) {
        const index = text.toLowerCase().indexOf(keyword.toLowerCase());
        if (index === -1)
            return '';
        const start = Math.max(0, index - windowSize);
        const end = Math.min(text.length, index + keyword.length + windowSize);
        return text.slice(start, end).trim();
    }
    analyzeSentiment(text) {
        // Simple rule-based sentiment analysis
        const positiveWords = [
            'surge', 'rally', 'boom', 'breakthrough', 'bullish', 'gain', 'rise', 'soar', 'rocket',
            'moon', 'pump', 'up', 'high', 'strong', 'growth', 'profit', 'success', 'win', 'positive',
            'optimistic', 'confident', 'momentum', 'support', 'bounce', 'recover', 'green', ' ATH',
            'all-time high', 'adopt', 'partnership', 'launch', 'upgrade', 'improve', 'beat',
            'exceed', 'outperform', 'breakout', ' ATH ', ' ath ', ' all-time', ' all time'
        ];
        const negativeWords = [
            'crash', 'plunge', 'dump', 'bearish', 'loss', 'fall', 'drop', 'decline', 'tank',
            'down', 'low', 'weak', 'crash', 'fear', 'panic', 'sell-off', 'liquidation', 'fud',
            'negative', 'pessimistic', 'worry', 'concern', 'risk', 'threat', 'ban', 'regulate',
            'hack', 'exploit', 'bug', 'delay', 'cancel', 'fail', 'miss', 'underperform', 'red',
            'death', 'blood', 'capitulation', 'bottom', 'dump', ' selloff', ' sell-off', 'fear'
        ];
        const textLower = text.toLowerCase();
        let positiveScore = 0;
        let negativeScore = 0;
        for (const word of positiveWords) {
            const regex = new RegExp(`\\b${this.escapeRegex(word)}\\b`, 'gi');
            const matches = textLower.match(regex);
            if (matches)
                positiveScore += matches.length;
        }
        for (const word of negativeWords) {
            const regex = new RegExp(`\\b${this.escapeRegex(word)}\\b`, 'gi');
            const matches = textLower.match(regex);
            if (matches)
                negativeScore += matches.length;
        }
        // Calculate normalized score (-1 to 1)
        const total = positiveScore + negativeScore;
        if (total === 0) {
            return { label: 'neutral', score: 0 };
        }
        const rawScore = (positiveScore - negativeScore) / total;
        // Map to label
        let label;
        if (rawScore > 0.6)
            label = 'very_positive';
        else if (rawScore > 0.2)
            label = 'positive';
        else if (rawScore < -0.6)
            label = 'very_negative';
        else if (rawScore < -0.2)
            label = 'negative';
        else
            label = 'neutral';
        return { label, score: rawScore };
    }
}
exports.marketMentionExtractor = new MarketMentionExtractor();
exports.default = exports.marketMentionExtractor;
//# sourceMappingURL=market-mention-extractor.js.map