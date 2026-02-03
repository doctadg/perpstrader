"use strict";
// Prediction Market Execution Engine (Paper Trading)
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const uuid_1 = require("uuid");
const prediction_store_1 = __importDefault(require("../data/prediction-store"));
const logger_1 = __importDefault(require("../shared/logger"));
class PredictionExecutionEngine {
    initialBalance;
    cashBalance;
    realizedPnL = 0;
    positions = new Map();
    currentPrices = new Map();
    constructor() {
        this.initialBalance = Number.parseFloat(process.env.PREDICTION_PAPER_BALANCE || '10000');
        this.cashBalance = this.initialBalance;
    }
    updateMarketPrice(marketId, yesPrice, noPrice) {
        const existing = this.currentPrices.get(marketId) || {};
        this.currentPrices.set(marketId, {
            yesPrice: Number.isFinite(yesPrice) ? yesPrice : existing.yesPrice,
            noPrice: Number.isFinite(noPrice) ? noPrice : existing.noPrice,
        });
        for (const position of this.positions.values()) {
            if (position.marketId !== marketId)
                continue;
            const snapshot = this.currentPrices.get(marketId);
            const lastPrice = position.outcome === 'YES' ? snapshot?.yesPrice : snapshot?.noPrice;
            if (Number.isFinite(lastPrice)) {
                position.lastPrice = lastPrice;
                position.unrealizedPnL = (position.lastPrice - position.averagePrice) * position.shares;
                prediction_store_1.default.upsertPosition(position);
            }
        }
    }
    async executeSignal(signal, risk, marketTitle) {
        if (signal.action === 'HOLD') {
            throw new Error('Cannot execute HOLD signal');
        }
        const price = signal.price;
        if (!Number.isFinite(price) || price <= 0) {
            throw new Error('Invalid price for prediction trade');
        }
        const shares = risk.suggestedSizeUsd / price;
        const key = `${signal.marketId}:${signal.outcome}`;
        const existing = this.positions.get(key);
        let pnl = 0;
        if (signal.action === 'BUY') {
            const cost = shares * price;
            if (cost > this.cashBalance) {
                throw new Error(`Insufficient balance: need $${cost.toFixed(2)}, have $${this.cashBalance.toFixed(2)}`);
            }
            if (existing) {
                const totalCost = existing.averagePrice * existing.shares + cost;
                const totalShares = existing.shares + shares;
                existing.averagePrice = totalCost / totalShares;
                existing.shares = totalShares;
                existing.lastPrice = price;
                existing.unrealizedPnL = (price - existing.averagePrice) * existing.shares;
                this.positions.set(key, existing);
                prediction_store_1.default.upsertPosition(existing);
            }
            else {
                const position = {
                    marketId: signal.marketId,
                    marketTitle,
                    outcome: signal.outcome,
                    shares,
                    averagePrice: price,
                    lastPrice: price,
                    unrealizedPnL: 0,
                    openedAt: new Date(),
                };
                this.positions.set(key, position);
                prediction_store_1.default.upsertPosition(position);
            }
            this.cashBalance -= cost;
        }
        else if (signal.action === 'SELL') {
            if (!existing) {
                throw new Error('No open position to sell');
            }
            const sellShares = Math.min(shares, existing.shares);
            pnl = (price - existing.averagePrice) * sellShares;
            this.realizedPnL += pnl;
            this.cashBalance += sellShares * price;
            existing.shares -= sellShares;
            existing.lastPrice = price;
            existing.unrealizedPnL = existing.shares > 0
                ? (price - existing.averagePrice) * existing.shares
                : 0;
            if (existing.shares <= 0) {
                this.positions.delete(key);
                prediction_store_1.default.removePosition(signal.marketId, signal.outcome);
            }
            else {
                this.positions.set(key, existing);
                prediction_store_1.default.upsertPosition(existing);
            }
        }
        const trade = {
            id: (0, uuid_1.v4)(),
            marketId: signal.marketId,
            marketTitle,
            outcome: signal.outcome,
            side: signal.action,
            shares,
            price,
            fee: price * shares * 0.001,
            pnl,
            timestamp: new Date(),
            status: 'FILLED',
            reason: signal.reason,
        };
        prediction_store_1.default.storeTrade(trade);
        logger_1.default.info(`[PredictionExecution] ${signal.action} ${shares.toFixed(2)} ${signal.outcome} @ ${price.toFixed(3)} (${marketTitle})`);
        return trade;
    }
    getPortfolio() {
        let positionValue = 0;
        let costBasis = 0;
        let unrealized = 0;
        for (const position of this.positions.values()) {
            const lastPrice = position.lastPrice || position.averagePrice;
            positionValue += position.shares * lastPrice;
            costBasis += position.shares * position.averagePrice;
            unrealized += (lastPrice - position.averagePrice) * position.shares;
        }
        return {
            totalValue: this.cashBalance + positionValue,
            availableBalance: this.cashBalance,
            usedBalance: costBasis,
            realizedPnL: this.realizedPnL,
            unrealizedPnL: unrealized,
            positions: Array.from(this.positions.values()),
        };
    }
    getPositions() {
        return Array.from(this.positions.values());
    }
}
const predictionExecutionEngine = new PredictionExecutionEngine();
exports.default = predictionExecutionEngine;
//# sourceMappingURL=execution-engine.js.map