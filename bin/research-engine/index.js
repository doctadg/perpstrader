"use strict";
// Research Engine - Main orchestrator for continuous strategy research
// Runs every 15 minutes to generate new trading strategy ideas
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
                    // Simulate backtest (placeholder - actual backtest would be integrated with backtest engine)
                    const result = await this.simulateBacktest(job.strategyId);
                    await this.ideaQueue.completeBacktestJob(job.id, result);
                    logger_1.default.info(`[ResearchEngine] Backtest completed for strategy ${job.strategyId}`);
                }
                catch (error) {
                    logger_1.default.error(`[ResearchEngine] Backtest failed for job ${job.id}:`, error);
                    await this.ideaQueue.updateBacktestJobStatus(job.id, 'FAILED');
                }
            }
        }
        catch (error) {
            logger_1.default.error('[ResearchEngine] Error processing backtest jobs:', error);
        }
    }
    /**
     * Simulate a backtest (placeholder for actual backtest integration)
     */
    async simulateBacktest(strategyId) {
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