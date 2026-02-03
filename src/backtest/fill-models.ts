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

import { v4 as uuidv4 } from 'uuid';
import { MarketData } from '../shared/types';

export interface OrderBook {
    symbol: string;
    bids: BookLevel[]; // [[price, size], ...]
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
 * Simple seeded random number generator for deterministic backtesting
 */
class SeededRNG {
    private seed: number;

    constructor(seed: number) {
        this.seed = seed;
    }

    next(): number {
        // Mulberry32 algorithm
        let t = this.seed += 0x6D2B79F5;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    nextGaussian(): number {
        // Box-Muller transform
        const u1 = this.next();
        const u2 = this.next();
        const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        return z0;
    }
}

/**
 * Fill Model - Simulates order execution
 */
export class FillModel {
    private config: FillModelConfig;
    private rng: SeededRNG;
    private latencyConfig: LatencyModelConfig;

    constructor(
        fillConfig: Partial<FillModelConfig> = {},
        latencyConfig: Partial<LatencyModelConfig> = {}
    ) {
        this.config = {
            limitFillProbability: fillConfig.limitFillProbability ?? 0.5,
            slippageProbability: fillConfig.slippageProbability ?? 0.3,
            avgSlippageBps: fillConfig.avgSlippageBps ?? 5,
            commissionRate: fillConfig.commissionRate ?? 0.0005, // 0.05%
            makerDiscount: fillConfig.makerDiscount ?? 0.0002, // 0.02%
            randomSeed: fillConfig.randomSeed ?? Date.now(),
        };

        this.rng = new SeededRNG(this.config.randomSeed ?? Date.now());

        this.latencyConfig = {
            baseLatencyMs: latencyConfig.baseLatencyMs ?? 10,
            latencyVarianceMs: latencyConfig.latencyVarianceMs ?? 5,
            sizeLatencyFactor: latencyConfig.sizeLatencyFactor ?? 0.001,
        };
    }

    /**
     * Simulate order execution
     */
    simulateFill(order: SimulatedOrder, book: OrderBook): SimulatedFill[] {
        const fills: SimulatedFill[] = [];

        // Check stop trigger first
        if (order.type === 'STOP_MARKET' || order.type === 'STOP_LIMIT') {
            const triggered = this.checkStopTrigger(order, book);
            if (!triggered) {
                return fills; // Stop not triggered yet
            }
        }

        switch (order.type) {
            case 'MARKET':
            case 'STOP_MARKET':
                return this.simulateMarketOrder(order, book);

            case 'LIMIT':
            case 'STOP_LIMIT':
                return this.simulateLimitOrder(order, book);
        }

        return fills;
    }

    /**
     * Simulate market order execution with realistic fill simulation
     */
    private simulateMarketOrder(order: SimulatedOrder, book: OrderBook): SimulatedFill[] {
        const fills: SimulatedFill[] = [];
        const side = order.side === 'BUY' ? 'asks' : 'bids';
        const levels = [...book[side]].sort((a, b) =>
            order.side === 'BUY' ? a.price - b.price : b.price - a.price
        );

        let remainingQty = order.quantity;
        const executions: { price: number; qty: number }[] = [];

        // Walk through the book filling orders
        for (const level of levels) {
            if (remainingQty <= 0) break;

            const fillQty = Math.min(remainingQty, level.size);
            executions.push({ price: level.price, qty: fillQty });
            remainingQty -= fillQty;
        }

        // Calculate average price
        let totalValue = 0;
        let totalQty = 0;
        for (const exec of executions) {
            totalValue += exec.price * exec.qty;
            totalQty += exec.qty;
        }
        const avgPrice = totalQty > 0 ? totalValue / totalQty : book.midPrice || 0;

        // Apply slippage
        const slippage = this.calculateSlippage(avgPrice, order.side);
        const finalAvgPrice = avgPrice + slippage;

        // Generate fill
        if (totalQty > 0) {
            const commission = this.calculateCommission(finalAvgPrice, totalQty, 'TAKER');

            fills.push({
                fillId: uuidv4(),
                orderId: order.orderId,
                symbol: order.symbol,
                side: order.side,
                quantity: totalQty,
                price: finalAvgPrice,
                commission,
                timestamp: order.timestamp + this.calculateLatency(totalQty),
                liquiditySide: 'TAKER',
                slippage,
            });
        }

        return fills;
    }

