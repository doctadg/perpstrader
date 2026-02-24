"use strict";
// Position Recovery Service
// Handles automatic recovery of stuck, orphaned, or problematic positions
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PositionRecoveryService = void 0;
const logger_1 = __importDefault(require("../shared/logger"));
const execution_engine_1 = __importDefault(require("./execution-engine"));
const risk_manager_1 = __importDefault(require("../risk-manager/risk-manager"));
const data_manager_1 = __importDefault(require("../data-manager/data-manager"));
/**
 * Position Recovery Service
 * Monitors and recovers problematic positions automatically
 */
class PositionRecoveryService {
    recoveryAttempts = new Map();
    maxRecoveryAttempts = 3;
    monitoringInterval = null;
    lastCheckTime = null;
    issueHistory = [];
    alertHistory = [];
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
        logger_1.default.info(`[PositionRecovery] Started monitoring (interval: ${intervalMs}ms)`);
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
    }
    /**
     * Check all positions and perform recovery if needed
     */
    async checkAndRecoverPositions() {
        this.lastCheckTime = new Date();
        try {
            const portfolio = await execution_engine_1.default.getPortfolio();
            const issues = await this.analyzePositions(portfolio);
            if (issues.length === 0) {
                return;
            }
            logger_1.default.warn(`[PositionRecovery] Found ${issues.length} position issues`);
            for (const issue of issues) {
                await this.handlePositionIssue(issue, portfolio);
            }
        }
        catch (error) {
            logger_1.default.error('[PositionRecovery] Check failed:', error);
        }
    }
    /**
     * Analyze positions for potential issues
     */
    async analyzePositions(portfolio) {
        const issues = [];
        for (const position of portfolio.positions) {
            try {
                const positionRisk = await risk_manager_1.default.checkPositionRisk(position, portfolio);
                if (!positionRisk.approved || risk_manager_1.default.shouldClosePosition(position)) {
                    const priority = positionRisk.warnings.some(warning => warning.includes('CRITICAL') || warning.includes('Large unrealized loss')) ? 'CRITICAL' : 'HIGH';
                    const riskReason = positionRisk.warnings.length > 0
                        ? positionRisk.warnings.join('; ')
                        : `Risk score ${positionRisk.riskScore.toFixed(2)} exceeded threshold`;
                    issues.push({
                        position,
                        issue: 'RISK_LIMIT',
                        action: {
                            type: 'CLOSE',
                            reason: `Risk manager exit trigger: ${riskReason}`,
                            priority,
                        },
                        detectedAt: new Date(),
                    });
                    continue;
                }
            }
            catch (riskError) {
                logger_1.default.warn(`[PositionRecovery] Risk check failed for ${position.symbol}:`, riskError);
            }
            // Check for orphaned positions (no matching strategy)
            if (await this.isOrphanedPosition(position)) {
                issues.push({
                    position,
                    issue: 'ORPHANED',
                    action: {
                        type: 'CLOSE',
                        reason: 'Position has no associated strategy or has been abandoned',
                        priority: 'HIGH',
                    },
                    detectedAt: new Date(),
                });
                continue;
            }
            // Check for excessive unrealized loss
            const lossPercent = position.unrealizedPnL / (position.size * position.entryPrice);
            if (lossPercent < -0.05) { // 5% loss hard fallback
                issues.push({
                    position,
                    issue: 'EXCESSIVE_LOSS',
                    action: {
                        type: 'CLOSE',
                        reason: `Position has excessive unrealized loss: ${(lossPercent * 100).toFixed(1)}%`,
                        priority: 'CRITICAL',
                    },
                    detectedAt: new Date(),
                });
                continue;
            }
            // Check for stuck positions (no price movement for extended period)
            if (await this.isStuckPosition(position)) {
                issues.push({
                    position,
                    issue: 'STUCK',
                    action: {
                        type: position.side === 'LONG' ? 'REDUCE' : 'CLOSE',
                        reason: 'Position appears stuck with no price movement',
                        priority: 'MEDIUM',
                    },
                    detectedAt: new Date(),
                });
                continue;
            }
            // Check for leverage exceeded
            if (position.leverage > 50) { // Beyond 50x
                issues.push({
                    position,
                    issue: 'EXCESSIVE_LEVERAGE',
                    action: {
                        type: 'REDUCE',
                        reason: `Position leverage ${position.leverage}x exceeds safe threshold`,
                        priority: 'HIGH',
                    },
                    detectedAt: new Date(),
                });
                continue;
            }
            // Check for stale positions (open too long without action)
            if (await this.isStalePosition(position)) {
                issues.push({
                    position,
                    issue: 'STALE',
                    action: {
                        type: 'WAIT',
                        reason: 'Position has been open for extended period, consider closing',
                        priority: 'LOW',
                    },
                    detectedAt: new Date(),
                });
            }
        }
        // Store in history
        this.issueHistory.push(...issues);
        // Keep only last 100 issues
        if (this.issueHistory.length > 100) {
            this.issueHistory = this.issueHistory.slice(-100);
        }
        return issues.filter(i => i.action.priority === 'CRITICAL' || i.action.priority === 'HIGH');
    }
    /**
     * Check if position is orphaned (no associated strategy)
     */
    async isOrphanedPosition(position) {
        try {
            const strategies = await data_manager_1.default.getAllStrategies();
            const hasActiveStrategy = strategies.some(s => s.symbols.includes(position.symbol) && s.isActive);
            return !hasActiveStrategy;
        }
        catch {
            return false;
        }
    }
    /**
     * Check if position is stuck (no significant price movement)
     */
    async isStuckPosition(position) {
        try {
            const trades = await execution_engine_1.default.getHistoricalTrades(position.symbol, 10);
            if (trades.length === 0)
                return false;
            // Check if price has moved less than 0.5% in last 10 trades
            const prices = trades.map(t => t.price).filter(p => p > 0);
            if (prices.length < 5)
                return false;
            const minPrice = Math.min(...prices);
            const maxPrice = Math.max(...prices);
            const volatility = (maxPrice - minPrice) / ((minPrice + maxPrice) / 2);
            return volatility < 0.005; // Less than 0.5% movement
        }
        catch {
            return false;
        }
    }
    /**
     * Check if position is stale (open too long)
     */
    async isStalePosition(position) {
        try {
            const trades = await execution_engine_1.default.getHistoricalTrades(position.symbol, 1);
            if (trades.length === 0)
                return false;
            const oldestTrade = trades[0];
            if (!oldestTrade.timestamp)
                return false;
            const ageMs = Date.now() - new Date(oldestTrade.timestamp).getTime();
            const ageHours = ageMs / (1000 * 60 * 60);
            return ageHours > 24; // Older than 24 hours
        }
        catch {
            return false;
        }
    }
    /**
     * Handle a position issue
     */
    async handlePositionIssue(issue, portfolio) {
        const { position, action } = issue;
        const positionKey = `${position.symbol}-${position.side}`;
        // Check recovery attempts
        const attempts = this.recoveryAttempts.get(positionKey) || 0;
        if (attempts >= this.maxRecoveryAttempts) {
            logger_1.default.error(`[PositionRecovery] Max recovery attempts reached for ${positionKey}`);
            return;
        }
        this.recoveryAttempts.set(positionKey, attempts + 1);
        logger_1.default.info(`[PositionRecovery] Handling ${action.type} for ${position.symbol} (${action.priority}): ${action.reason}`);
        switch (action.type) {
            case 'CLOSE':
                await this.closePosition(position, action.reason);
                break;
            case 'REDUCE':
                await this.reducePosition(position, portfolio, action.reason);
                break;
            case 'HEDGE':
                await this.hedgePosition(position, action.reason);
                break;
            case 'ALERT':
                await this.sendAlert(position, action.reason);
                break;
            case 'WAIT':
                logger_1.default.info(`[PositionRecovery] Waiting on ${position.symbol}: ${action.reason}`);
                break;
        }
    }
    /**
     * Close a position immediately
     */
    async closePosition(position, reason) {
        try {
            logger_1.default.warn(`[PositionRecovery] Closing position ${position.symbol}: ${reason}`);
            const signal = {
                id: `recovery-${Date.now()}`,
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
            const riskAssessment = {
                approved: true,
                suggestedSize: Math.abs(position.size),
                riskScore: 0,
                warnings: ['Exit signal', 'Position recovery close'],
                stopLoss: 0,
                takeProfit: 0,
                leverage: position.leverage,
            };
            await execution_engine_1.default.executeSignal(signal, riskAssessment);
            logger_1.default.info(`[PositionRecovery] Successfully closed position ${position.symbol}`);
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
                id: `recovery-${Date.now()}`,
                symbol: position.symbol,
                action: position.side === 'LONG' ? 'SELL' : 'BUY',
                size: newSize,
                price: position.markPrice,
                type: 'MARKET',
                timestamp: new Date(),
                confidence: 1.0,
                strategyId: 'position-recovery',
                reason: `Recovery: ${reason}`,
            };
            const riskAssessment = {
                approved: true,
                suggestedSize: newSize,
                riskScore: 0,
                warnings: ['Exit signal', 'Position recovery reduce'],
                stopLoss: 0,
                takeProfit: 0,
                leverage: position.leverage,
            };
            await execution_engine_1.default.executeSignal(signal, riskAssessment);
            logger_1.default.info(`[PositionRecovery] Successfully reduced position ${position.symbol} by 50%`);
        }
        catch (error) {
            logger_1.default.error(`[PositionRecovery] Failed to reduce position ${position.symbol}:`, error);
        }
    }
    /**
     * Hedge a position with opposite exposure
     */
    async hedgePosition(position, reason) {
        try {
            logger_1.default.warn(`[PositionRecovery] Hedging position ${position.symbol}: ${reason}`);
            // For now, just log - hedging requires more sophisticated logic
            logger_1.default.info(`[PositionRecovery] Hedge recommendation: ${position.side === 'LONG' ? 'SHORT' : 'LONG'} ${position.symbol}`);
        }
        catch (error) {
            logger_1.default.error(`[PositionRecovery] Failed to hedge position ${position.symbol}:`, error);
        }
    }
    /**
     * Send alert about position issue
     */
    async sendAlert(position, reason) {
        logger_1.default.error(`[PositionRecovery] ALERT: ${position.symbol} ${position.side} - ${reason}`);
        // Could integrate with notification services here
        // For now, just log and store locally
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
            activeIssues: this.issueHistory.filter(i => i.detectedAt > new Date(Date.now() - 3600000)), // Last hour
        };
    }
    /**
     * Reset recovery attempts for a position
     */
    resetRecoveryAttempts(symbol, side) {
        const key = `${symbol}-${side}`;
        this.recoveryAttempts.delete(key);
        logger_1.default.info(`[PositionRecovery] Reset recovery attempts for ${key}`);
    }
    /**
     * Emergency close all positions
     */
    async emergencyCloseAll() {
        try {
            logger_1.default.error('[PositionRecovery] EMERGENCY CLOSE ALL POSITIONS');
            const portfolio = await execution_engine_1.default.getPortfolio();
            for (const position of portfolio.positions) {
                await this.closePosition(position, 'EMERGENCY CLOSE ALL');
            }
        }
        catch (error) {
            logger_1.default.error('[PositionRecovery] Emergency close all failed:', error);
            throw error;
        }
    }
}
exports.PositionRecoveryService = PositionRecoveryService;
// Singleton instance
const positionRecovery = new PositionRecoveryService();
exports.default = positionRecovery;
//# sourceMappingURL=position-recovery.js.map