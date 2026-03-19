"use strict";
// Research Engine Orchestrator
// Coordinates all research activities with configurable cycles and evolution runs
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.researchOrchestrator = exports.ResearchOrchestrator = void 0;
require("dotenv/config");
const logger_1 = __importDefault(require("../shared/logger"));
const config_1 = require("./config");
const index_1 = require("./index");
class ResearchOrchestrator {
    config;
    researchEngine;
    isRunning = false;
    researchTimer = null;
    evolutionTimer = null;
    lastEvolutionRun = null;
    evolutionGeneration = 0;
    backtestQueueStatus = {
        pending: 0,
        running: 0,
        completed: 0,
        failed: 0,
    };
    constructor(config) {
        this.config = {
            ...config_1.researchEngineConfig,
            ...config,
        };
        this.researchEngine = new index_1.ResearchEngine({
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
    async start() {
        if (this.isRunning) {
            logger_1.default.warn('[ResearchOrchestrator] Already running');
            return;
        }
        logger_1.default.info('═══════════════════════════════════════════════════════════');
        logger_1.default.info('  Research Orchestrator Starting');
        logger_1.default.info('═══════════════════════════════════════════════════════════');
        logger_1.default.info(`[ResearchOrchestrator] Research interval: ${this.config.researchIntervalMs / 60000} minutes`);
        logger_1.default.info(`[ResearchOrchestrator] Evolution interval: ${this.config.evolutionIntervalMs / 3600000} hours`);
        logger_1.default.info(`[ResearchOrchestrator] Min Sharpe ratio: ${this.config.performanceThresholds.minSharpeRatio}`);
        logger_1.default.info(`[ResearchOrchestrator] Min win rate: ${this.config.performanceThresholds.minWinRate}%`);
        logger_1.default.info(`[ResearchOrchestrator] Max concurrent backtests: ${this.config.maxConcurrentBacktests}`);
        this.isRunning = true;
        // Start the research engine
        await this.researchEngine.start();
        // Schedule research cycle (every 15 minutes)
        this.scheduleResearchCycle();
        // Schedule evolution runs (every 6 hours)
        this.scheduleEvolutionCycle();
        logger_1.default.info('[ResearchOrchestrator] Started successfully');
    }
    /**
     * Stop the research orchestrator gracefully
     */
    stop() {
        logger_1.default.info('[ResearchOrchestrator] Stopping...');
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
        logger_1.default.info('[ResearchOrchestrator] Stopped');
    }
    /**
     * Schedule the research cycle
     * Runs every configured interval (default 15 minutes)
     */
    scheduleResearchCycle() {
        if (!this.isRunning)
            return;
        const runResearch = async () => {
            try {
                await this.runResearchCycle();
            }
            catch (error) {
                logger_1.default.error('[ResearchOrchestrator] Research cycle error:', error);
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
    scheduleEvolutionCycle() {
        if (!this.isRunning)
            return;
        const runEvolution = async () => {
            try {
                await this.runEvolutionCycle();
            }
            catch (error) {
                logger_1.default.error('[ResearchOrchestrator] Evolution cycle error:', error);
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
    getAdjustedInterval() {
        const baseInterval = this.config.researchIntervalMs;
        const queueDepth = this.backtestQueueStatus.pending + this.backtestQueueStatus.running;
        const maxConcurrent = this.config.maxConcurrentBacktests;
        // If queue is getting full, slow down
        if (queueDepth > maxConcurrent * 2) {
            const slowdownFactor = Math.min(4, queueDepth / maxConcurrent);
            const adjustedInterval = baseInterval * slowdownFactor;
            logger_1.default.info(`[ResearchOrchestrator] Queue depth ${queueDepth}, slowing research to ${adjustedInterval / 60000}min`);
            return adjustedInterval;
        }
        return baseInterval;
    }
    /**
     * Run a single research cycle
     */
    async runResearchCycle() {
        const startTime = Date.now();
        logger_1.default.info('[ResearchOrchestrator] ╔══════════════════════════════════════════════════════════╗');
        logger_1.default.info('[ResearchOrchestrator] ║  Research Cycle Starting                                  ║');
        logger_1.default.info('[ResearchOrchestrator] ╚══════════════════════════════════════════════════════════╝');
        try {
            // Update queue status
            await this.updateQueueStatus();
            // Run research cycle through research engine
            await this.researchEngine.runResearchCycle();
            // Check queue depth and log warnings if needed
            if (this.backtestQueueStatus.pending > this.config.maxConcurrentBacktests * 3) {
                logger_1.default.warn(`[ResearchOrchestrator] Backtest queue backing up: ${this.backtestQueueStatus.pending} pending`);
            }
            const duration = Date.now() - startTime;
            logger_1.default.info(`[ResearchOrchestrator] Research cycle completed in ${duration}ms`);
        }
        catch (error) {
            logger_1.default.error('[ResearchOrchestrator] Research cycle failed:', error);
        }
    }
    /**
     * Run evolution cycle
     * Evaluates and evolves top performing strategies
     */
    async runEvolutionCycle() {
        const startTime = Date.now();
        this.evolutionGeneration++;
        logger_1.default.info('[ResearchOrchestrator] ╔══════════════════════════════════════════════════════════╗');
        logger_1.default.info('[ResearchOrchestrator] ║  Evolution Cycle Starting                                 ║');
        logger_1.default.info(`[ResearchOrchestrator] ║  Generation: ${this.evolutionGeneration.toString().padEnd(45)}║`);
        logger_1.default.info('[ResearchOrchestrator] ╚══════════════════════════════════════════════════════════╝');
        try {
            // Get top performing strategies
            const topStrategies = await this.researchEngine.getTopStrategies(20);
            // Filter strategies that meet performance thresholds
            const eligibleStrategies = topStrategies.filter(s => s.sharpeRatio >= this.config.performanceThresholds.minSharpeRatio &&
                s.winRate >= this.config.performanceThresholds.minWinRate);
            logger_1.default.info(`[ResearchOrchestrator] Found ${eligibleStrategies.length} strategies meeting performance thresholds`);
            // Simulate evolution (would integrate with actual evolution engine)
            const evolutionResult = {
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
            logger_1.default.info(`[ResearchOrchestrator] Evolution cycle completed in ${duration}ms`);
            logger_1.default.info(`[ResearchOrchestrator] Top performer Sharpe: ${evolutionResult.averageSharpe.toFixed(2)}`);
        }
        catch (error) {
            logger_1.default.error('[ResearchOrchestrator] Evolution cycle failed:', error);
        }
    }
    /**
     * Update backtest queue status
     */
    async updateQueueStatus() {
        try {
            const status = await this.researchEngine.getStatus();
            this.backtestQueueStatus = {
                pending: status.pendingBacktests,
                running: status.queueSize,
                completed: status.completedBacktests,
                failed: 0, // Would track from database
            };
        }
        catch (error) {
            logger_1.default.error('[ResearchOrchestrator] Failed to update queue status:', error);
        }
    }
    /**
     * Get current orchestrator status
     */
    getStatus() {
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
    async triggerEvolution() {
        logger_1.default.info('[ResearchOrchestrator] Manual evolution trigger');
        await this.runEvolutionCycle();
    }
    /**
     * Force trigger a research cycle
     */
    async triggerResearch() {
        logger_1.default.info('[ResearchOrchestrator] Manual research trigger');
        await this.runResearchCycle();
    }
}
exports.ResearchOrchestrator = ResearchOrchestrator;
// Export singleton instance
exports.researchOrchestrator = new ResearchOrchestrator();
exports.default = exports.researchOrchestrator;
//# sourceMappingURL=orchestrator.js.map