    /**
     * Simulate limit order execution with probability-based fill
     */
    private simulateLimitOrder(order: SimulatedOrder, book: OrderBook): SimulatedFill[] {
        const fills: SimulatedFill[] = [];

        if (!order.price) {
            return fills;
        }

        const side = order.side === 'BUY' ? 'asks' : 'bids';
        const levels = book[side];

        // Check if order would be filled immediately
        let wouldFill = false;
        let fillPrice = order.price;

        if (order.side === 'BUY') {
            // Buy order fills if price >= best ask
            const bestAsk = levels.length > 0 ? levels[0].price : Infinity;
            wouldFill = order.price >= bestAsk;
            fillPrice = wouldFill ? bestAsk : order.price;
        } else {
            // Sell order fills if price <= best bid
            const bestBid = book.bids.length > 0 ? book.bids[0].price : 0;
            wouldFill = order.price <= bestBid;
            fillPrice = wouldFill ? bestBid : order.price;
        }

        // Use probability to determine if limit order fills
        if (wouldFill || this.rng.next() < this.config.limitFillProbability) {
            const commission = this.calculateCommission(fillPrice, order.quantity, 'MAKER');
            const slippage = this.calculateSlippage(fillPrice, order.side);

            fills.push({
                fillId: uuidv4(),
                orderId: order.orderId,
                symbol: order.symbol,
                side: order.side,
                quantity: order.quantity,
                price: fillPrice + slippage,
                commission,
                timestamp: order.timestamp + this.calculateLatency(order.quantity),
                liquiditySide: 'MAKER',
                slippage,
            });
        }

        // Handle IOC (Immediate-or-Cancel) - unfilled portion is cancelled
        // Handle FOK (Fill-or-Kill) - either fill entirely or cancel

        return fills;
    }

    /**
     * Check if stop order is triggered
     */
    private checkStopTrigger(order: SimulatedOrder, book: OrderBook): boolean {
        if (!order.stopPrice) return false;

        if (order.side === 'BUY') {
            // Buy stop triggers when ask >= stop price
            const bestAsk = book.asks.length > 0 ? book.asks[0].price : 0;
            return bestAsk >= order.stopPrice;
        } else {
            // Sell stop triggers when bid <= stop price
            const bestBid = book.bids.length > 0 ? book.bids[0].price : Infinity;
            return bestBid <= order.stopPrice;
        }
    }

    /**
     * Calculate slippage for a fill
     */
    private calculateSlippage(price: number, side: 'BUY' | 'SELL'): number {
        if (this.rng.next() > this.config.slippageProbability) {
            return 0;
        }

        // Normal distribution centered at avgSlippageBps
        const slippageBps = this.config.avgSlippageBps * (0.5 + Math.abs(this.rng.nextGaussian()));
        const slippagePct = slippageBps / 10000;

        // Slippage is worse for the trader (higher for buys, lower for sells)
        const direction = side === 'BUY' ? 1 : -1;
        return price * slippagePct * direction;
    }

    /**
     * Calculate commission for a fill
     */
    private calculateCommission(price: number, quantity: number, liquiditySide: 'MAKER' | 'TAKER'): number {
        const rate = liquiditySide === 'MAKER'
            ? this.config.commissionRate - this.config.makerDiscount
            : this.config.commissionRate;

        return price * quantity * Math.max(0, rate);
    }

    /**
     * Calculate order latency
     */
    private calculateLatency(quantity: number): number {
        const baseLatency = this.latencyConfig.baseLatencyMs;
        const variance = this.latencyConfig.latencyVarianceMs;
        const sizeDelay = quantity * this.latencyConfig.sizeLatencyFactor;

        const randomOffset = (this.rng.next() - 0.5) * 2 * variance;

        return Math.max(0, baseLatency + sizeDelay + randomOffset);
    }

    /**
     * Set random seed (for deterministic backtesting)
     */
    setSeed(seed: number): void {
        this.config.randomSeed = seed;
        this.rng = new SeededRNG(seed);
    }
}

/**
 * Order Book Builder - Creates simulated order books from market data
 */
export class OrderBookBuilder {
    /**
     * Build order book from market data
     */
    static fromMarketData(data: MarketData, depth: number = 10): OrderBook {
        const midPrice = ((data.bid ?? data.close) + (data.ask ?? data.close)) / 2;
        const spread = (data.ask && data.bid) ? data.ask - data.bid : midPrice * 0.0001;

        const bids: BookLevel[] = [];
        const asks: BookLevel[] = [];

        // Simulate order book depth
        for (let i = 0; i < depth; i++) {
            const bidPrice = midPrice - (spread / 2) - (i * spread * 0.5);
            const askPrice = midPrice + (spread / 2) + (i * spread * 0.5);

            // Size decreases with distance from mid
            const size = 10000 * Math.exp(-i * 0.3);

            if (bidPrice > 0) {
                bids.push({ price: bidPrice, size });
            }
            asks.push({ price: askPrice, size });
        }

        return {
            symbol: data.symbol,
            bids,
            asks,
            timestamp: data.timestamp.getTime(),
            spread,
            midPrice,
        };
    }

