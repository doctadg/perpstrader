import Database from 'better-sqlite3';
import logger from '../shared/logger';
import config from '../shared/config';
import hyperliquidAllMarkets, { HyperliquidMarket } from './hyperliquid-all-markets';
import crossExchangeArbitrage, { CrossExchangeOpportunity, ExchangeInfo } from './cross-exchange-arbitrage';

interface FundingRate {
  symbol: string;
  timestamp: number;
  fundingRate: number;
  nextFundingTime: number;
  annualizedRate: number;
  rank: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  opportunityScore: number;
  volume24h: number;
  markPrice: number;
  openInterest: number;
}

interface FundingOpportunity {
  symbol: string;
  type: 'long' | 'short';
  currentFunding: number;
  annualizedRate: number;
  opportunityScore: number;
  reason: string;
  urgency: 'high' | 'medium' | 'low';
  timestamp: number;
}

interface FundingStats {
  bestLongFunding: { symbol: string; rate: number } | null;
  bestShortFunding: { symbol: string; rate: number } | null;
  averageFunding: number;
  extremeMarketsCount: number;
  totalMarkets: number;
  positiveFundingCount: number;
  negativeFundingCount: number;
  timestamp: number;
}

interface FundingHistory {
  timestamp: number;
  fundingRate: number;
  annualizedRate: number;
}

class FundingArbitrageScanner {
  private db: Database.Database | null = null;
  private dbPath: string;
  private initialized: boolean = false;
  private fundingHistory: Map<string, FundingHistory[]> = new Map();
  private maxHistoryLength: number = 100;
  private readonly FUNDING_PERIODS_PER_DAY = 3; // Hyperliquid pays funding 3x daily
  private readonly DAYS_PER_YEAR = 365;

