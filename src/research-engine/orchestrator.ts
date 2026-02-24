// Research Engine Orchestrator
// Coordinates all research activities with configurable cycles and evolution runs

import 'dotenv/config';
import logger from '../shared/logger';
import { researchEngineConfig, ResearchEngineConfig } from './config';
import { ResearchEngine } from './index';
import cron from 'node-cron';

interface BacktestQueueStatus {
  pending: number;
  running: number;
  completed: number;
  failed: number;
}

interface EvolutionResult {
  generation: number;
  strategiesEvaluated: number;
  topPerformers: string[];
  averageSharpe: number;
  timestamp: Date;
}

export class ResearchOrchestrator {
  private config: ResearchEngineConfig;
  private researchEngine: ResearchEngine;
  private isRunning: boolean = false;
  private researchTimer: NodeJS.Timeout | null = null;
  private evolutionTimer: NodeJS.Timeout | null = null;
  private lastEvolutionRun: Date | null = null;
  private evolutionGeneration: number = 0;
  private backtestQueueStatus: BacktestQueueStatus = {
    pending: 0,
    running: 0,
    completed: 0,
    failed: 0,
  };

  constructor(config?: Partial<ResearchEngineConfig>) {
    this.config = {
      ...researchEngineConfig,
      ...config,
    };
    this.researchEngine = new ResearchEngine({
      intervalMinutes: Math.floor(this.config.researchIntervalMs / 60000),
      ideasPerRun: 5,
      minConfidence: 0.6,
      maxQueueSize: 100,
    });
  }

  /**
   * Start the research orchestrator
   * Begins the 15-minute research cycle and 6-hour evolution runs
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('[ResearchOrchestrator] Already running');
      return;
    }

    logger.info('═══════════════════════════════════════════════════════════');
    logger.info('  Research Orchestrator Starting');
    logger.info('═══════════════════════════════════════════════════════════');
    logger.info(`[ResearchOrchestrator] Research interval: ${this.config.researchIntervalMs / 60000} minutes`);
    logger.info(`[ResearchOrchestrator] Evolution interval: ${this.config.evolutionIntervalMs / 3600000} hours`);
    logger.info(`[ResearchOrchestrator] Min Sharpe ratio: ${this.config.performanceThresholds.minSharpeRatio}`);
    logger.info(`[ResearchOrchestrator] Min win rate: ${this.config.performanceThresholds.minWinRate}%`);
    logger.info(`[ResearchOrchestrator] Max concurrent backtests: ${this.config.maxConcurrentBacktests}`);

    this.isRunning = true;

    // Start the research engine
    await this.researchEngine.start();

    // Schedule research cycle (every 15 minutes)
    this.scheduleResearchCycle();

    // Schedule evolution runs (every 6 hours)
    this.scheduleEvolutionCycle();

    logger.info('[ResearchOrchestrator] Started successfully');
  }

  /**
   * Stop the research orchestrator gracefully
   */
  stop(): void {
    logger.info('[ResearchOrchestrator] Stopping...');
    this.isRunning = false;

    // Clear timers
    if (this.researchTimer) {
      clearTimeout(this.researchTimer);
      this.researchTimer = null;
    }
    if (this.evolutionTimer) {
      clearTimeout(this.evolutionTimer);
      this.evolutionTimer = null;
    }

    // Stop research engine
    this.researchEngine.stop();

    logger.info('[ResearchOrchestrator] Stopped');
  }

  /**
   * Schedule the research cycle
   * Runs every configured interval (default 15 minutes)
   */
  private scheduleResearchCycle(): void {
    if (!this.isRunning) return;

    const runResearch = async () => {
      try {
        await this.runResearchCycle();
      } catch (error) {
        logger.error('[ResearchOrchestrator] Research cycle error:', error);
      }

      // Schedule next run
      if (this.isRunning) {
        this.researchTimer = setTimeout(runResearch, this.getAdjustedInterval());
      }
    };

    // Start the first run
    runResearch();
  }

  /**
   * Schedule the evolution cycle
   * Runs every configured evolution interval (default 6 hours)
   */
  private scheduleEvolutionCycle(): void {
    if (!this.isRunning) return;

    const runEvolution = async () => {
      try {
        await this.runEvolutionCycle();
      } catch (error) {
        logger.error('[ResearchOrchestrator] Evolution cycle error:', error);
      }

      // Schedule next evolution
      if (this.isRunning) {
        this.evolutionTimer = setTimeout(runEvolution, this.config.evolutionIntervalMs);
      }
    };

    // Delay first evolution to allow some research to complete
    setTimeout(runEvolution, this.config.evolutionIntervalMs);
  }

  /**
   * Get adjusted interval based on backtest queue depth
   * If queue is backing up, slow down research generation
   */
  private getAdjustedInterval(): number {
    const baseInterval = this.config.researchIntervalMs;
    const queueDepth = this.backtestQueueStatus.pending + this.backtestQueueStatus.running;
    const maxConcurrent = this.config.maxConcurrentBacktests;

    // If queue is getting full, slow down
    if (queueDepth > maxConcurrent * 2) {
      const slowdownFactor = Math.min(4, queueDepth / maxConcurrent);
      const adjustedInterval = baseInterval * slowdownFactor;
      logger.info(`[ResearchOrchestrator] Queue depth ${queueDepth}, slowing research to ${adjustedInterval / 60000}min`);
      return adjustedInterval;
    }

    return baseInterval;
  }

