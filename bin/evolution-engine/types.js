"use strict";
/**
 * Strategy Parameter Definitions
 * Defines the parameter space for genetic optimization
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TIMEFRAME_OPTIONS = exports.PARAMETER_BOUNDS = void 0;
exports.createRandomGenome = createRandomGenome;
exports.genomeToStrategy = genomeToStrategy;
exports.PARAMETER_BOUNDS = {
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
exports.TIMEFRAME_OPTIONS = ['1m', '5m', '15m', '1h', '4h'];
/**
 * Create a random strategy genome with random parameters
 */
function createRandomGenome(generation = 0) {
    const { v4: uuidv4 } = require('uuid');
    const randomValue = (bounds) => {
        const value = bounds.min + Math.random() * (bounds.max - bounds.min);
        if (bounds.integer) {
            return Math.round(value);
        }
        if (bounds.step) {
            return Math.round(value / bounds.step) * bounds.step;
        }
        return value;
    };
    const params = {
        entryThresholds: {
            rsiOverbought: randomValue(exports.PARAMETER_BOUNDS.entryThresholds.rsiOverbought),
            rsiOversold: randomValue(exports.PARAMETER_BOUNDS.entryThresholds.rsiOversold),
            emaFast: randomValue(exports.PARAMETER_BOUNDS.entryThresholds.emaFast),
            emaSlow: randomValue(exports.PARAMETER_BOUNDS.entryThresholds.emaSlow),
            volumeThreshold: randomValue(exports.PARAMETER_BOUNDS.entryThresholds.volumeThreshold),
            macdSignalThreshold: randomValue(exports.PARAMETER_BOUNDS.entryThresholds.macdSignalThreshold),
        },
        riskParameters: {
            stopLoss: randomValue(exports.PARAMETER_BOUNDS.riskParameters.stopLoss),
            takeProfit: randomValue(exports.PARAMETER_BOUNDS.riskParameters.takeProfit),
            maxPositionSize: randomValue(exports.PARAMETER_BOUNDS.riskParameters.maxPositionSize),
            maxLeverage: randomValue(exports.PARAMETER_BOUNDS.riskParameters.maxLeverage),
            trailingStop: randomValue(exports.PARAMETER_BOUNDS.riskParameters.trailingStop),
        },
        timingParameters: {
            timeframe: exports.TIMEFRAME_OPTIONS[Math.floor(Math.random() * exports.TIMEFRAME_OPTIONS.length)],
            maxHoldTime: randomValue(exports.PARAMETER_BOUNDS.timingParameters.maxHoldTime),
            minHoldTime: randomValue(exports.PARAMETER_BOUNDS.timingParameters.minHoldTime),
        },
        filterParameters: {
            minVolatility: randomValue(exports.PARAMETER_BOUNDS.filterParameters.minVolatility),
            maxVolatility: randomValue(exports.PARAMETER_BOUNDS.filterParameters.maxVolatility),
            trendStrength: randomValue(exports.PARAMETER_BOUNDS.filterParameters.trendStrength),
            correlationThreshold: randomValue(exports.PARAMETER_BOUNDS.filterParameters.correlationThreshold),
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
function genomeToStrategy(genome) {
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
//# sourceMappingURL=types.js.map