// pump.fun Token Store - SQLite Storage
// Stores and retrieves pump.fun token analysis results

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import logger from '../shared/logger';
import configManager from '../shared/config';
import { TokenAnalysis, PumpFunToken, TokenRecommendation } from '../shared/types';

interface PumpFunTokenRow {
  id: string;
  cycle_id: string;
  mint_address: string;
  token_name: string;
  token_symbol: string;
  metadata_uri: string;
  description: string;
  website: string;
  twitter: string;
  telegram: string;
  discord: string;
  image_url: string;

  // Security
  mint_authority: string | null;
  freeze_authority: string | null;
  is_mintable: number;
  is_freezable: number;
  security_score: number;

  // Scores
  website_score: number;
  social_score: number;
  overall_score: number;

  // Analysis
  recommendation: string;
  rationale: string;
  red_flags: string;
  green_flags: string;

  // Timestamps
  created_at: string;
  analyzed_at: string;

  // Metadata JSON
  metadata_json?: string;
}

/**
 * PumpFun Token Store - SQLite storage for analyzed tokens
 */
class PumpFunStore {
  private db: Database.Database | null = null;
  private initialized = false;
  private dbPath: string;

  constructor() {
    this.dbPath = process.env.PUMPFUN_DB_PATH || path.join(process.cwd(), 'data/pumpfun.db');
  }

