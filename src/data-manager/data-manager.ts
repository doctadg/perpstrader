import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { Trade, Strategy, MarketData, BacktestResult, AIInsight, ResearchData } from '../shared/types';
import { v4 as uuidv4 } from 'uuid';
import config from '../shared/config';
import logger from '../shared/logger';

export class DataManager {
  private db: Database.Database;
  private dbPath: string;

  constructor() {
    const dbConfig = config.getSection('database');
    this.dbPath = dbConfig.connection;

    // Ensure data directory exists
    const dataDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    this.db = new Database(this.dbPath);
    this.initializeDatabase();

    logger.info(`Database initialized at: ${this.dbPath}`);
  }

  private initializeDatabase(): void {
    try {
      // Strategies table
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS strategies (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          type TEXT NOT NULL,
          symbols TEXT NOT NULL,
          timeframe TEXT NOT NULL,
          parameters TEXT NOT NULL,
          entryConditions TEXT NOT NULL,
          exitConditions TEXT NOT NULL,
          riskParameters TEXT NOT NULL,
          isActive INTEGER DEFAULT 0,
          performance TEXT NOT NULL,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL
        )
      `);

      // Trades table
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS trades (
          id TEXT PRIMARY KEY,
          strategyId TEXT NOT NULL,
          symbol TEXT NOT NULL,
          side TEXT NOT NULL,
          size REAL NOT NULL,
          price REAL NOT NULL,
          fee REAL DEFAULT 0,
          pnl REAL DEFAULT 0,
          timestamp TEXT NOT NULL,
          type TEXT NOT NULL,
          status TEXT NOT NULL,
          entryExit TEXT NOT NULL,
          FOREIGN KEY (strategyId) REFERENCES strategies (id)
        )
      `);

      // Market data table
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS market_data (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          symbol TEXT NOT NULL,
          timestamp TEXT NOT NULL,
          open REAL NOT NULL,
          high REAL NOT NULL,
          low REAL NOT NULL,
          close REAL NOT NULL,
          volume REAL NOT NULL,
          vwap REAL,
          bid REAL,
          ask REAL,
          bidSize REAL,
          askSize REAL
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_market_symbol_time ON market_data(symbol, timestamp);
        CREATE INDEX IF NOT EXISTS idx_market_symbol ON market_data(symbol);
        CREATE INDEX IF NOT EXISTS idx_market_timestamp ON market_data(timestamp);
      `);

      // AI insights table
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS ai_insights (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT NOT NULL,
          confidence REAL NOT NULL,
          actionable INTEGER NOT NULL,
          timestamp TEXT NOT NULL,
          data TEXT NOT NULL
        )
      `);

      // Research data table
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS research_data (
          id TEXT PRIMARY KEY,
          topic TEXT NOT NULL,
          timestamp TEXT NOT NULL,
          searchResults TEXT NOT NULL,
          scrapedContent TEXT NOT NULL,
          insights TEXT NOT NULL,
          sources TEXT NOT NULL,
          confidence REAL NOT NULL
        )
      `);

      // Backtest results table
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS backtest_results (
          id TEXT PRIMARY KEY,
          strategyId TEXT NOT NULL,
          periodStart TEXT NOT NULL,
          periodEnd TEXT NOT NULL,
          initialCapital REAL NOT NULL,
          finalCapital REAL NOT NULL,
          totalReturn REAL NOT NULL,
          annualizedReturn REAL NOT NULL,
          sharpeRatio REAL NOT NULL,
          maxDrawdown REAL NOT NULL,
          winRate REAL NOT NULL,
          totalTrades INTEGER NOT NULL,
          trades TEXT NOT NULL,
          metrics TEXT NOT NULL,
          createdAt TEXT NOT NULL
        )
      `);

