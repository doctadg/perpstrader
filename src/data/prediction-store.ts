// Prediction Market Store - SQLite persistence for prediction markets
// Keeps market snapshots, trades, positions, and agent status

import BetterSqlite3 from 'better-sqlite3';
import logger from '../shared/logger';
import {
  PredictionMarket,
  PredictionMarketSnapshot,
  PredictionTrade,
  PredictionPosition,
  PredictionBacktestResult,
} from '../shared/types';

interface PredictionAgentStatus {
  status: 'RUNNING' | 'IDLE' | 'ERROR';
  currentCycleId: string | null;
  currentStep: string | null;
  lastUpdate: Date | null;
  lastCycleStart: Date | null;
  lastCycleEnd: Date | null;
  lastTradeId: string | null;
  lastTradeAt: Date | null;
  activeMarkets: number;
  openPositions: number;
  metadata?: Record<string, any>;
}

interface PredictionMarketFilter {
  statuses?: Array<PredictionMarket['status']>;
  minVolume?: number;
  maxAgeDays?: number;
}

class PredictionStore {
  private db: BetterSqlite3.Database | null = null;
  private initialized = false;
  private dbPath: string;

  constructor() {
    this.dbPath = process.env.PREDICTION_DB_PATH || './data/predictions.db';
  }

