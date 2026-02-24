"use strict";
/**
 * Cross-Exchange Arbitrage Detector
 * Compares funding rates pairwise across Hyperliquid, Asterdex, and Binance.
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
const binance_funding_client_1 = __importDefault(require("./binance-funding-client"));
class CrossExchangeArbitrage {
    opportunitiesTable = 'cross_exchange_opportunities_v2';
    db = null;
    dbPath;
    initialized = false;
    config;
    exchangeOrder = ['hyperliquid', 'asterdex', 'binance'];
    constructor() {
        this.dbPath = process.env.FUNDING_DB_PATH || './data/funding.db';
        const arbConfig = config_1.default.getSection('crossExchangeArbitrage') || {};
        this.config = {
            minSpreadThreshold: arbConfig.minSpreadThreshold || 0.0001,
            minAnnualizedSpread: arbConfig.minAnnualizedSpread || 10,
            highUrgencyThreshold: arbConfig.highUrgencyThreshold || 50,
            mediumUrgencyThreshold: arbConfig.mediumUrgencyThreshold || 25,
            priceDiffThreshold: arbConfig.priceDiffThreshold || 0.5,
            symbolsToTrack: arbConfig.symbolsToTrack || ['BTC', 'ETH', 'SOL', 'AVAX', 'ARB', 'OP'],
        };
    }
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
    createTables() {
        if (!this.db)
            return;
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS ${this.opportunitiesTable} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL,
        exchangeA TEXT NOT NULL,
        exchangeB TEXT NOT NULL,
        exchangeAFunding REAL NOT NULL,
        exchangeBFunding REAL NOT NULL,
        spread REAL NOT NULL,
        spreadPercent REAL NOT NULL,
        annualizedSpread REAL NOT NULL,
        recommendedAction TEXT,
        longExchange TEXT,
        shortExchange TEXT,
        estimatedYearlyYield REAL,
        urgency TEXT CHECK(urgency IN ('high', 'medium', 'low')),
        timestamp INTEGER NOT NULL,
        isActive INTEGER DEFAULT 1,
        exchangeAMarkPrice REAL DEFAULT 0,
        exchangeBMarkPrice REAL DEFAULT 0,
        priceDiffPercent REAL DEFAULT 0,
        confidence REAL DEFAULT 100
      );

      CREATE INDEX IF NOT EXISTS idx_cross_exchange_v2_symbol
        ON ${this.opportunitiesTable}(symbol);
      CREATE INDEX IF NOT EXISTS idx_cross_exchange_v2_active
        ON ${this.opportunitiesTable}(isActive);
      CREATE INDEX IF NOT EXISTS idx_cross_exchange_v2_timestamp
        ON ${this.opportunitiesTable}(timestamp);
      CREATE INDEX IF NOT EXISTS idx_cross_exchange_v2_spread
        ON ${this.opportunitiesTable}(annualizedSpread);
      CREATE INDEX IF NOT EXISTS idx_cross_exchange_v2_urgency
        ON ${this.opportunitiesTable}(urgency);
      CREATE INDEX IF NOT EXISTS idx_cross_exchange_v2_pair
        ON ${this.opportunitiesTable}(exchangeA, exchangeB);
    `);
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
    async scanForOpportunities() {
        await this.initialize();
        try {
            const timestamp = Date.now();
            logger_1.default.info('[CrossExchangeArbitrage] Starting cross-exchange scan...');
            const [hlMap, asterMap, binanceMap] = await Promise.all([
                this.fetchHyperliquidData(),
                this.fetchAsterdexData(),
                this.fetchBinanceData(),
            ]);
            this.updateExchangeStatus('hyperliquid', hlMap.size > 0, [...hlMap.keys()]);
            this.updateExchangeStatus('asterdex', asterMap.size > 0, [...asterMap.keys()]);
            this.updateExchangeStatus('binance', binanceMap.size > 0, [...binanceMap.keys()]);
            const fundingBook = {
                hyperliquid: hlMap,
                asterdex: asterMap,
                binance: binanceMap,
            };
            const allSymbols = new Set();
            for (const ex of this.exchangeOrder) {
                for (const symbol of fundingBook[ex].keys()) {
                    allSymbols.add(symbol);
                }
            }
            const opportunities = [];
            for (const symbol of allSymbols) {
                const availableExchanges = this.exchangeOrder.filter(ex => fundingBook[ex].has(symbol));
                if (availableExchanges.length < 2)
                    continue;
                for (let i = 0; i < availableExchanges.length; i++) {
                    for (let j = i + 1; j < availableExchanges.length; j++) {
                        const exchangeA = availableExchanges[i];
                        const exchangeB = availableExchanges[j];
                        const dataA = fundingBook[exchangeA].get(symbol);
                        const dataB = fundingBook[exchangeB].get(symbol);
                        if (!dataA || !dataB)
                            continue;
                        const opportunity = this.calculateOpportunity(symbol, exchangeA, dataA, exchangeB, dataB, timestamp);
                        if (opportunity) {
                            opportunities.push(opportunity);
                        }
                    }
                }
            }
            if (opportunities.length > 0) {
                await this.storeOpportunities(opportunities);
            }
            this.deactivateOldOpportunities(timestamp);
            logger_1.default.info(`[CrossExchangeArbitrage] Found ${opportunities.length} cross-exchange opportunities`);
            return opportunities.sort((a, b) => Math.abs(b.annualizedSpread) - Math.abs(a.annualizedSpread));
        }
        catch (error) {
            logger_1.default.error('[CrossExchangeArbitrage] Failed to scan for opportunities:', error);
            throw error;
        }
    }
    async fetchHyperliquidData() {
        try {
            const { markets } = await hyperliquid_all_markets_1.default.getAllMarkets();
            const map = new Map();
            for (const market of markets) {
                const symbol = String(market.coin || '').toUpperCase();
                if (!symbol)
                    continue;
                map.set(symbol, {
                    symbol,
                    fundingRate: Number(market.fundingRate || 0),
                    markPrice: Number(market.markPx || market.markPrice || 0),
                    volume24h: Number(market.volume24h || 0),
                    timestamp: Date.now(),
                });
            }
            return map;
        }
        catch (error) {
            logger_1.default.error('[CrossExchangeArbitrage] Failed to fetch Hyperliquid data:', error);
            return new Map();
        }
    }
    async fetchAsterdexData() {
        try {
            const rates = await asterdex_client_1.default.getFundingRates();
            return this.mapAsterdexFundingRates(rates);
        }
        catch (error) {
            logger_1.default.error('[CrossExchangeArbitrage] Failed to fetch Asterdex data:', error);
            return new Map();
        }
    }
    async fetchBinanceData() {
        try {
            const rates = await binance_funding_client_1.default.getFundingRates();
            return this.mapBinanceFundingRates(rates);
        }
        catch (error) {
            logger_1.default.error('[CrossExchangeArbitrage] Failed to fetch Binance data:', error);
            return new Map();
        }
    }
    mapAsterdexFundingRates(rates) {
        const map = new Map();
        for (const rate of rates) {
            const symbol = this.normalizeSymbol(rate.symbol);
            if (!symbol)
                continue;
            map.set(symbol, {
                symbol,
                fundingRate: Number(rate.fundingRate || 0),
                markPrice: Number(rate.markPrice || 0),
                volume24h: Number(rate.volume24h || 0),
                timestamp: Number(rate.timestamp || Date.now()),
            });
        }
        return map;
    }
    mapBinanceFundingRates(rates) {
        const map = new Map();
        for (const rate of rates) {
            const symbol = this.normalizeSymbol(rate.symbol);
            if (!symbol)
                continue;
            map.set(symbol, {
                symbol,
                fundingRate: Number(rate.fundingRate || 0),
                markPrice: Number(rate.markPrice || 0),
                volume24h: Number(rate.volume24h || 0),
                timestamp: Number(rate.timestamp || Date.now()),
            });
        }
        return map;
    }
    normalizeSymbol(raw) {
        const symbol = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (!symbol)
            return '';
        const suffixes = ['USDT', 'USD', 'USDC', 'FDUSD', 'BUSD'];
        for (const suffix of suffixes) {
            if (symbol.endsWith(suffix) && symbol.length > suffix.length) {
                return symbol.slice(0, -suffix.length);
            }
        }
        return symbol;
    }
    calculateOpportunity(symbol, exchangeA, dataA, exchangeB, dataB, timestamp) {
        const spread = dataA.fundingRate - dataB.fundingRate;
        const spreadPercent = Math.abs(spread) * 100;
        const annualizedSpread = this.calculateAnnualizedSpread(spread);
        if (Math.abs(spread) < this.config.minSpreadThreshold) {
            return null;
        }
        if (Math.abs(annualizedSpread) < this.config.minAnnualizedSpread) {
            return null;
        }
        let priceDiffPercent = 0;
        if (dataA.markPrice > 0 && dataB.markPrice > 0) {
            const avgPrice = (dataA.markPrice + dataB.markPrice) / 2;
            if (avgPrice > 0) {
                priceDiffPercent = Math.abs(dataA.markPrice - dataB.markPrice) / avgPrice * 100;
            }
        }
        if (priceDiffPercent > this.config.priceDiffThreshold) {
            return null;
        }
        const shortExchange = spread > 0 ? exchangeA : exchangeB;
        const longExchange = spread > 0 ? exchangeB : exchangeA;
        const recommendedAction = `short_${shortExchange}_long_${longExchange}`;
        let urgency = 'low';
        const absAnnualized = Math.abs(annualizedSpread);
        if (absAnnualized >= this.config.highUrgencyThreshold)
            urgency = 'high';
        else if (absAnnualized >= this.config.mediumUrgencyThreshold)
            urgency = 'medium';
        let confidence = 100;
        if (priceDiffPercent > 0.1)
            confidence -= 10;
        if (priceDiffPercent > 0.3)
            confidence -= 15;
        if (dataA.volume24h > 0 && dataA.volume24h < 1_000_000)
            confidence -= 10;
        if (dataB.volume24h > 0 && dataB.volume24h < 1_000_000)
            confidence -= 10;
        if (dataA.markPrice <= 0 || dataB.markPrice <= 0)
            confidence -= 15;
        const now = Date.now();
        if (now - dataA.timestamp > 5 * 60 * 1000)
            confidence -= 10;
        if (now - dataB.timestamp > 5 * 60 * 1000)
            confidence -= 10;
        return {
            symbol,
            exchangeA,
            exchangeB,
            exchangeAFunding: dataA.fundingRate,
            exchangeBFunding: dataB.fundingRate,
            spread,
            spreadPercent,
            annualizedSpread,
            recommendedAction,
            longExchange,
            shortExchange,
            estimatedYearlyYield: absAnnualized,
            urgency,
            timestamp,
            isActive: true,
            exchangeAMarkPrice: dataA.markPrice,
            exchangeBMarkPrice: dataB.markPrice,
            priceDiffPercent,
            confidence: Math.max(0, confidence),
        };
    }
    calculateAnnualizedSpread(spread) {
        return spread * 3 * 365 * 100;
    }
    async storeOpportunities(opportunities) {
        if (!this.db || opportunities.length === 0)
            return;
        const deactivateForPair = this.db.prepare(`
      UPDATE ${this.opportunitiesTable}
      SET isActive = 0
      WHERE symbol = ? AND exchangeA = ? AND exchangeB = ? AND isActive = 1
    `);
        const insert = this.db.prepare(`
      INSERT INTO ${this.opportunitiesTable}
      (symbol, exchangeA, exchangeB, exchangeAFunding, exchangeBFunding, spread, spreadPercent,
       annualizedSpread, recommendedAction, longExchange, shortExchange, estimatedYearlyYield,
       urgency, timestamp, isActive, exchangeAMarkPrice, exchangeBMarkPrice, priceDiffPercent, confidence)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
    `);
        const txn = this.db.transaction((ops) => {
            for (const opp of ops) {
                deactivateForPair.run(opp.symbol, opp.exchangeA, opp.exchangeB);
                insert.run(opp.symbol, opp.exchangeA, opp.exchangeB, opp.exchangeAFunding, opp.exchangeBFunding, opp.spread, opp.spreadPercent, opp.annualizedSpread, opp.recommendedAction, opp.longExchange, opp.shortExchange, opp.estimatedYearlyYield, opp.urgency, opp.timestamp, opp.exchangeAMarkPrice, opp.exchangeBMarkPrice, opp.priceDiffPercent, opp.confidence);
            }
        });
        txn(opportunities);
        logger_1.default.info(`[CrossExchangeArbitrage] Stored ${opportunities.length} opportunities`);
    }
    deactivateOldOpportunities(currentTimestamp) {
        if (!this.db)
            return;
        const cutoffTime = currentTimestamp - (30 * 60 * 1000);
        const result = this.db.prepare(`
      UPDATE ${this.opportunitiesTable}
      SET isActive = 0
      WHERE isActive = 1 AND timestamp < ?
    `).run(cutoffTime);
        if (result.changes > 0) {
            logger_1.default.info(`[CrossExchangeArbitrage] Deactivated ${result.changes} old opportunities`);
        }
    }
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
    async getActiveOpportunities(minSpread) {
        await this.initialize();
        try {
            if (!this.db)
                return [];
            let query = `
        SELECT *
        FROM ${this.opportunitiesTable}
        WHERE isActive = 1
      `;
            const params = [];
            if (minSpread !== undefined) {
                query += ' AND ABS(annualizedSpread) >= ?';
                params.push(minSpread);
            }
            query += ' ORDER BY ABS(annualizedSpread) DESC';
            const rows = this.db.prepare(query).all(...params);
            return rows.map(row => this.mapRowToOpportunity(row));
        }
        catch (error) {
            logger_1.default.error('[CrossExchangeArbitrage] Failed to get active opportunities:', error);
            return [];
        }
    }
    async getOpportunitiesByUrgency(urgency) {
        await this.initialize();
        try {
            if (!this.db)
                return [];
            const rows = this.db.prepare(`
        SELECT *
        FROM ${this.opportunitiesTable}
        WHERE isActive = 1 AND urgency = ?
        ORDER BY ABS(annualizedSpread) DESC
      `).all(urgency);
            return rows.map(row => this.mapRowToOpportunity(row));
        }
        catch (error) {
            logger_1.default.error('[CrossExchangeArbitrage] Failed to get opportunities by urgency:', error);
            return [];
        }
    }
    async getOpportunityBySymbol(symbol) {
        await this.initialize();
        try {
            if (!this.db)
                return null;
            const row = this.db.prepare(`
        SELECT *
        FROM ${this.opportunitiesTable}
        WHERE symbol = ? AND isActive = 1
        ORDER BY ABS(annualizedSpread) DESC, timestamp DESC
        LIMIT 1
      `).get(symbol.toUpperCase());
            if (!row)
                return null;
            return this.mapRowToOpportunity(row);
        }
        catch (error) {
            logger_1.default.error(`[CrossExchangeArbitrage] Failed to get opportunity for ${symbol}:`, error);
            return null;
        }
    }
    async getExchangeInfo() {
        await this.initialize();
        try {
            if (!this.db)
                return [];
            const rows = this.db.prepare('SELECT * FROM exchange_status').all();
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
            const total = this.db.prepare(`
        SELECT COUNT(*) as count FROM ${this.opportunitiesTable} WHERE isActive = 1
      `).get();
            const high = this.db.prepare(`
        SELECT COUNT(*) as count FROM ${this.opportunitiesTable} WHERE isActive = 1 AND urgency = 'high'
      `).get();
            const medium = this.db.prepare(`
        SELECT COUNT(*) as count FROM ${this.opportunitiesTable} WHERE isActive = 1 AND urgency = 'medium'
      `).get();
            const low = this.db.prepare(`
        SELECT COUNT(*) as count FROM ${this.opportunitiesTable} WHERE isActive = 1 AND urgency = 'low'
      `).get();
            const bestRow = this.db.prepare(`
        SELECT symbol, exchangeA, exchangeB, ABS(annualizedSpread) as spread
        FROM ${this.opportunitiesTable}
        WHERE isActive = 1
        ORDER BY ABS(annualizedSpread) DESC
        LIMIT 1
      `).get();
            const avg = this.db.prepare(`
        SELECT AVG(ABS(annualizedSpread)) as avg
        FROM ${this.opportunitiesTable}
        WHERE isActive = 1
      `).get();
            const connected = this.db.prepare(`
        SELECT COUNT(*) as count FROM exchange_status WHERE connected = 1
      `).get();
            return {
                totalOpportunities: total.count,
                highUrgencyCount: high.count,
                mediumUrgencyCount: medium.count,
                lowUrgencyCount: low.count,
                bestSpread: bestRow ? { symbol: `${bestRow.symbol} (${bestRow.exchangeA}/${bestRow.exchangeB})`, spread: bestRow.spread } : null,
                avgSpread: avg?.avg || 0,
                connectedExchanges: connected.count,
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
    async getHistoricalOpportunities(symbol, hours = 24) {
        await this.initialize();
        try {
            if (!this.db)
                return [];
            const cutoffTime = Date.now() - (hours * 60 * 60 * 1000);
            const rows = this.db.prepare(`
        SELECT *
        FROM ${this.opportunitiesTable}
        WHERE symbol = ? AND timestamp >= ?
        ORDER BY timestamp DESC
      `).all(symbol.toUpperCase(), cutoffTime);
            return rows.map(row => this.mapRowToOpportunity(row));
        }
        catch (error) {
            logger_1.default.error(`[CrossExchangeArbitrage] Failed to get historical opportunities for ${symbol}:`, error);
            return [];
        }
    }
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        logger_1.default.info('[CrossExchangeArbitrage] Configuration updated');
    }
    async cleanupOldData(days = 7) {
        if (!this.db)
            return;
        try {
            const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);
            const result = this.db.prepare(`
        DELETE FROM ${this.opportunitiesTable}
        WHERE timestamp < ?
      `).run(cutoffTime);
            logger_1.default.info(`[CrossExchangeArbitrage] Cleaned up ${result.changes} old records`);
        }
        catch (error) {
            logger_1.default.error('[CrossExchangeArbitrage] Cleanup failed:', error);
        }
    }
    mapRowToOpportunity(row) {
        return {
            id: row.id,
            symbol: row.symbol,
            exchangeA: row.exchangeA,
            exchangeB: row.exchangeB,
            exchangeAFunding: row.exchangeAFunding,
            exchangeBFunding: row.exchangeBFunding,
            spread: row.spread,
            spreadPercent: row.spreadPercent,
            annualizedSpread: row.annualizedSpread,
            recommendedAction: row.recommendedAction,
            longExchange: row.longExchange,
            shortExchange: row.shortExchange,
            estimatedYearlyYield: row.estimatedYearlyYield,
            urgency: row.urgency,
            timestamp: row.timestamp,
            isActive: row.isActive === 1,
            exchangeAMarkPrice: row.exchangeAMarkPrice,
            exchangeBMarkPrice: row.exchangeBMarkPrice,
            priceDiffPercent: row.priceDiffPercent,
            confidence: row.confidence,
        };
    }
}
exports.crossExchangeArbitrage = new CrossExchangeArbitrage();
exports.default = exports.crossExchangeArbitrage;
//# sourceMappingURL=cross-exchange-arbitrage.js.map