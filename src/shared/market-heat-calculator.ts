// Market Heat Calculator
// Calculates heat scores for markets based on mentions, sentiment, and volume

import BetterSqlite3 from 'better-sqlite3';
import logger from '../shared/logger';

export interface MarketHeatData {
  marketId: string;
  marketName: string;
  marketType: 'hyperliquid' | 'polymarket';
  category: string;
  heatScore: number;
  articleCount: number;
  mentionCount: number;
  uniqueArticleCount: number;
  avgSentiment: number;
  sentimentDistribution: {
    very_positive: number;
    positive: number;
    neutral: number;
    negative: number;
    very_negative: number;
  };
  trendDirection: 'SPIKING' | 'RISING' | 'STABLE' | 'FALLING' | 'CRASHING';
  velocity: number;
  relatedClusterIds: string[];
}

interface HeatHistoryPoint {
  heatScore: number;
  timestamp: Date;
}

class MarketHeatCalculator {
  private db: BetterSqlite3.Database | null = null;
  private initialized: boolean = false;
  private dbPath: string;

  constructor() {
    this.dbPath = process.env.NEWS_DB_PATH || './data/news.db';
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      this.db = new BetterSqlite3(this.dbPath);
      this.db.pragma('journal_mode = WAL');
      this.initialized = true;
      logger.info('[MarketHeatCalculator] Initialized successfully');
    } catch (error) {
      logger.error('[MarketHeatCalculator] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Calculate heat for all markets in a given timeframe
   */
  async calculateMarketHeat(
    periodType: '1h' | '4h' | '24h' | '7d' = '24h',
    hours: number = 24
  ): Promise<MarketHeatData[]> {
    await this.initialize();
    if (!this.db) return [];

    try {
      logger.info(`[MarketHeatCalculator] Calculating ${periodType} heat for last ${hours}h...`);

      // Get all active markets with their mentions
      const marketRows = this.db.prepare(`
        SELECT 
          m.id as market_id,
          m.name as market_name,
          m.type as market_type,
          m.category,
          m.volume_24h,
          m.pm_probability,
          m.pm_liquidity,
          COUNT(DISTINCT mm.article_id) as unique_article_count,
          COUNT(mm.id) as total_mentions,
          AVG(mm.relevance_score) as avg_relevance,
          AVG(mm.sentiment_score) as avg_sentiment,
          SUM(CASE WHEN mm.mention_sentiment = 'very_positive' THEN 1 ELSE 0 END) as vp_count,
          SUM(CASE WHEN mm.mention_sentiment = 'positive' THEN 1 ELSE 0 END) as p_count,
          SUM(CASE WHEN mm.mention_sentiment = 'neutral' THEN 1 ELSE 0 END) as n_count,
          SUM(CASE WHEN mm.mention_sentiment = 'negative' THEN 1 ELSE 0 END) as neg_count,
          SUM(CASE WHEN mm.mention_sentiment = 'very_negative' THEN 1 ELSE 0 END) as vn_count
        FROM markets m
        LEFT JOIN market_mentions mm ON m.id = mm.market_id
          AND mm.extracted_at > datetime('now', '-${hours} hours')
        WHERE m.active = 1
        GROUP BY m.id
        HAVING total_mentions > 0
        ORDER BY total_mentions DESC
      `).all() as any[];

      // Get related clusters for each market
      const clusterRows = this.db.prepare(`
        SELECT DISTINCT
          mm.market_id,
          ca.cluster_id
        FROM market_mentions mm
        JOIN cluster_articles ca ON mm.article_id = ca.article_id
        WHERE mm.extracted_at > datetime('now', '-${hours} hours')
      `).all() as any[];

      // Group clusters by market
      const marketClusters: Map<string, string[]> = new Map();
      for (const row of clusterRows) {
        if (!marketClusters.has(row.market_id)) {
          marketClusters.set(row.market_id, []);
        }
        marketClusters.get(row.market_id)!.push(row.cluster_id);
      }

      // Get previous heat scores for velocity calculation
      const previousHeat = await this.getPreviousHeatScores(periodType);

      // Calculate heat for each market
      const results: MarketHeatData[] = [];

      for (const row of marketRows) {
        // Calculate base heat score
        const baseHeat = this.calculateBaseHeatScore({
          uniqueArticleCount: row.unique_article_count,
          totalMentions: row.total_mentions,
          avgRelevance: row.avg_relevance || 50,
          avgSentiment: Math.abs(row.avg_sentiment || 0), // Higher absolute sentiment = more heat
          marketVolume: row.volume_24h || 0,
          marketLiquidity: row.pm_liquidity || 0,
          marketProbability: row.pm_probability,
        });

        // Calculate trend and velocity
        const prevHeat = previousHeat.get(row.market_id);
        const { trendDirection, velocity } = this.calculateTrend(
          baseHeat,
          prevHeat?.heatScore || null
        );

        const marketData: MarketHeatData = {
          marketId: row.market_id,
          marketName: row.market_name,
          marketType: row.market_type,
          category: row.category,
          heatScore: baseHeat,
          articleCount: row.unique_article_count,
          mentionCount: row.total_mentions,
          uniqueArticleCount: row.unique_article_count,
          avgSentiment: row.avg_sentiment || 0,
          sentimentDistribution: {
            very_positive: row.vp_count || 0,
            positive: row.p_count || 0,
            neutral: row.n_count || 0,
            negative: row.neg_count || 0,
            very_negative: row.vn_count || 0,
          },
          trendDirection,
          velocity,
          relatedClusterIds: marketClusters.get(row.market_id) || [],
        };

        results.push(marketData);
      }

      // Sort by heat score
      results.sort((a, b) => b.heatScore - a.heatScore);

      logger.info(`[MarketHeatCalculator] Calculated heat for ${results.length} markets`);
      return results;
    } catch (error) {
      logger.error('[MarketHeatCalculator] Failed to calculate market heat:', error);
      return [];
    }
  }

  /**
   * Store heat calculations
   */
  async storeHeatCalculations(
    heatData: MarketHeatData[],
    periodType: '1h' | '4h' | '24h' | '7d'
  ): Promise<number> {
    await this.initialize();
    if (!this.db || heatData.length === 0) return 0;

    try {
      const now = new Date();
      const periodStart = this.getPeriodStart(now, periodType);
      const periodEnd = now.toISOString();

      const insertStmt = this.db.prepare(`
        INSERT INTO market_heat (
          market_id, heat_score, article_count, mention_count, unique_article_count,
          avg_sentiment, sentiment_distribution, period_start, period_end, period_type,
          trend_direction, velocity, related_cluster_ids
        ) VALUES (
          @marketId, @heatScore, @articleCount, @mentionCount, @uniqueArticleCount,
          @avgSentiment, @sentimentDistribution, @periodStart, @periodEnd, @periodType,
          @trendDirection, @velocity, @relatedClusterIds
        )
        ON CONFLICT(market_id, period_type, period_start) DO UPDATE SET
          heat_score = @heatScore,
          article_count = @articleCount,
          mention_count = @mentionCount,
          unique_article_count = @uniqueArticleCount,
          avg_sentiment = @avgSentiment,
          sentiment_distribution = @sentimentDistribution,
          period_end = @periodEnd,
          trend_direction = @trendDirection,
          velocity = @velocity,
          related_cluster_ids = @relatedClusterIds
      `);

      const txn = this.db.transaction(() => {
        let count = 0;
        for (const data of heatData) {
          insertStmt.run({
            marketId: data.marketId,
            heatScore: data.heatScore,
            articleCount: data.articleCount,
            mentionCount: data.mentionCount,
            uniqueArticleCount: data.uniqueArticleCount,
            avgSentiment: data.avgSentiment,
            sentimentDistribution: JSON.stringify(data.sentimentDistribution),
            periodStart,
            periodEnd,
            periodType,
            trendDirection: data.trendDirection,
            velocity: data.velocity,
            relatedClusterIds: JSON.stringify(data.relatedClusterIds),
          });
          count++;
        }
        return count;
      });

      const result = txn();
      logger.info(`[MarketHeatCalculator] Stored ${result} heat calculations`);
      return result;
    } catch (error) {
      logger.error('[MarketHeatCalculator] Failed to store heat calculations:', error);
      return 0;
    }
  }

  /**
   * Get heat history for a market
   */
  async getHeatHistory(
    marketId: string,
    periodType: '1h' | '4h' | '24h' | '7d' = '24h',
    limit: number = 30
  ): Promise<Array<{
    heatScore: number;
    articleCount: number;
    periodStart: Date;
    trendDirection: string;
  }>> {
    await this.initialize();
    if (!this.db) return [];

    try {
      const rows = this.db.prepare(`
        SELECT 
          heat_score,
          article_count,
          period_start,
          trend_direction
        FROM market_heat
        WHERE market_id = ?
        AND period_type = ?
        ORDER BY period_start DESC
        LIMIT ?
      `).all(marketId, periodType, limit) as any[];

      return rows.map(r => ({
        heatScore: r.heat_score,
        articleCount: r.article_count,
        periodStart: new Date(r.period_start),
        trendDirection: r.trend_direction,
      }));
    } catch (error) {
      logger.error(`[MarketHeatCalculator] Failed to get heat history for ${marketId}:`, error);
      return [];
    }
  }

  /**
   * Get heat snapshot for all markets (for bubble map)
   */
  async getHeatSnapshot(
    category?: string,
    minHeatScore: number = 0
  ): Promise<MarketHeatData[]> {
    await this.initialize();
    if (!this.db) return [];

    try {
      let query = `
        SELECT 
          m.id as market_id,
          m.name as market_name,
          m.type as market_type,
          m.category,
          m.volume_24h,
          m.pm_probability,
          mh.heat_score,
          mh.article_count,
          mh.mention_count,
          mh.unique_article_count,
          mh.avg_sentiment,
          mh.sentiment_distribution,
          mh.trend_direction,
          mh.velocity,
          mh.related_cluster_ids
        FROM markets m
        LEFT JOIN market_heat mh ON m.id = mh.market_id
          AND mh.period_type = '24h'
          AND mh.period_start = (
            SELECT MAX(period_start) 
            FROM market_heat 
            WHERE market_id = m.id AND period_type = '24h'
          )
        WHERE m.active = 1
      `;

      const params: any[] = [];

      if (category) {
        query += ` AND m.category = ?`;
        params.push(category);
      }

      query += ` ORDER BY COALESCE(mh.heat_score, 0) DESC`;

      const rows = this.db.prepare(query).all(...params) as any[];

      return rows.map(r => {
        const sentimentDist = r.sentiment_distribution ? 
          JSON.parse(r.sentiment_distribution) : 
          { very_positive: 0, positive: 0, neutral: 0, negative: 0, very_negative: 0 };

        return {
          marketId: r.market_id,
          marketName: r.market_name,
          marketType: r.market_type,
          category: r.category,
          heatScore: r.heat_score || 0,
          articleCount: r.article_count || 0,
          mentionCount: r.mention_count || 0,
          uniqueArticleCount: r.unique_article_count || 0,
          avgSentiment: r.avg_sentiment || 0,
          sentimentDistribution: sentimentDist,
          trendDirection: r.trend_direction || 'STABLE',
          velocity: r.velocity || 0,
          relatedClusterIds: r.related_cluster_ids ? JSON.parse(r.related_cluster_ids) : [],
        };
      }).filter(m => m.heatScore >= minHeatScore);
    } catch (error) {
      logger.error('[MarketHeatCalculator] Failed to get heat snapshot:', error);
      return [];
    }
  }

  /**
   * Get heat grid data (for heatmap grid visualization)
   */
  async getHeatGridData(
    periodTypes: Array<'1h' | '4h' | '24h' | '7d'> = ['1h', '4h', '24h']
  ): Promise<Array<{
    marketId: string;
    marketName: string;
    marketType: string;
    category: string;
    volume24h: number;
    periods: Record<string, {
      heatScore: number;
      articleCount: number;
      trendDirection: string;
      avgSentiment: number;
    }>;
  }>> {
    await this.initialize();
    if (!this.db) return [];

    try {
      const markets = this.db.prepare(`
        SELECT id, name, type, category, volume_24h
        FROM markets
        WHERE active = 1
        ORDER BY priority DESC, volume_24h DESC
        LIMIT 100
      `).all() as any[];

      const results: Array<{
        marketId: string;
        marketName: string;
        marketType: string;
        category: string;
        volume24h: number;
        periods: Record<string, {
          heatScore: number;
          articleCount: number;
          trendDirection: string;
          avgSentiment: number;
        }>;
      }> = [];

      for (const market of markets) {
        const periods: Record<string, any> = {};

        for (const periodType of periodTypes) {
          const row = this.db.prepare(`
            SELECT heat_score, article_count, trend_direction, avg_sentiment
            FROM market_heat
            WHERE market_id = ? AND period_type = ?
            ORDER BY period_start DESC
            LIMIT 1
          `).get(market.id, periodType) as any;

          if (row) {
            periods[periodType] = {
              heatScore: row.heat_score,
              articleCount: row.article_count,
              trendDirection: row.trend_direction,
              avgSentiment: row.avg_sentiment,
            };
          }
        }

        // Only include markets with at least some data
        if (Object.keys(periods).length > 0) {
          results.push({
            marketId: market.id,
            marketName: market.name,
            marketType: market.type,
            category: market.category,
            volume24h: market.volume_24h,
            periods,
          });
        }
      }

      return results;
    } catch (error) {
      logger.error('[MarketHeatCalculator] Failed to get heat grid data:', error);
      return [];
    }
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private calculateBaseHeatScore(params: {
    uniqueArticleCount: number;
    totalMentions: number;
    avgRelevance: number;
    avgSentiment: number;
    marketVolume: number;
    marketLiquidity: number;
    marketProbability?: number;
  }): number {
    // Base score from article and mention count
    // Log scale to prevent single viral article from dominating
    const articleScore = Math.log10(Math.max(1, params.uniqueArticleCount)) * 15;
    const mentionScore = Math.log10(Math.max(1, params.totalMentions)) * 10;

    // Relevance factor (0-1 scaled from avg 0-100)
    const relevanceFactor = params.avgRelevance / 100;

    // Sentiment intensity factor (0-1)
    // Both very positive and very negative sentiment create heat
    const sentimentIntensity = params.avgSentiment;

    // Market volume factor (log scale, normalized)
    // High volume markets get a boost
    const volumeFactor = Math.min(1, Math.log10(Math.max(1, params.marketVolume)) / 12);

    // Liquidity factor for Polymarket (0-1)
    const liquidityFactor = Math.min(1, Math.log10(Math.max(1, params.marketLiquidity)) / 8);

    // Probability uncertainty factor for Polymarket
    // Markets near 50% are more interesting (uncertainty)
    let uncertaintyFactor = 0.5;
    if (params.marketProbability !== undefined) {
      const distanceFrom50 = Math.abs(params.marketProbability - 0.5);
      uncertaintyFactor = 1 - (distanceFrom50 * 1.5); // Higher when near 50%
    }

    // Combine factors
    const baseHeat = articleScore + mentionScore;
    const multiplier = (
      0.3 * relevanceFactor +
      0.2 * sentimentIntensity +
      0.2 * volumeFactor +
      0.15 * liquidityFactor +
      0.15 * uncertaintyFactor
    );

    const finalScore = baseHeat * (0.5 + multiplier);

    // Cap at 100
    return Math.min(100, Math.round(finalScore * 10) / 10);
  }

  private calculateTrend(
    currentHeat: number,
    previousHeat: number | null
  ): { trendDirection: MarketHeatData['trendDirection']; velocity: number } {
    if (previousHeat === null) {
      return { trendDirection: 'STABLE', velocity: 0 };
    }

    const delta = currentHeat - previousHeat;
    const percentChange = previousHeat > 0 ? (delta / previousHeat) * 100 : 0;

    let trendDirection: MarketHeatData['trendDirection'];
    
    if (percentChange >= 50) trendDirection = 'SPIKING';
    else if (percentChange >= 20) trendDirection = 'RISING';
    else if (percentChange <= -50) trendDirection = 'CRASHING';
    else if (percentChange <= -20) trendDirection = 'FALLING';
    else trendDirection = 'STABLE';

    return {
      trendDirection,
      velocity: Math.round(percentChange * 10) / 10,
    };
  }

  private async getPreviousHeatScores(
    periodType: '1h' | '4h' | '24h' | '7d'
  ): Promise<Map<string, { heatScore: number; timestamp: Date }>> {
    if (!this.db) return new Map();

    try {
      const rows = this.db.prepare(`
        SELECT market_id, heat_score, period_start
        FROM market_heat
        WHERE period_type = ?
        AND period_start = (
          SELECT MAX(period_start)
          FROM market_heat AS sub
          WHERE sub.market_id = market_heat.market_id
          AND sub.period_type = ?
        )
      `).all(periodType, periodType) as any[];

      const result = new Map<string, { heatScore: number; timestamp: Date }>();
      for (const row of rows) {
        result.set(row.market_id, {
          heatScore: row.heat_score,
          timestamp: new Date(row.period_start),
        });
      }

      return result;
    } catch (error) {
      logger.error('[MarketHeatCalculator] Failed to get previous heat scores:', error);
      return new Map();
    }
  }

  private getPeriodStart(now: Date, periodType: string): string {
    const start = new Date(now);
    
    switch (periodType) {
      case '1h':
        start.setMinutes(0, 0, 0);
        break;
      case '4h':
        start.setHours(Math.floor(start.getHours() / 4) * 4, 0, 0, 0);
        break;
      case '24h':
        start.setHours(0, 0, 0, 0);
        break;
      case '7d':
        // Start of week (Sunday)
        start.setDate(start.getDate() - start.getDay());
        start.setHours(0, 0, 0, 0);
        break;
    }

    return start.toISOString();
  }
}

export const marketHeatCalculator = new MarketHeatCalculator();
export default marketHeatCalculator;
