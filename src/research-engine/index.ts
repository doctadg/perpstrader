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

        try {
          // Simulate backtest (placeholder - actual backtest would be integrated with backtest engine)
          const result = await this.simulateBacktest(job.strategyId);
          await this.ideaQueue.completeBacktestJob(job.id, result);
          logger.info(`[ResearchEngine] Backtest completed for strategy ${job.strategyId}`);
        } catch (error) {
          logger.error(`[ResearchEngine] Backtest failed for job ${job.id}:`, error);
          await this.ideaQueue.updateBacktestJobStatus(job.id, 'FAILED');
        }
      }
    } catch (error) {
      logger.error('[ResearchEngine] Error processing backtest jobs:', error);
    }
  }

  /**
   * Simulate a backtest (placeholder for actual backtest integration)
   */
  private async simulateBacktest(strategyId: string): Promise<any> {
    // This would integrate with the actual backtest engine
    // For now, return a placeholder result
    return {
      sharpeRatio: 1.0 + Math.random(),
      winRate: 0.5 + Math.random() * 0.3,
      pnl: Math.random() * 10000,
      maxDrawdown: Math.random() * 0.2,
      totalTrades: Math.floor(Math.random() * 100) + 20,
      completedAt: new Date().toISOString(),
    };
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
