// Position Recovery Service
// Handles automatic recovery of stuck, orphaned, or problematic positions

import { Position, Portfolio, TradingSignal, RiskAssessment } from '../shared/types';
import logger from '../shared/logger';
import executionEngine from './execution-engine';
import riskManager from '../risk-manager/risk-manager';
import dataManager from '../data-manager/data-manager';

interface RecoveryAction {
    type: 'CLOSE' | 'REDUCE' | 'HEDGE' | 'WAIT' | 'ALERT';
    reason: string;
    priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
}

interface PositionIssue {
    position: Position;
    issue: string;
    action: RecoveryAction;
    detectedAt: Date;
}

/**
 * Position Recovery Service
 * Monitors and recovers problematic positions automatically
 */
export class PositionRecoveryService {
    private recoveryAttempts: Map<string, number> = new Map();
    private maxRecoveryAttempts: number = 3;
    private monitoringInterval: NodeJS.Timeout | null = null;
    private lastCheckTime: Date | null = null;
    private issueHistory: PositionIssue[] = [];
    private alertHistory: PositionIssue[] = [];

    constructor() {
        this.maxRecoveryAttempts = parseInt(process.env.MAX_RECOVERY_ATTEMPTS || '3', 10);
    }

    /**
     * Start monitoring positions for recovery
     */
    startMonitoring(intervalMs: number = 30000): void {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
        }

        this.monitoringInterval = setInterval(async () => {
            await this.checkAndRecoverPositions();
        }, intervalMs);

