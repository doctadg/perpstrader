/**
 * Genetic Optimizer
 * Main orchestrator for the strategy evolution process
 */

import { StrategyGenome, genomeToStrategy } from './types';
import { PopulationManager, PopulationConfig, EvolutionResult, GenerationStats } from './population-manager';
import { MutationEngine, MutationConfig } from './mutation-engine';
import { CrossoverEngine, CrossoverConfig } from './crossover-engine';
import { Selector, SelectionConfig, FitnessMetrics } from './selector';
import DatabaseConstructor from 'better-sqlite3';
const Database = DatabaseConstructor as any;
import * as path from 'path';

export interface GeneticOptimizerConfig {
  population: Partial<PopulationConfig>;
  mutation: Partial<MutationConfig>;
  crossover: Partial<CrossoverConfig>;
  selection: Partial<SelectionConfig>;
  dbPath?: string;
}

export const DEFAULT_GENETIC_CONFIG: GeneticOptimizerConfig = {
  population: {},
  mutation: {},
  crossover: {},
  selection: {},
  dbPath: './data/trading.db',
};

export interface EvolutionSession {
  id: string;
  startTime: Date;
  endTime?: Date;
  config: GeneticOptimizerConfig;
  status: 'running' | 'completed' | 'failed';
  progress: {
    currentGeneration: number;
    maxGenerations: number;
    bestFitness: number;
    bestSharpeRatio: number;
  };
  result?: EvolutionResult;
}

export class GeneticOptimizer {
  private config: GeneticOptimizerConfig;
  private populationManager: PopulationManager;
  private mutationEngine: MutationEngine;
  private crossoverEngine: CrossoverEngine;
  private selector: Selector;
  private db: any = null;
  private session: EvolutionSession | null = null;
  private backtestEngine: any = null;

  constructor(config: Partial<GeneticOptimizerConfig> = {}) {
    this.config = {
      ...DEFAULT_GENETIC_CONFIG,
      ...config,
      population: { ...DEFAULT_GENETIC_CONFIG.population, ...config.population },
      mutation: { ...DEFAULT_GENETIC_CONFIG.mutation, ...config.mutation },
      crossover: { ...DEFAULT_GENETIC_CONFIG.crossover, ...config.crossover },
      selection: { ...DEFAULT_GENETIC_CONFIG.selection, ...config.selection },
    };

    this.mutationEngine = new MutationEngine(this.config.mutation);
    this.crossoverEngine = new CrossoverEngine(this.config.crossover);
    this.selector = new Selector(this.config.selection);
    this.populationManager = new PopulationManager(
      this.config.population,
      this.mutationEngine,
      this.crossoverEngine,
      this.selector
    );
  }

  /**
   * Initialize database connection and tables
   */
  async initialize(): Promise<void> {
    const dbPath = this.config.dbPath || './data/trading.db';
    this.db = new Database(dbPath);
    
    this.createTables();
    
    // Load backtest engine dynamically
    try {
      const { BacktestEngine } = require('../backtest/enhanced-backtest');
      this.backtestEngine = BacktestEngine;
    } catch (error) {
      console.warn('[GeneticOptimizer] Backtest engine not available, using simulation mode');
      this.backtestEngine = null;
    }

    console.log('[GeneticOptimizer] Initialized successfully');
  }

