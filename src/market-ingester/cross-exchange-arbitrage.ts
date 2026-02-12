/**
 * Cross-Exchange Arbitrage Detector
 * Compares funding rates between Hyperliquid and Asterdex
 * Identifies arbitrage opportunities for cross-exchange funding rate arbitrage
 */

import Database from 'better-sqlite3';
import logger from '../shared/logger';
import config from '../shared/config';
import hyperliquidAllMarkets from './hyperliquid-all-markets';
import asterdexClient, { AsterdexFundingRate } from './asterdex-client';

// Cross-exchange opportunity structure
interface CrossExchangeOpportunity {
  id?: number;
  symbol: string;
  hyperliquidFunding: number;
  asterdexFunding: number;
  spread: number; // Absolute difference
  spreadPercent: number; // Spread as percentage
  annualizedSpread: number; // Annualized difference
  recommendedAction: 'long_hl_short_aster' | 'short_hl_long_aster' | null;
  estimatedYearlyYield: number;
  urgency: 'high' | 'medium' | 'low';
  timestamp: number;
  isActive: boolean;
  hyperliquidMarkPrice: number;
  asterdexMarkPrice: number;
  priceDiffPercent: number;
  confidence: number; // 0-100 based on data quality
}

// Exchange info
interface ExchangeInfo {
  name: string;
  connected: boolean;
  lastUpdate: number;
  symbols: string[];
}

// Scanner configuration
interface ArbitrageConfig {
  minSpreadThreshold: number; // Minimum spread to consider (default: 0.0001 = 0.01%)
  minAnnualizedSpread: number; // Minimum annualized spread (default: 10% APR)
  highUrgencyThreshold: number; // Annualized spread for high urgency (default: 50% APR)
  mediumUrgencyThreshold: number; // Annualized spread for medium urgency (default: 25% APR)
  priceDiffThreshold: number; // Max acceptable price difference between exchanges
  symbolsToTrack: string[]; // Priority symbols to always check
}

class CrossExchangeArbitrage {
  private db: Database.Database | null = null;
  private dbPath: string;
  private initialized: boolean = false;
  private config: ArbitrageConfig;