  /**
   * Run a single research cycle
   */
  private async runResearchCycle(): Promise<void> {
    const startTime = Date.now();
    logger.info('[ResearchOrchestrator] ╔══════════════════════════════════════════════════════════╗');
    logger.info('[ResearchOrchestrator] ║  Research Cycle Starting                                  ║');
    logger.info('[ResearchOrchestrator] ╚══════════════════════════════════════════════════════════╝');

    try {
      // Update queue status
      await this.updateQueueStatus();

      // Run research cycle through research engine
      await this.researchEngine.runResearchCycle();

      // Check queue depth and log warnings if needed
      if (this.backtestQueueStatus.pending > this.config.maxConcurrentBacktests * 3) {
        logger.warn(`[ResearchOrchestrator] Backtest queue backing up: ${this.backtestQueueStatus.pending} pending`);
      }

      const duration = Date.now() - startTime;
      logger.info(`[ResearchOrchestrator] Research cycle completed in ${duration}ms`);

    } catch (error) {
      logger.error('[ResearchOrchestrator] Research cycle failed:', error);
    }
  }

  /**
   * Run evolution cycle
   * Evaluates and evolves top performing strategies
   */
  private async runEvolutionCycle(): Promise<void> {
    const startTime = Date.now();
    this.evolutionGeneration++;

    logger.info('[ResearchOrchestrator] ╔══════════════════════════════════════════════════════════╗');
    logger.info('[ResearchOrchestrator] ║  Evolution Cycle Starting                                 ║');
    logger.info(`[ResearchOrchestrator] ║  Generation: ${this.evolutionGeneration.toString().padEnd(45)}║`);
    logger.info('[ResearchOrchestrator] ╚══════════════════════════════════════════════════════════╝');

    try {
      // Get top performing strategies
      const topStrategies = await this.researchEngine.getTopStrategies(20);

      // Filter strategies that meet performance thresholds
      const eligibleStrategies = topStrategies.filter(s => 
        s.sharpeRatio >= this.config.performanceThresholds.minSharpeRatio &&
        s.winRate >= this.config.performanceThresholds.minWinRate
      );

      logger.info(`[ResearchOrchestrator] Found ${eligibleStrategies.length} strategies meeting performance thresholds`);

      // Simulate evolution (would integrate with actual evolution engine)
      const evolutionResult: EvolutionResult = {
        generation: this.evolutionGeneration,
        strategiesEvaluated: topStrategies.length,
        topPerformers: eligibleStrategies.slice(0, 5).map(s => s.id || s.strategyId),
        averageSharpe: eligibleStrategies.length > 0 
          ? eligibleStrategies.reduce((sum, s) => sum + s.sharpeRatio, 0) / eligibleStrategies.length 
          : 0,
        timestamp: new Date(),
      };

      this.lastEvolutionRun = evolutionResult.timestamp;

      const duration = Date.now() - startTime;
      logger.info(`[ResearchOrchestrator] Evolution cycle completed in ${duration}ms`);
      logger.info(`[ResearchOrchestrator] Top performer Sharpe: ${evolutionResult.averageSharpe.toFixed(2)}`);

    } catch (error) {
      logger.error('[ResearchOrchestrator] Evolution cycle failed:', error);
    }
  }

  /**
   * Update backtest queue status
   */
  private async updateQueueStatus(): Promise<void> {
    try {
      const status = await this.researchEngine.getStatus();
      this.backtestQueueStatus = {
        pending: status.pendingBacktests,
        running: status.queueSize,
        completed: status.completedBacktests,
        failed: 0, // Would track from database
      };
    } catch (error) {
      logger.error('[ResearchOrchestrator] Failed to update queue status:', error);
    }
  }

  /**
   * Get current orchestrator status
   */
  getStatus(): {
    isRunning: boolean;
    evolutionGeneration: number;
    lastEvolutionRun: Date | null;
    backtestQueue: BacktestQueueStatus;
    config: ResearchEngineConfig;
  } {
    return {
      isRunning: this.isRunning,
      evolutionGeneration: this.evolutionGeneration,
      lastEvolutionRun: this.lastEvolutionRun,
      backtestQueue: { ...this.backtestQueueStatus },
      config: this.config,
    };
  }

  /**
   * Force trigger an evolution run
   */
  async triggerEvolution(): Promise<void> {
    logger.info('[ResearchOrchestrator] Manual evolution trigger');
    await this.runEvolutionCycle();
  }

  /**
   * Force trigger a research cycle
   */
  async triggerResearch(): Promise<void> {
    logger.info('[ResearchOrchestrator] Manual research trigger');
    await this.runResearchCycle();
  }
}

// Export singleton instance
export const researchOrchestrator = new ResearchOrchestrator();
export default researchOrchestrator;
