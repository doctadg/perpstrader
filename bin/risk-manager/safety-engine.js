"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const logger_1 = __importDefault(require("../shared/logger"));
class SafetyEngine {
    circuitBreakers;
    safetyRules;
    isEnabled;
    emergencyStopTriggered;
    config;
    constructor() {
        this.circuitBreakers = new Map();
        this.safetyRules = [];
        this.isEnabled = true;
        this.emergencyStopTriggered = false;
        this.config = {
            maxDailyLoss: 0.05,
            maxDrawdown: 0.15,
            maxPositionSize: 0.20,
            maxLeverage: 5,
            maxPositions: 3,
            volatilityThreshold: 0.05,
            liquidityThreshold: 0.02
        };
        this.initializeCircuitBreakers();
        this.initializeSafetyRules();
        logger_1.default.info('Safety Engine initialized');
    }
    initializeCircuitBreakers() {
        this.circuitBreakers.set('daily_loss', {
            id: 'daily_loss',
            type: 'DAILY_LOSS',
            triggered: false,
            threshold: this.config.maxDailyLoss,
            currentValue: 0,
            action: 'HALT_TRADING',
            triggeredAt: new Date(),
            resetAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
        });
        this.circuitBreakers.set('max_drawdown', {
            id: 'max_drawdown',
            type: 'MAX_DRAWDOWN',
            triggered: false,
            threshold: this.config.maxDrawdown,
            currentValue: 0,
            action: 'REDUCE_POSITIONS',
            triggeredAt: new Date(),
            resetAt: new Date(Date.now() + 4 * 60 * 60 * 1000)
        });
        this.circuitBreakers.set('volatility', {
            id: 'volatility',
            type: 'VOLATILITY',
            triggered: false,
            threshold: this.config.volatilityThreshold,
            currentValue: 0,
            action: 'REDUCE_LEVERAGE',
            triggeredAt: new Date(),
            resetAt: new Date(Date.now() + 30 * 60 * 1000)
        });
        this.circuitBreakers.set('liquidity', {
            id: 'liquidity',
            type: 'LIQUIDITY',
            triggered: false,
            threshold: this.config.liquidityThreshold,
            currentValue: 0,
            action: 'HALT_TRADING',
            triggeredAt: new Date(),
            resetAt: new Date(Date.now() + 60 * 60 * 1000)
        });
    }
    initializeSafetyRules() {
        this.safetyRules = [
            {
                id: 'max_position_count',
                name: 'Maximum Position Count',
                description: 'Ensure we never have more than 3 active positions',
                enabled: true,
                check: async () => {
                    const positions = await this.getPositionCount();
                    return positions >= this.config.maxPositions;
                },
                action: async () => {
                    logger_1.default.warn('Maximum position count reached, halting new entries');
                    await this.setTradingHalted(true);
                }
            },
            {
                id: 'position_size_limit',
                name: 'Position Size Limit',
                description: 'Ensure no single position exceeds 20% of capital',
                enabled: true,
                check: async () => {
                    const maxSize = await this.getMaxPositionSize();
                    return maxSize > this.config.maxPositionSize;
                },
                action: async () => {
                    logger_1.default.warn('Position size exceeds limit, reducing position');
                    await this.reduceLargestPosition();
                }
            },
            {
                id: 'leverage_limit',
                name: 'Leverage Limit',
                description: 'Ensure leverage never exceeds 5x',
                enabled: true,
                check: async () => {
                    const maxLeverage = await this.getMaxLeverage();
                    return maxLeverage > this.config.maxLeverage;
                },
                action: async () => {
                    logger_1.default.warn('Leverage exceeds limit, reducing leverage');
                    await this.reduceAllLeverage();
                }
            },
            {
                id: 'correlation_check',
                name: 'Correlation Check',
                description: 'Ensure positions are not all in same direction',
                enabled: true,
                check: async () => {
                    const positions = await this.getPositions();
                    const longs = positions.filter(p => p.side === 'LONG').length;
                    const shorts = positions.filter(p => p.side === 'SHORT').length;
                    return (longs === positions.length) || (shorts === positions.length);
                },
                action: async () => {
                    logger_1.default.warn('All positions in same direction, reducing exposure');
                    await this.reduceExposure();
                }
            }
        ];
    }
    async checkSafetyRules() {
        if (!this.isEnabled || this.emergencyStopTriggered) {
            return false;
        }
        let anyTriggered = false;
        for (const rule of this.safetyRules) {
            if (!rule.enabled)
                continue;
            try {
                const shouldTrigger = await rule.check();
                if (shouldTrigger) {
                    anyTriggered = true;
                    await rule.action();
                }
            }
            catch (error) {
                logger_1.default.error(`Error checking safety rule ${rule.id}:`, error);
            }
        }
        return anyTriggered;
    }
    async checkCircuitBreakers(dailyPnL, maxDrawdown) {
        const dailyLossBreaker = this.circuitBreakers.get('daily_loss');
        const drawdownBreaker = this.circuitBreakers.get('max_drawdown');
        const lossRatio = Math.abs(dailyPnL) / 1000;
        if (lossRatio >= dailyLossBreaker.threshold && !dailyLossBreaker.triggered) {
            dailyLossBreaker.triggered = true;
            dailyLossBreaker.currentValue = lossRatio;
            dailyLossBreaker.triggeredAt = new Date();
            logger_1.default.error(`DAILY LOSS CIRCUIT BREAKER TRIGGERED: ${lossRatio.toFixed(2)}%`);
            await this.executeCircuitBreaker(dailyLossBreaker);
            return true;
        }
        if (maxDrawdown >= drawdownBreaker.threshold && !drawdownBreaker.triggered) {
            drawdownBreaker.triggered = true;
            drawdownBreaker.currentValue = maxDrawdown;
            drawdownBreaker.triggeredAt = new Date();
            logger_1.default.error(`MAX DRAWDOWN CIRCUIT BREAKER TRIGGERED: ${maxDrawdown.toFixed(2)}%`);
            await this.executeCircuitBreaker(drawdownBreaker);
            return true;
        }
        return false;
    }
    async executeCircuitBreaker(breaker) {
        switch (breaker.action) {
            case 'HALT_TRADING':
                await this.emergencyStop();
                break;
            case 'REDUCE_POSITIONS':
                await this.reduceAllPositions(0.5);
                break;
            case 'REDUCE_LEVERAGE':
                await this.reduceAllLeverage();
                break;
            case 'CLOSE_ALL':
                await this.closeAllPositions();
                break;
        }
    }
    async resetCircuitBreaker(breakerId) {
        const breaker = this.circuitBreakers.get(breakerId);
        if (breaker) {
            breaker.triggered = false;
            breaker.currentValue = 0;
            breaker.triggeredAt = new Date();
            logger_1.default.info(`Circuit breaker ${breakerId} reset`);
        }
    }
    async emergencyStop() {
        this.emergencyStopTriggered = true;
        logger_1.default.error('EMERGENCY STOP TRIGGERED - Trading halted');
        await this.closeAllPositions();
        await this.setTradingHalted(true);
    }
    async resetEmergencyStop() {
        this.emergencyStopTriggered = false;
        await this.setTradingHalted(false);
        for (const breaker of this.circuitBreakers.values()) {
            breaker.triggered = false;
            breaker.currentValue = 0;
        }
        logger_1.default.info('Emergency stop reset, trading resumed');
    }
    async validateOrder(symbol, side, size, leverage) {
        if (this.emergencyStopTriggered) {
            return { approved: false, reason: 'Emergency stop is active' };
        }
        const positionCount = await this.getPositionCount();
        if (positionCount >= this.config.maxPositions) {
            return { approved: false, reason: `Maximum position count reached (${this.config.maxPositions})` };
        }
        if (size > this.config.maxPositionSize) {
            return { approved: false, reason: `Position size exceeds limit (${this.config.maxPositionSize})` };
        }
        if (leverage > this.config.maxLeverage) {
            return { approved: false, reason: `Leverage exceeds limit (${this.config.maxLeverage}x)` };
        }
        for (const breaker of this.circuitBreakers.values()) {
            if (breaker.triggered && breaker.action === 'HALT_TRADING') {
                return { approved: false, reason: `Circuit breaker active: ${breaker.type}` };
            }
        }
        return { approved: true };
    }
    getStatus() {
        return {
            enabled: this.isEnabled,
            emergencyStop: this.emergencyStopTriggered,
            activeCircuitBreakers: Array.from(this.circuitBreakers.values())
                .filter(b => b.triggered)
                .map(b => b.id),
            activeSafetyRules: this.safetyRules.filter(r => r.enabled).map(r => r.id)
        };
    }
    async getPositionCount() {
        return 0;
    }
    async getPositions() {
        return [];
    }
    async getMaxPositionSize() {
        return 0;
    }
    async getMaxLeverage() {
        return 0;
    }
    async reduceAllPositions(ratio) {
        logger_1.default.info(`Reducing all positions by ${(ratio * 100).toFixed(0)}%`);
    }
    async reduceLargestPosition() {
        logger_1.default.info('Reducing largest position');
    }
    async reduceAllLeverage() {
        logger_1.default.info('Reducing leverage on all positions');
    }
    async reduceExposure() {
        logger_1.default.info('Reducing overall exposure');
    }
    async closeAllPositions() {
        logger_1.default.info('Closing all positions');
    }
    async setTradingHalted(halted) {
        logger_1.default.info(`Trading ${halted ? 'halted' : 'resumed'}`);
    }
}
exports.default = new SafetyEngine();
//# sourceMappingURL=safety-engine.js.map