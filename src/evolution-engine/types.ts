/**
 * Strategy Parameter Definitions
 * Defines the parameter space for genetic optimization
 */

export interface StrategyParameters {
  // Entry threshold parameters
  entryThresholds: {
    rsiOverbought: number;      // 60-90
    rsiOversold: number;        // 10-40
    emaFast: number;            // 3-20
    emaSlow: number;            // 10-50
    volumeThreshold: number;    // 1.0-3.0
    macdSignalThreshold: number;// 0.0-0.5
  };
  
  // Risk parameters
  riskParameters: {
    stopLoss: number;           // 0.005-0.05 (0.5% - 5%)
    takeProfit: number;         // 0.01-0.10 (1% - 10%)
    maxPositionSize: number;    // 0.01-0.20 (1% - 20% of portfolio)
    maxLeverage: number;        // 1-10
    trailingStop: number;       // 0.0-0.03 (0% - 3%)
  };
  
  // Timeframe and holding parameters
  timingParameters: {
    timeframe: string;          // '1m', '5m', '15m', '1h', '4h'
    maxHoldTime: number;        // Minutes: 5-1440
    minHoldTime: number;        // Minutes: 1-60
  };
  
  // Filter parameters
  filterParameters: {
    minVolatility: number;      // 0.005-0.05
    maxVolatility: number;      // 0.01-0.15
    trendStrength: number;      // 0.0-1.0
    correlationThreshold: number;// -1.0 to 1.0
  };
}

export interface StrategyGenome {
  id: string;
  parentIds: string[];
  generation: number;
  parameters: StrategyParameters;
  fitness?: number;
  sharpeRatio?: number;
  totalReturn?: number;
  maxDrawdown?: number;
  winRate?: number;
  totalTrades?: number;
  createdAt: Date;
  backtestResult?: any;
}

export interface ParameterBounds {
  min: number;
  max: number;
  step?: number;
  integer?: boolean;
}

export const PARAMETER_BOUNDS: Record<string, Record<string, ParameterBounds>> = {
  entryThresholds: {
    rsiOverbought: { min: 60, max: 90, step: 1, integer: true },
    rsiOversold: { min: 10, max: 40, step: 1, integer: true },
    emaFast: { min: 3, max: 20, step: 1, integer: true },
    emaSlow: { min: 10, max: 50, step: 1, integer: true },
    volumeThreshold: { min: 1.0, max: 3.0, step: 0.1 },
    macdSignalThreshold: { min: 0.0, max: 0.5, step: 0.01 },
  },
  riskParameters: {
    stopLoss: { min: 0.005, max: 0.05, step: 0.001 },
    takeProfit: { min: 0.01, max: 0.10, step: 0.005 },
    maxPositionSize: { min: 0.01, max: 0.20, step: 0.01 },
    maxLeverage: { min: 1, max: 10, step: 1, integer: true },
    trailingStop: { min: 0.0, max: 0.03, step: 0.001 },
  },
  timingParameters: {
    maxHoldTime: { min: 5, max: 1440, step: 5, integer: true },
    minHoldTime: { min: 1, max: 60, step: 1, integer: true },
  },
  filterParameters: {
    minVolatility: { min: 0.005, max: 0.05, step: 0.001 },
    maxVolatility: { min: 0.01, max: 0.15, step: 0.005 },
    trendStrength: { min: 0.0, max: 1.0, step: 0.05 },
    correlationThreshold: { min: -1.0, max: 1.0, step: 0.1 },
  },
};

export const TIMEFRAME_OPTIONS = ['1m', '5m', '15m', '1h', '4h'];

/**
 * Create a random strategy genome with random parameters
 */
