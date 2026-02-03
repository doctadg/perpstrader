/**
 * Fill Simulation Models
 *
 * Inspired by Nautilus Trader's fill simulation system.
 * Provides realistic order execution simulation for backtesting.
 *
 * Features:
 * - Market order simulation with slippage
 * - Limit order fill probability
 * - Order book depth simulation
 * - Latency modeling
 * - Commission calculation
 */
import { MarketData } from '../shared/types';
export interface OrderBook {
    symbol: string;
    bids: BookLevel[];
    asks: BookLevel[];
    timestamp: number;
    spread?: number;
    midPrice?: number;
}
export interface BookLevel {
    price: number;
    size: number;
}
export interface SimulatedOrder {
    orderId: string;
    symbol: string;
    side: 'BUY' | 'SELL';
    type: 'MARKET' | 'LIMIT' | 'STOP_MARKET' | 'STOP_LIMIT';
    quantity: number;
    price?: number;
    stopPrice?: number;
    timeInForce?: 'GTC' | 'IOC' | 'FOK' | 'ALO';
    reduceOnly?: boolean;
    timestamp: number;
}
export interface SimulatedFill {
    fillId: string;
    orderId: string;
    symbol: string;
    side: 'BUY' | 'SELL';
    quantity: number;
    price: number;
    commission: number;
    timestamp: number;
    liquiditySide: 'MAKER' | 'TAKER';
    slippage: number;
}
export interface FillModelConfig {
    /** Probability limit order fills (0-1) */
    limitFillProbability: number;
    /** Probability of slippage on market orders (0-1) */
    slippageProbability: number;
    /** Average slippage in basis points */
    avgSlippageBps: number;
    /** Base commission rate */
    commissionRate: number;
    /** Commission discount for maker orders */
    makerDiscount: number;
    /** Random seed for deterministic testing */
    randomSeed?: number;
}
export interface LatencyModelConfig {
    /** Base latency in milliseconds */
    baseLatencyMs: number;
    /** Latency variance (± ms) */
    latencyVarianceMs: number;
    /** Additional latency per order size */
    sizeLatencyFactor: number;
}
/**
 * Fill Model - Simulates order execution
 */
export declare class FillModel {
    private config;
    private rng;
    private latencyConfig;
    constructor(fillConfig?: Partial<FillModelConfig>, latencyConfig?: Partial<LatencyModelConfig>);
    /**
     * Simulate order execution
     */
    simulateFill(order: SimulatedOrder, book: OrderBook): SimulatedFill[];
    /**
     * Simulate market order execution with realistic fill simulation
     */
    private simulateMarketOrder;
    /**
     * Simulate limit order execution with probability-based fill
     */
    private simulateLimitOrder;
    /**
     * Check if stop order is triggered
     */
    private checkStopTrigger;
    /**
     * Calculate slippage for a fill
     */
    private calculateSlippage;
    /**
     * Calculate commission for a fill
     */
    private calculateCommission;
    /**
     * Calculate order latency
     */
    private calculateLatency;
    /**
     * Set random seed (for deterministic backtesting)
     */
    setSeed(seed: number): void;
}
/**
 * Order Book Builder - Creates simulated order books from market data
 */
export declare class OrderBookBuilder {
    /**
     * Build order book from market data
     */
    static fromMarketData(data: MarketData, depth?: number): OrderBook;
    /**
     * Update order book with new prices (simulate movement)
     */
    static updateBook(book: OrderBook, priceChange: number): OrderBook;
}
/**
 * Position Calculator - Calculates position changes from fills
 */
export declare class PositionCalculator {
    /**
     * Calculate position state after fills
     */
    static applyFills(currentQty: number, currentAvgPx: number, fills: SimulatedFill[]): {
        qty: number;
        avgPx: number;
        realizedPnL: number;
    };
    /**
     * Detect position zero crossing
     */
    static detectZeroCrossing(currentQty: number, fill: SimulatedFill): boolean;
}
export declare const FillModels: {
    /** Conservative fill model - less slippage, higher fill probability */
    CONSERVATIVE: FillModel;
    /** Standard fill model */
    STANDARD: FillModel;
    /** Aggressive fill model - more slippage, lower fill probability */
    AGGRESSIVE: FillModel;
};
export default FillModel;
//# sourceMappingURL=fill-models.d.ts.map