  /**
   * Initialize the database and create tables
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      logger.info('[PumpFunStore] Initializing pump.fun database...');

      // Ensure data directory exists
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      this.db = new Database(this.dbPath);
      this.db.pragma('journal_mode = WAL');

      // Create main table
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS pumpfun_tokens (
          id TEXT PRIMARY KEY,
          cycle_id TEXT NOT NULL,
          mint_address TEXT NOT NULL UNIQUE,
          token_name TEXT NOT NULL,
          token_symbol TEXT NOT NULL,
          metadata_uri TEXT,
          description TEXT,
          website TEXT,
          twitter TEXT,
          telegram TEXT,
          discord TEXT,
          image_url TEXT,

          -- Security
          mint_authority TEXT,
          freeze_authority TEXT,
          is_mintable INTEGER,
          is_freezable INTEGER,
          security_score REAL,

          -- Scores
          website_score REAL,
          social_score REAL,
          overall_score REAL,

          -- Analysis
          recommendation TEXT,
          rationale TEXT,
          red_flags TEXT,
          green_flags TEXT,

          -- Timestamps
          created_at TEXT NOT NULL,
          analyzed_at TEXT NOT NULL,

          -- Metadata JSON
          metadata_json TEXT
        )
      `);

      // Create indexes
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_pumpfun_mint_address
        ON pumpfun_tokens(mint_address)
      `);

      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_pumpfun_overall_score
        ON pumpfun_tokens(overall_score DESC)
      `);

      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_pumpfun_created_at
        ON pumpfun_tokens(created_at DESC)
      `);

      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_pumpfun_recommendation
        ON pumpfun_tokens(recommendation)
      `);

      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_pumpfun_cycle_id
        ON pumpfun_tokens(cycle_id)
      `);

      // ==========================================
      // Trade Tracking Tables
      // ==========================================

      // pumpfun_trades - Every buy/sell action
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS pumpfun_trades (
          id TEXT PRIMARY KEY,
          mint_address TEXT NOT NULL,
          token_symbol TEXT NOT NULL,
          side TEXT NOT NULL,
          sol_amount REAL NOT NULL,
          token_amount REAL,
          price_per_token REAL,
          entry_score REAL,
          tp_level TEXT,
          trade_reason TEXT,
          pnl REAL DEFAULT 0,
          paper_mode INTEGER DEFAULT 1,
          timestamp TEXT NOT NULL
        )
      `);

      // pumpfun_positions - Open positions (persisted version of in-memory PaperPosition)
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS pumpfun_positions (
          mint_address TEXT PRIMARY KEY,
          token_symbol TEXT NOT NULL,
          tokens_owned REAL NOT NULL,
          sol_spent REAL NOT NULL,
          entry_price REAL NOT NULL,
          entry_score REAL,
          buy_timestamp TEXT NOT NULL,
          tp_levels TEXT NOT NULL,
          partial_sells TEXT DEFAULT '[]',
          status TEXT DEFAULT 'OPEN',
          max_multiplier REAL DEFAULT 1.0,
          current_multiplier REAL DEFAULT 1.0,
          updated_at TEXT NOT NULL
        )
      `);

      // pumpfun_price_samples - Price tracking over time
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS pumpfun_price_samples (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          mint_address TEXT NOT NULL,
          price_multiplier REAL NOT NULL,
          sol_market_cap REAL,
          bonding_curve_complete INTEGER DEFAULT 0,
          timestamp TEXT NOT NULL
        )
      `);

      // pumpfun_trade_outcomes - Final outcome summary per position
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS pumpfun_trade_outcomes (
          mint_address TEXT PRIMARY KEY,
          token_symbol TEXT NOT NULL,
          entry_score REAL,
          entry_sol REAL NOT NULL,
          exit_sol REAL NOT NULL,
          pnl_sol REAL NOT NULL,
          pnl_pct REAL NOT NULL,
          max_multiplier REAL NOT NULL,
          outcome TEXT NOT NULL,
          hold_time_minutes REAL NOT NULL,
          partial_sells_count INTEGER DEFAULT 0,
          tp_levels_hit TEXT,
          closed_at TEXT NOT NULL
        )
      `);

      // ==========================================
      // Trade Tracking Indexes
      // ==========================================

      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_pumpfun_trades_mint
        ON pumpfun_trades(mint_address)
      `);

      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_pumpfun_trades_timestamp
        ON pumpfun_trades(timestamp DESC)
      `);

      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_pumpfun_trades_side
        ON pumpfun_trades(side)
      `);

      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_pumpfun_positions_status
        ON pumpfun_positions(status)
      `);

      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_pumpfun_price_samples_mint
        ON pumpfun_price_samples(mint_address, timestamp DESC)
      `);

      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_pumpfun_trade_outcomes_outcome
        ON pumpfun_trade_outcomes(outcome)
      `);

      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_pumpfun_trade_outcomes_score
        ON pumpfun_trade_outcomes(entry_score)
      `);

      this.initialized = true;
      logger.info('[PumpFunStore] Database initialized successfully');
    } catch (error) {
      logger.error('[PumpFunStore] Failed to initialize database:', error);
      this.db = null;
      throw error;
    }
  }

  /**
   * Store a token analysis result
   */
  storeToken(analysis: TokenAnalysis): boolean {
    if (!this.db) {
      logger.warn('[PumpFunStore] Database not initialized');
      return false;
    }

    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO pumpfun_tokens (
          id, cycle_id, mint_address, token_name, token_symbol, metadata_uri,
          description, website, twitter, telegram, discord, image_url,
          mint_authority, freeze_authority, is_mintable, is_freezable, security_score,
          website_score, social_score, overall_score,
          recommendation, rationale, red_flags, green_flags,
          created_at, analyzed_at, metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        analysis.id,
        analysis.cycleId,
        analysis.token.mintAddress,
        analysis.token.name,
        analysis.token.symbol,
        analysis.token.metadataUri,
        analysis.metadata.description || '',
        analysis.metadata.website || '',
        analysis.metadata.twitter || '',
        analysis.metadata.telegram || '',
        analysis.metadata.discord || '',
        analysis.metadata.image || '',
        analysis.security.mintAuthority,
        analysis.security.freezeAuthority,
        analysis.security.isMintable ? 1 : 0,
        analysis.security.isFreezable ? 1 : 0,
        analysis.securityScore,
        analysis.websiteScore,
        analysis.socialScore,
        analysis.overallScore,
        analysis.recommendation,
        analysis.rationale,
        JSON.stringify(analysis.redFlags),
        JSON.stringify(analysis.greenFlags),
        analysis.token.createdAt.toISOString(),
        analysis.analyzedAt.toISOString(),
        JSON.stringify(analysis, (_, value) =>
          typeof value === 'bigint' ? value.toString() : value
        )
      );

      logger.debug(`[PumpFunStore] Stored token: ${analysis.token.symbol} (${analysis.overallScore.toFixed(2)})`);
      return true;
    } catch (error) {
      // Check if it's a unique constraint violation (duplicate)
      if (error instanceof Error && error.message.includes('UNIQUE')) {
        logger.debug(`[PumpFunStore] Token already exists: ${analysis.token.mintAddress}`);
        return false;
      }
      logger.error('[PumpFunStore] Failed to store token:', error);
      return false;
    }
  }

  /**
   * Store multiple tokens in a transaction
   */
  storeTokens(analyses: TokenAnalysis[]): { stored: number; duplicates: number } {
    if (!this.db) {
      logger.warn('[PumpFunStore] Database not initialized');
      return { stored: 0, duplicates: 0 };
    }

    let stored = 0;
    let duplicates = 0;

    const transaction = this.db.transaction(() => {
      for (const analysis of analyses) {
        if (this.storeToken(analysis)) {
          stored++;
        } else {
          duplicates++;
        }
      }
    });

    try {
      transaction();
    } catch (error) {
      logger.error('[PumpFunStore] Failed to store tokens in transaction:', error);
    }

    return { stored, duplicates };
  }

  /**
   * Get token by mint address
   */
  getTokenByMint(mintAddress: string): TokenAnalysis | null {
    if (!this.db) {
      return null;
    }

    try {
      const stmt = this.db.prepare(`
        SELECT * FROM pumpfun_tokens WHERE mint_address = ?
      `);

      const row = stmt.get(mintAddress) as PumpFunTokenRow | undefined;

      if (!row) {
        return null;
      }

      return this.rowToTokenAnalysis(row);
    } catch (error) {
      logger.error('[PumpFunStore] Failed to get token by mint:', error);
      return null;
    }
  }

  /**
   * Get recent tokens
   */
  getRecentTokens(limit: number = 50, minScore: number = 0): TokenAnalysis[] {
    if (!this.db) {
      return [];
    }

    try {
      const stmt = this.db.prepare(`
        SELECT * FROM pumpfun_tokens
        WHERE overall_score >= ?
        ORDER BY created_at DESC
        LIMIT ?
      `);

      const rows = stmt.all(minScore, limit) as PumpFunTokenRow[];
      return rows.map(row => this.rowToTokenAnalysis(row));
    } catch (error) {
      logger.error('[PumpFunStore] Failed to get recent tokens:', error);
      return [];
    }
  }

  /**
   * Get high confidence tokens
   */
  getHighConfidenceTokens(minScore: number = 0.7, limit: number = 100): TokenAnalysis[] {
    if (!this.db) {
      return [];
    }

    try {
      const stmt = this.db.prepare(`
        SELECT * FROM pumpfun_tokens
        WHERE overall_score >= ?
        ORDER BY overall_score DESC, created_at DESC
        LIMIT ?
      `);

      const rows = stmt.all(minScore, limit) as PumpFunTokenRow[];
      return rows.map(row => this.rowToTokenAnalysis(row));
    } catch (error) {
      logger.error('[PumpFunStore] Failed to get high confidence tokens:', error);
      return [];
    }
  }

  /**
   * Get tokens by recommendation
   */
  getByRecommendation(recommendation: TokenRecommendation, limit: number = 50): TokenAnalysis[] {
    if (!this.db) {
      return [];
    }

    try {
      const stmt = this.db.prepare(`
        SELECT * FROM pumpfun_tokens
        WHERE recommendation = ?
        ORDER BY created_at DESC
        LIMIT ?
      `);

      const rows = stmt.all(recommendation, limit) as PumpFunTokenRow[];
      return rows.map(row => this.rowToTokenAnalysis(row));
    } catch (error) {
      logger.error('[PumpFunStore] Failed to get tokens by recommendation:', error);
      return [];
    }
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalTokens: number;
    averageScore: number;
    byRecommendation: Record<TokenRecommendation, number>;
    highConfidenceCount: number;
    lastAnalyzedAt: string | null;
  } {
    if (!this.db) {
      return {
        totalTokens: 0,
        averageScore: 0,
        byRecommendation: {
          STRONG_BUY: 0,
          BUY: 0,
          HOLD: 0,
          AVOID: 0,
          STRONG_AVOID: 0,
        },
        highConfidenceCount: 0,
        lastAnalyzedAt: null,
      };
    }

    try {
      const minScoreThreshold = configManager.get().pumpfun?.minScoreThreshold ?? 0.7;

      // Total tokens
      const totalStmt = this.db.prepare(`SELECT COUNT(*) as count FROM pumpfun_tokens`);
      const totalResult = totalStmt.get() as { count: number };
      const totalTokens = totalResult.count;

      // Average score
      const avgStmt = this.db.prepare(`SELECT AVG(overall_score) as avg_score FROM pumpfun_tokens`);
      const avgResult = avgStmt.get() as { avg_score: number | null };
      const averageScore = avgResult.avg_score || 0;

      // By recommendation
      const recStmt = this.db.prepare(`
        SELECT recommendation, COUNT(*) as count
        FROM pumpfun_tokens
        GROUP BY recommendation
      `);
      const recRows = recStmt.all() as { recommendation: string; count: number }[];

      const byRecommendation: Record<TokenRecommendation, number> = {
        STRONG_BUY: 0,
        BUY: 0,
        HOLD: 0,
        AVOID: 0,
        STRONG_AVOID: 0,
      };

      for (const row of recRows) {
        if (row.recommendation in byRecommendation) {
          byRecommendation[row.recommendation as TokenRecommendation] = row.count;
        }
      }

      // High confidence count
      const highStmt = this.db.prepare(`
        SELECT COUNT(*) as count FROM pumpfun_tokens WHERE overall_score >= ?
      `);
      const highResult = highStmt.get(minScoreThreshold) as { count: number };
      const highConfidenceCount = highResult.count;

      // Last analyzed
      const lastStmt = this.db.prepare(`
        SELECT analyzed_at FROM pumpfun_tokens ORDER BY analyzed_at DESC LIMIT 1
      `);
      const lastResult = lastStmt.get() as { analyzed_at: string } | undefined;
      const lastAnalyzedAt = lastResult?.analyzed_at || null;

      return {
        totalTokens,
        averageScore,
        byRecommendation,
        highConfidenceCount,
        lastAnalyzedAt,
      };
    } catch (error) {
      logger.error('[PumpFunStore] Failed to get stats:', error);
      return {
        totalTokens: 0,
        averageScore: 0,
        byRecommendation: {
          STRONG_BUY: 0,
          BUY: 0,
          HOLD: 0,
          AVOID: 0,
          STRONG_AVOID: 0,
        },
        highConfidenceCount: 0,
        lastAnalyzedAt: null,
      };
    }
  }

  /**
   * Check if token exists
   */
  tokenExists(mintAddress: string): boolean {
    if (!this.db) {
      return false;
    }

    try {
      const stmt = this.db.prepare(`SELECT 1 FROM pumpfun_tokens WHERE mint_address = ? LIMIT 1`);
      const result = stmt.get(mintAddress);
      return result !== undefined;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get tokens from a specific cycle
   */
  getTokensByCycle(cycleId: string): TokenAnalysis[] {
    if (!this.db) {
      return [];
    }

    try {
      const stmt = this.db.prepare(`
        SELECT * FROM pumpfun_tokens WHERE cycle_id = ? ORDER BY overall_score DESC
      `);

      const rows = stmt.all(cycleId) as PumpFunTokenRow[];
      return rows.map(row => this.rowToTokenAnalysis(row));
    } catch (error) {
      logger.error('[PumpFunStore] Failed to get tokens by cycle:', error);
      return [];
    }
  }

  // ==========================================
  // Trade Tracking Methods
  // ==========================================

  /**
   * Record a trade (buy or sell)
   */
  recordTrade(trade: {
    mintAddress: string;
    tokenSymbol: string;
    side: 'BUY' | 'SELL';
    solAmount: number;
    tokenAmount?: number;
    pricePerToken?: number;
    entryScore?: number;
    tpLevel?: string;
    tradeReason: string;
    pnl?: number;
    paperMode?: boolean;
    timestamp?: Date;
  }): boolean {
    if (!this.db) {
      logger.warn('[PumpFunStore] Database not initialized');
      return false;
    }

    try {
      const id = `${trade.mintAddress}_${trade.side}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const ts = (trade.timestamp || new Date()).toISOString();

      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO pumpfun_trades (
          id, mint_address, token_symbol, side, sol_amount, token_amount,
          price_per_token, entry_score, tp_level, trade_reason, pnl, paper_mode, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        id,
        trade.mintAddress,
        trade.tokenSymbol,
        trade.side,
        trade.solAmount,
        trade.tokenAmount ?? null,
        trade.pricePerToken ?? null,
        trade.entryScore ?? null,
        trade.tpLevel ?? null,
        trade.tradeReason,
        trade.pnl ?? 0,
        trade.paperMode !== false ? 1 : 0,
        ts
      );

      logger.debug(`[PumpFunStore] Recorded ${trade.side} trade: ${trade.tokenSymbol} - ${trade.solAmount} SOL (${trade.tradeReason})`);
      return true;
    } catch (error) {
      logger.error('[PumpFunStore] Failed to record trade:', error);
      return false;
    }
  }

  /**
   * Persist an open position (insert or update)
   */
  upsertPosition(position: {
    mintAddress: string;
    tokenSymbol: string;
    tokensOwned: number;
    solSpent: number;
    entryPrice: number;
    entryScore?: number;
    buyTimestamp: Date;
    tpLevels: any[];
    partialSells?: any[];
    status?: string;
    maxMultiplier?: number;
    currentMultiplier?: number;
  }): boolean {
    if (!this.db) {
      logger.warn('[PumpFunStore] Database not initialized');
      return false;
    }

    try {
      const now = new Date().toISOString();

      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO pumpfun_positions (
          mint_address, token_symbol, tokens_owned, sol_spent, entry_price,
          entry_score, buy_timestamp, tp_levels, partial_sells, status,
          max_multiplier, current_multiplier, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        position.mintAddress,
        position.tokenSymbol,
        position.tokensOwned,
        position.solSpent,
        position.entryPrice,
        position.entryScore ?? null,
        position.buyTimestamp.toISOString(),
        JSON.stringify(position.tpLevels),
        JSON.stringify(position.partialSells ?? []),
        position.status ?? 'OPEN',
        position.maxMultiplier ?? 1.0,
        position.currentMultiplier ?? 1.0,
        now
      );

      logger.debug(`[PumpFunStore] Upserted position: ${position.tokenSymbol} (${position.status ?? 'OPEN'})`);
      return true;
    } catch (error) {
      logger.error('[PumpFunStore] Failed to upsert position:', error);
      return false;
    }
  }

  /**
   * Record a price sample
   */
  recordPriceSample(
    mintAddress: string,
    priceMultiplier: number,
    solMarketCap?: number,
    bondingCurveComplete?: boolean,
    timestamp?: Date
  ): boolean {
    if (!this.db) {
      logger.warn('[PumpFunStore] Database not initialized');
      return false;
    }

    try {
      const ts = (timestamp || new Date()).toISOString();

      const stmt = this.db.prepare(`
        INSERT INTO pumpfun_price_samples (
          mint_address, price_multiplier, sol_market_cap, bonding_curve_complete, timestamp
        ) VALUES (?, ?, ?, ?, ?)
      `);

      stmt.run(
        mintAddress,
        priceMultiplier,
        solMarketCap ?? null,
        bondingCurveComplete ? 1 : 0,
        ts
      );

      return true;
    } catch (error) {
      logger.error('[PumpFunStore] Failed to record price sample:', error);
      return false;
    }
  }

  /**
   * Record a trade outcome
   */
  recordOutcome(outcome: {
    mintAddress: string;
    tokenSymbol: string;
    entryScore?: number;
    entrySol: number;
    exitSol: number;
    pnlSol: number;
    pnlPct: number;
    maxMultiplier: number;
    outcome: string;
    holdTimeMinutes: number;
    partialSellsCount: number;
    tpLevelsHit?: string[];
    closedAt: Date;
  }): boolean {
    if (!this.db) {
      logger.warn('[PumpFunStore] Database not initialized');
      return false;
    }

    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO pumpfun_trade_outcomes (
          mint_address, token_symbol, entry_score, entry_sol, exit_sol, pnl_sol,
          pnl_pct, max_multiplier, outcome, hold_time_minutes, partial_sells_count,
          tp_levels_hit, closed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        outcome.mintAddress,
        outcome.tokenSymbol,
        outcome.entryScore ?? null,
        outcome.entrySol,
        outcome.exitSol,
        outcome.pnlSol,
        outcome.pnlPct,
        outcome.maxMultiplier,
        outcome.outcome,
        outcome.holdTimeMinutes,
        outcome.partialSellsCount,
        outcome.tpLevelsHit ? JSON.stringify(outcome.tpLevelsHit) : null,
        outcome.closedAt.toISOString()
      );

      logger.debug(`[PumpFunStore] Recorded outcome: ${outcome.tokenSymbol} - ${outcome.outcome} (${outcome.pnlPct > 0 ? '+' : ''}${outcome.pnlPct.toFixed(1)}%)`);
      return true;
    } catch (error) {
      logger.error('[PumpFunStore] Failed to record outcome:', error);
      return false;
    }
  }

  /**
   * Get trade statistics for analysis
   */
  getTradeStats(): {
    totalBuys: number;
    totalSells: number;
    totalPnl: number;
    winRate: number;
    avgPnlPerTrade: number;
    avgHoldTime: number;
    byOutcome: Record<string, number>;
    byScoreRange: Record<string, { count: number; avgPnl: number; winRate: number }>;
    bestScoreRange: string;
  } {
    const empty = {
      totalBuys: 0,
      totalSells: 0,
      totalPnl: 0,
      winRate: 0,
      avgPnlPerTrade: 0,
      avgHoldTime: 0,
      byOutcome: {} as Record<string, number>,
      byScoreRange: {} as Record<string, { count: number; avgPnl: number; winRate: number }>,
      bestScoreRange: '',
    };

    if (!this.db) {
      return empty;
    }

    try {
      // Total buys
      const buyStmt = this.db.prepare(`SELECT COUNT(*) as count FROM pumpfun_trades WHERE side = 'BUY'`);
      const buyResult = buyStmt.get() as { count: number };
      const totalBuys = buyResult.count;

      // Total sells
      const sellStmt = this.db.prepare(`SELECT COUNT(*) as count FROM pumpfun_trades WHERE side = 'SELL'`);
      const sellResult = sellStmt.get() as { count: number };
      const totalSells = sellResult.count;

      // Total PnL (sum of sell PnLs)
      const pnlStmt = this.db.prepare(`SELECT COALESCE(SUM(pnl), 0) as total FROM pumpfun_trades WHERE side = 'SELL'`);
      const pnlResult = pnlStmt.get() as { total: number };
      const totalPnl = pnlResult.total;

      // Win rate (sells with positive PnL / total sells)
      const winStmt = this.db.prepare(`SELECT COUNT(*) as count FROM pumpfun_trades WHERE side = 'SELL' AND pnl > 0`);
      const winResult = winStmt.get() as { count: number };
      const winRate = totalSells > 0 ? winResult.count / totalSells : 0;

      // Avg PnL per sell
      const avgPnlPerTrade = totalSells > 0 ? totalPnl / totalSells : 0;

      // Avg hold time from outcomes
      const holdStmt = this.db.prepare(`SELECT COALESCE(AVG(hold_time_minutes), 0) as avg FROM pumpfun_trade_outcomes`);
      const holdResult = holdStmt.get() as { avg: number };
      const avgHoldTime = holdResult.avg;

      // By outcome
      const outcomeStmt = this.db.prepare(`
        SELECT outcome, COUNT(*) as count FROM pumpfun_trade_outcomes GROUP BY outcome
      `);
      const outcomeRows = outcomeStmt.all() as { outcome: string; count: number }[];
      const byOutcome: Record<string, number> = {};
      for (const row of outcomeRows) {
        byOutcome[row.outcome] = row.count;
      }

      // By score range (using outcomes joined with entry scores)
      const scoreRangeStmt = this.db.prepare(`
        SELECT
          CASE
            WHEN entry_score >= 0.9 THEN '0.9-1.0'
            WHEN entry_score >= 0.8 THEN '0.8-0.9'
            WHEN entry_score >= 0.7 THEN '0.7-0.8'
            WHEN entry_score >= 0.6 THEN '0.6-0.7'
            WHEN entry_score >= 0.5 THEN '0.5-0.6'
            ELSE '<0.5'
          END as score_range,
          COUNT(*) as count,
          AVG(pnl_sol) as avg_pnl,
          SUM(CASE WHEN pnl_sol > 0 THEN 1 ELSE 0 END) * 1.0 / COUNT(*) as win_rate
        FROM pumpfun_trade_outcomes
        WHERE entry_score IS NOT NULL
        GROUP BY score_range
        ORDER BY score_range DESC
      `);
      const scoreRangeRows = scoreRangeStmt.all() as {
        score_range: string;
        count: number;
        avg_pnl: number;
        win_rate: number;
      }[];
      const byScoreRange: Record<string, { count: number; avgPnl: number; winRate: number }> = {};
      for (const row of scoreRangeRows) {
        byScoreRange[row.score_range] = {
          count: row.count,
          avgPnl: row.avg_pnl,
          winRate: row.win_rate,
        };
      }

      // Best score range (highest win rate with at least 3 trades, else highest avg PnL)
      let bestScoreRange = '';
      let bestScore = -Infinity;
      for (const [range, data] of Object.entries(byScoreRange)) {
        if (data.count >= 3) {
          const score = data.winRate * 100 + data.avgPnl * 10;
          if (score > bestScore) {
            bestScore = score;
            bestScoreRange = range;
          }
        }
      }
      // Fallback if no range has 3+ trades
      if (!bestScoreRange && Object.keys(byScoreRange).length > 0) {
        let bestPnl = -Infinity;
        for (const [range, data] of Object.entries(byScoreRange)) {
          if (data.avgPnl > bestPnl) {
            bestPnl = data.avgPnl;
            bestScoreRange = range;
          }
        }
      }

      return {
        totalBuys,
        totalSells,
        totalPnl,
        winRate,
        avgPnlPerTrade,
        avgHoldTime,
        byOutcome,
        byScoreRange,
        bestScoreRange,
      };
    } catch (error) {
      logger.error('[PumpFunStore] Failed to get trade stats:', error);
      return empty;
    }
  }

  /**
   * Get recent trades with full details
   */
  getRecentTrades(limit: number = 50, side?: string): any[] {
    if (!this.db) {
      return [];
    }

    try {
      let query = `SELECT * FROM pumpfun_trades`;
      const params: any[] = [];

      if (side) {
        query += ` WHERE side = ?`;
        params.push(side);
      }

      query += ` ORDER BY timestamp DESC LIMIT ?`;
      params.push(limit);

      const stmt = this.db.prepare(query);
      return stmt.all(...params);
    } catch (error) {
      logger.error('[PumpFunStore] Failed to get recent trades:', error);
      return [];
    }
  }

  /**
   * Get open positions
   */
  getOpenPositions(): any[] {
    if (!this.db) {
      return [];
    }

    try {
      const stmt = this.db.prepare(`
        SELECT * FROM pumpfun_positions WHERE status = 'OPEN' ORDER BY buy_timestamp DESC
      `);

      const rows = stmt.all() as any[];

      // Parse JSON fields
      return rows.map(row => ({
        ...row,
        tpLevels: JSON.parse(row.tp_levels || '[]'),
        partialSells: JSON.parse(row.partial_sells || '[]'),
      }));
    } catch (error) {
      logger.error('[PumpFunStore] Failed to get open positions:', error);
      return [];
    }
  }

  /**
   * Get outcomes for score analysis
   */
  getOutcomesByScoreRange(): any[] {
    if (!this.db) {
      return [];
    }

    try {
      const stmt = this.db.prepare(`
        SELECT
          CASE
            WHEN entry_score >= 0.9 THEN '0.9-1.0'
            WHEN entry_score >= 0.8 THEN '0.8-0.9'
            WHEN entry_score >= 0.7 THEN '0.7-0.8'
            WHEN entry_score >= 0.6 THEN '0.6-0.7'
            WHEN entry_score >= 0.5 THEN '0.5-0.6'
            ELSE '<0.5'
          END as score_range,
          COUNT(*) as total_trades,
          SUM(CASE WHEN pnl_sol > 0 THEN 1 ELSE 0 END) as wins,
          SUM(CASE WHEN pnl_sol <= 0 THEN 1 ELSE 0 END) as losses,
          ROUND(AVG(pnl_sol), 6) as avg_pnl_sol,
          ROUND(AVG(pnl_pct), 2) as avg_pnl_pct,
          ROUND(SUM(CASE WHEN pnl_sol > 0 THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as win_rate_pct,
          ROUND(MAX(pnl_sol), 6) as best_pnl_sol,
          ROUND(MIN(pnl_sol), 6) as worst_pnl_sol,
          ROUND(AVG(hold_time_minutes), 1) as avg_hold_minutes,
          ROUND(AVG(max_multiplier), 2) as avg_max_multiplier,
          GROUP_CONCAT(DISTINCT outcome) as outcomes
        FROM pumpfun_trade_outcomes
        WHERE entry_score IS NOT NULL
        GROUP BY score_range
        ORDER BY score_range DESC
      `);

      return stmt.all();
    } catch (error) {
      logger.error('[PumpFunStore] Failed to get outcomes by score range:', error);
      return [];
    }
  }

  /**
   * Convert database row to TokenAnalysis
   */
  private rowToTokenAnalysis(row: PumpFunTokenRow): TokenAnalysis {
    return {
      id: row.id,
      token: {
        mintAddress: row.mint_address,
        name: row.token_name,
        symbol: row.token_symbol,
        metadataUri: row.metadata_uri,
        createdAt: new Date(row.created_at),
      },
      metadata: {
        name: row.token_name,
        symbol: row.token_symbol,
        description: row.description,
        image: row.image_url,
        website: row.website || undefined,
        twitter: row.twitter || undefined,
        telegram: row.telegram || undefined,
        discord: row.discord || undefined,
      },
      security: {
        mintAuthority: row.mint_authority,
        freezeAuthority: row.freeze_authority,
        decimals: 0, // Not stored in main table
        supply: 0 as unknown as bigint,
        isMintable: row.is_mintable === 1,
        isFreezable: row.is_freezable === 1,
        metadataHash: '',
        riskLevel: 'MEDIUM',
      },
      website: {
        url: row.website,
        exists: !!row.website,
        hasContent: true,
        contentQuality: row.website_score,
        hasWhitepaper: false,
        hasTeamInfo: false,
        hasRoadmap: false,
        hasTokenomics: false,
        sslValid: row.website?.startsWith('https://') || false,
        glmAnalysis: '',
      },
      social: {
        twitter: {
          exists: !!row.twitter,
          followerCount: 0,
          tweetCount: 0,
          bio: '',
          verified: false,
          sentimentScore: 0.5,
        },
        telegram: {
          exists: !!row.telegram,
          memberCount: 0,
          isChannel: false,
          description: '',
        },
        discord: {
          exists: !!row.discord,
          memberCount: 0,
          inviteActive: false,
        },
        overallPresenceScore: row.social_score,
        glmAnalysis: '',
      },
      websiteScore: row.website_score,
      socialScore: row.social_score,
      securityScore: row.security_score,
      overallScore: row.overall_score,
      rationale: row.rationale,
      redFlags: row.red_flags ? JSON.parse(row.red_flags) : [],
      greenFlags: row.green_flags ? JSON.parse(row.green_flags) : [],
      recommendation: row.recommendation as TokenRecommendation,
      analyzedAt: new Date(row.analyzed_at),
      cycleId: row.cycle_id,
      errors: [],
    };
  }

  /**
   * Close the database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initialized = false;
      logger.info('[PumpFunStore] Database closed');
    }
  }
}

// Singleton instance
const pumpfunStore = new PumpFunStore();
export default pumpfunStore;