  /**
   * Create required database tables
   */
  private createTables(): void {
    if (!this.db) return;

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
  async loadTopStrategies(count: number = 5): Promise<any[]> {
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
      return (rows as any[]).map(row => ({
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

    return (activeRows as any[]).map(row => ({
      ...row,
      parameters: JSON.parse(row.parameters || '{}'),
      risk_parameters: JSON.parse(row.risk_parameters || '{}'),
      performance: { sharpeRatio: 0 },
    }));
  }

  /**
   * Evaluate genome fitness through backtesting
   */
  async evaluateGenome(genome: StrategyGenome): Promise<FitnessMetrics> {
    // Convert genome to strategy format
    const strategy = genomeToStrategy(genome);

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
      } else {
        // Use simulated fitness for testing
        return this.simulateFitness(genome);
      }
    } catch (error) {
      console.error(`[GeneticOptimizer] Backtest error for genome ${genome.id}:`, error);
      return this.simulateFitness(genome);
    }
  }

  /**
   * Load market data for backtesting
   */
  private async loadMarketData(timeframe: string): Promise<any[]> {
    if (!this.db) return [];

    // Map timeframe to approximate seconds
    const timeframeMap: Record<string, number> = {
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

    return (rows as any[]).map(row => ({
      ...row,
      timestamp: new Date(row.timestamp),
    }));
  }

  /**
   * Simulate fitness for testing (when backtest engine unavailable)
   */
  private simulateFitness(genome: StrategyGenome): FitnessMetrics {
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
  private saveGenome(genome: StrategyGenome): void {
    if (!this.db) return;

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO strategy_generations (
        id, parent_id, generation, parameters, fitness,
        sharpe_ratio, total_return, max_drawdown, win_rate, total_trades,
        backtest_result, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      genome.id,
      genome.parentIds.join(','),
      genome.generation,
      JSON.stringify(genome.parameters),
      genome.fitness,
      genome.sharpeRatio,
      genome.totalReturn,
      genome.maxDrawdown,
      genome.winRate,
      genome.totalTrades,
      genome.backtestResult ? JSON.stringify(genome.backtestResult) : null,
      genome.createdAt.toISOString()
    );
  }

  /**
   * Save evolution session to database
   */
  private saveSession(): void {
    if (!this.db || !this.session) return;

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO evolution_sessions (
        id, start_time, config, status, generations_completed
      ) VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(
      this.session.id,
      this.session.startTime.toISOString(),
      JSON.stringify(this.session.config),
      this.session.status,
      this.session.progress.currentGeneration
    );
  }

  /**
   * Run the complete evolution process
   */
  async runEvolution(
    options: {
      seedStrategies?: any[];
      onGeneration?: (stats: GenerationStats) => void;
    } = {}
  ): Promise<EvolutionResult> {
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
      } else {
        const topStrategies = await this.loadTopStrategies(5);
        this.populationManager.initializeFromTopStrategies(topStrategies);
      }

      // Wrap evaluation function to include database persistence
      const evaluateWithPersistence = async (genome: StrategyGenome): Promise<FitnessMetrics> => {
        const metrics = await this.evaluateGenome(genome);
        this.saveGenome({
          ...genome,
          fitness: this.selector.calculateFitness(metrics),
          ...metrics,
        });
        return metrics;
      };

      // Wrap generation callback to update session
      const onGeneration = (stats: GenerationStats) => {
        this.session!.progress = {
          currentGeneration: stats.generation,
          maxGenerations: this.config.population?.maxGenerations || 10,
          bestFitness: stats.bestFitness,
          bestSharpeRatio: stats.bestSharpeRatio,
        };
        this.saveSession();

        console.log(
          `[GeneticOptimizer] Generation ${stats.generation}: ` +
          `Best Fitness=${stats.bestFitness.toFixed(4)}, ` +
          `Sharpe=${stats.bestSharpeRatio.toFixed(4)}, ` +
          `Diversity=${stats.diversity.toFixed(4)}` +
          (stats.improved ? ' [IMPROVED]' : '')
        );

        if (options.onGeneration) {
          options.onGeneration(stats);
        }
      };

      // Run evolution
      const result = await this.populationManager.runEvolution(
        evaluateWithPersistence,
        onGeneration
      );

      // Update session
      this.session.status = 'completed';
      this.session.endTime = new Date();
      this.session.result = result;

      // Save final results
      this.saveFinalResults(result);

      console.log(`[GeneticOptimizer] Evolution complete: ${result.reason}`);
      console.log(`[GeneticOptimizer] Best Sharpe Ratio: ${result.bestGenome.sharpeRatio?.toFixed(4)}`);

      return result;

    } catch (error) {
      this.session.status = 'failed';
      this.session.endTime = new Date();
      
      console.error('[GeneticOptimizer] Evolution failed:', error);
      
      throw error;
    }
  }

  /**
   * Save final evolution results to database
   */
  private saveFinalResults(result: EvolutionResult): void {
    if (!this.db || !this.session) return;

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

    stmt.run(
      this.session.endTime?.toISOString(),
      this.session.status,
      result.bestGenome.id,
      result.generations,
      result.bestGenome.fitness,
      result.reason,
      this.session.id
    );

    // Save all final population genomes
    for (const genome of result.finalPopulation) {
      this.saveGenome(genome);
    }
  }

  /**
   * Get the best evolved strategy
   */
  getBestStrategy(): any {
    const bestGenome = this.populationManager.getBestGenome();
    return genomeToStrategy(bestGenome);
  }

  /**
   * Get current session info
   */
  getSession(): EvolutionSession | null {
    return this.session;
  }

  /**
   * Close database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

export default GeneticOptimizer;