      // System status table
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS system_status (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          agent TEXT NOT NULL,
          execution TEXT NOT NULL,
          research TEXT NOT NULL,
          data TEXT NOT NULL,
          dashboard TEXT NOT NULL,
          uptime INTEGER NOT NULL,
          lastUpdate TEXT NOT NULL,
          errors TEXT
        )
      `);

      logger.info('Database tables initialized successfully');

    } catch (error) {
      logger.error('Database initialization failed:', error);
      throw error;
    }
  }

  // Strategy operations
  async saveStrategy(strategy: Strategy): Promise<void> {
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO strategies (
          id, name, description, type, symbols, timeframe, parameters,
          entryConditions, exitConditions, riskParameters, isActive,
          performance, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        strategy.id,
        strategy.name,
        strategy.description,
        strategy.type,
        JSON.stringify(strategy.symbols),
        strategy.timeframe,
        JSON.stringify(strategy.parameters),
        JSON.stringify(strategy.entryConditions),
        JSON.stringify(strategy.exitConditions),
        JSON.stringify(strategy.riskParameters),
        strategy.isActive ? 1 : 0,
        JSON.stringify(strategy.performance),
        strategy.createdAt.toISOString(),
        strategy.updatedAt.toISOString()
      );

      logger.info(`Strategy saved: ${strategy.name}`);

    } catch (error) {
      logger.error('Failed to save strategy:', error);
      throw error;
    }
  }

  async getStrategy(id: string): Promise<Strategy | null> {
    try {
      const stmt = this.db.prepare('SELECT * FROM strategies WHERE id = ?');
      const row = stmt.get(id) as any;

      if (!row) return null;

      return this.mapRowToStrategy(row);

    } catch (error) {
      logger.error('Failed to get strategy:', error);
      throw error;
    }
  }

  async getAllStrategies(): Promise<Strategy[]> {
    try {
      const stmt = this.db.prepare('SELECT * FROM strategies ORDER BY createdAt DESC');
      const rows = stmt.all() as any[];

      return rows.map(row => this.mapRowToStrategy(row));

    } catch (error) {
      logger.error('Failed to get all strategies:', error);
      throw error;
    }
  }

  async deleteStrategy(id: string): Promise<boolean> {
    try {
      const stmt = this.db.prepare('DELETE FROM strategies WHERE id = ?');
      const result = stmt.run(id);

      return result.changes > 0;

    } catch (error) {
      logger.error('Failed to delete strategy:', error);
      throw error;
    }
  }

  // Trade operations
  async saveTrade(trade: Trade): Promise<void> {
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO trades (
          id, strategyId, symbol, side, size, price, fee, pnl,
          timestamp, type, status, entryExit
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        trade.id,
        trade.strategyId,
        trade.symbol,
        trade.side,
        trade.size,
        trade.price,
        trade.fee,
        trade.pnl || 0,
        trade.timestamp.toISOString(),
        trade.type,
        trade.status,
        trade.entryExit
      );

      logger.info(`Trade saved: ${trade.id}`);

    } catch (error) {
      logger.error('Failed to save trade:', error);
      throw error;
    }
  }

  async getTrades(strategyId?: string, symbol?: string, limit: number = 100): Promise<Trade[]> {
    try {
      let query = 'SELECT * FROM trades';
      const params: any[] = [];
      const conditions: string[] = [];

      if (strategyId) {
        conditions.push('strategyId = ?');
        params.push(strategyId);
      }

      if (symbol) {
        conditions.push('symbol = ?');
        params.push(symbol);
      }

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }

      query += ' ORDER BY timestamp DESC LIMIT ?';
      params.push(limit);

      const stmt = this.db.prepare(query);
      const rows = stmt.all(...params) as any[];

      return rows.map(row => this.mapRowToTrade(row));

    } catch (error) {
      logger.error('Failed to get trades:', error);
      throw error;
    }
  }

  async clearAllTrades(): Promise<number> {
    try {
      const stmt = this.db.prepare('DELETE FROM trades');
      const result = stmt.run();
      logger.info(`Cleared ${result.changes} trades from database`);
      return result.changes;
    } catch (error) {
      logger.error('Failed to clear trades:', error);
      throw error;
    }
  }

  // Market data operations
  async saveMarketData(marketData: MarketData[]): Promise<void> {
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO market_data (
          symbol, timestamp, open, high, low, close, volume,
          vwap, bid, ask, bidSize, askSize
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const transaction = this.db.transaction(() => {
        for (const data of marketData) {
          stmt.run(
            data.symbol,
            data.timestamp.toISOString(),
            data.open,
            data.high,
            data.low,
            data.close,
            data.volume,
            data.vwap || null,
            data.bid || null,
            data.ask || null,
            data.bidSize || null,
            data.askSize || null
          );
        }
      });

      transaction();
      logger.info(`Saved ${marketData.length} market data points`);

    } catch (error) {
      logger.error('Failed to save market data:', error);
      throw error;
    }
  }

  async getMarketData(symbol: string, startTime?: Date, endTime?: Date, limit: number = 1000): Promise<MarketData[]> {
    try {
      let query = 'SELECT * FROM market_data WHERE symbol = ?';
      const params: any[] = [symbol];

      if (startTime) {
        query += ' AND timestamp >= ?';
        params.push(startTime.toISOString());
      }

      if (endTime) {
        query += ' AND timestamp <= ?';
        params.push(endTime.toISOString());
      }

      query += ' ORDER BY timestamp DESC LIMIT ?';
      params.push(limit);

      const stmt = this.db.prepare(query);
      const rows = stmt.all(...params) as any[];

      return rows.map(row => this.mapRowToMarketData(row));

    } catch (error) {
      logger.error('Failed to get market data:', error);
      throw error;
    }
  }

  // Backtest results operations
  async saveBacktestResult(result: BacktestResult): Promise<void> {
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO backtest_results (
          id, strategyId, periodStart, periodEnd, initialCapital,
          finalCapital, totalReturn, annualizedReturn, sharpeRatio,
          maxDrawdown, winRate, totalTrades, trades, metrics, createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        uuidv4(),
        result.strategyId,
        result.period.start.toISOString(),
        result.period.end.toISOString(),
        result.initialCapital,
        result.finalCapital,
        result.totalReturn,
        result.annualizedReturn,
        result.sharpeRatio,
        result.maxDrawdown,
        result.winRate,
        result.totalTrades,
        JSON.stringify(result.trades),
        JSON.stringify(result.metrics),
        new Date().toISOString()
      );

      logger.info(`Backtest result saved for strategy: ${result.strategyId}`);

    } catch (error) {
      logger.error('Failed to save backtest result:', error);
      throw error;
    }
  }

  // AI insights operations
  async saveAIInsight(insight: AIInsight): Promise<void> {
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO ai_insights (
          id, type, title, description, confidence, actionable, timestamp, data
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        insight.id,
        insight.type,
        insight.title,
        insight.description,
        insight.confidence,
        insight.actionable ? 1 : 0,
        insight.timestamp.toISOString(),
        JSON.stringify(insight.data)
      );

      logger.info(`AI insight saved: ${insight.title}`);

    } catch (error) {
      logger.error('Failed to save AI insight:', error);
      throw error;
    }
  }

  async getAIInsights(type?: string, limit: number = 50): Promise<AIInsight[]> {
    try {
      let query = 'SELECT * FROM ai_insights';
      const params: any[] = [];

      if (type) {
        query += ' WHERE type = ?';
        params.push(type);
      }

      query += ' ORDER BY timestamp DESC LIMIT ?';
      params.push(limit);

      const stmt = this.db.prepare(query);
      const rows = stmt.all(...params) as any[];

      return rows.map(row => this.mapRowToAIInsight(row));

    } catch (error) {
      logger.error('Failed to get AI insights:', error);
      throw error;
    }
  }

  // Research data operations
  async saveResearchData(research: ResearchData): Promise<void> {
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO research_data (
          id, topic, timestamp, searchResults, scrapedContent, insights, sources, confidence
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        uuidv4(),
        research.topic,
        research.timestamp.toISOString(),
        JSON.stringify(research.searchResults),
        JSON.stringify(research.scrapedContent),
        JSON.stringify(research.insights),
        JSON.stringify(research.sources),
        research.confidence
      );

      logger.info(`Research data saved: ${research.topic}`);

    } catch (error) {
      logger.error('Failed to save research data:', error);
      throw error;
    }
  }

  // Analytics and reporting
  async getPortfolioPerformance(timeframe: string = '7d'): Promise<any> {
    try {
      const endTime = new Date();
      const startTime = new Date();

      switch (timeframe) {
        case '1d':
          startTime.setDate(startTime.getDate() - 1);
          break;
        case '7d':
          startTime.setDate(startTime.getDate() - 7);
          break;
        case '30d':
          startTime.setDate(startTime.getDate() - 30);
          break;
        case '90d':
          startTime.setDate(startTime.getDate() - 90);
          break;
      }

      const stmt = this.db.prepare(`
        SELECT 
          COUNT(*) as totalTrades,
          SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as winningTrades,
          SUM(pnl) as totalPnL,
          AVG(pnl) as avgPnL,
          MAX(pnl) as bestTrade,
          MIN(pnl) as worstTrade
        FROM trades 
        WHERE timestamp >= ? AND timestamp <= ?
      `);

      const result = stmt.get(startTime.toISOString(), endTime.toISOString()) as any;

      return {
        timeframe,
        totalTrades: result.totalTrades || 0,
        winningTrades: result.winningTrades || 0,
        winRate: result.totalTrades > 0 ? (result.winningTrades / result.totalTrades) * 100 : 0,
        totalPnL: result.totalPnL || 0,
        avgPnL: result.avgPnL || 0,
        bestTrade: result.bestTrade || 0,
        worstTrade: result.worstTrade || 0
      };

    } catch (error) {
      logger.error('Failed to get portfolio performance:', error);
      throw error;
    }
  }

  // Cleanup and maintenance
  async cleanupOldData(daysToKeep: number = 90): Promise<void> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      // Clean up old market data
      const marketDataStmt = this.db.prepare('DELETE FROM market_data WHERE timestamp < ?');
      const marketDataResult = marketDataStmt.run(cutoffDate.toISOString());

      // Clean up old AI insights
      const insightsStmt = this.db.prepare('DELETE FROM ai_insights WHERE timestamp < ?');
      const insightsResult = insightsStmt.run(cutoffDate.toISOString());

      logger.info(`Cleanup completed: removed ${marketDataResult.changes} market data points and ${insightsResult.changes} insights`);

    } catch (error) {
      logger.error('Failed to cleanup old data:', error);
      throw error;
    }
  }

  close(): void {
    this.db.close();
    logger.info('Database connection closed');
  }

  // Helper methods for mapping rows to objects
  private mapRowToStrategy(row: any): Strategy {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      type: row.type,
      symbols: JSON.parse(row.symbols),
      timeframe: row.timeframe,
      parameters: JSON.parse(row.parameters),
      entryConditions: JSON.parse(row.entryConditions),
      exitConditions: JSON.parse(row.exitConditions),
      riskParameters: JSON.parse(row.riskParameters),
      isActive: row.isActive === 1,
      performance: JSON.parse(row.performance),
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt)
    };
  }

  private mapRowToTrade(row: any): Trade {
    return {
      id: row.id,
      strategyId: row.strategyId,
      symbol: row.symbol,
      side: row.side,
      size: row.size,
      price: row.price,
      fee: row.fee,
      pnl: row.pnl,
      timestamp: new Date(row.timestamp),
      type: row.type,
      status: row.status,
      entryExit: row.entryExit
    };
  }

  private mapRowToMarketData(row: any): MarketData {
    return {
      symbol: row.symbol,
      timestamp: new Date(row.timestamp),
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      volume: row.volume,
      vwap: row.vwap,
      bid: row.bid,
      ask: row.ask,
      bidSize: row.bidSize,
      askSize: row.askSize
    };
  }

  private mapRowToAIInsight(row: any): AIInsight {
    return {
      id: row.id,
      type: row.type,
      title: row.title,
      description: row.description,
      confidence: row.confidence,
      actionable: row.actionable === 1,
      timestamp: new Date(row.timestamp),
      data: JSON.parse(row.data)
    };
  }

  async saveSystemStatus(status: any): Promise<void> {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO system_status (agent, execution, research, data, dashboard, uptime, lastUpdate, errors)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        status.agent,
        status.execution,
        status.research,
        status.data,
        status.dashboard,
        status.uptime,
        status.lastUpdate.toISOString(),
        JSON.stringify(status.errors || [])
      );

      logger.debug('System status saved to database');
    } catch (error) {
      logger.error('Failed to save system status:', error);
    }
  }

  async getSystemStatus(): Promise<any | null> {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM system_status
        ORDER BY id DESC
        LIMIT 1
      `);

      const row = stmt.get() as any;

      if (!row) {
        return null;
      }

      return {
        agent: row.agent,
        execution: row.execution,
        research: row.research,
        data: row.data,
        dashboard: row.dashboard,
        uptime: row.uptime,
        lastUpdate: new Date(row.lastUpdate),
        errors: JSON.parse(row.errors || '[]')
      };
    } catch (error) {
      logger.error('Failed to get system status:', error);
      return null;
    }
  }

  async cleanupOldStatusEntries(maxAge: number = 7): Promise<void> {
    try {
      const cutoffDate = new Date(Date.now() - maxAge * 24 * 60 * 60 * 1000);

      const stmt = this.db.prepare(`
        DELETE FROM system_status
        WHERE lastUpdate < ?
      `);

      const result = stmt.run(cutoffDate.toISOString());
      logger.info(`Cleaned up ${result.changes} old system status entries`);
    } catch (error) {
      logger.error('Failed to cleanup old status entries:', error);
    }
  }
}

export default new DataManager();
