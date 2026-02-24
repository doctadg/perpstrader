"use strict";
/**
 * Genetic Optimizer
 * Main orchestrator for the strategy evolution process
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeneticOptimizer = exports.DEFAULT_GENETIC_CONFIG = void 0;
const types_1 = require("./types");
const population_manager_1 = require("./population-manager");
const mutation_engine_1 = require("./mutation-engine");
const crossover_engine_1 = require("./crossover-engine");
const selector_1 = require("./selector");
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const Database = better_sqlite3_1.default;
exports.DEFAULT_GENETIC_CONFIG = {
    population: {},
    mutation: {},
    crossover: {},
    selection: {},
    dbPath: './data/trading.db',
};
class GeneticOptimizer {
    config;
    populationManager;
    mutationEngine;
    crossoverEngine;
    selector;
    db = null;
    session = null;
    backtestEngine = null;
    constructor(config = {}) {
        this.config = {
            ...exports.DEFAULT_GENETIC_CONFIG,
            ...config,
            population: { ...exports.DEFAULT_GENETIC_CONFIG.population, ...config.population },
            mutation: { ...exports.DEFAULT_GENETIC_CONFIG.mutation, ...config.mutation },
            crossover: { ...exports.DEFAULT_GENETIC_CONFIG.crossover, ...config.crossover },
            selection: { ...exports.DEFAULT_GENETIC_CONFIG.selection, ...config.selection },
        };
        this.mutationEngine = new mutation_engine_1.MutationEngine(this.config.mutation);
        this.crossoverEngine = new crossover_engine_1.CrossoverEngine(this.config.crossover);
        this.selector = new selector_1.Selector(this.config.selection);
        this.populationManager = new population_manager_1.PopulationManager(this.config.population, this.mutationEngine, this.crossoverEngine, this.selector);
    }
    /**
     * Initialize database connection and tables
     */
    async initialize() {
        const dbPath = this.config.dbPath || './data/trading.db';
        this.db = new Database(dbPath);
        this.createTables();
        // Load backtest engine dynamically
        try {
            const { BacktestEngine } = require('../backtest/enhanced-backtest');
            this.backtestEngine = BacktestEngine;
        }
        catch (error) {
            console.warn('[GeneticOptimizer] Backtest engine not available, using simulation mode');
            this.backtestEngine = null;
        }
        console.log('[GeneticOptimizer] Initialized successfully');
    }
    /**
     * Create required database tables
     */
    createTables() {
        if (!this.db)
            return;
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS strategy_generations (
        id TEXT PRIMARY KEY,
        parent_id TEXT,
        generation INTEGER NOT NULL,
        parameters TEXT NOT NULL,
        fitness REAL,
        sharpe_ratio REAL,
        total_return REAL,
        max_drawdown REAL,
        win_rate REAL,
        total_trades INTEGER,
        backtest_result TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_strategy_gen_generation ON strategy_generations(generation);
      CREATE INDEX IF NOT EXISTS idx_strategy_gen_parent ON strategy_generations(parent_id);
      CREATE INDEX IF NOT EXISTS idx_strategy_gen_fitness ON strategy_generations(fitness);
      CREATE INDEX IF NOT EXISTS idx_strategy_gen_created ON strategy_generations(created_at);

      CREATE TABLE IF NOT EXISTS evolution_sessions (
        id TEXT PRIMARY KEY,
        start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        end_time TIMESTAMP,
        config TEXT,
        status TEXT DEFAULT 'running',
        best_genome_id TEXT,
        generations_completed INTEGER DEFAULT 0,
        final_fitness REAL,
        termination_reason TEXT
      );
    `);
        console.log('[GeneticOptimizer] Database tables created/verified');
    }
    /**
     * Load top strategies from the database
     */
    async loadTopStrategies(count = 5) {
        if (!this.db) {
            throw new Error('Database not initialized');
        }
        // First try to load from strategies table with performance data
        const rows = this.db.prepare(`
      SELECT * FROM strategies 
      WHERE performance IS NOT NULL
      ORDER BY (
        SELECT json_extract(performance, '$.sharpeRatio') 
      ) DESC
      LIMIT ?
    `).all(count);
        if (rows.length > 0) {
            return rows.map(row => ({
                ...row,
                parameters: JSON.parse(row.parameters || '{}'),
                risk_parameters: JSON.parse(row.risk_parameters || '{}'),
                performance: JSON.parse(row.performance || '{}'),
            }));
        }
        // If no strategies with performance, load active strategies
        const activeRows = this.db.prepare(`
      SELECT * FROM strategies 
      WHERE is_active = 1
      LIMIT ?
    `).all(count);
        return activeRows.map(row => ({
            ...row,
            parameters: JSON.parse(row.parameters || '{}'),
            risk_parameters: JSON.parse(row.risk_parameters || '{}'),
            performance: { sharpeRatio: 0 },
        }));
    }
    /**
     * Evaluate genome fitness through backtesting
     */
    async evaluateGenome(genome) {
        // Convert genome to strategy format
        const strategy = (0, types_1.genomeToStrategy)(genome);
        try {
            if (this.backtestEngine) {
                // Load market data
                const marketData = await this.loadMarketData(strategy.timeframe);
                if (marketData.length === 0) {
                    return this.simulateFitness(genome);
                }
                // Run backtest
                const engine = new this.backtestEngine({
                    initialCapital: 10000,
                    commissionRate: 0.0005,
                    slippageBps: 5,
                });
                const result = await engine.runBacktest(strategy, marketData);
                return {
                    sharpeRatio: result.sharpeRatio,
                    totalReturn: result.totalReturn,
                    maxDrawdown: result.maxDrawdown,
                    winRate: result.winRate,
                    profitFactor: 0, // Calculate from trades
                    totalTrades: result.totalTrades,
                };
            }
            else {
                // Use simulated fitness for testing
                return this.simulateFitness(genome);
            }
        }
        catch (error) {
            console.error(`[GeneticOptimizer] Backtest error for genome ${genome.id}:`, error);
            return this.simulateFitness(genome);
        }
    }
    /**
     * Load market data for backtesting
     */
    async loadMarketData(timeframe) {
        if (!this.db)
            return [];
        // Map timeframe to approximate seconds
        const timeframeMap = {
            '1m': 60,
            '5m': 300,
            '15m': 900,
            '1h': 3600,
            '4h': 14400,
        };
        const timeframeSeconds = timeframeMap[timeframe] || 900;
        const daysBack = 30; // Last 30 days of data
        const cutoffTime = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
        const rows = this.db.prepare(`
      SELECT * FROM market_data 
      WHERE timestamp >= ?
      ORDER BY timestamp ASC
    `).all(cutoffTime.toISOString());
        return rows.map(row => ({
            ...row,
            timestamp: new Date(row.timestamp),
        }));
    }
    /**
     * Simulate fitness for testing (when backtest engine unavailable)
     */
    simulateFitness(genome) {
        const params = genome.parameters;
        // Simulate based on parameter quality
        const riskScore = (params.riskParameters.stopLoss + params.riskParameters.takeProfit) > 0.05 ? 0.8 : 0.5;
        const entryScore = (params.entryThresholds.rsiOverbought - params.entryThresholds.rsiOversold) / 100;
        const positionScore = params.riskParameters.maxPositionSize < 0.1 ? 0.7 : 0.4;
        const simulatedSharpe = (riskScore + entryScore + positionScore) / 3 + (Math.random() - 0.5) * 0.5;
        const simulatedReturn = simulatedSharpe * 0.3 + (Math.random() - 0.5) * 0.2;
        const simulatedDrawdown = 0.1 + Math.random() * 0.2;
        const simulatedWinRate = 0.4 + Math.random() * 0.3;
        return {
            sharpeRatio: Math.max(0, simulatedSharpe),
            totalReturn: simulatedReturn,
            maxDrawdown: simulatedDrawdown,
            winRate: simulatedWinRate,
            profitFactor: 1 + simulatedSharpe * 0.5,
            totalTrades: Math.floor(20 + Math.random() * 100),
        };
    }
    /**
     * Save genome to database
     */
    saveGenome(genome) {
        if (!this.db)
            return;
        const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO strategy_generations (
        id, parent_id, generation, parameters, fitness,
        sharpe_ratio, total_return, max_drawdown, win_rate, total_trades,
        backtest_result, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
        stmt.run(genome.id, genome.parentIds.join(','), genome.generation, JSON.stringify(genome.parameters), genome.fitness, genome.sharpeRatio, genome.totalReturn, genome.maxDrawdown, genome.winRate, genome.totalTrades, genome.backtestResult ? JSON.stringify(genome.backtestResult) : null, genome.createdAt.toISOString());
    }
    /**
     * Save evolution session to database
     */
    saveSession() {
        if (!this.db || !this.session)
            return;
        const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO evolution_sessions (
        id, start_time, config, status, generations_completed
      ) VALUES (?, ?, ?, ?, ?)
    `);
        stmt.run(this.session.id, this.session.startTime.toISOString(), JSON.stringify(this.session.config), this.session.status, this.session.progress.currentGeneration);
    }
    /**
     * Run the complete evolution process
     */
    async runEvolution(options = {}) {
        const { v4: uuidv4 } = require('uuid');
        // Create session
        this.session = {
            id: uuidv4(),
            startTime: new Date(),
            config: this.config,
            status: 'running',
            progress: {
                currentGeneration: 0,
                maxGenerations: this.config.population?.maxGenerations || 10,
                bestFitness: 0,
                bestSharpeRatio: 0,
            },
        };
        console.log(`[GeneticOptimizer] Starting evolution session ${this.session.id}`);
        try {
            // Initialize population
            if (options.seedStrategies && options.seedStrategies.length > 0) {
                this.populationManager.initializeFromTopStrategies(options.seedStrategies);
            }
            else {
                const topStrategies = await this.loadTopStrategies(5);
                this.populationManager.initializeFromTopStrategies(topStrategies);
            }
            // Wrap evaluation function to include database persistence
            const evaluateWithPersistence = async (genome) => {
                const metrics = await this.evaluateGenome(genome);
                this.saveGenome({
                    ...genome,
                    fitness: this.selector.calculateFitness(metrics),
                    ...metrics,
                });
                return metrics;
            };
            // Wrap generation callback to update session
            const onGeneration = (stats) => {
                this.session.progress = {
                    currentGeneration: stats.generation,
                    maxGenerations: this.config.population?.maxGenerations || 10,
                    bestFitness: stats.bestFitness,
                    bestSharpeRatio: stats.bestSharpeRatio,
                };
                this.saveSession();
                console.log(`[GeneticOptimizer] Generation ${stats.generation}: ` +
                    `Best Fitness=${stats.bestFitness.toFixed(4)}, ` +
                    `Sharpe=${stats.bestSharpeRatio.toFixed(4)}, ` +
                    `Diversity=${stats.diversity.toFixed(4)}` +
                    (stats.improved ? ' [IMPROVED]' : ''));
                if (options.onGeneration) {
                    options.onGeneration(stats);
                }
            };
            // Run evolution
            const result = await this.populationManager.runEvolution(evaluateWithPersistence, onGeneration);
            // Update session
            this.session.status = 'completed';
            this.session.endTime = new Date();
            this.session.result = result;
            // Save final results
            this.saveFinalResults(result);
            console.log(`[GeneticOptimizer] Evolution complete: ${result.reason}`);
            console.log(`[GeneticOptimizer] Best Sharpe Ratio: ${result.bestGenome.sharpeRatio?.toFixed(4)}`);
            return result;
        }
        catch (error) {
            this.session.status = 'failed';
            this.session.endTime = new Date();
            console.error('[GeneticOptimizer] Evolution failed:', error);
            throw error;
        }
    }
    /**
     * Save final evolution results to database
     */
    saveFinalResults(result) {
        if (!this.db || !this.session)
            return;
        const stmt = this.db.prepare(`
      UPDATE evolution_sessions SET
        end_time = ?,
        status = ?,
        best_genome_id = ?,
        generations_completed = ?,
        final_fitness = ?,
        termination_reason = ?
      WHERE id = ?
    `);
        stmt.run(this.session.endTime?.toISOString(), this.session.status, result.bestGenome.id, result.generations, result.bestGenome.fitness, result.reason, this.session.id);
        // Save all final population genomes
        for (const genome of result.finalPopulation) {
            this.saveGenome(genome);
        }
    }
    /**
     * Get the best evolved strategy
     */
    getBestStrategy() {
        const bestGenome = this.populationManager.getBestGenome();
        return (0, types_1.genomeToStrategy)(bestGenome);
    }
    /**
     * Get current session info
     */
    getSession() {
        return this.session;
    }
    /**
     * Close database connection
     */
    close() {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }
}
exports.GeneticOptimizer = GeneticOptimizer;
exports.default = GeneticOptimizer;
//# sourceMappingURL=genetic-optimizer.js.map