    /**
     * Update order book with new prices (simulate movement)
     */
    static updateBook(book: OrderBook, priceChange: number): OrderBook {
        const newBids = book.bids.map(level => ({
            price: level.price + priceChange,
            size: level.size,
        }));

        const newAsks = book.asks.map(level => ({
            price: level.price + priceChange,
            size: level.size,
        }));

        return {
            ...book,
            bids: newBids,
            asks: newAsks,
            timestamp: Date.now(),
        };
    }
}

/**
 * Position Calculator - Calculates position changes from fills
 */
export class PositionCalculator {
    /**
     * Calculate position state after fills
     */
    static applyFills(
        currentQty: number,
        currentAvgPx: number,
        fills: SimulatedFill[]
    ): {
        qty: number;
        avgPx: number;
        realizedPnL: number;
    } {
        let qty = currentQty;
        let avgPx = currentAvgPx;
        let realizedPnL = 0;

        for (const fill of fills) {
            const fillQty = fill.side === 'BUY' ? fill.quantity : -fill.quantity;
            const newQty = qty + fillQty;

            if (qty >= 0 && newQty >= 0) {
                // Adding to long or reducing long
                if (fillQty > 0) {
                    // Adding to long
                    avgPx = qty > 0
                        ? (avgPx * qty + fill.price * fillQty) / newQty
                        : fill.price;
                } else {
                    // Reducing long - realize PnL
                    realizedPnL += (fill.price - avgPx) * Math.abs(fillQty);
                }
            } else if (qty <= 0 && newQty <= 0) {
                // Adding to short or reducing short
                if (fillQty < 0) {
                    // Adding to short
                    avgPx = qty < 0
                        ? (avgPx * Math.abs(qty) + fill.price * Math.abs(fillQty)) / Math.abs(newQty)
                        : fill.price;
                } else {
                    // Reducing short - realize PnL
                    realizedPnL += (avgPx - fill.price) * Math.abs(fillQty);
                }
            } else {
                // Position flip - close entire position and open new one
                if (qty > 0) {
                    realizedPnL += (fill.price - avgPx) * qty;
                } else {
                    realizedPnL += (avgPx - fill.price) * Math.abs(qty);
                }
                avgPx = fill.price;
            }

            qty = newQty;
        }

        return {
            qty: Math.abs(qty),
            avgPx,
            realizedPnL,
        };
    }

    /**
     * Detect position zero crossing
     */
    static detectZeroCrossing(
        currentQty: number,
        fill: SimulatedFill
    ): boolean {
        const fillQty = fill.side === 'BUY' ? fill.quantity : -fill.quantity;
        const newQty = currentQty + fillQty;
        return (currentQty > 0 && newQty < 0) || (currentQty < 0 && newQty > 0);
    }
}

// Pre-configured fill models for different use cases
export const FillModels = {
    /** Conservative fill model - less slippage, higher fill probability */
    CONSERVATIVE: new FillModel(
        {
            limitFillProbability: 0.7,
            slippageProbability: 0.2,
            avgSlippageBps: 2,
        },
        {
            baseLatencyMs: 5,
            latencyVarianceMs: 2,
        }
    ),

    /** Standard fill model */
    STANDARD: new FillModel(
        {
            limitFillProbability: 0.5,
            slippageProbability: 0.3,
            avgSlippageBps: 5,
        },
        {
            baseLatencyMs: 10,
            latencyVarianceMs: 5,
        }
    ),

    /** Aggressive fill model - more slippage, lower fill probability */
    AGGRESSIVE: new FillModel(
        {
            limitFillProbability: 0.3,
            slippageProbability: 0.5,
            avgSlippageBps: 10,
        },
        {
            baseLatencyMs: 20,
            latencyVarianceMs: 10,
        }
    ),
};

export default FillModel;
