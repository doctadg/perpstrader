import logger from '../shared/logger';
import { Trade, Position, Strategy } from '../shared/types';

interface CircuitBreaker {
  id: string;
  type: 'DAILY_LOSS' | 'MAX_DRAWDOWN' | 'VOLATILITY' | 'CORRELATION' | 'LIQUIDITY';
  triggered: boolean;
  threshold: number;
  currentValue: number;
  action: 'REDUCE_POSITIONS' | 'HALT_TRADING' | 'REDUCE_LEVERAGE' | 'CLOSE_ALL';
  triggeredAt: Date;
  resetAt: Date;
}

interface SafetyRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  check: () => Promise<boolean>;
  action: () => Promise<void>;
}

class SafetyEngine {
  private circuitBreakers: Map<string, CircuitBreaker>;
  private safetyRules: SafetyRule[];
  private isEnabled: boolean;
  private emergencyStopTriggered: boolean;

  private config: {
    maxDailyLoss: number;
    maxDrawdown: number;
    maxPositionSize: number;
    maxLeverage: number;
    maxPositions: number;
    volatilityThreshold: number;
    liquidityThreshold: number;
  };

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

    logger.info('Safety Engine initialized');
  }

  private initializeCircuitBreakers(): void {
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

  private initializeSafetyRules(): void {
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
          logger.warn('Maximum position count reached, halting new entries');
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
          logger.warn('Position size exceeds limit, reducing position');
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
          logger.warn('Leverage exceeds limit, reducing leverage');
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
          logger.warn('All positions in same direction, reducing exposure');
          await this.reduceExposure();
        }
      }
    ];
  }

  async checkSafetyRules(): Promise<boolean> {
    if (!this.isEnabled || this.emergencyStopTriggered) {
      return false;
    }

    let anyTriggered = false;

    for (const rule of this.safetyRules) {
      if (!rule.enabled) continue;

      try {
        const shouldTrigger = await rule.check();
        if (shouldTrigger) {
          anyTriggered = true;
          await rule.action();
        }
      } catch (error) {
        logger.error(`Error checking safety rule ${rule.id}:`, error);
      }
    }

    return anyTriggered;
  }

  async checkCircuitBreakers(dailyPnL: number, maxDrawdown: number): Promise<boolean> {
    const dailyLossBreaker = this.circuitBreakers.get('daily_loss')!;
    const drawdownBreaker = this.circuitBreakers.get('max_drawdown')!;

    const lossRatio = Math.abs(dailyPnL) / 1000;

    if (lossRatio >= dailyLossBreaker.threshold && !dailyLossBreaker.triggered) {
      dailyLossBreaker.triggered = true;
      dailyLossBreaker.currentValue = lossRatio;
      dailyLossBreaker.triggeredAt = new Date();
      
      logger.error(`DAILY LOSS CIRCUIT BREAKER TRIGGERED: ${lossRatio.toFixed(2)}%`);
      await this.executeCircuitBreaker(dailyLossBreaker);
      return true;
    }

    if (maxDrawdown >= drawdownBreaker.threshold && !drawdownBreaker.triggered) {
      drawdownBreaker.triggered = true;
      drawdownBreaker.currentValue = maxDrawdown;
      drawdownBreaker.triggeredAt = new Date();

      logger.error(`MAX DRAWDOWN CIRCUIT BREAKER TRIGGERED: ${maxDrawdown.toFixed(2)}%`);
      await this.executeCircuitBreaker(drawdownBreaker);
      return true;
    }

    return false;
  }

  private async executeCircuitBreaker(breaker: CircuitBreaker): Promise<void> {
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

  async resetCircuitBreaker(breakerId: string): Promise<void> {
    const breaker = this.circuitBreakers.get(breakerId);
    if (breaker) {
      breaker.triggered = false;
      breaker.currentValue = 0;
      breaker.triggeredAt = new Date();
      logger.info(`Circuit breaker ${breakerId} reset`);
    }
  }

  async emergencyStop(): Promise<void> {
    this.emergencyStopTriggered = true;
    logger.error('EMERGENCY STOP TRIGGERED - Trading halted');

    await this.closeAllPositions();
    await this.setTradingHalted(true);
  }

  async resetEmergencyStop(): Promise<void> {
    this.emergencyStopTriggered = false;
    await this.setTradingHalted(false);

    for (const breaker of this.circuitBreakers.values()) {
      breaker.triggered = false;
      breaker.currentValue = 0;
    }

    logger.info('Emergency stop reset, trading resumed');
  }

  async validateOrder(
    symbol: string,
    side: 'BUY' | 'SELL',
    size: number,
    leverage: number
  ): Promise<{ approved: boolean; reason?: string }> {
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

  getStatus(): {
    enabled: boolean;
    emergencyStop: boolean;
    activeCircuitBreakers: string[];
    activeSafetyRules: string[];
  } {
    return {
      enabled: this.isEnabled,
      emergencyStop: this.emergencyStopTriggered,
      activeCircuitBreakers: Array.from(this.circuitBreakers.values())
        .filter(b => b.triggered)
        .map(b => b.id),
      activeSafetyRules: this.safetyRules.filter(r => r.enabled).map(r => r.id)
    };
  }

  private async getPositionCount(): Promise<number> {
    return 0;
  }

  private async getPositions(): Promise<Position[]> {
    return [];
  }

  private async getMaxPositionSize(): Promise<number> {
    return 0;
  }

  private async getMaxLeverage(): Promise<number> {
    return 0;
  }

  private async reduceAllPositions(ratio: number): Promise<void> {
    logger.info(`Reducing all positions by ${(ratio * 100).toFixed(0)}%`);
  }

  private async reduceLargestPosition(): Promise<void> {
    logger.info('Reducing largest position');
  }

  private async reduceAllLeverage(): Promise<void> {
    logger.info('Reducing leverage on all positions');
  }

  private async reduceExposure(): Promise<void> {
    logger.info('Reducing overall exposure');
  }

  private async closeAllPositions(): Promise<void> {
    logger.info('Closing all positions');
  }

  private async setTradingHalted(halted: boolean): Promise<void> {
    logger.info(`Trading ${halted ? 'halted' : 'resumed'}`);
  }
}

export default new SafetyEngine();
