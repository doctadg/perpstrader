"use strict";
/**
 * Cross-Exchange Arbitrage Detector
 * Compares funding rates between Hyperliquid and Asterdex
 * Identifies arbitrage opportunities for cross-exchange funding rate arbitrage
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.crossExchangeArbitrage = void 0;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const logger_1 = __importDefault(require("../shared/logger"));
const config_1 = __importDefault(require("../shared/config"));
const hyperliquid_all_markets_1 = __importDefault(require("./hyperliquid-all-markets"));
const asterdex_client_1 = __importDefault(require("./asterdex-client"));
class CrossExchangeArbitrage {
    db = null;
    dbPath;
    initialized = false;
    config;
    constructor() {
        this.dbPath = process.env.FUNDING_DB_PATH || './data/funding.db';
        // Load configuration
        const arbConfig = config_1.default.getSection('crossExchangeArbitrage') || {};
        this.config = {
            minSpreadThreshold: arbConfig.minSpreadThreshold || 0.0001,
            minAnnualizedSpread: arbConfig.minAnnualizedSpread || 10,
            highUrgencyThreshold: arbConfig.highUrgencyThreshold || 50,
            mediumUrgencyThreshold: arbConfig.mediumUrgencyThreshold || 25,
            priceDiffThreshold: arbConfig.priceDiffThreshold || 0.5, // 0.5% max price diff
            symbolsToTrack: arbConfig.symbolsToTrack || ['BTC', 'ETH', 'SOL', 'AVAX', 'ARB', 'OP'],
        };
    }
    /**
     * Initialize database connection
     */
    async initialize() {
        if (this.initialized)
            return;
        try {
            this.db = new better_sqlite3_1.default(this.dbPath);
            this.db.pragma('journal_mode = WAL');
            this.createTables();
            this.initialized = true;
            logger_1.default.info('[CrossExchangeArbitrage] Initialized successfully');
        }
        catch (error) {
            logger_1.default.error('[CrossExchangeArbitrage] Initialization failed:', error);
            throw error;
        }
    }
    /**
     * Create database tables
     */
    createTables() {
        if (!this.db)
            return;
        // Cross-exchange opportunities table
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS cross_exchange_opportunities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL,
        hyperliquidFunding REAL NOT NULL,
        asterdexFunding REAL NOT NULL,
        spread REAL NOT NULL,
        spreadPercent REAL NOT NULL,
        annualizedSpread REAL NOT NULL,
        recommendedAction TEXT CHECK(recommendedAction IN ('long_hl_short_aster', 'short_hl_long_aster')),
        estimatedYearlyYield REAL,
        urgency TEXT CHECK(urgency IN ('high', 'medium', 'low')),
        timestamp INTEGER NOT NULL,
        isActive INTEGER DEFAULT 1,
        hyperliquidMarkPrice REAL DEFAULT 0,
        asterdexMarkPrice REAL DEFAULT 0,
        priceDiffPercent REAL DEFAULT 0,
        confidence REAL DEFAULT 100
      );

      CREATE INDEX IF NOT EXISTS idx_cross_exchange_symbol 
        ON cross_exchange_opportunities(symbol);
      CREATE INDEX IF NOT EXISTS idx_cross_exchange_active 
        ON cross_exchange_opportunities(isActive);
      CREATE INDEX IF NOT EXISTS idx_cross_exchange_timestamp 
        ON cross_exchange_opportunities(timestamp);
      CREATE INDEX IF NOT EXISTS idx_cross_exchange_spread 
        ON cross_exchange_opportunities(spread);
      CREATE INDEX IF NOT EXISTS idx_cross_exchange_urgency 
        ON cross_exchange_opportunities(urgency);
    `);
        // Exchange status tracking
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS exchange_status (
        exchange TEXT PRIMARY KEY,
        connected INTEGER DEFAULT 0,
        lastUpdate INTEGER DEFAULT 0,
        symbols TEXT,
        errorMessage TEXT
      );
    `);
        logger_1.default.info('[CrossExchangeArbitrage] Database tables created');
    }
    /**
     * Scan for cross-exchange arbitrage opportunities
     */
    async scanForOpportunities() {
        await this.initialize();
        try {
            const timestamp = Date.now();
            logger_1.default.info('[CrossExchangeArbitrage] Starting cross-exchange scan...');
            // Fetch data from both exchanges in parallel
            const [hlMarkets, asterdexRates] = await Promise.all([
                this.fetchHyperliquidData(),
                this.fetchAsterdexData(),
            ]);
            // Update exchange status
            this.updateExchangeStatus('hyperliquid', hlMarkets.length > 0, hlMarkets.map(m => m.coin));
            this.updateExchangeStatus('asterdex', asterdexRates.length > 0, asterdexRates.map(r => r.symbol));
            // Find overlapping symbols
            const hlSymbols = new Set(hlMarkets.map(m => m.coin.toUpperCase()));
            const asterSymbols = new Set(asterdexRates.map(r => r.symbol.toUpperCase()));
            const overlappingSymbols = Array.from(hlSymbols).filter(s => asterSymbols.has(s));
            logger_1.default.info(`[CrossExchangeArbitrage] Found ${overlappingSymbols.length} overlapping symbols`);
            // Create opportunity map
            const opportunities = [];
            for (const symbol of overlappingSymbols) {
                const hlData = hlMarkets.find(m => m.coin.toUpperCase() === symbol);
                const asterData = asterdexRates.find(r => r.symbol.toUpperCase() === symbol);
                if (!hlData || !asterData)
                    continue;
                const opportunity = this.calculateOpportunity(symbol, hlData, asterData, timestamp);
                if (opportunity) {
                    opportunities.push(opportunity);
                }
            }
            // Store opportunities in database
            if (opportunities.length > 0) {
                await this.storeOpportunities(opportunities);
            }
            // Mark old opportunities as inactive
            this.deactivateOldOpportunities(timestamp);
            logger_1.default.info(`[CrossExchangeArbitrage] Found ${opportunities.length} cross-exchange opportunities`);
            // Sort by absolute annualized spread
            return opportunities.sort((a, b) => Math.abs(b.annualizedSpread) - Math.abs(a.annualizedSpread));
        }
        catch (error) {
            logger_1.default.error('[CrossExchangeArbitrage] Failed to scan for opportunities:', error);
            throw error;
        }
    }
    /**
     * Fetch Hyperliquid market data
     */
    async fetchHyperliquidData() {
        try {
            const { markets } = await hyperliquid_all_markets_1.default.getAllMarkets();
            return markets;
        }
        catch (error) {
            logger_1.default.error('[CrossExchangeArbitrage] Failed to fetch Hyperliquid data:', error);
            return [];
        }
    }
    /**
     * Fetch Asterdex funding rates
     */
    async fetchAsterdexData() {
        try {
            // Initialize Asterdex client if needed
            await asterdex_client_1.default.initialize();
            const rates = await asterdex_client_1.default.getFundingRates();
            return rates;
        }
        catch (error) {
            logger_1.default.error('[CrossExchangeArbitrage] Failed to fetch Asterdex data:', error);
            return [];
        }
    }
    /**
     * Calculate arbitrage opportunity for a symbol
     */
    calculateOpportunity(symbol, hlData, asterData, timestamp) {
        const hlFunding = hlData.fundingRate || 0;
        const asterFunding = asterData.fundingRate || 0;
        const hlMarkPrice = hlData.markPx || hlData.markPrice || 0;
        const asterMarkPrice = asterData.markPrice || 0;
        // Calculate spread
        const spread = hlFunding - asterFunding;
        const spreadPercent = Math.abs(spread) * 100;
        const annualizedSpread = this.calculateAnnualizedSpread(spread);
        // Check if spread meets threshold
        if (Math.abs(spread) < this.config.minSpreadThreshold) {
            return null;
        }
        if (Math.abs(annualizedSpread) < this.config.minAnnualizedSpread) {
            return null;
        }
        // Calculate price difference
        let priceDiffPercent = 0;
        if (hlMarkPrice > 0 && asterMarkPrice > 0) {
            priceDiffPercent = Math.abs(hlMarkPrice - asterMarkPrice) / hlMarkPrice * 100;
        }
        // Skip if price difference is too high (execution risk)
        if (priceDiffPercent > this.config.priceDiffThreshold) {
            logger_1.default.warn(`[CrossExchangeArbitrage] ${symbol}: Price diff too high (${priceDiffPercent.toFixed(2)}%), skipping`);
            return null;
        }
        // Determine recommended action
        let recommendedAction = null;
        if (hlFunding > asterFunding) {
            // HL has higher funding = short HL, long Asterdex
            recommendedAction = 'short_hl_long_aster';
        }
        else {
            // Asterdex has higher funding = long HL, short Asterdex
            recommendedAction = 'long_hl_short_aster';
        }
        // Determine urgency
        let urgency = 'low';
        const absAnnualized = Math.abs(annualizedSpread);
        if (absAnnualized >= this.config.highUrgencyThreshold) {
            urgency = 'high';
        }
        else if (absAnnualized >= this.config.mediumUrgencyThreshold) {
            urgency = 'medium';
        }
        // Calculate confidence (based on data quality)
        let confidence = 100;
        if (priceDiffPercent > 0.1)
            confidence -= 10;
        if (priceDiffPercent > 0.3)
            confidence -= 20;
        if (hlData.volume24h < 1000000)
            confidence -= 15; // Low volume on HL
        if (!asterdex_client_1.default.isConnected())
            confidence -= 10; // WS not connected
        return {
            symbol,
            hyperliquidFunding: hlFunding,
            asterdexFunding: asterFunding,
            spread,
            spreadPercent,
            annualizedSpread,
            recommendedAction,
            estimatedYearlyYield: absAnnualized,
            urgency,
            timestamp,
            isActive: true,
            hyperliquidMarkPrice: hlMarkPrice,
            asterdexMarkPrice: asterMarkPrice,
            priceDiffPercent,
            confidence: Math.max(0, confidence),
        };
    }
    /**
     * Calculate annualized spread
     * Assumes funding paid 3 times per day (every 8 hours)
     */
    calculateAnnualizedSpread(spread) {
        return spread * 3 * 365 * 100; // Convert to percentage
    }
    /**
     * Store opportunities in database
     */
    async storeOpportunities(opportunities) {
        if (!this.db || opportunities.length === 0)
            return;
        const insert = this.db.prepare(`
      INSERT INTO cross_exchange_opportunities 
      (symbol, hyperliquidFunding, asterdexFunding, spread, spreadPercent, annualizedSpread, 
       recommendedAction, estimatedYearlyYield, urgency, timestamp, isActive,
       hyperliquidMarkPrice, asterdexMarkPrice, priceDiffPercent, confidence)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
    `);
        const txn = this.db.transaction((ops) => {
            for (const opp of ops) {
                // Deactivate previous opportunities for this symbol
                this.db.prepare(`
          UPDATE cross_exchange_opportunities 
          SET isActive = 0 
          WHERE symbol = ? AND isActive = 1
        `).run(opp.symbol);
                // Insert new opportunity
                insert.run(opp.symbol, opp.hyperliquidFunding, opp.asterdexFunding, opp.spread, opp.spreadPercent, opp.annualizedSpread, opp.recommendedAction, opp.estimatedYearlyYield, opp.urgency, opp.timestamp, opp.hyperliquidMarkPrice, opp.asterdexMarkPrice, opp.priceDiffPercent, opp.confidence);
            }
        });
        txn(opportunities);
        logger_1.default.info(`[CrossExchangeArbitrage] Stored ${opportunities.length} opportunities`);
    }
    /**
     * Deactivate old opportunities
     */
    deactivateOldOpportunities(currentTimestamp) {
        if (!this.db)
            return;
        const cutoffTime = currentTimestamp - (30 * 60 * 1000); // 30 minutes
        const result = this.db.prepare(`
      UPDATE cross_exchange_opportunities 
      SET isActive = 0 
      WHERE isActive = 1 AND timestamp < ?
    `).run(cutoffTime);
        if (result.changes > 0) {
            logger_1.default.info(`[CrossExchangeArbitrage] Deactivated ${result.changes} old opportunities`);
        }
    }
    /**
     * Update exchange status in database
     */
    updateExchangeStatus(exchange, connected, symbols) {
        if (!this.db)
            return;
        this.db.prepare(`
      INSERT INTO exchange_status (exchange, connected, lastUpdate, symbols)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(exchange) DO UPDATE SET
        connected = excluded.connected,
        lastUpdate = excluded.lastUpdate,
        symbols = excluded.symbols
    `).run(exchange, connected ? 1 : 0, Date.now(), JSON.stringify(symbols));
    }
    /**
     * Get all active cross-exchange opportunities
     */
    async getActiveOpportunities(minSpread) {
        await this.initialize();
        try {
            if (!this.db)
                return [];
            let query = `
        SELECT *
        FROM cross_exchange_opportunities
        WHERE isActive = 1
      `;
            const params = [];
            if (minSpread !== undefined) {
                query += ' AND ABS(annualizedSpread) >= ?';
                params.push(minSpread);
            }
            query += ' ORDER BY ABS(annualizedSpread) DESC';
            const rows = this.db.prepare(query).all(...params);
            return rows.map(row => ({
                id: row.id,
                symbol: row.symbol,
                hyperliquidFunding: row.hyperliquidFunding,
                asterdexFunding: row.asterdexFunding,
                spread: row.spread,
                spreadPercent: row.spreadPercent,
                annualizedSpread: row.annualizedSpread,
                recommendedAction: row.recommendedAction,
                estimatedYearlyYield: row.estimatedYearlyYield,
                urgency: row.urgency,
                timestamp: row.timestamp,
                isActive: row.isActive === 1,
                hyperliquidMarkPrice: row.hyperliquidMarkPrice,
                asterdexMarkPrice: row.asterdexMarkPrice,
                priceDiffPercent: row.priceDiffPercent,
                confidence: row.confidence,
            }));
        }
        catch (error) {
            logger_1.default.error('[CrossExchangeArbitrage] Failed to get active opportunities:', error);
            return [];
        }
    }
    /**
     * Get opportunities by urgency level
     */
    async getOpportunitiesByUrgency(urgency) {
        await this.initialize();
        try {
            if (!this.db)
                return [];
            const rows = this.db.prepare(`
        SELECT *
        FROM cross_exchange_opportunities
        WHERE isActive = 1 AND urgency = ?
        ORDER BY ABS(annualizedSpread) DESC
      `).all(urgency);
            return rows.map(row => ({
                id: row.id,
                symbol: row.symbol,
                hyperliquidFunding: row.hyperliquidFunding,
                asterdexFunding: row.asterdexFunding,
                spread: row.spread,
                spreadPercent: row.spreadPercent,
                annualizedSpread: row.annualizedSpread,
                recommendedAction: row.recommendedAction,
                estimatedYearlyYield: row.estimatedYearlyYield,
                urgency: row.urgency,
                timestamp: row.timestamp,
                isActive: row.isActive === 1,
                hyperliquidMarkPrice: row.hyperliquidMarkPrice,
                asterdexMarkPrice: row.asterdexMarkPrice,
                priceDiffPercent: row.priceDiffPercent,
                confidence: row.confidence,
            }));
        }
        catch (error) {
            logger_1.default.error('[CrossExchangeArbitrage] Failed to get opportunities by urgency:', error);
            return [];
        }
    }
    /**
     * Get opportunity by symbol
     */
    async getOpportunityBySymbol(symbol) {
        await this.initialize();
        try {
            if (!this.db)
                return null;
            const row = this.db.prepare(`
        SELECT *
        FROM cross_exchange_opportunities
        WHERE symbol = ? AND isActive = 1
        ORDER BY timestamp DESC
        LIMIT 1
      `).get(symbol.toUpperCase());
            if (!row)
                return null;
            return {
                id: row.id,
                symbol: row.symbol,
                hyperliquidFunding: row.hyperliquidFunding,
                asterdexFunding: row.asterdexFunding,
                spread: row.spread,
                spreadPercent: row.spreadPercent,
                annualizedSpread: row.annualizedSpread,
                recommendedAction: row.recommendedAction,
                estimatedYearlyYield: row.estimatedYearlyYield,
                urgency: row.urgency,
                timestamp: row.timestamp,
                isActive: row.isActive === 1,
                hyperliquidMarkPrice: row.hyperliquidMarkPrice,
                asterdexMarkPrice: row.asterdexMarkPrice,
                priceDiffPercent: row.priceDiffPercent,
                confidence: row.confidence,
            };
        }
        catch (error) {
            logger_1.default.error(`[CrossExchangeArbitrage] Failed to get opportunity for ${symbol}:`, error);
            return null;
        }
    }
    /**
     * Get connected exchanges info
     */
    async getExchangeInfo() {
        await this.initialize();
        try {
            if (!this.db)
                return [];
            const rows = this.db.prepare(`
        SELECT * FROM exchange_status
      `).all();
            return rows.map(row => ({
                name: row.exchange,
                connected: row.connected === 1,
                lastUpdate: row.lastUpdate,
                symbols: row.symbols ? JSON.parse(row.symbols) : [],
            }));
        }
        catch (error) {
            logger_1.default.error('[CrossExchangeArbitrage] Failed to get exchange info:', error);
            return [];
        }
    }
    /**
     * Get arbitrage statistics
     */
    async getStatistics() {
        await this.initialize();
        try {
            if (!this.db) {
                return {
                    totalOpportunities: 0,
                    highUrgencyCount: 0,
                    mediumUrgencyCount: 0,
                    lowUrgencyCount: 0,
                    bestSpread: null,
                    avgSpread: 0,
                    connectedExchanges: 0,
                };
            }
            const totalOpportunities = this.db.prepare(`
        SELECT COUNT(*) as count FROM cross_exchange_opportunities WHERE isActive = 1
      `).get();
            const highUrgency = this.db.prepare(`
        SELECT COUNT(*) as count FROM cross_exchange_opportunities 
        WHERE isActive = 1 AND urgency = 'high'
      `).get();
            const mediumUrgency = this.db.prepare(`
        SELECT COUNT(*) as count FROM cross_exchange_opportunities 
        WHERE isActive = 1 AND urgency = 'medium'
      `).get();
            const lowUrgency = this.db.prepare(`
        SELECT COUNT(*) as count FROM cross_exchange_opportunities 
        WHERE isActive = 1 AND urgency = 'low'
      `).get();
            const bestSpread = this.db.prepare(`
        SELECT symbol, ABS(annualizedSpread) as spread
        FROM cross_exchange_opportunities
        WHERE isActive = 1
        ORDER BY ABS(annualizedSpread) DESC
        LIMIT 1
      `).get();
            const avgSpread = this.db.prepare(`
        SELECT AVG(ABS(annualizedSpread)) as avg
        FROM cross_exchange_opportunities
        WHERE isActive = 1
      `).get();
            const connectedExchanges = this.db.prepare(`
        SELECT COUNT(*) as count FROM exchange_status WHERE connected = 1
      `).get();
            return {
                totalOpportunities: totalOpportunities.count,
                highUrgencyCount: highUrgency.count,
                mediumUrgencyCount: mediumUrgency.count,
                lowUrgencyCount: lowUrgency.count,
                bestSpread: bestSpread ? { symbol: bestSpread.symbol, spread: bestSpread.spread } : null,
                avgSpread: avgSpread?.avg || 0,
                connectedExchanges: connectedExchanges.count,
            };
        }
        catch (error) {
            logger_1.default.error('[CrossExchangeArbitrage] Failed to get statistics:', error);
            return {
                totalOpportunities: 0,
                highUrgencyCount: 0,
                mediumUrgencyCount: 0,
                lowUrgencyCount: 0,
                bestSpread: null,
                avgSpread: 0,
                connectedExchanges: 0,
            };
        }
    }
    /**
     * Get historical opportunities for a symbol
     */
    async getHistoricalOpportunities(symbol, hours = 24) {
        await this.initialize();
        try {
            if (!this.db)
                return [];
            const cutoffTime = Date.now() - (hours * 60 * 60 * 1000);
            const rows = this.db.prepare(`
        SELECT *
        FROM cross_exchange_opportunities
        WHERE symbol = ? AND timestamp >= ?
        ORDER BY timestamp DESC
      `).all(symbol.toUpperCase(), cutoffTime);
            return rows.map(row => ({
                id: row.id,
                symbol: row.symbol,
                hyperliquidFunding: row.hyperliquidFunding,
                asterdexFunding: row.asterdexFunding,
                spread: row.spread,
                spreadPercent: row.spreadPercent,
                annualizedSpread: row.annualizedSpread,
                recommendedAction: row.recommendedAction,
                estimatedYearlyYield: row.estimatedYearlyYield,
                urgency: row.urgency,
                timestamp: row.timestamp,
                isActive: row.isActive === 1,
                hyperliquidMarkPrice: row.hyperliquidMarkPrice,
                asterdexMarkPrice: row.asterdexMarkPrice,
                priceDiffPercent: row.priceDiffPercent,
                confidence: row.confidence,
            }));
        }
        catch (error) {
            logger_1.default.error(`[CrossExchangeArbitrage] Failed to get historical opportunities for ${symbol}:`, error);
            return [];
        }
    }
    /**
     * Update configuration
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        logger_1.default.info('[CrossExchangeArbitrage] Configuration updated');
    }
    /**
     * Clean up old data
     */
    async cleanupOldData(days = 7) {
        if (!this.db)
            return;
        try {
            const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);
            const result = this.db.prepare(`
        DELETE FROM cross_exchange_opportunities 
        WHERE timestamp < ?
      `).run(cutoffTime);
            logger_1.default.info(`[CrossExchangeArbitrage] Cleaned up ${result.changes} old records`);
        }
        catch (error) {
            logger_1.default.error('[CrossExchangeArbitrage] Cleanup failed:', error);
        }
    }
}
// Export singleton instance
exports.crossExchangeArbitrage = new CrossExchangeArbitrage();
exports.default = exports.crossExchangeArbitrage;
//# sourceMappingURL=cross-exchange-arbitrage.js.map