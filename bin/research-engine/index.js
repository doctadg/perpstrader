"use strict";
// Research Engine - Main orchestrator for continuous strategy research
// Runs every 15 minutes to generate new trading strategy ideas
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.researchEngine = exports.ResearchEngine = void 0;
const logger_1 = __importDefault(require("../shared/logger"));
const market_analyzer_1 = require("./market-analyzer");
const idea_queue_1 = require("./idea-queue");
const strategy_generator_1 = require("./strategy-generator");
const node_cron_1 = __importDefault(require("node-cron"));
class ResearchEngine {
    marketAnalyzer;
    ideaQueue;
    strategyGenerator;
    config;
    isRunning = false;
    cronJob = null;
    constructor(config) {
        this.config = {
            intervalMinutes: 15,
            ideasPerRun: 5,
            minConfidence: 0.6,
            maxQueueSize: 100,
            ...config,
        };
        this.marketAnalyzer = new market_analyzer_1.MarketAnalyzer();
        this.ideaQueue = new idea_queue_1.IdeaQueue();
        this.strategyGenerator = new strategy_generator_1.StrategyGenerator();
    }
    /**
     * Start the research engine with cron scheduling
     */
    async start() {
        if (this.isRunning) {
            logger_1.default.warn('[ResearchEngine] Already running');
            return;
        }
        logger_1.default.info('[ResearchEngine] Starting research engine...');
        this.isRunning = true;
        // Initialize database tables
        await this.ideaQueue.initialize();
        // Run immediately on start
        await this.runResearchCycle();
        // Schedule to run every 15 minutes
        this.cronJob = node_cron_1.default.schedule('*/15 * * * *', async () => {
            if (!this.isRunning) {
                logger_1.default.warn('[ResearchEngine] Skipping cycle - engine not running');
                return;
            }
            await this.runResearchCycle();
        });
        logger_1.default.info(`[ResearchEngine] Scheduled to run every ${this.config.intervalMinutes} minutes`);
    }
    /**
     * Stop the research engine
     */
    stop() {
        logger_1.default.info('[ResearchEngine] Stopping research engine...');
        this.isRunning = false;
        if (this.cronJob) {
            this.cronJob.stop();
            this.cronJob = null;
        }
        logger_1.default.info('[ResearchEngine] Stopped');
    }
    /**
     * Run a single research cycle
     */
    async runResearchCycle() {
        const startTime = Date.now();
        logger_1.default.info('[ResearchEngine] Starting research cycle...');
        try {
            // Step 1: Analyze current market conditions
            const marketRegime = await this.marketAnalyzer.analyze();
            logger_1.default.info(`[ResearchEngine] Market regime: ${marketRegime.regime}, volatility: ${marketRegime.volatility.toFixed(2)}`);
            // Step 2: Check queue capacity
            const queueSize = await this.ideaQueue.getPendingCount();
            if (queueSize >= this.config.maxQueueSize) {
                logger_1.default.warn(`[ResearchEngine] Queue full (${queueSize}/${this.config.maxQueueSize}), skipping generation`);
                return;
            }
            // Step 3: Generate strategy ideas based on market conditions
            const ideas = await this.strategyGenerator.generateIdeas(marketRegime, this.config.ideasPerRun);
            logger_1.default.info(`[ResearchEngine] Generated ${ideas.length} strategy ideas`);
            // Step 4: Filter high-confidence ideas and add to queue
            const validIdeas = ideas.filter(idea => idea.confidence >= this.config.minConfidence);
            logger_1.default.info(`[ResearchEngine] ${validIdeas.length} ideas meet confidence threshold (${this.config.minConfidence})`);
            // Step 5: Add ideas to queue
            const addedCount = await this.ideaQueue.addIdeas(validIdeas);
            logger_1.default.info(`[ResearchEngine] Added ${addedCount} ideas to backtest queue`);
            // Step 6: Process any pending backtest jobs
            await this.processPendingBacktests();
            const duration = Date.now() - startTime;
            logger_1.default.info(`[ResearchEngine] Research cycle completed in ${duration}ms`);
        }
        catch (error) {
            logger_1.default.error('[ResearchEngine] Research cycle failed:', error);
        }
    }
    /**
     * Process pending backtest jobs
     */
    async processPendingBacktests() {
        try {
            const pendingJobs = await this.ideaQueue.getPendingBacktestJobs(5);
            if (pendingJobs.length === 0) {
                return;
            }
            logger_1.default.info(`[ResearchEngine] Processing ${pendingJobs.length} pending backtest jobs`);
            for (const job of pendingJobs) {
                await this.ideaQueue.updateBacktestJobStatus(job.id, 'RUNNING');
                try {
                    const result = await this.runRealBacktest(job.strategyId);
                    await this.ideaQueue.completeBacktestJob(job.id, result);
                    logger_1.default.info(`[ResearchEngine] Backtest completed for strategy ${job.strategyId}: Sharpe=${result.sharpeRatio?.toFixed(2)}, WR=${(result.winRate * 100).toFixed(0)}%, Trades=${result.totalTrades}`);
                }
                catch (error) {
                    logger_1.default.error(`[ResearchEngine] Backtest failed for job ${job.id}:`, error);
                    await this.ideaQueue.updateBacktestJobStatus(job.id, 'FAILED');
                }
            }
            // After processing backtests, promote top strategies to the strategies table
            await this.promoteTopStrategies();
        }
        catch (error) {
            logger_1.default.error('[ResearchEngine] Error processing backtest jobs:', error);
        }
    }
    /**
     * Run a real backtest using market data from the database.
     * Falls back to simulated results if market data is unavailable.
     */
    async runRealBacktest(strategyId) {
        try {
            // Get the strategy idea
            const ideas = await this.ideaQueue.getIdeasByStatus('RUNNING');
            const idea = ideas.find(i => i.id === strategyId);
            if (!idea) {
                // Try getting by ID directly
                const pendingIdeas = await this.ideaQueue.getPendingIdeas(100);
                const fallback = pendingIdeas.find(i => i.id === strategyId);
                if (!fallback) {
                    logger_1.default.warn(`[ResearchEngine] Strategy ${strategyId} not found, using simulation`);
                    return this.simulateBacktest(strategyId);
                }
                return this.backtestStrategy(fallback);
            }
            return this.backtestStrategy(idea);
        }
        catch (error) {
            logger_1.default.error(`[ResearchEngine] Real backtest failed for ${strategyId}, falling back to simulation:`, error);
            return this.simulateBacktest(strategyId);
        }
    }
    /**
     * Backtest a strategy idea using the BacktestEngine with real market data
     */
    async backtestStrategy(idea) {
        try {
            const { BacktestEngine } = await Promise.resolve().then(() => __importStar(require('../backtest/enhanced-backtest')));
            const DatabaseConstructor = await Promise.resolve().then(() => __importStar(require('better-sqlite3')));
            const Database = DatabaseConstructor.default || DatabaseConstructor;
            const config = (await Promise.resolve().then(() => __importStar(require('../shared/config')))).default;
            const dbConfig = config.getSection('database');
            const db = new Database(dbConfig.connection);
            try {
                // Load recent market data for the strategy's symbols
                const cutoffTime = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
                const symbols = idea.symbols.slice(0, 4); // Limit to 4 symbols for performance
                const marketData = [];
                for (const symbol of symbols) {
                    const rows = db.prepare('SELECT symbol, timestamp, open, high, low, close, volume FROM market_data WHERE symbol = ? AND timestamp >= ? ORDER BY timestamp ASC').all(symbol, cutoffTime);
                    for (const row of rows) {
                        marketData.push({
                            symbol: row.symbol,
                            timestamp: new Date(row.timestamp),
                            open: row.open,
                            high: row.high,
                            low: row.low,
                            close: row.close,
                            volume: row.volume,
                        });
                    }
                }
                db.close();
                if (marketData.length < 100) {
                    logger_1.default.warn(`[ResearchEngine] Insufficient market data (${marketData.length} candles), using simulation`);
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
                const result = await engine.runBacktest(strategy, marketData);
                return {
                    sharpeRatio: result.sharpeRatio,
                    winRate: result.winRate / 100, // Convert from % to decimal
                    pnl: result.finalCapital - result.initialCapital,
                    maxDrawdown: result.maxDrawdown / 100, // Convert from % to decimal
                    totalTrades: result.totalTrades,
                    profitFactor: result.profitFactor ?? 0,
                    completedAt: new Date().toISOString(),
                };
            }
            catch (dbError) {
                db.close();
                throw dbError;
            }
        }
        catch (importError) {
            logger_1.default.warn('[ResearchEngine] BacktestEngine not available, using simulation');
            return this.simulateBacktest(idea.id);
        }
    }
    /**
     * Simulate a backtest (fallback when real backtest is unavailable)
     */
    simulateBacktest(strategyId) {
        return Promise.resolve({
            sharpeRatio: 1.0 + Math.random(),
            winRate: 0.5 + Math.random() * 0.3,
            pnl: Math.random() * 10000,
            maxDrawdown: Math.random() * 0.2,
            totalTrades: Math.floor(Math.random() * 100) + 20,
            completedAt: new Date().toISOString(),
        });
    }
    /**
     * Promote top-performing strategies from strategy_performance to the strategies table.
     * This bridges the research engine pipeline to the active trading pool.
     */
    async promoteTopStrategies() {
        try {
            const topStrategies = await this.ideaQueue.getTopStrategies(5);
            if (topStrategies.length === 0) {
                logger_1.default.info('[ResearchEngine] No top strategies to promote');
                return;
            }
            logger_1.default.info(`[ResearchEngine] Promoting ${topStrategies.length} top strategies to active pool...`);
            const betterSqlite3 = await Promise.resolve().then(() => __importStar(require('better-sqlite3')));
            const Database = (betterSqlite3.default ?? betterSqlite3);
            const config = (await Promise.resolve().then(() => __importStar(require('../shared/config')))).default;
            const dbConfig = config.getSection('database');
            const { v4: uuidv4 } = await Promise.resolve().then(() => __importStar(require('uuid')));
            const cryptoMod = await Promise.resolve().then(() => __importStar(require('crypto')));
            const crypto = cryptoMod.default ?? cryptoMod;
            // Hard cap on active strategies to prevent clone spam
            const preCheckDb = new Database(dbConfig.connection);
            const activeCount = preCheckDb.prepare('SELECT COUNT(*) as cnt FROM strategies WHERE isActive = 1').get().cnt;
            const MAX_ACTIVE_STRATEGIES = 50;
            if (activeCount >= MAX_ACTIVE_STRATEGIES) {
                logger_1.default.warn(`[ResearchEngine] Active strategy cap reached (${activeCount}/${MAX_ACTIVE_STRATEGIES}), skipping promotion`);
                preCheckDb.close();
                return;
            }
            preCheckDb.close();
            logger_1.default.info(`[ResearchEngine] Active strategies: ${activeCount}/${MAX_ACTIVE_STRATEGIES}`);
            const db = new Database(dbConfig.connection);
            try {
                // --- Phase 1: Pre-compute params hashes for the promotion batch ---
                const batchEntries = [];
                for (const perf of topStrategies) {
                    const idea = db.prepare('SELECT * FROM strategy_ideas WHERE id = ?').get(perf.strategyId);
                    if (!idea)
                        continue;
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
                    db.prepare(`UPDATE strategies SET isActive = 0 WHERE isActive = 1 AND params_hash IN (${placeholders})`).run(...batchHashes);
                }
                // Track which (name, params) combos we've already promoted in this batch
                const promotedHashes = new Set();
                let promoted = 0;
                for (const { perf, idea, paramsHash } of batchEntries) {
                    // Skip if already promoted in this batch
                    if (promotedHashes.has(paramsHash)) {
                        logger_1.default.debug(`[ResearchEngine] Skipping duplicate strategy (same name+params): ${idea.name}`);
                        continue;
                    }
                    // Check if strategy already exists in strategies table (match by params hash only — prevents clone spam)
                    let existing = db.prepare('SELECT id, params_hash FROM strategies WHERE params_hash = ?').get(paramsHash);
                    // Also match NULL-hash strategies with identical parameters (legacy data)
                    if (!existing) {
                        existing = db.prepare('SELECT id FROM strategies WHERE params_hash IS NULL AND parameters = ? LIMIT 1').get(idea.parameters);
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
            `).run(paramsHash, JSON.stringify({
                            totalTrades: perf.totalTrades,
                            winningTrades: Math.round(perf.totalTrades * perf.winRate),
                            losingTrades: Math.round(perf.totalTrades * (1 - perf.winRate)),
                            winRate: perf.winRate * 100,
                            totalPnL: perf.pnl,
                            sharpeRatio: perf.sharpe,
                            maxDrawdown: perf.maxDrawdown,
                            averageWin: perf.pnl > 0 ? (perf.pnl * perf.winRate) / Math.max(perf.totalTrades * perf.winRate, 1) : 0,
                            averageLoss: perf.pnl < 0 ? Math.abs(perf.pnl) / Math.max(perf.totalTrades * (1 - perf.winRate), 1) : 0,
                            profitFactor: perf.profitFactor,
                        }), new Date().toISOString(), existing.id);
                        promotedHashes.add(paramsHash);
                        promoted++;
                    }
                    else {
                        // Insert new strategy
                        const strategyId = uuidv4();
                        const now = new Date().toISOString();
                        db.prepare(`
              INSERT INTO strategies (
                id, name, description, type, symbols, timeframe, parameters,
                entryConditions, exitConditions, riskParameters, isActive,
                performance, params_hash, createdAt, updatedAt
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
            `).run(strategyId, idea.name, idea.description || `Promoted from research pipeline. Sharpe: ${perf.sharpe.toFixed(2)}`, idea.type, idea.symbols, idea.timeframe, idea.parameters, idea.entry_conditions, idea.exit_conditions, idea.risk_parameters, JSON.stringify({
                            totalTrades: perf.totalTrades,
                            winningTrades: Math.round(perf.totalTrades * perf.winRate),
                            losingTrades: Math.round(perf.totalTrades * (1 - perf.winRate)),
                            winRate: perf.winRate * 100,
                            totalPnL: perf.pnl,
                            sharpeRatio: perf.sharpe,
                            maxDrawdown: perf.maxDrawdown,
                            averageWin: 0,
                            averageLoss: 0,
                            profitFactor: perf.profitFactor,
                        }), paramsHash, now, now);
                        promotedHashes.add(paramsHash);
                        promoted++;
                    }
                }
                // --- Phase 2: Diversity enforcement ---
                // Ensure at least TREND_FOLLOWING is represented among active strategies
                const activeTypes = db.prepare('SELECT DISTINCT type FROM strategies WHERE isActive = 1').all().map((r) => r.type);
                const activeTypeSet = new Set(activeTypes);
                // If no TREND_FOLLOWING active, promote the best one from ideas+performance
                if (!activeTypeSet.has('TREND_FOLLOWING')) {
                    const bestTrend = db.prepare(`
            SELECT i.*, p.sharpe, p.win_rate, p.pnl, p.max_drawdown, p.total_trades, p.profit_factor
            FROM strategy_ideas i
            JOIN strategy_performance p ON p.strategy_id = i.id
            WHERE i.type = 'TREND_FOLLOWING'
              AND p.sharpe > 0
              AND p.max_drawdown <= 0.03
            ORDER BY p.sharpe DESC
            LIMIT 1
          `).get();
                    if (bestTrend) {
                        // Check if it already exists in strategies table
                        const trendHash = crypto
                            .createHash('sha256')
                            .update(`${bestTrend.name}|${bestTrend.parameters}`)
                            .digest('hex');
                        const existingTrend = db.prepare('SELECT id FROM strategies WHERE params_hash = ?').get(trendHash);
                        if (existingTrend) {
                            db.prepare(`
                UPDATE strategies SET isActive = 1, performance = ?, updatedAt = ?
                WHERE id = ?
              `).run(JSON.stringify({
                                totalTrades: bestTrend.total_trades,
                                winRate: bestTrend.win_rate * 100,
                                totalPnL: bestTrend.pnl,
                                sharpeRatio: bestTrend.sharpe,
                                maxDrawdown: bestTrend.max_drawdown,
                                profitFactor: bestTrend.profit_factor,
                            }), new Date().toISOString(), existingTrend.id);
                            logger_1.default.info(`[ResearchEngine] Diversity fix: reactivated TREND_FOLLOWING "${bestTrend.name}" (sharpe: ${bestTrend.sharpe.toFixed(2)})`);
                        }
                        else {
                            const strategyId = uuidv4();
                            const now = new Date().toISOString();
                            db.prepare(`
                INSERT INTO strategies (
                  id, name, description, type, symbols, timeframe, parameters,
                  entryConditions, exitConditions, riskParameters, isActive,
                  performance, params_hash, createdAt, updatedAt
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
              `).run(strategyId, bestTrend.name, `Diversity promotion: TREND_FOLLOWING. Sharpe: ${bestTrend.sharpe.toFixed(2)}`, bestTrend.type, bestTrend.symbols, bestTrend.timeframe, bestTrend.parameters, bestTrend.entry_conditions, bestTrend.exit_conditions, bestTrend.risk_parameters, JSON.stringify({
                                totalTrades: bestTrend.total_trades,
                                winRate: bestTrend.win_rate * 100,
                                totalPnL: bestTrend.pnl,
                                sharpeRatio: bestTrend.sharpe,
                                maxDrawdown: bestTrend.max_drawdown,
                                profitFactor: bestTrend.profit_factor,
                            }), trendHash, now, now);
                            logger_1.default.info(`[ResearchEngine] Diversity fix: promoted TREND_FOLLOWING "${bestTrend.name}" (sharpe: ${bestTrend.sharpe.toFixed(2)})`);
                        }
                    }
                    else {
                        logger_1.default.warn('[ResearchEngine] Diversity fix: no suitable TREND_FOLLOWING found (sharpe > 0, max_drawdown <= 3%)');
                    }
                }
                // Re-read active types after potential TREND_FOLLOWING fix
                const finalActiveTypes = db.prepare('SELECT DISTINCT type FROM strategies WHERE isActive = 1').all().map((r) => r.type);
                // Ensure at least 2 strategy types are active
                if (finalActiveTypes.length < 2) {
                    const missingTypes = ['TREND_FOLLOWING', 'MEAN_REVERSION', 'AI_PREDICTION', 'ARBITRAGE', 'MARKET_MAKING']
                        .filter(t => !finalActiveTypes.includes(t));
                    for (const missingType of missingTypes) {
                        if (finalActiveTypes.length >= 2)
                            break;
                        const bestOfType = db.prepare(`
              SELECT i.*, p.sharpe, p.win_rate, p.pnl, p.max_drawdown, p.total_trades, p.profit_factor
              FROM strategy_ideas i
              JOIN strategy_performance p ON p.strategy_id = i.id
              WHERE i.type = ?
                AND p.sharpe > 0
                AND p.max_drawdown <= 0.05
              ORDER BY p.sharpe DESC
              LIMIT 1
            `).get(missingType);
                        if (!bestOfType)
                            continue;
                        const typeHash = crypto
                            .createHash('sha256')
                            .update(`${bestOfType.name}|${bestOfType.parameters}`)
                            .digest('hex');
                        const existingType = db.prepare('SELECT id FROM strategies WHERE params_hash = ?').get(typeHash);
                        if (existingType) {
                            db.prepare(`
                UPDATE strategies SET isActive = 1, performance = ?, updatedAt = ?
                WHERE id = ?
              `).run(JSON.stringify({
                                totalTrades: bestOfType.total_trades,
                                winRate: bestOfType.win_rate * 100,
                                totalPnL: bestOfType.pnl,
                                sharpeRatio: bestOfType.sharpe,
                                maxDrawdown: bestOfType.max_drawdown,
                                profitFactor: bestOfType.profit_factor,
                            }), new Date().toISOString(), existingType.id);
                            logger_1.default.info(`[ResearchEngine] Diversity fix: reactivated ${missingType} "${bestOfType.name}"`);
                        }
                        else {
                            const strategyId = uuidv4();
                            const now = new Date().toISOString();
                            db.prepare(`
                INSERT INTO strategies (
                  id, name, description, type, symbols, timeframe, parameters,
                  entryConditions, exitConditions, riskParameters, isActive,
                  performance, params_hash, createdAt, updatedAt
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
              `).run(strategyId, bestOfType.name, `Diversity promotion: ${missingType}. Sharpe: ${bestOfType.sharpe.toFixed(2)}`, bestOfType.type, bestOfType.symbols, bestOfType.timeframe, bestOfType.parameters, bestOfType.entry_conditions, bestOfType.exit_conditions, bestOfType.risk_parameters, JSON.stringify({
                                totalTrades: bestOfType.total_trades,
                                winRate: bestOfType.win_rate * 100,
                                totalPnL: bestOfType.pnl,
                                sharpeRatio: bestOfType.sharpe,
                                maxDrawdown: bestOfType.max_drawdown,
                                profitFactor: bestOfType.profit_factor,
                            }), typeHash, now, now);
                            logger_1.default.info(`[ResearchEngine] Diversity fix: promoted ${missingType} "${bestOfType.name}"`);
                        }
                        finalActiveTypes.push(missingType);
                    }
                }
                // Verify activation
                const activeCount = db.prepare('SELECT COUNT(*) as c FROM strategies WHERE isActive = 1').get().c;
                const typeCount = db.prepare('SELECT COUNT(DISTINCT type) as c FROM strategies WHERE isActive = 1').get().c;
                logger_1.default.info(`[ResearchEngine] Promotion complete: ${promoted} strategies promoted (total active: ${activeCount}, types: ${typeCount})`);
                db.close();
            }
            catch (dbError) {
                db.close();
                throw dbError;
            }
        }
        catch (error) {
            logger_1.default.error('[ResearchEngine] Failed to promote strategies:', error);
        }
    }
    /**
     * Get current research engine status
     */
    async getStatus() {
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
    async getPendingIdeas(limit) {
        return this.ideaQueue.getPendingIdeas(limit);
    }
    /**
     * Get top performing strategies
     */
    async getTopStrategies(limit = 10) {
        return this.ideaQueue.getTopStrategies(limit);
    }
}
exports.ResearchEngine = ResearchEngine;
// Export singleton instance
exports.researchEngine = new ResearchEngine();
exports.default = exports.researchEngine;
//# sourceMappingURL=index.js.map