  private coerceTimestamp(value: unknown): number {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value > 1e12 ? value : value * 1000;
    }
    if (typeof value === 'string') {
      const parsed = Date.parse(value);
      if (!Number.isNaN(parsed)) return parsed;
      const num = Number(value);
      if (Number.isFinite(num)) return num > 1e12 ? num : num * 1000;
    }
    return 0;
  }

  private resolveMarketTimestamp(market: PredictionMarket): number {
    const meta = market.metadata as Record<string, any> | undefined;
    const metaTimestamp = this.coerceTimestamp(meta?.marketTimestamp);
    if (metaTimestamp) return metaTimestamp;
    if (market.closeTime) return market.closeTime.getTime();
    return 0;
  }

  initialize(): void {
    if (this.initialized) return;

    try {
      this.db = new BetterSqlite3(this.dbPath);
      this.db.pragma('journal_mode = WAL');

      this.db.exec(`
        CREATE TABLE IF NOT EXISTS prediction_markets (
          id TEXT PRIMARY KEY,
          slug TEXT,
          title TEXT NOT NULL,
          category TEXT,
          status TEXT,
          outcomes TEXT,
          yes_price REAL,
          no_price REAL,
          volume REAL,
          liquidity REAL,
          close_time TEXT,
          updated_at TEXT NOT NULL,
          metadata TEXT
        )
      `);

      this.db.exec(`
        CREATE TABLE IF NOT EXISTS prediction_market_prices (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          market_id TEXT NOT NULL,
          timestamp TEXT NOT NULL,
          yes_price REAL,
          no_price REAL,
          volume REAL,
          liquidity REAL
        )
      `);

      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_prediction_market_prices
        ON prediction_market_prices(market_id, timestamp)
      `);

      this.db.exec(`
        CREATE TABLE IF NOT EXISTS prediction_trades (
          id TEXT PRIMARY KEY,
          market_id TEXT NOT NULL,
          market_title TEXT NOT NULL,
          outcome TEXT NOT NULL,
          side TEXT NOT NULL,
          shares REAL NOT NULL,
          price REAL NOT NULL,
          fee REAL NOT NULL,
          pnl REAL,
          timestamp TEXT NOT NULL,
          status TEXT NOT NULL,
          reason TEXT
        )
      `);

      this.db.exec(`
        CREATE TABLE IF NOT EXISTS prediction_positions (
          market_id TEXT NOT NULL,
          market_title TEXT NOT NULL,
          outcome TEXT NOT NULL,
          shares REAL NOT NULL,
          average_price REAL NOT NULL,
          last_price REAL NOT NULL,
          unrealized_pnl REAL NOT NULL,
          opened_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (market_id, outcome)
        )
      `);

      this.db.exec(`
        CREATE TABLE IF NOT EXISTS prediction_backtests (
          id TEXT PRIMARY KEY,
          idea_id TEXT NOT NULL,
          market_id TEXT NOT NULL,
          period_start TEXT NOT NULL,
          period_end TEXT NOT NULL,
          total_return REAL NOT NULL,
          average_return REAL NOT NULL,
          win_rate REAL NOT NULL,
          max_drawdown REAL NOT NULL,
          trades_simulated INTEGER NOT NULL,
          sharpe_ratio REAL NOT NULL,
          created_at TEXT NOT NULL
        )
      `);

      this.db.exec(`
        CREATE TABLE IF NOT EXISTS prediction_agent_status (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          status TEXT NOT NULL,
          current_cycle_id TEXT,
          current_step TEXT,
          last_update TEXT,
          last_cycle_start TEXT,
          last_cycle_end TEXT,
          last_trade_id TEXT,
          last_trade_at TEXT,
          active_markets INTEGER,
          open_positions INTEGER,
          metadata TEXT
        )
      `);

      this.initialized = true;
      logger.info('[PredictionStore] Initialized prediction database');
    } catch (error) {
      logger.error('[PredictionStore] Failed to initialize:', error);
      throw error;
    }
  }

  upsertMarkets(markets: PredictionMarket[]): void {
    if (!this.db) this.initialize();
    if (!this.db) return;

    const stmt = this.db.prepare(`
      INSERT INTO prediction_markets (
        id, slug, title, category, status, outcomes, yes_price, no_price,
        volume, liquidity, close_time, updated_at, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        slug = excluded.slug,
        title = excluded.title,
        category = excluded.category,
        status = excluded.status,
        outcomes = excluded.outcomes,
        yes_price = excluded.yes_price,
        no_price = excluded.no_price,
        volume = excluded.volume,
        liquidity = excluded.liquidity,
        close_time = excluded.close_time,
        updated_at = excluded.updated_at,
        metadata = excluded.metadata
    `);

    const batch = this.db.transaction((items: PredictionMarket[]) => {
      for (const market of items) {
        stmt.run(
          market.id,
          market.slug || null,
          market.title,
          market.category || null,
          market.status,
          JSON.stringify(market.outcomes || []),
          market.yesPrice ?? null,
          market.noPrice ?? null,
          market.volume ?? null,
          market.liquidity ?? null,
          market.closeTime ? market.closeTime.toISOString() : null,
          market.updatedAt.toISOString(),
          market.metadata ? JSON.stringify(market.metadata) : null
        );
      }
    });

    batch(markets);
  }

  pruneMarkets(options: { removeClosed?: boolean; removeNoVolume?: boolean } = {}): number {
    if (!this.db) this.initialize();
    if (!this.db) return 0;

    let removed = 0;
    if (options.removeClosed) {
      removed += this.db.prepare(`
        DELETE FROM prediction_markets
        WHERE status IN ('CLOSED', 'RESOLVED')
      `).run().changes;
    }

    if (options.removeNoVolume) {
      removed += this.db.prepare(`
        DELETE FROM prediction_markets
        WHERE volume IS NULL
      `).run().changes;
    }

    return removed;
  }

  recordMarketSnapshot(snapshot: PredictionMarketSnapshot): void {
    if (!this.db) this.initialize();
    if (!this.db) return;

    this.db.prepare(`
      INSERT INTO prediction_market_prices (
        market_id, timestamp, yes_price, no_price, volume, liquidity
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      snapshot.marketId,
      snapshot.timestamp.toISOString(),
      snapshot.yesPrice,
      snapshot.noPrice,
      snapshot.volume ?? null,
      snapshot.liquidity ?? null
    );
  }

  getMarkets(limit: number = 50, filter: PredictionMarketFilter = {}): PredictionMarket[] {
    if (!this.db) this.initialize();
    if (!this.db) return [];

    const resolvedLimit = Number.isFinite(limit) ? limit : 50;
    const scanLimit = Math.max(resolvedLimit * 5, resolvedLimit);
    const rows = this.db.prepare(`
      SELECT * FROM prediction_markets
      ORDER BY updated_at DESC
      LIMIT ?
    `).all(scanLimit) as any[];

    let markets = rows.map(row => ({
      id: row.id,
      slug: row.slug || undefined,
      title: row.title,
      category: row.category || undefined,
      status: (row.status || 'UNKNOWN') as PredictionMarket['status'],
      outcomes: (() => {
        if (!row.outcomes) return [];
        try {
          return JSON.parse(row.outcomes);
        } catch (error) {
          return [];
        }
      })(),
      yesPrice: Number.isFinite(row.yes_price) ? row.yes_price : undefined,
      noPrice: Number.isFinite(row.no_price) ? row.no_price : undefined,
      volume: Number.isFinite(row.volume) ? row.volume : undefined,
      liquidity: Number.isFinite(row.liquidity) ? row.liquidity : undefined,
      closeTime: row.close_time ? new Date(row.close_time) : null,
      source: 'POLYMARKET' as const,
      updatedAt: row.updated_at ? new Date(row.updated_at) : new Date(),
      metadata: (() => {
        if (!row.metadata) return undefined;
        try {
          return JSON.parse(row.metadata);
        } catch (error) {
          return undefined;
        }
      })(),
    }));

    if (filter.statuses && filter.statuses.length) {
      const allowed = new Set(filter.statuses);
      markets = markets.filter(market => allowed.has(market.status));
    }

    if (Number.isFinite(filter.minVolume ?? NaN)) {
      const minVolume = filter.minVolume as number;
      markets = markets.filter(market => (market.volume ?? 0) >= minVolume);
    }

    if (Number.isFinite(filter.maxAgeDays ?? NaN) && (filter.maxAgeDays as number) > 0) {
      const cutoff = Date.now() - (filter.maxAgeDays as number) * 24 * 60 * 60 * 1000;
      markets = markets.filter(market => {
        const timestamp = this.resolveMarketTimestamp(market);
        return timestamp > 0 && timestamp >= cutoff;
      });
    }

    return markets.slice(0, resolvedLimit) as PredictionMarket[];
  }

  getMarketPrices(marketId: string, limit: number = 200): PredictionMarketSnapshot[] {
    if (!this.db) this.initialize();
    if (!this.db) return [];

    const resolvedLimit = Number.isFinite(limit) ? limit : 200;
    const rows = this.db.prepare(`
      SELECT * FROM prediction_market_prices
      WHERE market_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(marketId, resolvedLimit) as any[];

    return rows.map(row => ({
      marketId: row.market_id,
      timestamp: new Date(row.timestamp),
      yesPrice: row.yes_price,
      noPrice: row.no_price,
      volume: row.volume,
      liquidity: row.liquidity,
    })).reverse();
  }

  storeTrade(trade: PredictionTrade): void {
    if (!this.db) this.initialize();
    if (!this.db) return;

    this.db.prepare(`
      INSERT OR REPLACE INTO prediction_trades (
        id, market_id, market_title, outcome, side, shares, price, fee,
        pnl, timestamp, status, reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      trade.id,
      trade.marketId,
      trade.marketTitle,
      trade.outcome,
      trade.side,
      trade.shares,
      trade.price,
      trade.fee,
      trade.pnl ?? null,
      trade.timestamp.toISOString(),
      trade.status,
      trade.reason || null
    );
  }

  getTrades(limit: number = 50): PredictionTrade[] {
    if (!this.db) this.initialize();
    if (!this.db) return [];

    const resolvedLimit = Number.isFinite(limit) ? limit : 50;
    const rows = this.db.prepare(`
      SELECT * FROM prediction_trades
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(resolvedLimit) as any[];

    return rows.map(row => ({
      id: row.id,
      marketId: row.market_id,
      marketTitle: row.market_title,
      outcome: row.outcome,
      side: row.side,
      shares: row.shares,
      price: row.price,
      fee: row.fee,
      pnl: row.pnl ?? undefined,
      timestamp: new Date(row.timestamp),
      status: row.status,
      reason: row.reason || undefined,
    }));
  }

  upsertPosition(position: PredictionPosition): void {
    if (!this.db) this.initialize();
    if (!this.db) return;

    this.db.prepare(`
      INSERT INTO prediction_positions (
        market_id, market_title, outcome, shares, average_price,
        last_price, unrealized_pnl, opened_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(market_id, outcome) DO UPDATE SET
        shares = excluded.shares,
        average_price = excluded.average_price,
        last_price = excluded.last_price,
        unrealized_pnl = excluded.unrealized_pnl,
        updated_at = excluded.updated_at
    `).run(
      position.marketId,
      position.marketTitle,
      position.outcome,
      position.shares,
      position.averagePrice,
      position.lastPrice,
      position.unrealizedPnL,
      position.openedAt.toISOString(),
      new Date().toISOString()
    );
  }

  removePosition(marketId: string, outcome: string): void {
    if (!this.db) this.initialize();
    if (!this.db) return;

    this.db.prepare(`
      DELETE FROM prediction_positions WHERE market_id = ? AND outcome = ?
    `).run(marketId, outcome);
  }

  getPositions(): PredictionPosition[] {
    if (!this.db) this.initialize();
    if (!this.db) return [];

    const rows = this.db.prepare(`
      SELECT * FROM prediction_positions
      ORDER BY updated_at DESC
    `).all() as any[];

    return rows.map(row => ({
      marketId: row.market_id,
      marketTitle: row.market_title,
      outcome: row.outcome,
      shares: row.shares,
      averagePrice: row.average_price,
      lastPrice: row.last_price,
      unrealizedPnL: row.unrealized_pnl,
      openedAt: new Date(row.opened_at),
    }));
  }

  storeBacktest(result: PredictionBacktestResult): void {
    if (!this.db) this.initialize();
    if (!this.db) return;

    this.db.prepare(`
      INSERT OR REPLACE INTO prediction_backtests (
        id, idea_id, market_id, period_start, period_end, total_return,
        average_return, win_rate, max_drawdown, trades_simulated,
        sharpe_ratio, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      `${result.ideaId}:${result.marketId}`,
      result.ideaId,
      result.marketId,
      result.period.start.toISOString(),
      result.period.end.toISOString(),
      result.totalReturn,
      result.averageReturn,
      result.winRate,
      result.maxDrawdown,
      result.tradesSimulated,
      result.sharpeRatio,
      new Date().toISOString()
    );
  }

  getBacktests(limit: number = 50): PredictionBacktestResult[] {
    if (!this.db) this.initialize();
    if (!this.db) return [];

    const resolvedLimit = Number.isFinite(limit) ? limit : 50;
    const rows = this.db.prepare(`
      SELECT * FROM prediction_backtests
      ORDER BY created_at DESC
      LIMIT ?
    `).all(resolvedLimit) as any[];

    return rows.map(row => ({
      ideaId: row.idea_id,
      marketId: row.market_id,
      period: {
        start: new Date(row.period_start),
        end: new Date(row.period_end),
      },
      totalReturn: row.total_return,
      averageReturn: row.average_return,
      winRate: row.win_rate,
      maxDrawdown: row.max_drawdown,
      tradesSimulated: row.trades_simulated,
      sharpeRatio: row.sharpe_ratio,
    }));
  }

  updateAgentStatus(status: PredictionAgentStatus): void {
    if (!this.db) this.initialize();
    if (!this.db) return;

    this.db.prepare(`
      INSERT INTO prediction_agent_status (
        id, status, current_cycle_id, current_step, last_update,
        last_cycle_start, last_cycle_end, last_trade_id, last_trade_at,
        active_markets, open_positions, metadata
      ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        current_cycle_id = excluded.current_cycle_id,
        current_step = excluded.current_step,
        last_update = excluded.last_update,
        last_cycle_start = excluded.last_cycle_start,
        last_cycle_end = excluded.last_cycle_end,
        last_trade_id = excluded.last_trade_id,
        last_trade_at = excluded.last_trade_at,
        active_markets = excluded.active_markets,
        open_positions = excluded.open_positions,
        metadata = excluded.metadata
    `).run(
      status.status,
      status.currentCycleId,
      status.currentStep,
      status.lastUpdate ? status.lastUpdate.toISOString() : null,
      status.lastCycleStart ? status.lastCycleStart.toISOString() : null,
      status.lastCycleEnd ? status.lastCycleEnd.toISOString() : null,
      status.lastTradeId,
      status.lastTradeAt ? status.lastTradeAt.toISOString() : null,
      status.activeMarkets,
      status.openPositions,
      status.metadata ? JSON.stringify(status.metadata) : null
    );
  }

  getAgentStatus(): PredictionAgentStatus {
    if (!this.db) this.initialize();
    if (!this.db) {
      return {
        status: 'IDLE',
        currentCycleId: null,
        currentStep: null,
        lastUpdate: null,
        lastCycleStart: null,
        lastCycleEnd: null,
        lastTradeId: null,
        lastTradeAt: null,
        activeMarkets: 0,
        openPositions: 0,
      };
    }

    const row = this.db.prepare(`
      SELECT * FROM prediction_agent_status WHERE id = 1
    `).get() as any;

    if (!row) {
      return {
        status: 'IDLE',
        currentCycleId: null,
        currentStep: null,
        lastUpdate: null,
        lastCycleStart: null,
        lastCycleEnd: null,
        lastTradeId: null,
        lastTradeAt: null,
        activeMarkets: 0,
        openPositions: 0,
      };
    }

    return {
      status: row.status as PredictionAgentStatus['status'],
      currentCycleId: row.current_cycle_id,
      currentStep: row.current_step,
      lastUpdate: row.last_update ? new Date(row.last_update) : null,
      lastCycleStart: row.last_cycle_start ? new Date(row.last_cycle_start) : null,
      lastCycleEnd: row.last_cycle_end ? new Date(row.last_cycle_end) : null,
      lastTradeId: row.last_trade_id,
      lastTradeAt: row.last_trade_at ? new Date(row.last_trade_at) : null,
      activeMarkets: row.active_markets || 0,
      openPositions: row.open_positions || 0,
      metadata: (() => {
        if (!row.metadata) return undefined;
        try {
          return JSON.parse(row.metadata);
        } catch (error) {
          return undefined;
        }
      })(),
    };
  }
}

const predictionStore = new PredictionStore();
export default predictionStore;
export type { PredictionAgentStatus };