  constructor() {
    this.dbPath = process.env.FUNDING_DB_PATH || './data/funding.db';
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      this.db = new Database(this.dbPath);
      this.db.pragma('journal_mode = WAL');
      this.createTables();
      this.initialized = true;
      logger.info('[FundingArbitrageScanner] Initialized successfully');
    } catch (error) {
      logger.error('[FundingArbitrageScanner] Initialization failed:', error);
      throw error;
    }
  }

  private createTables(): void {
    if (!this.db) return;

    // Funding rates table - tracks all funding rates over time
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS funding_rates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        fundingRate REAL NOT NULL,
        nextFundingTime INTEGER NOT NULL,
        annualizedRate REAL NOT NULL,
        rank INTEGER,
        trend TEXT CHECK(trend IN ('increasing', 'decreasing', 'stable')),
        opportunityScore REAL DEFAULT 0,
        volume24h REAL DEFAULT 0,
        markPrice REAL DEFAULT 0,
        openInterest REAL DEFAULT 0
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_funding_symbol_time 
        ON funding_rates(symbol, timestamp);
      CREATE INDEX IF NOT EXISTS idx_funding_timestamp 
        ON funding_rates(timestamp);
      CREATE INDEX IF NOT EXISTS idx_funding_symbol 
        ON funding_rates(symbol);
      CREATE INDEX IF NOT EXISTS idx_funding_rate 
        ON funding_rates(fundingRate);
      CREATE INDEX IF NOT EXISTS idx_funding_annualized 
        ON funding_rates(annualizedRate);
    `);

    // Arbitrage opportunities table - stores detected opportunities
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS funding_opportunities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL,
        type TEXT CHECK(type IN ('long', 'short')) NOT NULL,
        currentFunding REAL NOT NULL,
        annualizedRate REAL NOT NULL,
        opportunityScore REAL NOT NULL,
        reason TEXT,
        urgency TEXT CHECK(urgency IN ('high', 'medium', 'low')),
        timestamp INTEGER NOT NULL,
        isActive INTEGER DEFAULT 1,
        alerted INTEGER DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_opportunities_symbol 
        ON funding_opportunities(symbol);
      CREATE INDEX IF NOT EXISTS idx_opportunities_active 
        ON funding_opportunities(isActive);
      CREATE INDEX IF NOT EXISTS idx_opportunities_timestamp 
        ON funding_opportunities(timestamp);
      CREATE INDEX IF NOT EXISTS idx_opportunities_score 
        ON funding_opportunities(opportunityScore);
    `);

    // Similar assets comparison table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS funding_comparisons (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol1 TEXT NOT NULL,
        symbol2 TEXT NOT NULL,
        fundingDiff REAL NOT NULL,
        annualizedDiff REAL NOT NULL,
        correlation TEXT,
        timestamp INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_comparisons_timestamp 
        ON funding_comparisons(timestamp);
    `);

    logger.info('[FundingArbitrageScanner] Database tables created');
  }

  /**
   * Calculate annualized funding rate from hourly rate
   * Hyperliquid: funding paid 3 times per day (every 8 hours)
   * Annualized = fundingRate * 3 * 365
   */
  calculateAnnualizedRate(fundingRate: number): number {
    return fundingRate * this.FUNDING_PERIODS_PER_DAY * this.DAYS_PER_YEAR;
  }

  /**
   * Calculate funding rate trend based on recent history
   */
  calculateTrend(symbol: string, currentRate: number): 'increasing' | 'decreasing' | 'stable' {
    const history = this.fundingHistory.get(symbol) || [];
    if (history.length < 3) return 'stable';

    // Look at last 3 periods
    const recent = history.slice(-3);
    const avg = recent.reduce((sum, h) => sum + h.fundingRate, 0) / recent.length;
    
    const diff = currentRate - avg;
    const threshold = Math.abs(avg) * 0.1; // 10% of current value

    if (diff > threshold) return 'increasing';
    if (diff < -threshold) return 'decreasing';
    return 'stable';
  }

  /**
   * Calculate opportunity score (0-100)
   * Higher = better opportunity
   */
  calculateOpportunityScore(fundingRate: number, volume24h: number, trend: string): number {
    const annualized = this.calculateAnnualizedRate(fundingRate);
    const absAnnualized = Math.abs(annualized);
    
    // Base score from annualized rate (up to 60 points)
    let score = Math.min(absAnnualized / 100 * 60, 60);
    
    // Volume factor (up to 20 points) - higher volume = more liquid = better
    const volumeScore = Math.min(Math.log10(volume24h + 1) / 10 * 20, 20);
    score += volumeScore;
    
    // Trend factor (up to 20 points)
    // If funding is getting more extreme, that's better for arb
    if (trend === 'increasing' && fundingRate > 0) {
      score += 20; // Getting more positive - good for shorting
    } else if (trend === 'decreasing' && fundingRate < 0) {
      score += 20; // Getting more negative - good for longing
    } else if (trend === 'stable') {
      score += 10; // Stable is okay
    }
    
    return Math.min(Math.max(score, 0), 100);
  }

  /**
   * Scan all markets for funding rate data
   */
  async scanAllFundingRates(): Promise<FundingRate[]> {
    await this.initialize();

    try {
      const timestamp = Date.now();
      const { markets } = await hyperliquidAllMarkets.getAllMarkets();
      
      if (!markets || markets.length === 0) {
        logger.warn('[FundingArbitrageScanner] No markets found');
        return [];
      }

      const fundingRates: FundingRate[] = [];
      
      for (const market of markets) {
        const trend = this.calculateTrend(market.coin, market.fundingRate);
        const annualizedRate = this.calculateAnnualizedRate(market.fundingRate);
        const opportunityScore = this.calculateOpportunityScore(
          market.fundingRate, 
          market.volume24h, 
          trend
        );

        fundingRates.push({
          symbol: market.coin,
          timestamp,
          fundingRate: market.fundingRate,
          nextFundingTime: timestamp + (8 * 60 * 60 * 1000), // 8 hours from now
          annualizedRate,
          rank: 0, // Will be set after sorting
          trend,
          opportunityScore,
          volume24h: market.volume24h,
          markPrice: market.markPx,
          openInterest: market.openInterest,
        });

        // Update history
        if (!this.fundingHistory.has(market.coin)) {
          this.fundingHistory.set(market.coin, []);
        }
        const history = this.fundingHistory.get(market.coin)!;
        history.push({ timestamp, fundingRate: market.fundingRate, annualizedRate });
        if (history.length > this.maxHistoryLength) {
          history.shift();
        }
      }

      // Sort by absolute annualized rate and assign ranks
      const sorted = [...fundingRates].sort((a, b) => 
        Math.abs(b.annualizedRate) - Math.abs(a.annualizedRate)
      );
      
      sorted.forEach((rate, index) => {
        rate.rank = index + 1;
      });

      // Store in database
      await this.storeFundingRates(fundingRates);

      logger.info(`[FundingArbitrageScanner] Scanned ${fundingRates.length} markets for funding rates`);
      return fundingRates;
    } catch (error) {
      logger.error('[FundingArbitrageScanner] Failed to scan funding rates:', error);
      throw error;
    }
  }

  /**
   * Store funding rates in database
   */
  private async storeFundingRates(rates: FundingRate[]): Promise<void> {
    if (!this.db) return;

    const insert = this.db.prepare(`
      INSERT OR REPLACE INTO funding_rates 
      (symbol, timestamp, fundingRate, nextFundingTime, annualizedRate, rank, trend, opportunityScore, volume24h, markPrice, openInterest)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const txn = this.db.transaction((rates: FundingRate[]) => {
      for (const rate of rates) {
        insert.run(
          rate.symbol,
          rate.timestamp,
          rate.fundingRate,
          rate.nextFundingTime,
          rate.annualizedRate,
          rate.rank,
          rate.trend,
          rate.opportunityScore,
          rate.volume24h,
          rate.markPrice,
          rate.openInterest
        );
      }
    });

    txn(rates);
  }

  /**
   * Identify funding arbitrage opportunities
   */
  async identifyOpportunities(
    extremeThreshold: number = 0.5 // 50% APR
  ): Promise<FundingOpportunity[]> {
    await this.initialize();

    try {
      const timestamp = Date.now();
      const fundingRates = await this.scanAllFundingRates();
      const opportunities: FundingOpportunity[] = [];

      for (const rate of fundingRates) {
        const absAnnualized = Math.abs(rate.annualizedRate);
        
        // Skip if below threshold
        if (absAnnualized < extremeThreshold * 100) continue;

        let opportunity: FundingOpportunity | null = null;

        if (rate.annualizedRate > extremeThreshold * 100) {
          // Positive funding - opportunity to short (get paid)
          opportunity = {
            symbol: rate.symbol,
            type: 'short',
            currentFunding: rate.fundingRate,
            annualizedRate: rate.annualizedRate,
            opportunityScore: rate.opportunityScore,
            reason: `High positive funding (${rate.annualizedRate.toFixed(2)}% APR). Short to collect funding payments.`,
            urgency: rate.annualizedRate > 100 ? 'high' : rate.annualizedRate > 75 ? 'medium' : 'low',
            timestamp,
          };
        } else if (rate.annualizedRate < -extremeThreshold * 100) {
          // Negative funding - opportunity to long (get paid)
          opportunity = {
            symbol: rate.symbol,
            type: 'long',
            currentFunding: rate.fundingRate,
            annualizedRate: rate.annualizedRate,
            opportunityScore: rate.opportunityScore,
            reason: `High negative funding (${rate.annualizedRate.toFixed(2)}% APR). Long to collect funding payments.`,
            urgency: rate.annualizedRate < -100 ? 'high' : rate.annualizedRate < -75 ? 'medium' : 'low',
            timestamp,
          };
        }

        if (opportunity) {
          opportunities.push(opportunity);
        }
      }

      // Store opportunities
      await this.storeOpportunities(opportunities);

      logger.info(`[FundingArbitrageScanner] Identified ${opportunities.length} opportunities`);
      return opportunities.sort((a, b) => b.opportunityScore - a.opportunityScore);
    } catch (error) {
      logger.error('[FundingArbitrageScanner] Failed to identify opportunities:', error);
      throw error;
    }
  }

  /**
   * Store opportunities in database
   */
  private async storeOpportunities(opportunities: FundingOpportunity[]): Promise<void> {
    if (!this.db) return;

    const insert = this.db.prepare(`
      INSERT INTO funding_opportunities 
      (symbol, type, currentFunding, annualizedRate, opportunityScore, reason, urgency, timestamp, isActive, alerted)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0)
    `);

    const txn = this.db.transaction((ops: FundingOpportunity[]) => {
      for (const opp of ops) {
        insert.run(
          opp.symbol,
          opp.type,
          opp.currentFunding,
          opp.annualizedRate,
          opp.opportunityScore,
          opp.reason,
          opp.urgency,
          opp.timestamp
        );
      }
    });

    txn(opportunities);
  }

  /**
   * Compare funding rates between similar assets
   */
  async compareSimilarAssets(): Promise<void> {
    await this.initialize();

    try {
      const { markets } = await hyperliquidAllMarkets.getAllMarkets();
      const categories = hyperliquidAllMarkets.getMarketsByCategory(markets);
      const timestamp = Date.now();

      const comparisons: Array<{
        symbol1: string;
        symbol2: string;
        fundingDiff: number;
        annualizedDiff: number;
        correlation: string;
        timestamp: number;
      }> = [];

      for (const [category, categoryMarkets] of Object.entries(categories)) {
        if (categoryMarkets.length < 2) continue;

        // Compare all pairs in the category
        for (let i = 0; i < categoryMarkets.length; i++) {
          for (let j = i + 1; j < categoryMarkets.length; j++) {
            const m1 = categoryMarkets[i];
            const m2 = categoryMarkets[j];
            
            const fundingDiff = m1.fundingRate - m2.fundingRate;
            const annualizedDiff = this.calculateAnnualizedRate(fundingDiff);

            // Only store significant differences (>10% APR)
            if (Math.abs(annualizedDiff) > 10) {
              comparisons.push({
                symbol1: m1.coin,
                symbol2: m2.coin,
                fundingDiff,
                annualizedDiff,
                correlation: category,
                timestamp,
              });
            }
          }
        }
      }

      // Store comparisons
      if (comparisons.length > 0 && this.db) {
        const insert = this.db.prepare(`
          INSERT INTO funding_comparisons 
          (symbol1, symbol2, fundingDiff, annualizedDiff, correlation, timestamp)
          VALUES (?, ?, ?, ?, ?, ?)
        `);

        const txn = this.db.transaction((comps: typeof comparisons) => {
          for (const comp of comps) {
            insert.run(
              comp.symbol1,
              comp.symbol2,
              comp.fundingDiff,
              comp.annualizedDiff,
              comp.correlation,
              comp.timestamp
            );
          }
        });

        txn(comparisons);
      }

      logger.info(`[FundingArbitrageScanner] Compared ${comparisons.length} asset pairs`);
    } catch (error) {
      logger.error('[FundingArbitrageScanner] Failed to compare assets:', error);
    }
  }

  /**
   * Get current funding stats
   */
  async getFundingStats(): Promise<FundingStats> {
    await this.initialize();

    try {
      const fundingRates = await this.scanAllFundingRates();
      
      if (fundingRates.length === 0) {
        return {
          bestLongFunding: null,
          bestShortFunding: null,
          averageFunding: 0,
          extremeMarketsCount: 0,
          totalMarkets: 0,
          positiveFundingCount: 0,
          negativeFundingCount: 0,
          timestamp: Date.now(),
        };
      }

      // Find best opportunities
      const sortedByRate = [...fundingRates].sort((a, b) => a.annualizedRate - b.annualizedRate);
      const bestLong = sortedByRate[0]; // Most negative
      const bestShort = sortedByRate[sortedByRate.length - 1]; // Most positive

      const averageFunding = fundingRates.reduce((sum, r) => sum + r.annualizedRate, 0) / fundingRates.length;
      
      const extremeThreshold = 30; // 30% APR
      const extremeMarkets = fundingRates.filter(r => Math.abs(r.annualizedRate) > extremeThreshold);
      
      const positiveCount = fundingRates.filter(r => r.annualizedRate > 0).length;
      const negativeCount = fundingRates.filter(r => r.annualizedRate < 0).length;

      return {
        bestLongFunding: bestLong ? { symbol: bestLong.symbol, rate: bestLong.annualizedRate } : null,
        bestShortFunding: bestShort ? { symbol: bestShort.symbol, rate: bestShort.annualizedRate } : null,
        averageFunding,
        extremeMarketsCount: extremeMarkets.length,
        totalMarkets: fundingRates.length,
        positiveFundingCount: positiveCount,
        negativeFundingCount: negativeCount,
        timestamp: Date.now(),
      };
    } catch (error) {
      logger.error('[FundingArbitrageScanner] Failed to get funding stats:', error);
      throw error;
    }
  }

  /**
   * Get historical funding data for a symbol
   */
  async getFundingHistory(symbol: string, hours: number = 24): Promise<FundingHistory[]> {
    await this.initialize();

    try {
      if (!this.db) return [];

      const cutoffTime = Date.now() - (hours * 60 * 60 * 1000);
      
      const rows = this.db.prepare(`
        SELECT timestamp, fundingRate, annualizedRate
        FROM funding_rates
        WHERE symbol = ? AND timestamp >= ?
        ORDER BY timestamp ASC
      `).all(symbol, cutoffTime) as Array<{
        timestamp: number;
        fundingRate: number;
        annualizedRate: number;
      }>;

      return rows.map(r => ({
        timestamp: r.timestamp,
        fundingRate: r.fundingRate,
        annualizedRate: r.annualizedRate,
      }));
    } catch (error) {
      logger.error(`[FundingArbitrageScanner] Failed to get history for ${symbol}:`, error);
      return [];
    }
  }

  /**
   * Get all current funding rates
   */
  async getAllCurrentRates(): Promise<FundingRate[]> {
    await this.initialize();

    try {
      if (!this.db) return [];

      // Get the most recent entry for each symbol
      const rows = this.db.prepare(`
        SELECT f.*
        FROM funding_rates f
        INNER JOIN (
          SELECT symbol, MAX(timestamp) as max_ts
          FROM funding_rates
          GROUP BY symbol
        ) latest ON f.symbol = latest.symbol AND f.timestamp = latest.max_ts
        ORDER BY ABS(f.annualizedRate) DESC
      `).all() as Array<{
        symbol: string;
        timestamp: number;
        fundingRate: number;
        nextFundingTime: number;
        annualizedRate: number;
        rank: number;
        trend: string;
        opportunityScore: number;
        volume24h: number;
        markPrice: number;
        openInterest: number;
      }>;

      return rows.map(r => ({
        symbol: r.symbol,
        timestamp: r.timestamp,
        fundingRate: r.fundingRate,
        nextFundingTime: r.nextFundingTime,
        annualizedRate: r.annualizedRate,
        rank: r.rank,
        trend: r.trend as 'increasing' | 'decreasing' | 'stable',
        opportunityScore: r.opportunityScore,
        volume24h: r.volume24h,
        markPrice: r.markPrice,
        openInterest: r.openInterest,
      }));
    } catch (error) {
      logger.error('[FundingArbitrageScanner] Failed to get current rates:', error);
      return [];
    }
  }

  /**
   * Get top arbitrage opportunities
   */
  async getTopOpportunities(limit: number = 20): Promise<FundingOpportunity[]> {
    await this.initialize();

    try {
      if (!this.db) return [];

      const rows = this.db.prepare(`
        SELECT *
        FROM funding_opportunities
        WHERE isActive = 1
        ORDER BY opportunityScore DESC
        LIMIT ?
      `).all(limit) as Array<{
        symbol: string;
        type: string;
        currentFunding: number;
        annualizedRate: number;
        opportunityScore: number;
        reason: string;
        urgency: string;
        timestamp: number;
      }>;

      return rows.map(r => ({
        symbol: r.symbol,
        type: r.type as 'long' | 'short',
        currentFunding: r.currentFunding,
        annualizedRate: r.annualizedRate,
        opportunityScore: r.opportunityScore,
        reason: r.reason,
        urgency: r.urgency as 'high' | 'medium' | 'low',
        timestamp: r.timestamp,
      }));
    } catch (error) {
      logger.error('[FundingArbitrageScanner] Failed to get top opportunities:', error);
      return [];
    }
  }

  /**
   * Mark opportunities as alerted
   */
  async markAlerted(symbols: string[]): Promise<void> {
    if (!this.db || symbols.length === 0) return;

    try {
      const placeholders = symbols.map(() => '?').join(',');
      this.db.prepare(`
        UPDATE funding_opportunities
        SET alerted = 1
        WHERE symbol IN (${placeholders}) AND isActive = 1
      `).run(...symbols);
    } catch (error) {
      logger.error('[FundingArbitrageScanner] Failed to mark alerted:', error);
    }
  }

  /**
   * Clean up old data
   */
  async cleanupOldData(days: number = 7): Promise<void> {
    if (!this.db) return;

    try {
      const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);
      
      const fundingResult = this.db.prepare('DELETE FROM funding_rates WHERE timestamp < ?').run(cutoffTime);
      const oppResult = this.db.prepare('UPDATE funding_opportunities SET isActive = 0 WHERE timestamp < ?').run(cutoffTime);
      const compResult = this.db.prepare('DELETE FROM funding_comparisons WHERE timestamp < ?').run(cutoffTime);

      logger.info(`[FundingArbitrageScanner] Cleanup: ${fundingResult.changes} funding rates, ${oppResult.changes} opportunities, ${compResult.changes} comparisons`);
    } catch (error) {
      logger.error('[FundingArbitrageScanner] Cleanup failed:', error);
    }
  }

  // ==========================================
  // CROSS-EXCHANGE ARBITRAGE METHODS
  // ==========================================

  /**
   * Scan for cross-exchange funding rate arbitrage opportunities
   * Compares Hyperliquid vs Asterdex funding rates
   */
  async scanCrossExchangeArbitrage(): Promise<CrossExchangeOpportunity[]> {
    await this.initialize();
    
    try {
      logger.info('[FundingArbitrageScanner] Starting cross-exchange arbitrage scan...');
      const opportunities = await crossExchangeArbitrage.scanForOpportunities();
      logger.info(`[FundingArbitrageScanner] Cross-exchange scan complete: ${opportunities.length} opportunities`);
      return opportunities;
    } catch (error) {
      logger.error('[FundingArbitrageScanner] Cross-exchange scan failed:', error);
      throw error;
    }
  }

  /**
   * Get active cross-exchange arbitrage opportunities
   */
  async getCrossExchangeOpportunities(minSpread?: number): Promise<CrossExchangeOpportunity[]> {
    await this.initialize();
    
    try {
      return await crossExchangeArbitrage.getActiveOpportunities(minSpread);
    } catch (error) {
      logger.error('[FundingArbitrageScanner] Failed to get cross-exchange opportunities:', error);
      return [];
    }
  }

  /**
   * Get cross-exchange opportunities by urgency level
   */
  async getCrossExchangeOpportunitiesByUrgency(urgency: 'high' | 'medium' | 'low'): Promise<CrossExchangeOpportunity[]> {
    await this.initialize();
    
    try {
      return await crossExchangeArbitrage.getOpportunitiesByUrgency(urgency);
    } catch (error) {
      logger.error('[FundingArbitrageScanner] Failed to get cross-exchange opportunities by urgency:', error);
      return [];
    }
  }

  /**
   * Get cross-exchange opportunity for a specific symbol
   */
  async getCrossExchangeOpportunity(symbol: string): Promise<CrossExchangeOpportunity | null> {
    await this.initialize();
    
    try {
      return await crossExchangeArbitrage.getOpportunityBySymbol(symbol);
    } catch (error) {
      logger.error(`[FundingArbitrageScanner] Failed to get cross-exchange opportunity for ${symbol}:`, error);
      return null;
    }
  }

  /**
   * Get connected exchanges information
   */
  async getExchangeInfo(): Promise<ExchangeInfo[]> {
    await this.initialize();
    
    try {
      return await crossExchangeArbitrage.getExchangeInfo();
    } catch (error) {
      logger.error('[FundingArbitrageScanner] Failed to get exchange info:', error);
      return [];
    }
  }

  /**
   * Get cross-exchange arbitrage statistics
   */
  async getCrossExchangeStats(): Promise<{
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
      return await crossExchangeArbitrage.getStatistics();
    } catch (error) {
      logger.error('[FundingArbitrageScanner] Failed to get cross-exchange stats:', error);
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
   * Run complete funding arbitrage scan (single-exchange + cross-exchange)
   */
  async runCompleteScan(): Promise<{
    singleExchangeOpportunities: number;
    crossExchangeOpportunities: number;
    timestamp: number;
  }> {
    await this.initialize();
    
    const timestamp = Date.now();
    
    try {
      // Run both scans in parallel
      const [singleExchange, crossExchange] = await Promise.all([
        this.identifyOpportunities(),
        this.scanCrossExchangeArbitrage(),
      ]);

      logger.info(`[FundingArbitrageScanner] Complete scan finished: ${singleExchange.length} single-exchange, ${crossExchange.length} cross-exchange opportunities`);

      return {
        singleExchangeOpportunities: singleExchange.length,
        crossExchangeOpportunities: crossExchange.length,
        timestamp,
      };
    } catch (error) {
      logger.error('[FundingArbitrageScanner] Complete scan failed:', error);
      throw error;
    }
  }
}

export const fundingArbitrageScanner = new FundingArbitrageScanner();
export default fundingArbitrageScanner;
export type { FundingRate, FundingOpportunity, FundingStats, FundingHistory };
export type { CrossExchangeOpportunity, ExchangeInfo } from './cross-exchange-arbitrage';