export function createRandomGenome(generation: number = 0): StrategyGenome {
  const { v4: uuidv4 } = require('uuid');
  
  const randomValue = (bounds: ParameterBounds): number => {
    const value = bounds.min + Math.random() * (bounds.max - bounds.min);
    if (bounds.integer) {
      return Math.round(value);
    }
    if (bounds.step) {
      return Math.round(value / bounds.step) * bounds.step;
    }
    return value;
  };
  
  const params: StrategyParameters = {
    entryThresholds: {
      rsiOverbought: randomValue(PARAMETER_BOUNDS.entryThresholds.rsiOverbought),
      rsiOversold: randomValue(PARAMETER_BOUNDS.entryThresholds.rsiOversold),
      emaFast: randomValue(PARAMETER_BOUNDS.entryThresholds.emaFast),
      emaSlow: randomValue(PARAMETER_BOUNDS.entryThresholds.emaSlow),
      volumeThreshold: randomValue(PARAMETER_BOUNDS.entryThresholds.volumeThreshold),
      macdSignalThreshold: randomValue(PARAMETER_BOUNDS.entryThresholds.macdSignalThreshold),
    },
    riskParameters: {
      stopLoss: randomValue(PARAMETER_BOUNDS.riskParameters.stopLoss),
      takeProfit: randomValue(PARAMETER_BOUNDS.riskParameters.takeProfit),
      maxPositionSize: randomValue(PARAMETER_BOUNDS.riskParameters.maxPositionSize),
      maxLeverage: randomValue(PARAMETER_BOUNDS.riskParameters.maxLeverage),
      trailingStop: randomValue(PARAMETER_BOUNDS.riskParameters.trailingStop),
    },
    timingParameters: {
      timeframe: TIMEFRAME_OPTIONS[Math.floor(Math.random() * TIMEFRAME_OPTIONS.length)],
      maxHoldTime: randomValue(PARAMETER_BOUNDS.timingParameters.maxHoldTime),
      minHoldTime: randomValue(PARAMETER_BOUNDS.timingParameters.minHoldTime),
    },
    filterParameters: {
      minVolatility: randomValue(PARAMETER_BOUNDS.filterParameters.minVolatility),
      maxVolatility: randomValue(PARAMETER_BOUNDS.filterParameters.maxVolatility),
      trendStrength: randomValue(PARAMETER_BOUNDS.filterParameters.trendStrength),
      correlationThreshold: randomValue(PARAMETER_BOUNDS.filterParameters.correlationThreshold),
    },
  };
  
  // Ensure consistency
  if (params.entryThresholds.emaFast >= params.entryThresholds.emaSlow) {
    params.entryThresholds.emaSlow = params.entryThresholds.emaFast + 5;
  }
  if (params.filterParameters.minVolatility >= params.filterParameters.maxVolatility) {
    params.filterParameters.maxVolatility = params.filterParameters.minVolatility + 0.01;
  }
  if (params.timingParameters.minHoldTime >= params.timingParameters.maxHoldTime) {
    params.timingParameters.maxHoldTime = params.timingParameters.minHoldTime + 10;
  }
  
  return {
    id: uuidv4(),
    parentIds: [],
    generation,
    parameters: params,
    createdAt: new Date(),
  };
}

/**
 * Convert genome parameters to Strategy format
 */
export function genomeToStrategy(genome: StrategyGenome): any {
  const { v4: uuidv4 } = require('uuid');
  
  return {
    id: genome.id,
    name: `Evolved Strategy Gen${genome.generation}-${genome.id.slice(0, 8)}`,
    description: `Genetically evolved strategy from generation ${genome.generation}`,
    type: 'TREND_FOLLOWING',
    symbols: ['BTC', 'ETH', 'SOL'],
    timeframe: genome.parameters.timingParameters.timeframe,
    parameters: {
      ...genome.parameters.entryThresholds,
      ...genome.parameters.filterParameters,
      maxHoldTime: genome.parameters.timingParameters.maxHoldTime,
      minHoldTime: genome.parameters.timingParameters.minHoldTime,
    },
    entryConditions: [
      `RSI crosses above ${genome.parameters.entryThresholds.rsiOversold}`,
      `RSI crosses below ${genome.parameters.entryThresholds.rsiOverbought}`,
      `Volume > ${genome.parameters.entryThresholds.volumeThreshold}x average`,
      `Fast EMA (${genome.parameters.entryThresholds.emaFast}) crosses Slow EMA (${genome.parameters.entryThresholds.emaSlow})`,
    ],
    exitConditions: [
      `Stop loss ${(genome.parameters.riskParameters.stopLoss * 100).toFixed(1)}%`,
      `Take profit ${(genome.parameters.riskParameters.takeProfit * 100).toFixed(1)}%`,
      `Max hold time ${genome.parameters.timingParameters.maxHoldTime} minutes`,
      genome.parameters.riskParameters.trailingStop > 0 
        ? `Trailing stop ${(genome.parameters.riskParameters.trailingStop * 100).toFixed(1)}%`
        : 'No trailing stop',
    ],
    riskParameters: {
      maxPositionSize: genome.parameters.riskParameters.maxPositionSize,
      stopLoss: genome.parameters.riskParameters.stopLoss,
      takeProfit: genome.parameters.riskParameters.takeProfit,
      maxLeverage: genome.parameters.riskParameters.maxLeverage,
      trailingStop: genome.parameters.riskParameters.trailingStop,
    },
    isActive: false,
    performance: {
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRate: 0,
      totalPnL: 0,
      sharpeRatio: 0,
      maxDrawdown: 0,
      averageWin: 0,
      averageLoss: 0,
      profitFactor: 0,
    },
    createdAt: genome.createdAt,
    updatedAt: new Date(),
  };
}