  constructor() {
    this.dbPath = process.env.FUNDING_DB_PATH || './data/funding.db';
    
    // Load configuration
    const arbConfig = config.getSection('crossExchangeArbitrage') || {};
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
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      this.db = new Database(this.dbPath);
      this.db.pragma('journal_mode = WAL');
      this.createTables();
      this.initialized = true;
      logger.info('[CrossExchangeArbitrage] Initialized successfully');
    } catch (error) {
      logger.error('[CrossExchangeArbitrage] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Create database tables
   */
  private createTables(): void {
    if (!this.db) return;

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

    logger.info('[CrossExchangeArbitrage] Database tables created');
  }

  /**
   * Scan for cross-exchange arbitrage opportunities
   */
  async scanForOpportunities(): Promise<CrossExchangeOpportunity[]> {
    await this.initialize();

    try {
      const timestamp = Date.now();
      logger.info('[CrossExchangeArbitrage] Starting cross-exchange scan...');

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

      logger.info(`[CrossExchangeArbitrage] Found ${overlappingSymbols.length} overlapping symbols`);

      // Create opportunity map
      const opportunities: CrossExchangeOpportunity[] = [];

      for (const symbol of overlappingSymbols) {
        const hlData = hlMarkets.find(m => m.coin.toUpperCase() === symbol);
        const asterData = asterdexRates.find(r => r.symbol.toUpperCase() === symbol);

        if (!hlData || !asterData) continue;

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

      logger.info(`[CrossExchangeArbitrage] Found ${opportunities.length} cross-exchange opportunities`);
      
      // Sort by absolute annualized spread
      return opportunities.sort((a, b) => 
        Math.abs(b.annualizedSpread) - Math.abs(a.annualizedSpread)
      );
    } catch (error) {
      logger.error('[CrossExchangeArbitrage] Failed to scan for opportunities:', error);
      throw error;
    }
  }

  /**
   * Fetch Hyperliquid market data
   */
  private async fetchHyperliquidData(): Promise<any[]> {
    try {
      const { markets } = await hyperliquidAllMarkets.getAllMarkets();
      return markets;
    } catch (error) {
      logger.error('[CrossExchangeArbitrage] Failed to fetch Hyperliquid data:', error);
      return [];
    }
  }

  /**
   * Fetch Asterdex funding rates
   */
  private async fetchAsterdexData(): Promise<AsterdexFundingRate[]> {
    try {
      // Initialize Asterdex client if needed
      await asterdexClient.initialize();
      
      const rates = await asterdexClient.getFundingRates();
      return rates;
    } catch (error) {
      logger.error('[CrossExchangeArbitrage] Failed to fetch Asterdex data:', error);
      return [];
    }
  }

  /**
   * Calculate arbitrage opportunity for a symbol
   */
  private calculateOpportunity(
    symbol: string,
    hlData: any,
    asterData: AsterdexFundingRate,
    timestamp: number
  ): CrossExchangeOpportunity | null {
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
      logger.warn(`[CrossExchangeArbitrage] ${symbol}: Price diff too high (${priceDiffPercent.toFixed(2)}%), skipping`);
      return null;
    }

    // Determine recommended action
    let recommendedAction: 'long_hl_short_aster' | 'short_hl_long_aster' | null = null;
    
    if (hlFunding > asterFunding) {
      // HL has higher funding = short HL, long Asterdex
      recommendedAction = 'short_hl_long_aster';
    } else {
      // Asterdex has higher funding = long HL, short Asterdex
      recommendedAction = 'long_hl_short_aster';
    }

    // Determine urgency
    let urgency: 'high' | 'medium' | 'low' = 'low';
    const absAnnualized = Math.abs(annualizedSpread);
    
    if (absAnnualized >= this.config.highUrgencyThreshold) {
      urgency = 'high';
    } else if (absAnnualized >= this.config.mediumUrgencyThreshold) {
      urgency = 'medium';
    }

    // Calculate confidence (based on data quality)
    let confidence = 100;
    if (priceDiffPercent > 0.1) confidence -= 10;
    if (priceDiffPercent > 0.3) confidence -= 20;
    if (hlData.volume24h < 1000000) confidence -= 15; // Low volume on HL
    if (!asterdexClient.isConnected()) confidence -= 10; // WS not connected

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
  private calculateAnnualizedSpread(spread: number): number {
    return spread * 3 * 365 * 100; // Convert to percentage
  }

  /**
   * Store opportunities in database
   */
  private async storeOpportunities(opportunities: CrossExchangeOpportunity[]): Promise<void> {
    if (!this.db || opportunities.length === 0) return;

    const insert = this.db.prepare(`
      INSERT INTO cross_exchange_opportunities 
      (symbol, hyperliquidFunding, asterdexFunding, spread, spreadPercent, annualizedSpread, 
       recommendedAction, estimatedYearlyYield, urgency, timestamp, isActive,
       hyperliquidMarkPrice, asterdexMarkPrice, priceDiffPercent, confidence)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
    `);

    const txn = this.db.transaction((ops: CrossExchangeOpportunity[]) => {
      for (const opp of ops) {
        // Deactivate previous opportunities for this symbol
        this.db!.prepare(`
          UPDATE cross_exchange_opportunities 
          SET isActive = 0 
          WHERE symbol = ? AND isActive = 1
        `).run(opp.symbol);

        // Insert new opportunity
        insert.run(
          opp.symbol,
          opp.hyperliquidFunding,
          opp.asterdexFunding,
          opp.spread,
          opp.spreadPercent,
          opp.annualizedSpread,
          opp.recommendedAction,
          opp.estimatedYearlyYield,
          opp.urgency,
          opp.timestamp,
          opp.hyperliquidMarkPrice,
          opp.asterdexMarkPrice,
          opp.priceDiffPercent,
          opp.confidence
        );
      }
    });

    txn(opportunities);
    logger.info(`[CrossExchangeArbitrage] Stored ${opportunities.length} opportunities`);
  }

  /**
   * Deactivate old opportunities
   */
  private deactivateOldOpportunities(currentTimestamp: number): void {
    if (!this.db) return;

    const cutoffTime = currentTimestamp - (30 * 60 * 1000); // 30 minutes

    const result = this.db.prepare(`
      UPDATE cross_exchange_opportunities 
      SET isActive = 0 
      WHERE isActive = 1 AND timestamp < ?
    `).run(cutoffTime);

    if (result.changes > 0) {
      logger.info(`[CrossExchangeArbitrage] Deactivated ${result.changes} old opportunities`);
    }
  }

  /**
   * Update exchange status in database
   */
  private updateExchangeStatus(exchange: string, connected: boolean, symbols: string[]): void {
    if (!this.db) return;

    this.db.prepare(`
      INSERT INTO exchange_status (exchange, connected, lastUpdate, symbols)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(exchange) DO UPDATE SET
        connected = excluded.connected,
        lastUpdate = excluded.lastUpdate,
        symbols = excluded.symbols
    `).run(
      exchange,
      connected ? 1 : 0,
      Date.now(),
      JSON.stringify(symbols)
    );
  }

  /**
   * Get all active cross-exchange opportunities
   */
  async getActiveOpportunities(minSpread?: number): Promise<CrossExchangeOpportunity[]> {
    await this.initialize();

    try {
      if (!this.db) return [];

      let query = `
        SELECT *
        FROM cross_exchange_opportunities
        WHERE isActive = 1
      `;

      const params: any[] = [];

      if (minSpread !== undefined) {
        query += ' AND ABS(annualizedSpread) >= ?';
        params.push(minSpread);
      }

      query += ' ORDER BY ABS(annualizedSpread) DESC';

      const rows = this.db.prepare(query).all(...params) as any[];

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
    } catch (error) {
      logger.error('[CrossExchangeArbitrage] Failed to get active opportunities:', error);
      return [];
    }
  }

  /**
   * Get opportunities by urgency level
   */
  async getOpportunitiesByUrgency(urgency: 'high' | 'medium' | 'low'): Promise<CrossExchangeOpportunity[]> {
    await this.initialize();

    try {
      if (!this.db) return [];

      const rows = this.db.prepare(`
        SELECT *
        FROM cross_exchange_opportunities
        WHERE isActive = 1 AND urgency = ?
        ORDER BY ABS(annualizedSpread) DESC
      `).all(urgency) as any[];

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
    } catch (error) {
      logger.error('[CrossExchangeArbitrage] Failed to get opportunities by urgency:', error);
      return [];
    }
  }

  /**
   * Get opportunity by symbol
   */
  async getOpportunityBySymbol(symbol: string): Promise<CrossExchangeOpportunity | null> {
    await this.initialize();

    try {
      if (!this.db) return null;

      const row = this.db.prepare(`
        SELECT *
        FROM cross_exchange_opportunities
        WHERE symbol = ? AND isActive = 1
        ORDER BY timestamp DESC
        LIMIT 1
      `).get(symbol.toUpperCase()) as any;

      if (!row) return null;

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
    } catch (error) {
      logger.error(`[CrossExchangeArbitrage] Failed to get opportunity for ${symbol}:`, error);
      return null;
    }
  }

  /**
   * Get connected exchanges info
   */
  async getExchangeInfo(): Promise<ExchangeInfo[]> {
    await this.initialize();

    try {
      if (!this.db) return [];

      const rows = this.db.prepare(`
        SELECT * FROM exchange_status
      `).all() as any[];

      return rows.map(row => ({
        name: row.exchange,
        connected: row.connected === 1,
        lastUpdate: row.lastUpdate,
        symbols: row.symbols ? JSON.parse(row.symbols) : [],
      }));
    } catch (error) {
      logger.error('[CrossExchangeArbitrage] Failed to get exchange info:', error);
      return [];
    }
  }

  /**
   * Get arbitrage statistics
   */
  async getStatistics(): Promise<{
    totalOpportunities: number;
    highUrgencyCount: number;
    mediumUrgencyCount: number;
    lowUrgencyCount: number;
    bestSpread: { symbol: string; spread: number } | null;
    avgSpread: number;
    connectedExchanges: number;
  }> {
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
      `).get() as { count: number };

      const highUrgency = this.db.prepare(`
        SELECT COUNT(*) as count FROM cross_exchange_opportunities 
        WHERE isActive = 1 AND urgency = 'high'
      `).get() as { count: number };

      const mediumUrgency = this.db.prepare(`
        SELECT COUNT(*) as count FROM cross_exchange_opportunities 
        WHERE isActive = 1 AND urgency = 'medium'
      `).get() as { count: number };

      const lowUrgency = this.db.prepare(`
        SELECT COUNT(*) as count FROM cross_exchange_opportunities 
        WHERE isActive = 1 AND urgency = 'low'
      `).get() as { count: number };

      const bestSpread = this.db.prepare(`
        SELECT symbol, ABS(annualizedSpread) as spread
        FROM cross_exchange_opportunities
        WHERE isActive = 1
        ORDER BY ABS(annualizedSpread) DESC
        LIMIT 1
      `).get() as { symbol: string; spread: number } | undefined;

      const avgSpread = this.db.prepare(`
        SELECT AVG(ABS(annualizedSpread)) as avg
        FROM cross_exchange_opportunities
        WHERE isActive = 1
      `).get() as { avg: number } | undefined;

      const connectedExchanges = this.db.prepare(`
        SELECT COUNT(*) as count FROM exchange_status WHERE connected = 1
      `).get() as { count: number };

      return {
        totalOpportunities: totalOpportunities.count,
        highUrgencyCount: highUrgency.count,
        mediumUrgencyCount: mediumUrgency.count,
        lowUrgencyCount: lowUrgency.count,
        bestSpread: bestSpread ? { symbol: bestSpread.symbol, spread: bestSpread.spread } : null,
        avgSpread: avgSpread?.avg || 0,
        connectedExchanges: connectedExchanges.count,
      };
    } catch (error) {
      logger.error('[CrossExchangeArbitrage] Failed to get statistics:', error);
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
  async getHistoricalOpportunities(symbol: string, hours: number = 24): Promise<CrossExchangeOpportunity[]> {
    await this.initialize();

    try {
      if (!this.db) return [];

      const cutoffTime = Date.now() - (hours * 60 * 60 * 1000);

      const rows = this.db.prepare(`
        SELECT *
        FROM cross_exchange_opportunities
        WHERE symbol = ? AND timestamp >= ?
        ORDER BY timestamp DESC
      `).all(symbol.toUpperCase(), cutoffTime) as any[];

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
    } catch (error) {
      logger.error(`[CrossExchangeArbitrage] Failed to get historical opportunities for ${symbol}:`, error);
      return [];
    }
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<ArbitrageConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logger.info('[CrossExchangeArbitrage] Configuration updated');
  }

  /**
   * Clean up old data
   */
  async cleanupOldData(days: number = 7): Promise<void> {
    if (!this.db) return;

    try {
      const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);

      const result = this.db.prepare(`
        DELETE FROM cross_exchange_opportunities 
        WHERE timestamp < ?
      `).run(cutoffTime);

      logger.info(`[CrossExchangeArbitrage] Cleaned up ${result.changes} old records`);
    } catch (error) {
      logger.error('[CrossExchangeArbitrage] Cleanup failed:', error);
    }
  }
}

// Export singleton instance
export const crossExchangeArbitrage = new CrossExchangeArbitrage();
export default crossExchangeArbitrage;
export type { 
  CrossExchangeOpportunity, 
  ExchangeInfo, 
  ArbitrageConfig 
};