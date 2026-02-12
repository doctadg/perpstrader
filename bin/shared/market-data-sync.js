"use strict";
// Market Data Sync Service
// Fetches and syncs market data from Hyperliquid and Polymarket
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.marketDataSync = void 0;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const logger_1 = __importDefault(require("../shared/logger"));
class MarketDataSync {
    db = null;
    dbPath;
    initialized = false;
    constructor() {
        this.dbPath = process.env.NEWS_DB_PATH || './data/news.db';
    }
    async initialize() {
        if (this.initialized)
            return;
        try {
            this.db = new better_sqlite3_1.default(this.dbPath);
            this.db.pragma('journal_mode = WAL');
            this.initialized = true;
            logger_1.default.info('[MarketDataSync] Initialized successfully');
        }
        catch (error) {
            logger_1.default.error('[MarketDataSync] Initialization failed:', error);
            throw error;
        }
    }
    /**
     * Fetch top coins from Hyperliquid
     * Returns top 50 by 24h volume
     */
    async fetchHyperliquidMarkets() {
        try {
            logger_1.default.info('[MarketDataSync] Fetching Hyperliquid market data...');
            // Fetch meta and context in parallel
            const [metaRes, contextRes] = await Promise.all([
                fetch('https://api.hyperliquid.xyz/info', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ type: 'meta' }),
                }),
                fetch('https://api.hyperliquid.xyz/info', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
                }),
            ]);
            if (!metaRes.ok || !contextRes.ok) {
                throw new Error(`HL API error: meta=${metaRes.status}, context=${contextRes.ok}`);
            }
            const meta = await metaRes.json();
            const context = await contextRes.json();
            if (!meta.universe || !context.assetCtxs) {
                throw new Error('Invalid Hyperliquid API response structure');
            }
            // Combine universe and context data
            const markets = meta.universe
                .map((asset, index) => {
                const ctx = context.assetCtxs[index];
                if (!ctx || ctx.coin !== asset.name) {
                    logger_1.default.warn(`[MarketDataSync] Mismatch at index ${index}: ${asset.name} vs ${ctx?.coin}`);
                    return null;
                }
                const volume24h = parseFloat(ctx.dayNtlVlm) || 0;
                return {
                    id: `hl_${asset.name.toLowerCase()}`,
                    type: 'hyperliquid',
                    symbol: asset.name,
                    name: asset.name,
                    description: `${asset.name} perpetual futures on Hyperliquid`,
                    category: 'CRYPTO',
                    subCategory: this.categorizeCrypto(asset.name),
                    volume24h,
                    priority: this.calculatePriority(volume24h, 'hyperliquid'),
                    hlCoin: asset.name,
                    hlIndex: index,
                };
            })
                .filter((m) => m !== null)
                .sort((a, b) => (b?.volume24h || 0) - (a?.volume24h || 0))
                .slice(0, 50); // Top 50 by volume
            logger_1.default.info(`[MarketDataSync] Fetched ${markets.length} Hyperliquid markets`);
            return markets;
        }
        catch (error) {
            logger_1.default.error('[MarketDataSync] Failed to fetch Hyperliquid markets:', error);
            return [];
        }
    }
    /**
     * Fetch active markets from Polymarket
     */
    async fetchPolymarketMarkets() {
        try {
            logger_1.default.info('[MarketDataSync] Fetching Polymarket data...');
            // Fetch all markets
            const response = await fetch('https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=1000');
            if (!response.ok) {
                throw new Error(`Polymarket API error: ${response.status}`);
            }
            const markets = await response.json();
            if (!Array.isArray(markets)) {
                throw new Error('Invalid Polymarket API response structure');
            }
            // Sort by volume and filter active
            const activeMarkets = markets
                .filter(m => m.active && !m.closed)
                .sort((a, b) => parseFloat(b.volume || '0') - parseFloat(a.volume || '0'))
                .slice(0, 100); // Top 100 by volume
            const marketData = activeMarkets.map(m => {
                const volumeUsd = parseFloat(m.volume || '0');
                const liquidity = parseFloat(m.liquidity || '0');
                // Parse outcomes and prices
                let outcomes = [];
                let probability;
                try {
                    outcomes = m.outcomes || [];
                    if (m.outcomePrices) {
                        const prices = JSON.parse(m.outcomePrices);
                        if (Array.isArray(prices) && prices.length > 0) {
                            probability = parseFloat(prices[0]);
                        }
                    }
                }
                catch (e) {
                    // Ignore parsing errors
                }
                // Categorize the market
                const { category, subCategory } = this.categorizePolymarket(m);
                return {
                    id: `pm_${m.conditionId}`,
                    type: 'polymarket',
                    name: m.question,
                    description: m.description,
                    category,
                    subCategory,
                    volume24h: volumeUsd,
                    priority: this.calculatePriority(volumeUsd, 'polymarket'),
                    pmMarketSlug: m.slug,
                    pmConditionId: m.conditionId,
                    pmQuestionId: m.conditionId, // Using conditionId as questionId
                    pmResolutionDate: m.endDate || undefined,
                    pmVolumeUsd: volumeUsd,
                    pmLiquidity: liquidity,
                    pmProbability: probability,
                    pmOutcomes: outcomes,
                };
            });
            logger_1.default.info(`[MarketDataSync] Fetched ${marketData.length} Polymarket markets`);
            return marketData;
        }
        catch (error) {
            logger_1.default.error('[MarketDataSync] Failed to fetch Polymarket markets:', error);
            return [];
        }
    }
    /**
     * Sync all markets to database
     */
    async syncAllMarkets() {
        await this.initialize();
        if (!this.db)
            throw new Error('Database not initialized');
        const now = new Date().toISOString();
        try {
            // Fetch from both sources
            const [hlMarkets, pmMarkets] = await Promise.all([
                this.fetchHyperliquidMarkets(),
                this.fetchPolymarketMarkets(),
            ]);
            const insertMarket = this.db.prepare(`
        INSERT INTO markets (
          id, type, symbol, name, description, category, sub_category,
          active, volume_24h, priority,
          hl_coin, hl_index,
          pm_market_slug, pm_condition_id, pm_question_id, pm_resolution_date,
          pm_volume_usd, pm_liquidity, pm_probability, pm_outcomes,
          first_seen, last_updated
        ) VALUES (
          @id, @type, @symbol, @name, @description, @category, @subCategory,
          1, @volume24h, @priority,
          @hlCoin, @hlIndex,
          @pmMarketSlug, @pmConditionId, @pmQuestionId, @pmResolutionDate,
          @pmVolumeUsd, @pmLiquidity, @pmProbability, @pmOutcomes,
          @firstSeen, @lastUpdated
        )
        ON CONFLICT(id) DO UPDATE SET
          volume_24h = @volume24h,
          priority = @priority,
          last_updated = @lastUpdated,
          active = 1,
          pm_volume_usd = COALESCE(@pmVolumeUsd, pm_volume_usd),
          pm_liquidity = COALESCE(@pmLiquidity, pm_liquidity),
          pm_probability = COALESCE(@pmProbability, pm_probability)
      `);
            const insertKeyword = this.db.prepare(`
        INSERT OR IGNORE INTO market_keywords (market_id, keyword, keyword_type, weight)
        VALUES (@marketId, @keyword, @keywordType, @weight)
      `);
            const txn = this.db.transaction(() => {
                let hlCount = 0;
                let pmCount = 0;
                // Insert Hyperliquid markets
                for (const m of hlMarkets) {
                    insertMarket.run({
                        ...m,
                        subCategory: m.subCategory || null,
                        hlCoin: m.hlCoin || null,
                        hlIndex: m.hlIndex || null,
                        pmMarketSlug: null,
                        pmConditionId: null,
                        pmQuestionId: null,
                        pmResolutionDate: null,
                        pmVolumeUsd: null,
                        pmLiquidity: null,
                        pmProbability: null,
                        pmOutcomes: m.pmOutcomes ? JSON.stringify(m.pmOutcomes) : null,
                        firstSeen: now,
                        lastUpdated: now,
                    });
                    // Insert keywords for this market
                    const keywords = this.generateKeywords(m);
                    for (const kw of keywords) {
                        insertKeyword.run({
                            marketId: m.id,
                            keyword: kw.keyword,
                            keywordType: kw.type,
                            weight: kw.weight,
                        });
                    }
                    hlCount++;
                }
                // Insert Polymarket markets
                for (const m of pmMarkets) {
                    insertMarket.run({
                        ...m,
                        symbol: m.symbol || null,
                        subCategory: m.subCategory || null,
                        hlCoin: null,
                        hlIndex: null,
                        pmMarketSlug: m.pmMarketSlug || null,
                        pmConditionId: m.pmConditionId || null,
                        pmQuestionId: m.pmQuestionId || null,
                        pmResolutionDate: m.pmResolutionDate || null,
                        pmVolumeUsd: m.pmVolumeUsd || null,
                        pmLiquidity: m.pmLiquidity || null,
                        pmProbability: m.pmProbability || null,
                        pmOutcomes: m.pmOutcomes ? JSON.stringify(m.pmOutcomes) : null,
                        firstSeen: now,
                        lastUpdated: now,
                    });
                    // Insert keywords for this market
                    const keywords = this.generateKeywords(m);
                    for (const kw of keywords) {
                        insertKeyword.run({
                            marketId: m.id,
                            keyword: kw.keyword,
                            keywordType: kw.type,
                            weight: kw.weight,
                        });
                    }
                    pmCount++;
                }
                return { hlCount, pmCount };
            });
            const result = txn();
            logger_1.default.info(`[MarketDataSync] Synced ${result.hlCount} HL + ${result.pmCount} PM markets`);
            return {
                hyperliquid: result.hlCount,
                polymarket: result.pmCount,
                total: result.hlCount + result.pmCount,
            };
        }
        catch (error) {
            logger_1.default.error('[MarketDataSync] Sync failed:', error);
            throw error;
        }
    }
    /**
     * Deactivate markets not seen in last sync
     */
    async deactivateStaleMarkets(hours = 24) {
        await this.initialize();
        if (!this.db)
            return 0;
        try {
            const result = this.db.prepare(`
        UPDATE markets 
        SET active = 0 
        WHERE active = 1 
        AND last_updated < datetime('now', '-${hours} hours')
      `).run();
            if (result.changes > 0) {
                logger_1.default.info(`[MarketDataSync] Deactivated ${result.changes} stale markets`);
            }
            return result.changes;
        }
        catch (error) {
            logger_1.default.error('[MarketDataSync] Failed to deactivate stale markets:', error);
            return 0;
        }
    }
    /**
     * Get all active markets
     */
    async getActiveMarkets() {
        await this.initialize();
        if (!this.db)
            return [];
        try {
            const rows = this.db.prepare(`
        SELECT * FROM markets WHERE active = 1 ORDER BY priority DESC, volume_24h DESC
      `).all();
            return rows.map(r => ({
                id: r.id,
                type: r.type,
                symbol: r.symbol,
                name: r.name,
                description: r.description,
                category: r.category,
                subCategory: r.sub_category,
                volume24h: r.volume_24h,
                priority: r.priority,
                hlCoin: r.hl_coin,
                hlIndex: r.hl_index,
                pmMarketSlug: r.pm_market_slug,
                pmConditionId: r.pm_condition_id,
                pmQuestionId: r.pm_question_id,
                pmResolutionDate: r.pm_resolution_date,
                pmVolumeUsd: r.pm_volume_usd,
                pmLiquidity: r.pm_liquidity,
                pmProbability: r.pm_probability,
                pmOutcomes: r.pm_outcomes ? JSON.parse(r.pm_outcomes) : undefined,
            }));
        }
        catch (error) {
            logger_1.default.error('[MarketDataSync] Failed to get active markets:', error);
            return [];
        }
    }
    // ============================================================================
    // Private Helpers
    // ============================================================================
    categorizeCrypto(coin) {
        const coinLower = coin.toLowerCase();
        // Major coins
        if (['btc', 'eth'].includes(coinLower))
            return 'Layer 1';
        // L2s
        if (['arb', 'op', 'base', 'mnt', 'strk', 'zk'].includes(coinLower))
            return 'Layer 2';
        // DeFi
        if (['uni', 'aave', 'crv', 'comp', 'mkr', 'lido', 'pendle', 'jup', 'ray'].includes(coinLower)) {
            return 'DeFi';
        }
        // Memes
        if (['doge', 'shib', 'pepe', 'floki', 'bonk', 'wif', 'mog'].includes(coinLower)) {
            return 'Meme';
        }
        // AI tokens
        if (['render', 'tao', 'fet', 'agix', 'wld', 'arkm'].includes(coinLower)) {
            return 'AI';
        }
        // Solana ecosystem
        if (['sol', 'jto', 'jup', 'ray', 'bonk', 'wif', 'popcat'].includes(coinLower)) {
            return 'Solana';
        }
        return 'Altcoin';
    }
    categorizePolymarket(market) {
        const question = (market.question || '').toLowerCase();
        const description = (market.description || '').toLowerCase();
        const groupCategory = market.group?.category?.toLowerCase() || '';
        const groupSlug = market.group?.slug?.toLowerCase() || '';
        // Politics
        if (groupCategory.includes('politics') ||
            question.includes('trump') ||
            question.includes('biden') ||
            question.includes('election') ||
            question.includes('president') ||
            question.includes('congress') ||
            question.includes('senate') ||
            question.includes('house')) {
            return { category: 'POLITICS', subCategory: this.extractPoliticalSubcategory(question) };
        }
        // Crypto
        if (groupCategory.includes('crypto') ||
            question.includes('bitcoin') ||
            question.includes('ethereum') ||
            question.includes('etf') ||
            question.includes('sec')) {
            return { category: 'CRYPTO', subCategory: 'Markets' };
        }
        // Sports
        if (groupCategory.includes('sports') ||
            question.includes('nba') ||
            question.includes('nfl') ||
            question.includes('mlb') ||
            question.includes('fifa') ||
            question.includes('world cup') ||
            question.includes('super bowl') ||
            question.includes('championship')) {
            return { category: 'SPORTS', subCategory: this.extractSportsSubcategory(question) };
        }
        // Tech
        if (groupCategory.includes('tech') ||
            question.includes('ai') ||
            question.includes('artificial intelligence') ||
            question.includes('openai') ||
            question.includes('google') ||
            question.includes('apple')) {
            return { category: 'TECH', subCategory: 'AI & Tech' };
        }
        // Economics
        if (question.includes('fed') ||
            question.includes('interest rate') ||
            question.includes('inflation') ||
            question.includes('gdp') ||
            question.includes('recession')) {
            return { category: 'ECONOMICS', subCategory: 'Macro' };
        }
        // Pop Culture
        if (groupCategory.includes('pop culture') ||
            question.includes('oscar') ||
            question.includes('grammy') ||
            question.includes('academy') ||
            question.includes('movie') ||
            question.includes('album')) {
            return { category: 'POP_CULTURE', subCategory: 'Entertainment' };
        }
        return { category: 'GENERAL', subCategory: 'Other' };
    }
    extractPoliticalSubcategory(question) {
        if (question.includes('trump'))
            return 'Trump';
        if (question.includes('biden'))
            return 'Biden';
        if (question.includes('election'))
            return 'Elections';
        if (question.includes('congress') || question.includes('senate') || question.includes('house')) {
            return 'Congress';
        }
        if (question.includes('uk ') || question.includes('britain'))
            return 'UK';
        if (question.includes('france') || question.includes('macron'))
            return 'France';
        if (question.includes('germany'))
            return 'Germany';
        return 'General';
    }
    extractSportsSubcategory(question) {
        if (question.includes('nba'))
            return 'NBA';
        if (question.includes('nfl'))
            return 'NFL';
        if (question.includes('mlb'))
            return 'MLB';
        if (question.includes('nhl'))
            return 'NHL';
        if (question.includes('soccer') || question.includes('fifa') || question.includes('world cup')) {
            return 'Soccer';
        }
        if (question.includes('ufc') || question.includes('mma'))
            return 'MMA';
        if (question.includes('tennis'))
            return 'Tennis';
        return 'General';
    }
    calculatePriority(volume, type) {
        if (type === 'hyperliquid') {
            // Priority based on volume tiers
            if (volume > 1_000_000_000)
                return 100; // $1B+
            if (volume > 500_000_000)
                return 90;
            if (volume > 100_000_000)
                return 80;
            if (volume > 50_000_000)
                return 70;
            if (volume > 10_000_000)
                return 60;
            if (volume > 1_000_000)
                return 50;
            return 30;
        }
        else {
            // Polymarket priority based on volume
            if (volume > 100_000_000)
                return 95;
            if (volume > 50_000_000)
                return 85;
            if (volume > 10_000_000)
                return 75;
            if (volume > 1_000_000)
                return 65;
            if (volume > 100_000)
                return 50;
            return 35;
        }
    }
    generateKeywords(market) {
        const keywords = [];
        if (market.type === 'hyperliquid') {
            // Primary name
            keywords.push({ keyword: market.name.toLowerCase(), type: 'primary', weight: 2.0 });
            // Ticker
            if (market.symbol) {
                keywords.push({ keyword: market.symbol.toLowerCase(), type: 'ticker', weight: 2.5 });
            }
            // Full name expansions for common coins
            const fullNames = {
                'btc': ['bitcoin'],
                'eth': ['ethereum'],
                'sol': ['solana'],
                'ada': ['cardano'],
                'dot': ['polkadot'],
                'link': ['chainlink'],
                'uni': ['uniswap'],
                'aave': ['aave'],
                'crv': ['curve'],
                'mkr': ['maker'],
                'snx': ['synthetix'],
                'comp': ['compound'],
                'yfi': ['yearn'],
                'sushi': ['sushiswap'],
                '1inch': ['1inch'],
                'lido': ['lido'],
                'pendle': ['pendle'],
                'jup': ['jupiter'],
                'ray': ['raydium'],
                'drift': ['drift'],
                'kmno': ['kamino'],
                'jto': ['jito'],
                'render': ['render', 'rndr'],
                'tao': ['bittensor'],
                'fet': ['fetch.ai'],
                'wld': ['worldcoin'],
                'arkm': ['arkham'],
                'doge': ['dogecoin'],
                'shib': ['shiba inu'],
                'pepe': ['pepe'],
                'bonk': ['bonk'],
                'wif': ['dogwifhat'],
                'mog': ['mog'],
                'floki': ['floki'],
                'popcat': ['popcat'],
                'arb': ['arbitrum'],
                'op': ['optimism'],
                'base': ['base'],
                'mnt': ['mantle'],
                'strk': ['starknet'],
                'zk': ['zksync'],
                'avax': ['avalanche'],
                'near': ['near protocol'],
                'ftm': ['fantom'],
                'matic': ['polygon'],
                'sui': ['sui'],
                'apt': ['aptos'],
                'sei': ['sei'],
                'inj': ['injective'],
                'dydx': ['dydx'],
                'gmx': ['gmx'],
                'gns': ['gains network'],
            };
            const symbol = market.symbol?.toLowerCase();
            if (symbol && fullNames[symbol]) {
                for (const name of fullNames[symbol]) {
                    if (name !== symbol) {
                        keywords.push({ keyword: name, type: 'alias', weight: 1.5 });
                    }
                }
            }
        }
        else {
            // Polymarket keywords from question
            const words = market.name.toLowerCase()
                .replace(/[^\w\s]/g, ' ')
                .split(/\s+/)
                .filter(w => w.length > 2 && !['will', 'the', 'and', 'for', 'are', 'was', 'were', 'have', 'has', 'had', 'that', 'this', 'with', 'from', 'they', 'been', 'their', 'said', 'each', 'which', 'what', 'about', 'could', 'would', 'should', 'there', 'where', 'when', 'than', 'them', 'these', 'those', 'being', 'having', 'after', 'before', 'above', 'below', 'under', 'over', 'into', 'onto', 'upon', 'within', 'without', 'through', 'during', 'until', 'while', 'because', 'since', 'until', 'although', 'unless', 'whether', 'either', 'neither', 'both', 'some', 'many', 'most', 'more', 'less', 'much', 'such', 'only', 'also', 'just', 'even', 'back', 'after', 'other', 'many', 'than', 'then', 'now', 'here', 'why', 'how', 'all', 'any', 'both', 'can', 'her', 'his', 'our', 'out', 'day', 'get', 'use', 'man', 'new', 'now', 'way', 'may', 'say', 'she', 'try', 'way', 'own', 'say', 'too', 'old', 'tell', 'very', 'when', 'come', 'here', 'show', 'every', 'good', 'me', 'give', 'our', 'under', 'name', 'very', 'through', 'just', 'form', 'sentence', 'great', 'think', 'where', 'help', 'through', 'much', 'before', 'move', 'right', 'boy', 'old', 'too', 'same', 'she', 'all', 'there', 'when', 'use', 'her', 'would', 'make', 'like', 'into', 'him', 'has', 'two', 'more', 'write', 'go', 'see', 'number', 'no', 'way', 'could', 'people', 'my', 'than', 'first', 'water', 'been', 'call', 'who', 'oil', 'its', 'now', 'find', 'long', 'down', 'day', 'did', 'get', 'come', 'made', 'may', 'part'].includes(w));
            // Add important words as keywords
            for (const word of words.slice(0, 10)) {
                keywords.push({ keyword: word, type: 'related', weight: 1.0 });
            }
            // Add full question as primary
            keywords.push({ keyword: market.name.toLowerCase(), type: 'primary', weight: 2.0 });
        }
        return keywords;
    }
}
exports.marketDataSync = new MarketDataSync();
exports.default = exports.marketDataSync;
//# sourceMappingURL=market-data-sync.js.map