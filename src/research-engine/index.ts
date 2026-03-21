// Research Engine - Main orchestrator for continuous strategy research
// Runs every 15 minutes to generate new trading strategy ideas

import { GLMAIService } from '../shared/glm-service';
import logger from '../shared/logger';
import { MarketAnalyzer, MarketRegime } from './market-analyzer';
import { IdeaQueue, StrategyIdea, IdeaStatus } from './idea-queue';
import { StrategyGenerator } from './strategy-generator';
import cron from 'node-cron';

interface ResearchEngineConfig {
  intervalMinutes: number;
  ideasPerRun: number;
  minConfidence: number;
  maxQueueSize: number;
}

export class ResearchEngine {
  private marketAnalyzer: MarketAnalyzer;
  private ideaQueue: IdeaQueue;
  private strategyGenerator: StrategyGenerator;
  private config: ResearchEngineConfig;
  private isRunning: boolean = false;
  private cronJob: cron.ScheduledTask | null = null;

  constructor(config?: Partial<ResearchEngineConfig>) {
    this.config = {
      intervalMinutes: 15,
      ideasPerRun: 5,
      minConfidence: 0.6,
      maxQueueSize: 100,
      ...config,
    };

    this.marketAnalyzer = new MarketAnalyzer();
    this.ideaQueue = new IdeaQueue();
    this.strategyGenerator = new StrategyGenerator();
  }

