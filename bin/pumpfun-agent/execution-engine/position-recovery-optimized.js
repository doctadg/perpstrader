"use strict";
/**
 * Optimized Position Recovery Service
 * Performance improvements:
 * - Parallel position analysis
 * - Connection pooling for API calls
 * - Caching of position data
 * - Batched recovery operations
 * - Debounced alerts
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OptimizedPositionRecoveryService = void 0;
const logger_1 = __importDefault(require("../shared/logger"));
const execution_engine_1 = __importDefault(require("./execution-engine"));
const risk_manager_1 = __importDefault(require("../risk-manager/risk-manager"));
const data_manager_1 = __importDefault(require("../data-manager/data-manager"));
/**
 * Optimized Position Recovery Service
 * Monitors and recovers problematic positions automatically
 */
class OptimizedPositionRecoveryService {
    recoveryAttempts = new Map();
    maxRecoveryAttempts = 3;
    monitoringInterval = null;
    lastCheckTime = null;
    issueHistory = [];
    alertHistory = [];
    // Cache for position data
    cache = null;
    CACHE_TTL_MS = 5000; // 5 second cache
    // Alert deduplication
    recentAlerts = new Map();
    ALERT_DEDUP_MS = 300000; // 5 minutes
    // Batched operations queue
    pendingCloses = [];
    pendingReductions = [];
    batchTimeout = null;
    BATCH_INTERVAL_MS = 2000;
    constructor() {
        this.maxRecoveryAttempts = parseInt(process.env.MAX_RECOVERY_ATTEMPTS || '3', 10);
    }
    /**
     * Start monitoring positions for recovery
     */
    startMonitoring(intervalMs = 30000) {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
        }
        this.monitoringInterval = setInterval(async () => {
            await this.checkAndRecoverPositions();
        }, intervalMs);
        logger_1.default.info(`[PositionRecovery] Started optimized monitoring (interval: ${intervalMs}ms)`);
    }
    /**
     * Stop monitoring positions
     */
    stopMonitoring() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
            logger_1.default.info('[PositionRecovery] Stopped monitoring');
        }
        // Flush any pending batches
        this.flushPendingBatches();
    }
    /**
     * Check all positions and perform recovery if needed (parallelized)
     */
    async checkAndRecoverPositions() {
        this.lastCheckTime = new Date();
        try {
            // Fetch data in parallel with caching
            const { portfolio, strategies, trades } = await this.fetchPositionData();
            if (portfolio.positions.length === 0) {
                return;
            }
            // Analyze positions in parallel
            const issuePromises = portfolio.positions.map(position => this.analyzePosition(position, portfolio, strategies, trades.get(position.symbol) || []));
            const issues = (await Promise.all(issuePromises))
                .filter((issue) => issue !== null)
                .filter(issue => issue.action.priority === 'CRITICAL' || issue.action.priority === 'HIGH');
            if (issues.length === 0) {
                return;
            }
            logger_1.default.warn(`[PositionRecovery] Found ${issues.length} position issues`);
            // Handle issues in priority order
            const sortedIssues = issues.sort((a, b) => {
                const priorityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
                return priorityOrder[a.action.priority] - priorityOrder[b.action.priority];
            });
            // Batch similar operations
            for (const issue of sortedIssues) {
                this.queueRecoveryAction(issue, portfolio);
            }
            // Schedule batch flush
            if (!this.batchTimeout) {
                this.batchTimeout = setTimeout(() => this.flushPendingBatches(), this.BATCH_INTERVAL_MS);
            }
        }
        catch (error) {
            logger_1.default.error('[PositionRecovery] Check failed:', error);
        }
    }
    /**
     * Fetch position data with caching
     */
    async fetchPositionData() {
        const now = Date.now();
        // Return cached data if fresh
        if (this.cache && (now - this.cache.timestamp) < this.CACHE_TTL_MS) {
            return this.cache;
        }
        // Fetch in parallel
        const [portfolio, strategies] = await Promise.all([
            execution_engine_1.default.getPortfolio(),
            data_manager_1.default.getAllStrategies().catch(() => [])
        ]);
        // Fetch trades for all symbols in parallel
        const trades = new Map();
        const tradePromises = portfolio.positions.map(async (position) => {
            const positionTrades = await execution_engine_1.default.getHistoricalTrades(position.symbol, 10);
            trades.set(position.symbol, positionTrades);
        });
        await Promise.all(tradePromises);
        this.cache = {
            portfolio,
            strategies,
            trades,
            timestamp: now
        };
        return this.cache;
    }
    /**
     * Analyze a single position for issues
     */
    async analyzePosition(position, portfolio, strategies, trades) {
        // Check for orphaned positions (no matching strategy) - cached result
        const hasActiveStrategy = strategies.some(s => s.symbols?.includes(position.symbol) && s.isActive);
        if (!hasActiveStrategy) {
            return {
                position,
                issue: 'ORPHANED',
                action: {
                    type: 'CLOSE',
                    reason: 'Position has no associated strategy or has been abandoned',
                    priority: 'HIGH',
                },
                detectedAt: new Date(),
            };
        }
        // Check for excessive unrealized loss
        const lossPercent = position.unrealizedPnL / (position.size * position.entryPrice);
        if (lossPercent < -0.15) { // 15% loss
            return {
                position,
                issue: 'EXCESSIVE_LOSS',
                action: {
                    type: 'CLOSE',
                    reason: `Position has excessive unrealized loss: ${(lossPercent * 100).toFixed(1)}%`,
                    priority: 'CRITICAL',
                },
                detectedAt: new Date(),
            };
        }
        // Check for stuck positions (no price movement for extended period)
        if (trades.length >= 5) {
            const prices = trades.map(t => t.price).filter(p => p > 0);
            if (prices.length >= 5) {
                const minPrice = Math.min(...prices);
                const maxPrice = Math.max(...prices);
                const volatility = (maxPrice - minPrice) / ((minPrice + maxPrice) / 2);
                if (volatility < 0.005) { // Less than 0.5% movement
                    return {
                        position,
                        issue: 'STUCK',
                        action: {
                            type: position.side === 'LONG' ? 'REDUCE' : 'CLOSE',
                            reason: 'Position appears stuck with no price movement',
                            priority: 'MEDIUM',
                        },
                        detectedAt: new Date(),
                    };
                }
            }
        }
        // Check for leverage exceeded
        if (position.leverage > 50) { // Beyond 50x
            return {
                position,
                issue: 'EXCESSIVE_LEVERAGE',
                action: {
                    type: 'REDUCE',
                    reason: `Position leverage ${position.leverage}x exceeds safe threshold`,
                    priority: 'HIGH',
                },
                detectedAt: new Date(),
            };
        }
        // Check for stale positions (open too long without action)
        if (trades.length > 0) {
            const oldestTrade = trades[trades.length - 1]; // Most recent first
            if (oldestTrade?.timestamp) {
                const ageMs = Date.now() - new Date(oldestTrade.timestamp).getTime();
                const ageHours = ageMs / (1000 * 60 * 60);
                if (ageHours > 24) { // Older than 24 hours
                    return {
                        position,
                        issue: 'STALE',
                        action: {
                            type: 'WAIT',
                            reason: 'Position has been open for extended period, consider closing',
                            priority: 'LOW',
                        },
                        detectedAt: new Date(),
                    };
                }
            }
        }
        return null;
    }
    /**
     * Queue a recovery action for batching
     */
    queueRecoveryAction(issue, portfolio) {
        const { position, action } = issue;
        const positionKey = `${position.symbol}-${position.side}`;
        // Check recovery attempts
        const attempts = this.recoveryAttempts.get(positionKey) || 0;
        if (attempts >= this.maxRecoveryAttempts) {
            if (!this.shouldDedupeAlert(`max_attempts_${positionKey}`)) {
                logger_1.default.error(`[PositionRecovery] Max recovery attempts reached for ${positionKey}`);
            }
            return;
        }
        this.recoveryAttempts.set(positionKey, attempts + 1);
        switch (action.type) {
            case 'CLOSE':
                this.pendingCloses.push(position);
                break;
            case 'REDUCE':
                this.pendingReductions.push(position);
                break;
            case 'ALERT':
                this.sendAlert(position, action.reason);
                break;
            case 'WAIT':
                if (!this.shouldDedupeAlert(`wait_${positionKey}`)) {
                    logger_1.default.info(`[PositionRecovery] Waiting on ${position.symbol}: ${action.reason}`);
                }
                break;
        }
        // Store in history
        this.issueHistory.push(issue);
        // Keep only last 100 issues
        if (this.issueHistory.length > 100) {
            this.issueHistory = this.issueHistory.slice(-100);
        }
    }
    /**
     * Flush pending batch operations
     */
    async flushPendingBatches() {
        if (this.batchTimeout) {
            clearTimeout(this.batchTimeout);
            this.batchTimeout = null;
        }
        const closes = [...this.pendingCloses];
        const reductions = [...this.pendingReductions];
        this.pendingCloses = [];
        this.pendingReductions = [];
        // Execute closes in parallel
        if (closes.length > 0) {
            logger_1.default.info(`[PositionRecovery] Executing batch close for ${closes.length} positions`);
            await Promise.allSettled(closes.map(position => this.closePosition(position, 'Batch recovery')));
        }
        // Execute reductions in parallel
        if (reductions.length > 0) {
            logger_1.default.info(`[PositionRecovery] Executing batch reduction for ${reductions.length} positions`);
            const portfolio = await execution_engine_1.default.getPortfolio();
            await Promise.allSettled(reductions.map(position => this.reducePosition(position, portfolio, 'Batch recovery')));
        }
    }
    /**
     * Check if alert should be deduplicated
     */
    shouldDedupeAlert(alertKey) {
        const now = Date.now();
        const lastAlert = this.recentAlerts.get(alertKey);
        if (lastAlert && (now - lastAlert) < this.ALERT_DEDUP_MS) {
            return true; // Should dedupe
        }
        this.recentAlerts.set(alertKey, now);
        return false;
    }
    /**
     * Close a position immediately
     */
    async closePosition(position, reason) {
        try {
            logger_1.default.warn(`[PositionRecovery] Closing position ${position.symbol}: ${reason}`);
            const signal = {
                id: `recovery-${Date.now()}-${position.symbol}`,
                symbol: position.symbol,
                action: position.side === 'LONG' ? 'SELL' : 'BUY',
                size: Math.abs(position.size),
                price: position.markPrice,
                type: 'MARKET',
                timestamp: new Date(),
                confidence: 1.0,
                strategyId: 'position-recovery',
                reason: `Recovery: ${reason}`,
            };
            const riskAssessment = await risk_manager_1.default.evaluateSignal(signal, await execution_engine_1.default.getPortfolio());
            if (riskAssessment.approved) {
                await execution_engine_1.default.executeSignal(signal, riskAssessment);
                logger_1.default.info(`[PositionRecovery] Successfully closed position ${position.symbol}`);
            }
            else {
                logger_1.default.error(`[PositionRecovery] Risk manager rejected recovery close for ${position.symbol}`);
            }
        }
        catch (error) {
            logger_1.default.error(`[PositionRecovery] Failed to close position ${position.symbol}:`, error);
        }
    }
    /**
     * Reduce position size by 50%
     */
    async reducePosition(position, portfolio, reason) {
        try {
            const newSize = Math.abs(position.size) * 0.5;
            logger_1.default.warn(`[PositionRecovery] Reducing position ${position.symbol} by 50%: ${reason}`);
            const signal = {
                id: `recovery-${Date.now()}-${position.symbol}`,
                symbol: position.symbol,
                action: position.side === 'LONG' ? 'SELL' : 'BUY',
                size: newSize,
                price: position.markPrice,
                type: 'MARKET',
                timestamp: new Date(),
                confidence: 0.8,
                strategyId: 'position-recovery',
                reason: `Recovery: ${reason}`,
            };
            const riskAssessment = await risk_manager_1.default.evaluateSignal(signal, portfolio);
            if (riskAssessment.approved) {
                await execution_engine_1.default.executeSignal(signal, riskAssessment);
                logger_1.default.info(`[PositionRecovery] Successfully reduced position ${position.symbol} by 50%`);
            }
        }
        catch (error) {
            logger_1.default.error(`[PositionRecovery] Failed to reduce position ${position.symbol}:`, error);
        }
    }
    /**
     * Send alert about position issue (debounced)
     */
    sendAlert(position, reason) {
        const alertKey = `alert_${position.symbol}_${reason}`;
        if (this.shouldDedupeAlert(alertKey)) {
            return;
        }
        logger_1.default.error(`[PositionRecovery] ALERT: ${position.symbol} ${position.side} - ${reason}`);
        this.alertHistory.push({
            position,
            issue: reason,
            action: {
                type: 'ALERT',
                reason,
                priority: 'HIGH',
            },
            detectedAt: new Date(),
        });
        // Keep only last 100 alerts
        if (this.alertHistory.length > 100) {
            this.alertHistory = this.alertHistory.slice(-100);
        }
    }
    /**
     * Manual recovery trigger for specific position
     */
    async recoverPosition(symbol, side, action) {
        try {
            const portfolio = await execution_engine_1.default.getPortfolio();
            const position = portfolio.positions.find(p => p.symbol === symbol && p.side === side);
            if (!position) {
                logger_1.default.error(`[PositionRecovery] Position not found: ${symbol} ${side}`);
                return false;
            }
            if (action === 'CLOSE') {
                await this.closePosition(position, 'Manual recovery');
            }
            else {
                await this.reducePosition(position, portfolio, 'Manual recovery');
            }
            return true;
        }
        catch (error) {
            logger_1.default.error(`[PositionRecovery] Manual recovery failed:`, error);
            return false;
        }
    }
    /**
     * Get recovery statistics
     */
    getStats() {
        return {
            lastCheckTime: this.lastCheckTime,
            recoveryAttempts: this.recoveryAttempts.size,
            issueHistory: this.issueHistory,
            activeIssues: this.issueHistory.filter(i => i.detectedAt > new Date(Date.now() - 3600000)),
            pendingBatches: {
                closes: this.pendingCloses.length,
                reductions: this.pendingReductions.length
            }
        };
    }
    /**
     * Reset recovery attempts for a position
     */
    resetRecoveryAttempts(symbol, side) {
        const key = `${symbol}-${side}`;
        this.recoveryAttempts.delete(key);
        // Also clear cache to force fresh data
        this.cache = null;
        logger_1.default.info(`[PositionRecovery] Reset recovery attempts for ${key}`);
    }
    /**
     * Clear caches (call when external data changes)
     */
    clearCache() {
        this.cache = null;
    }
    /**
     * Emergency close all positions
     */
    async emergencyCloseAll() {
        try {
            logger_1.default.error('[PositionRecovery] EMERGENCY CLOSE ALL POSITIONS');
            const portfolio = await execution_engine_1.default.getPortfolio();
            await Promise.allSettled(portfolio.positions.map(position => this.closePosition(position, 'EMERGENCY CLOSE ALL')));
        }
        catch (error) {
            logger_1.default.error('[PositionRecovery] Emergency close all failed:', error);
            throw error;
        }
    }
}
exports.OptimizedPositionRecoveryService = OptimizedPositionRecoveryService;
// Singleton instance
const optimizedPositionRecovery = new OptimizedPositionRecoveryService();
exports.default = optimizedPositionRecovery;
//# sourceMappingURL=position-recovery-optimized.js.map