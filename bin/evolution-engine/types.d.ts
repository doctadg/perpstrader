/**
 * Strategy Parameter Definitions
 * Defines the parameter space for genetic optimization
 */
export interface StrategyParameters {
    entryThresholds: {
        rsiOverbought: number;
        rsiOversold: number;
        emaFast: number;
        emaSlow: number;
        volumeThreshold: number;
        macdSignalThreshold: number;
    };
    riskParameters: {
        stopLoss: number;
        takeProfit: number;
        maxPositionSize: number;
        maxLeverage: number;
        trailingStop: number;
    };
    timingParameters: {
        timeframe: string;
        maxHoldTime: number;
        minHoldTime: number;
    };
    filterParameters: {
        minVolatility: number;
        maxVolatility: number;
        trendStrength: number;
        correlationThreshold: number;
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
export declare const PARAMETER_BOUNDS: Record<string, Record<string, ParameterBounds>>;
export declare const TIMEFRAME_OPTIONS: string[];
/**
 * Create a random strategy genome with random parameters
 */
export declare function createRandomGenome(generation?: number): StrategyGenome;
/**
 * Convert genome parameters to Strategy format
 */
export declare function genomeToStrategy(genome: StrategyGenome): any;
//# sourceMappingURL=types.d.ts.map