        logger.info(`[PositionRecovery] Started monitoring (interval: ${intervalMs}ms)`);
    }

    /**
     * Stop monitoring positions
     */
    stopMonitoring(): void {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
            logger.info('[PositionRecovery] Stopped monitoring');
        }
    }

    /**
     * Check all positions and perform recovery if needed
     */
    async checkAndRecoverPositions(): Promise<void> {
        this.lastCheckTime = new Date();

        try {
            const portfolio = await executionEngine.getPortfolio();
            const issues = await this.analyzePositions(portfolio);

            if (issues.length === 0) {
                return;
            }

            logger.warn(`[PositionRecovery] Found ${issues.length} position issues`);

            for (const issue of issues) {
                await this.handlePositionIssue(issue, portfolio);
            }

        } catch (error) {
            logger.error('[PositionRecovery] Check failed:', error);
        }
    }

    /**
     * Analyze positions for potential issues
     */
    async analyzePositions(portfolio: Portfolio): Promise<PositionIssue[]> {
        const issues: PositionIssue[] = [];

        for (const position of portfolio.positions) {
            try {
                const positionRisk = await riskManager.checkPositionRisk(position, portfolio);
                if (!positionRisk.approved || riskManager.shouldClosePosition(position)) {
                    const priority: RecoveryAction['priority'] = positionRisk.warnings.some(
                        warning => warning.includes('CRITICAL') || warning.includes('Large unrealized loss')
                    ) ? 'CRITICAL' : 'HIGH';

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
            } catch (riskError) {
                logger.warn(`[PositionRecovery] Risk check failed for ${position.symbol}:`, riskError);
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
    private async isOrphanedPosition(position: Position): Promise<boolean> {
        try {
            const strategies = await dataManager.getAllStrategies();
            const hasActiveStrategy = strategies.some(s =>
                s.symbols.includes(position.symbol) && s.isActive
            );
            return !hasActiveStrategy;
        } catch {
            return false;
        }
    }

    /**
     * Check if position is stuck (no significant price movement)
     */
    private async isStuckPosition(position: Position): Promise<boolean> {
        try {
            const trades = await executionEngine.getHistoricalTrades(position.symbol, 10);
            if (trades.length === 0) return false;

            // Check if price has moved less than 0.5% in last 10 trades
            const prices = trades.map(t => t.price).filter(p => p > 0);
            if (prices.length < 5) return false;

            const minPrice = Math.min(...prices);
            const maxPrice = Math.max(...prices);
            const volatility = (maxPrice - minPrice) / ((minPrice + maxPrice) / 2);

            return volatility < 0.005; // Less than 0.5% movement
        } catch {
            return false;
        }
    }

    /**
     * Check if position is stale (open too long)
     */
    private async isStalePosition(position: Position): Promise<boolean> {
        try {
            const trades = await executionEngine.getHistoricalTrades(position.symbol, 1);
            if (trades.length === 0) return false;

            const oldestTrade = trades[0];
            if (!oldestTrade.timestamp) return false;

            const ageMs = Date.now() - new Date(oldestTrade.timestamp).getTime();
            const ageHours = ageMs / (1000 * 60 * 60);

            return ageHours > 24; // Older than 24 hours
        } catch {
            return false;
        }
    }

    /**
     * Handle a position issue
     */
    private async handlePositionIssue(issue: PositionIssue, portfolio: Portfolio): Promise<void> {
        const { position, action } = issue;
        const positionKey = `${position.symbol}-${position.side}`;

        // Check recovery attempts
        const attempts = this.recoveryAttempts.get(positionKey) || 0;
        if (attempts >= this.maxRecoveryAttempts) {
            logger.error(`[PositionRecovery] Max recovery attempts reached for ${positionKey}`);
            return;
        }

        this.recoveryAttempts.set(positionKey, attempts + 1);

        logger.info(`[PositionRecovery] Handling ${action.type} for ${position.symbol} (${action.priority}): ${action.reason}`);

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
                logger.info(`[PositionRecovery] Waiting on ${position.symbol}: ${action.reason}`);
                break;
        }
    }

    /**
     * Close a position immediately
     */
    private async closePosition(position: Position, reason: string): Promise<void> {
        try {
            logger.warn(`[PositionRecovery] Closing position ${position.symbol}: ${reason}`);

            const signal: TradingSignal = {
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

            const riskAssessment: RiskAssessment = {
                approved: true,
                suggestedSize: Math.abs(position.size),
                riskScore: 0,
                warnings: ['Exit signal', 'Position recovery close'],
                stopLoss: 0,
                takeProfit: 0,
                leverage: position.leverage,
            };

            await executionEngine.executeSignal(signal, riskAssessment);
            logger.info(`[PositionRecovery] Successfully closed position ${position.symbol}`);

        } catch (error) {
            logger.error(`[PositionRecovery] Failed to close position ${position.symbol}:`, error);
        }
    }

    /**
     * Reduce position size by 50%
     */
    private async reducePosition(position: Position, portfolio: Portfolio, reason: string): Promise<void> {
        try {
            const newSize = Math.abs(position.size) * 0.5;

            logger.warn(`[PositionRecovery] Reducing position ${position.symbol} by 50%: ${reason}`);

            const signal: TradingSignal = {
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

            const riskAssessment: RiskAssessment = {
                approved: true,
                suggestedSize: newSize,
                riskScore: 0,
                warnings: ['Exit signal', 'Position recovery reduce'],
                stopLoss: 0,
                takeProfit: 0,
                leverage: position.leverage,
            };

            await executionEngine.executeSignal(signal, riskAssessment);
            logger.info(`[PositionRecovery] Successfully reduced position ${position.symbol} by 50%`);

        } catch (error) {
            logger.error(`[PositionRecovery] Failed to reduce position ${position.symbol}:`, error);
        }
    }

    /**
     * Hedge a position with opposite exposure
     */
    private async hedgePosition(position: Position, reason: string): Promise<void> {
        try {
            logger.warn(`[PositionRecovery] Hedging position ${position.symbol}: ${reason}`);

            // For now, just log - hedging requires more sophisticated logic
            logger.info(`[PositionRecovery] Hedge recommendation: ${position.side === 'LONG' ? 'SHORT' : 'LONG'} ${position.symbol}`);

        } catch (error) {
            logger.error(`[PositionRecovery] Failed to hedge position ${position.symbol}:`, error);
        }
    }

    /**
     * Send alert about position issue
     */
    private async sendAlert(position: Position, reason: string): Promise<void> {
        logger.error(`[PositionRecovery] ALERT: ${position.symbol} ${position.side} - ${reason}`);

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
    async recoverPosition(symbol: string, side: 'LONG' | 'SHORT', action: 'CLOSE' | 'REDUCE'): Promise<boolean> {
        try {
            const portfolio = await executionEngine.getPortfolio();
            const position = portfolio.positions.find(p => p.symbol === symbol && p.side === side);

            if (!position) {
                logger.error(`[PositionRecovery] Position not found: ${symbol} ${side}`);
                return false;
            }

            if (action === 'CLOSE') {
                await this.closePosition(position, 'Manual recovery');
            } else {
                await this.reducePosition(position, portfolio, 'Manual recovery');
            }

            return true;

        } catch (error) {
            logger.error(`[PositionRecovery] Manual recovery failed:`, error);
            return false;
        }
    }

    /**
     * Get recovery statistics
     */
    getStats(): {
        lastCheckTime: Date | null;
        recoveryAttempts: number;
        issueHistory: PositionIssue[];
        activeIssues: PositionIssue[];
    } {
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
    resetRecoveryAttempts(symbol: string, side: 'LONG' | 'SHORT'): void {
        const key = `${symbol}-${side}`;
        this.recoveryAttempts.delete(key);
        logger.info(`[PositionRecovery] Reset recovery attempts for ${key}`);
    }

    /**
     * Emergency close all positions
     */
    async emergencyCloseAll(): Promise<void> {
        try {
            logger.error('[PositionRecovery] EMERGENCY CLOSE ALL POSITIONS');

            const portfolio = await executionEngine.getPortfolio();

            for (const position of portfolio.positions) {
                await this.closePosition(position, 'EMERGENCY CLOSE ALL');
            }

        } catch (error) {
            logger.error('[PositionRecovery] Emergency close all failed:', error);
            throw error;
        }
    }
}

// Singleton instance
const positionRecovery = new PositionRecoveryService();

export default positionRecovery;