  /**
   * Start the research engine with cron scheduling
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('[ResearchEngine] Already running');
      return;
    }

    logger.info('[ResearchEngine] Starting research engine...');
    this.isRunning = true;

    // Initialize database tables
    await this.ideaQueue.initialize();

    // Run immediately on start
    await this.runResearchCycle();

    // Schedule to run every 15 minutes
    this.cronJob = cron.schedule('*/15 * * * *', async () => {
      if (!this.isRunning) {
        logger.warn('[ResearchEngine] Skipping cycle - engine not running');
        return;
      }
      await this.runResearchCycle();
    });

    logger.info(`[ResearchEngine] Scheduled to run every ${this.config.intervalMinutes} minutes`);
  }

  /**
   * Stop the research engine
   */
  stop(): void {
    logger.info('[ResearchEngine] Stopping research engine...');
    this.isRunning = false;

    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
    }

    logger.info('[ResearchEngine] Stopped');
  }

  /**
   * Run a single research cycle
   */
  async runResearchCycle(): Promise<void> {
    const startTime = Date.now();
    logger.info('[ResearchEngine] Starting research cycle...');

    try {
      // Step 1: Analyze current market conditions
      const marketRegime = await this.marketAnalyzer.analyze();
      logger.info(`[ResearchEngine] Market regime: ${marketRegime.regime}, volatility: ${marketRegime.volatility.toFixed(2)}`);

      // Step 2: Check queue capacity
      const queueSize = await this.ideaQueue.getPendingCount();
      if (queueSize >= this.config.maxQueueSize) {
        logger.warn(`[ResearchEngine] Queue full (${queueSize}/${this.config.maxQueueSize}), skipping generation`);
        return;
      }

      // Step 3: Generate strategy ideas based on market conditions
      const ideas = await this.strategyGenerator.generateIdeas(marketRegime, this.config.ideasPerRun);
      logger.info(`[ResearchEngine] Generated ${ideas.length} strategy ideas`);

      // Step 4: Filter high-confidence ideas and add to queue
      const validIdeas = ideas.filter(idea => idea.confidence >= this.config.minConfidence);
      logger.info(`[ResearchEngine] ${validIdeas.length} ideas meet confidence threshold (${this.config.minConfidence})`);

      // Step 5: Add ideas to queue
      const addedCount = await this.ideaQueue.addIdeas(validIdeas);
      logger.info(`[ResearchEngine] Added ${addedCount} ideas to backtest queue`);

      // Step 6: Process any pending backtest jobs
      await this.processPendingBacktests();

      const duration = Date.now() - startTime;
      logger.info(`[ResearchEngine] Research cycle completed in ${duration}ms`);

    } catch (error) {
      logger.error('[ResearchEngine] Research cycle failed:', error);
    }
  }

  /**
   * Process pending backtest jobs
   */
  private async processPendingBacktests(): Promise<void> {
    try {
      const pendingJobs = await this.ideaQueue.getPendingBacktestJobs(5);
      if (pendingJobs.length === 0) {
        return;
      }

      logger.info(`[ResearchEngine] Processing ${pendingJobs.length} pending backtest jobs`);

      for (const job of pendingJobs) {
        await this.ideaQueue.updateBacktestJobStatus(job.id, 'RUNNING');
        await this.ideaQueue.updateIdeaStatus(job.strategyId, 'RUNNING');

        try {
          const result = await this.runRealBacktest(job.strategyId);
          await this.ideaQueue.completeBacktestJob(job.id, result);
          logger.info(`[ResearchEngine] Backtest completed for strategy ${job.strategyId}: Sharpe=${result.sharpeRatio?.toFixed(2)}, WR=${(result.winRate * 100).toFixed(0)}%, Trades=${result.totalTrades}`);
        } catch (error) {
          logger.error(`[ResearchEngine] Backtest failed for job ${job.id}:`, error);
          await this.ideaQueue.updateBacktestJobStatus(job.id, 'FAILED');
          await this.ideaQueue.updateIdeaStatus(job.strategyId, 'PENDING');
        }
      }

      // After processing backtests, promote top strategies to the strategies table
      await this.promoteTopStrategies();
    } catch (error) {
      logger.error('[ResearchEngine] Error processing backtest jobs:', error);
    }
  }

  /**
   * Run a real backtest using market data from the database.
   * Falls back to simulated results if market data is unavailable.
   */
  private async runRealBacktest(strategyId: string): Promise<any> {
    try {
      // Get the strategy idea
      const ideas = await this.ideaQueue.getIdeasByStatus('RUNNING');
      const idea = ideas.find(i => i.id === strategyId);
      
      if (!idea) {
        // Try getting by ID directly
        const pendingIdeas = await this.ideaQueue.getPendingIdeas(100);
        const fallback = pendingIdeas.find(i => i.id === strategyId);
        if (!fallback) {
          logger.warn(`[ResearchEngine] Strategy ${strategyId} not found, using simulation`);
          return this.simulateBacktest(strategyId);
        }
        return this.backtestStrategy(fallback);
      }
      
      return this.backtestStrategy(idea);
    } catch (error) {
      logger.error(`[ResearchEngine] Real backtest failed for ${strategyId}, falling back to simulation:`, error);
      return this.simulateBacktest(strategyId);
    }
  }

  /**
   * Backtest a strategy idea using the BacktestEngine with real market data
   */
  private async backtestStrategy(idea: StrategyIdea): Promise<any> {
    try {
      const { BacktestEngine } = await import('../backtest/enhanced-backtest');
      
      // Load recent market data using IdeaQueue's DB connection (avoids WAL locking)
      const cutoffTime = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const symbols = idea.symbols.slice(0, 4);
      const marketData = this.ideaQueue.getMarketDataForBacktest(symbols, cutoffTime);

      if (marketData.length < 100) {
        logger.warn(`[ResearchEngine] Insufficient market data (${marketData.length} candles), using simulation`);
        return this.simulateBacktest(idea.id);
      }

      // Build a Strategy object from the idea
      const strategy = {
        id: idea.id,
        name: idea.name,
        type: idea.type,
        symbols: idea.symbols,
        timeframe: idea.timeframe,
        parameters: idea.parameters,
        entryConditions: idea.entryConditions,
        exitConditions: idea.exitConditions,
        riskParameters: idea.riskParameters,
      };

      const engine = new BacktestEngine({
        initialCapital: 10000,
        commissionRate: 0.0005,
        slippageBps: 5,
      });

      const result = await engine.runBacktest(strategy as any, marketData as any);

      return {
        sharpeRatio: result.sharpeRatio,
        winRate: result.winRate / 100, // Convert from % to decimal
        pnl: result.finalCapital - result.initialCapital,
        maxDrawdown: result.maxDrawdown / 100, // Convert from % to decimal
        totalTrades: result.totalTrades,
        profitFactor: (result as any).profitFactor ?? 0,
        completedAt: new Date().toISOString(),
      };
    } catch (importError) {
      logger.warn('[ResearchEngine] BacktestEngine not available, using simulation');
      return this.simulateBacktest(idea.id);
    }
  }

  /**
   * Simulate a backtest (fallback when real backtest is unavailable).
   * Returns conservative estimates — NOT random garbage.
   * This should almost never be called; if it is, the result should
   * never pass promotion gates.
   */
  private simulateBacktest(strategyId: string): Promise<any> {
    logger.warn(`[ResearchEngine] simulateBacktest called for ${strategyId} — no real market data available`);
    return Promise.resolve({
      sharpeRatio: 0,      // Neutral — won't pass promotion gate
      winRate: 0,           // Unknown — fail-safe
      pnl: 0,               // No simulated PnL
      maxDrawdown: 1.0,     // Worst case assumed
      totalTrades: 0,       // No real trades happened
      profitFactor: 0,      // Unprofitable by default
      completedAt: new Date().toISOString(),
    });
  }

  /**
   * Promote top-performing strategies from strategy_performance to the strategies table.
   * This bridges the research engine pipeline to the active trading pool.
   */
  private async promoteTopStrategies(): Promise<void> {
    try {
      const topStrategies = await this.ideaQueue.getTopStrategies(5);
      if (topStrategies.length === 0) {
        logger.info('[ResearchEngine] No top strategies to promote');
        return;
      }

      logger.info(`[ResearchEngine] Promoting ${topStrategies.length} top strategies to active pool...`);

      const betterSqlite3 = await import('better-sqlite3');
      const Database = (betterSqlite3.default ?? betterSqlite3) as any;
      const config = (await import('../shared/config')).default;
      const dbConfig = config.getSection('database');
      const { v4: uuidv4 } = await import('uuid');
      const cryptoMod = await import('crypto');
      const crypto = cryptoMod.default ?? cryptoMod;

      // Hard cap on active strategies to prevent clone spam
      const preCheckDb = new Database(dbConfig.connection);
      const activeCount = (preCheckDb.prepare('SELECT COUNT(*) as cnt FROM strategies WHERE isActive = 1').get() as any).cnt;
      const MAX_ACTIVE_STRATEGIES = 50;
      if (activeCount >= MAX_ACTIVE_STRATEGIES) {
        logger.warn(`[ResearchEngine] Active strategy cap reached (${activeCount}/${MAX_ACTIVE_STRATEGIES}), skipping promotion`);
        preCheckDb.close();
        return;
      }
      preCheckDb.close();

      logger.info(`[ResearchEngine] Active strategies: ${activeCount}/${MAX_ACTIVE_STRATEGIES}`);

      const db = new Database(dbConfig.connection);
      try {
        // --- Phase 1: Pre-compute params hashes for the promotion batch ---
        const batchEntries: Array<{
          perf: typeof topStrategies[0];
          idea: any;
          paramsHash: string;
        }> = [];

        for (const perf of topStrategies) {
          const idea = db.prepare('SELECT * FROM strategy_ideas WHERE id = ?').get(perf.strategyId) as any;
          if (!idea) continue;

          const paramsHash = crypto
            .createHash('sha256')
            .update(`${idea.name}|${idea.parameters}`)
            .digest('hex');

          batchEntries.push({ perf, idea, paramsHash });
        }

        // Collect all params_hashes appearing in the batch (deduped)
        const batchHashes = [...new Set(batchEntries.map(e => e.paramsHash))];

        // Only deactivate strategies that are being replaced by a newer version
        // in this promotion batch (matched by params_hash). All others stay active.
        if (batchHashes.length > 0) {
          const placeholders = batchHashes.map(() => '?').join(', ');
          db.prepare(
            `UPDATE strategies SET isActive = 0 WHERE isActive = 1 AND params_hash IN (${placeholders})`
          ).run(...batchHashes);
        }

        // Track which (name, params) combos we've already promoted in this batch
        const promotedHashes = new Set<string>();

        let promoted = 0;
        for (const { perf, idea, paramsHash } of batchEntries) {
          // Skip if already promoted in this batch
          if (promotedHashes.has(paramsHash)) {
            logger.debug(`[ResearchEngine] Skipping duplicate strategy (same name+params): ${idea.name}`);
            continue;
          }

          // Check if strategy already exists in strategies table (match by params hash only — prevents clone spam)
          let existing: any = db.prepare(
            'SELECT id, params_hash FROM strategies WHERE params_hash = ?'
          ).get(paramsHash);

          // Also match NULL-hash strategies with identical parameters (legacy data)
          if (!existing) {
            existing = db.prepare(
              'SELECT id FROM strategies WHERE params_hash IS NULL AND parameters = ? LIMIT 1'
            ).get(idea.parameters);
          }
          
          if (existing) {
            // Update existing strategy with latest performance, params_hash, and reactivate
            db.prepare(`
              UPDATE strategies SET 
                isActive = 1,
                params_hash = ?,
                performance = ?,
                updatedAt = ?
              WHERE id = ?
            `).run(
              paramsHash,
              JSON.stringify({
                totalTrades: perf.totalTrades,
                winningTrades: Math.round(perf.totalTrades * perf.winRate),
                losingTrades: Math.round(perf.totalTrades * (1 - perf.winRate)),
                winRate: perf.winRate * 100,
                totalPnL: perf.pnl,
                sharpeRatio: perf.sharpe,
                maxDrawdown: perf.maxDrawdown,
                // Compute averageWin/averageLoss from profit factor and win rate
                // PF = (avgWin * winningTrades) / (avgLoss * losingTrades)
                // avgWin = totalPnL * PF / (winningTrades * PF + losingTrades) when PF > 0
                averageWin: perf.profitFactor > 0 && perf.totalTrades > 0
                  ? Math.abs(perf.pnl) * perf.profitFactor / (Math.round(perf.totalTrades * perf.winRate) * perf.profitFactor + Math.round(perf.totalTrades * (1 - perf.winRate)))
                  : Math.abs(perf.pnl) / Math.max(perf.totalTrades, 1),
                averageLoss: perf.profitFactor > 0 && perf.totalTrades > 0
                  ? Math.abs(perf.pnl) / (Math.round(perf.totalTrades * perf.winRate) * perf.profitFactor + Math.round(perf.totalTrades * (1 - perf.winRate)))
                  : 0,
                profitFactor: perf.profitFactor,
              }),
              new Date().toISOString(),
              existing.id
            );
            promotedHashes.add(paramsHash);
            promoted++;
          } else {
            // Insert new strategy
            const strategyId = uuidv4();
            const now = new Date().toISOString();
            db.prepare(`
              INSERT INTO strategies (
                id, name, description, type, symbols, timeframe, parameters,
                entryConditions, exitConditions, riskParameters, isActive,
                performance, params_hash, createdAt, updatedAt
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
            `).run(
              strategyId,
              idea.name,
              idea.description || `Promoted from research pipeline. Sharpe: ${perf.sharpe.toFixed(2)}`,
              idea.type,
              idea.symbols,
              idea.timeframe,
              idea.parameters,
              idea.entry_conditions,
              idea.exit_conditions,
              idea.risk_parameters,
              JSON.stringify({
                totalTrades: perf.totalTrades,
                winningTrades: Math.round(perf.totalTrades * perf.winRate),
                losingTrades: Math.round(perf.totalTrades * (1 - perf.winRate)),
                winRate: perf.winRate * 100,
                totalPnL: perf.pnl,
                sharpeRatio: perf.sharpe,
                maxDrawdown: perf.maxDrawdown,
                averageWin: perf.profitFactor > 0 && perf.totalTrades > 0
                  ? Math.abs(perf.pnl) * perf.profitFactor / (Math.round(perf.totalTrades * perf.winRate) * perf.profitFactor + Math.round(perf.totalTrades * (1 - perf.winRate)))
                  : Math.abs(perf.pnl) / Math.max(perf.totalTrades, 1),
                averageLoss: perf.profitFactor > 0 && perf.totalTrades > 0
                  ? Math.abs(perf.pnl) / (Math.round(perf.totalTrades * perf.winRate) * perf.profitFactor + Math.round(perf.totalTrades * (1 - perf.winRate)))
                  : 0,
                profitFactor: perf.profitFactor,
              }),
              paramsHash,
              now,
              now
            );
            promotedHashes.add(paramsHash);
            promoted++;
          }
        }

        // --- Phase 2: Diversity enforcement ---
        // Ensure at least TREND_FOLLOWING is represented among active strategies
        const activeTypes = (db.prepare(
          'SELECT DISTINCT type FROM strategies WHERE isActive = 1'
        ).all() as any[]).map((r: any) => r.type);

        const activeTypeSet = new Set(activeTypes);

        // If no TREND_FOLLOWING active, promote the best one from ideas+performance
        if (!activeTypeSet.has('TREND_FOLLOWING')) {
          const bestTrend = db.prepare(`
            SELECT i.*, p.sharpe, p.win_rate, p.pnl, p.max_drawdown, p.total_trades, p.profit_factor
            FROM strategy_ideas i
            JOIN strategy_performance p ON p.strategy_id = i.id
            WHERE i.type = 'TREND_FOLLOWING'
              AND p.sharpe > 0.5
              AND p.sharpe <= 5.0
              AND p.win_rate >= 0.45
              AND p.max_drawdown >= 0.005
              AND p.max_drawdown <= 0.20
              AND p.total_trades >= 10
              AND p.pnl > 0
              AND p.pnl <= 100000
            ORDER BY p.sharpe DESC
            LIMIT 1
          `).get() as any;

          if (bestTrend) {
            // Check if it already exists in strategies table
            const trendHash = crypto
              .createHash('sha256')
              .update(`${bestTrend.name}|${bestTrend.parameters}`)
              .digest('hex');

            const existingTrend = db.prepare(
              'SELECT id FROM strategies WHERE params_hash = ?'
            ).get(trendHash) as any;

            if (existingTrend) {
              db.prepare(`
                UPDATE strategies SET isActive = 1, performance = ?, updatedAt = ?
                WHERE id = ?
              `).run(
                JSON.stringify({
                  totalTrades: bestTrend.total_trades,
                  winRate: bestTrend.win_rate * 100,
                  totalPnL: bestTrend.pnl,
                  sharpeRatio: bestTrend.sharpe,
                  maxDrawdown: bestTrend.max_drawdown,
                  profitFactor: bestTrend.profit_factor,
                }),
                new Date().toISOString(),
                existingTrend.id
              );
              logger.info(`[ResearchEngine] Diversity fix: reactivated TREND_FOLLOWING "${bestTrend.name}" (sharpe: ${bestTrend.sharpe.toFixed(2)})`);
            } else {
              const strategyId = uuidv4();
              const now = new Date().toISOString();
              db.prepare(`
                INSERT INTO strategies (
                  id, name, description, type, symbols, timeframe, parameters,
                  entryConditions, exitConditions, riskParameters, isActive,
                  performance, params_hash, createdAt, updatedAt
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
              `).run(
                strategyId,
                bestTrend.name,
                `Diversity promotion: TREND_FOLLOWING. Sharpe: ${bestTrend.sharpe.toFixed(2)}`,
                bestTrend.type,
                bestTrend.symbols,
                bestTrend.timeframe,
                bestTrend.parameters,
                bestTrend.entry_conditions,
                bestTrend.exit_conditions,
                bestTrend.risk_parameters,
                JSON.stringify({
                  totalTrades: bestTrend.total_trades,
                  winRate: bestTrend.win_rate * 100,
                  totalPnL: bestTrend.pnl,
                  sharpeRatio: bestTrend.sharpe,
                  maxDrawdown: bestTrend.max_drawdown,
                  profitFactor: bestTrend.profit_factor,
                }),
                trendHash,
                now,
                now
              );
              logger.info(`[ResearchEngine] Diversity fix: promoted TREND_FOLLOWING "${bestTrend.name}" (sharpe: ${bestTrend.sharpe.toFixed(2)})`);
            }
          } else {
            logger.warn('[ResearchEngine] Diversity fix: no suitable TREND_FOLLOWING found (sharpe > 0, max_drawdown <= 3%)');
          }
        }

        // Re-read active types after potential TREND_FOLLOWING fix
        const finalActiveTypes = (db.prepare(
          'SELECT DISTINCT type FROM strategies WHERE isActive = 1'
        ).all() as any[]).map((r: any) => r.type);

        // Ensure at least 2 strategy types are active
        if (finalActiveTypes.length < 2) {
          const missingTypes = ['TREND_FOLLOWING', 'MEAN_REVERSION', 'AI_PREDICTION', 'ARBITRAGE', 'MARKET_MAKING']
            .filter(t => !finalActiveTypes.includes(t));

          for (const missingType of missingTypes) {
            if (finalActiveTypes.length >= 2) break;

            const bestOfType = db.prepare(`
              SELECT i.*, p.sharpe, p.win_rate, p.pnl, p.max_drawdown, p.total_trades, p.profit_factor
              FROM strategy_ideas i
              JOIN strategy_performance p ON p.strategy_id = i.id
              WHERE i.type = ?
                AND p.sharpe > 0
                AND p.sharpe <= 5.0
                AND p.win_rate >= 0.45
                AND p.max_drawdown >= 0.005
                AND p.max_drawdown <= 0.20
                AND p.total_trades >= 10
                AND p.pnl > 0
                AND p.pnl <= 100000
              ORDER BY p.sharpe DESC
              LIMIT 1
            `).get(missingType) as any;

            if (!bestOfType) continue;

            const typeHash = crypto
              .createHash('sha256')
              .update(`${bestOfType.name}|${bestOfType.parameters}`)
              .digest('hex');

            const existingType = db.prepare(
              'SELECT id FROM strategies WHERE params_hash = ?'
            ).get(typeHash) as any;

            if (existingType) {
              db.prepare(`
                UPDATE strategies SET isActive = 1, performance = ?, updatedAt = ?
                WHERE id = ?
              `).run(
                JSON.stringify({
                  totalTrades: bestOfType.total_trades,
                  winRate: bestOfType.win_rate * 100,
                  totalPnL: bestOfType.pnl,
                  sharpeRatio: bestOfType.sharpe,
                  maxDrawdown: bestOfType.max_drawdown,
                  profitFactor: bestOfType.profit_factor,
                }),
                new Date().toISOString(),
                existingType.id
              );
              logger.info(`[ResearchEngine] Diversity fix: reactivated ${missingType} "${bestOfType.name}"`);
            } else {
              const strategyId = uuidv4();
              const now = new Date().toISOString();
              db.prepare(`
                INSERT INTO strategies (
                  id, name, description, type, symbols, timeframe, parameters,
                  entryConditions, exitConditions, riskParameters, isActive,
                  performance, params_hash, createdAt, updatedAt
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
              `).run(
                strategyId,
                bestOfType.name,
                `Diversity promotion: ${missingType}. Sharpe: ${bestOfType.sharpe.toFixed(2)}`,
                bestOfType.type,
                bestOfType.symbols,
                bestOfType.timeframe,
                bestOfType.parameters,
                bestOfType.entry_conditions,
                bestOfType.exit_conditions,
                bestOfType.risk_parameters,
                JSON.stringify({
                  totalTrades: bestOfType.total_trades,
                  winRate: bestOfType.win_rate * 100,
                  totalPnL: bestOfType.pnl,
                  sharpeRatio: bestOfType.sharpe,
                  maxDrawdown: bestOfType.max_drawdown,
                  profitFactor: bestOfType.profit_factor,
                }),
                typeHash,
                now,
                now
              );
              logger.info(`[ResearchEngine] Diversity fix: promoted ${missingType} "${bestOfType.name}"`);
            }

            finalActiveTypes.push(missingType);
          }
        }

        // Verify activation
        const activeCount = (db.prepare('SELECT COUNT(*) as c FROM strategies WHERE isActive = 1').get() as any).c;
        const typeCount = (db.prepare('SELECT COUNT(DISTINCT type) as c FROM strategies WHERE isActive = 1').get() as any).c;
        logger.info(`[ResearchEngine] Promotion complete: ${promoted} strategies promoted (total active: ${activeCount}, types: ${typeCount})`);
        
        db.close();
      } catch (dbError) {
        db.close();
        throw dbError;
      }
    } catch (error) {
      logger.error('[ResearchEngine] Failed to promote strategies:', error);
    }
  }

  /**
   * Get current research engine status
   */
  async getStatus(): Promise<{
    isRunning: boolean;
    queueSize: number;
    pendingBacktests: number;
    completedBacktests: number;
  }> {
    const queueSize = await this.ideaQueue.getPendingCount();
    const pendingBacktests = await this.ideaQueue.getPendingBacktestCount();
    const completedBacktests = await this.ideaQueue.getCompletedBacktestCount();

    return {
      isRunning: this.isRunning,
      queueSize,
      pendingBacktests,
      completedBacktests,
    };
  }

  /**
   * Get pending ideas from the queue
   */
  async getPendingIdeas(limit?: number): Promise<StrategyIdea[]> {
    return this.ideaQueue.getPendingIdeas(limit);
  }

  /**
   * Get top performing strategies
   */
  async getTopStrategies(limit: number = 10): Promise<any[]> {
    return this.ideaQueue.getTopStrategies(limit);
  }
}

// Export singleton instance
export const researchEngine = new ResearchEngine();
export default researchEngine;
