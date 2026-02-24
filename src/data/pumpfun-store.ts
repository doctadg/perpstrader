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
        supply: 0n,
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
