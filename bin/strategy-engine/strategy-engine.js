"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StrategyEngine = void 0;
const uuid_1 = require("uuid");
const ta_module_1 = __importDefault(require("../ta-module/ta-module"));
const glm_service_1 = __importDefault(require("../shared/glm-service"));
const logger_1 = __importDefault(require("../shared/logger"));
class StrategyEngine {
    strategies = new Map();
    async brainstormStrategies(research) {
        try {
            logger_1.default.info(`Brainstorming strategies based on research: ${research.topic}`);
            let strategies = [];
            // Try to generate strategies using GLM 4.6 first
            try {
                const glmStrategies = await glm_service_1.default.generateTradingStrategies(research);
                if (glmStrategies.length > 0) {
                    strategies.push(...glmStrategies);
                    logger_1.default.info(`Generated ${glmStrategies.length} strategies using GLM 4.6`);
                }
            }
            catch (glmError) {
                logger_1.default.warn('GLM strategy generation failed, falling back to rule-based:', glmError);
            }
            // Fallback to rule-based generation if GLM fails or returns no strategies
            if (strategies.length === 0) {
                strategies.push(...this.generateMarketMakingStrategies(research));
                strategies.push(...this.generateTrendFollowingStrategies(research));
                strategies.push(...this.generateMeanReversionStrategies(research));
                strategies.push(...this.generateArbitrageStrategies(research));
                strategies.push(...this.generateAIPredictionStrategies(research));
            }
            logger_1.default.info(`Generated ${strategies.length} new strategies total`);
            return strategies;
        }
        catch (error) {
            logger_1.default.error('Strategy brainstorming failed:', error);
            throw error;
        }
    }
    generateMarketMakingStrategies(_research) {
        const strategies = [];
        // Grid Trading Strategy
        strategies.push({
            id: (0, uuid_1.v4)(),
            name: 'Grid Trading - Dynamic',
            description: 'Dynamic grid trading strategy that adjusts grid spacing based on volatility',
            type: 'MARKET_MAKING',
            symbols: ['BTC', 'ETH'],
            timeframe: '5m',
            parameters: {
                gridLevels: 10,
                gridSpacing: 0.005, // 0.5%
                volatilityMultiplier: 1.5,
                minSpread: 0.002, // 0.2%
                maxSpread: 0.01 // 1%
            },
            entryConditions: [
                'price >= lowerGrid',
                'price <= upperGrid',
                'spread > minSpread',
                'volatility < threshold'
            ],
            exitConditions: [
                'price hits opposite grid level',
                'takeProfit reached',
                'stopLoss triggered'
            ],
            riskParameters: {
                maxPositionSize: 0.02,
                stopLoss: 0.05,
                takeProfit: 0.03,
                maxLeverage: 2
            },
            isActive: false,
            performance: this.getEmptyPerformance(),
            createdAt: new Date(),
            updatedAt: new Date()
        });
        // Market Making Strategy
        strategies.push({
            id: (0, uuid_1.v4)(),
            name: 'Market Making - Inventory Balanced',
            description: 'Market making strategy that maintains balanced inventory',
            type: 'MARKET_MAKING',
            symbols: ['ETH'],
            timeframe: '1m',
            parameters: {
                targetInventory: 0,
                inventoryThreshold: 0.1,
                baseSpread: 0.001,
                skewAdjustment: 0.5
            },
            entryConditions: [
                'inventory imbalance detected',
                'spread > baseSpread',
                'order book depth sufficient'
            ],
            exitConditions: [
                'inventory balanced',
                'position size limit reached',
                'adverse price movement'
            ],
            riskParameters: {
                maxPositionSize: 0.05,
                stopLoss: 0.03,
                takeProfit: 0.02,
                maxLeverage: 3
            },
            isActive: false,
            performance: this.getEmptyPerformance(),
            createdAt: new Date(),
            updatedAt: new Date()
        });
        return strategies;
    }
    generateTrendFollowingStrategies(_research) {
        const strategies = [];
        // Moving Average Crossover
        strategies.push({
            id: (0, uuid_1.v4)(),
            name: 'MA Crossover - Adaptive',
            description: 'Adaptive moving average crossover strategy with volatility filters',
            type: 'TREND_FOLLOWING',
            symbols: ['BTC', 'ETH'],
            timeframe: '15m',
            parameters: {
                fastMA: 20,
                slowMA: 50,
                signalMA: 9,
                volatilityThreshold: 0.02,
                volumeConfirmation: true
            },
            entryConditions: [
                'fastMA crosses above slowMA',
                'volume > average',
                'volatility in acceptable range'
            ],
            exitConditions: [
                'fastMA crosses below slowMA',
                'stopLoss triggered',
                'takeProfit reached'
            ],
            riskParameters: {
                maxPositionSize: 0.03,
                stopLoss: 0.04,
                takeProfit: 0.08,
                maxLeverage: 4
            },
            isActive: false,
            performance: this.getEmptyPerformance(),
            createdAt: new Date(),
            updatedAt: new Date()
        });
        // MACD Momentum
        strategies.push({
            id: (0, uuid_1.v4)(),
            name: 'MACD Momentum - Enhanced',
            description: 'Enhanced MACD strategy with divergence detection',
            type: 'TREND_FOLLOWING',
            symbols: ['BTC'],
            timeframe: '1h',
            parameters: {
                macdFast: 12,
                macdSlow: 26,
                macdSignal: 9,
                divergenceLookback: 20,
                confirmationCandles: 3
            },
            entryConditions: [
                'MACD line crosses above signal',
                'histogram turns positive',
                'no bearish divergence',
                'price above key moving average'
            ],
            exitConditions: [
                'MACD line crosses below signal',
                'bearish divergence detected',
                'stopLoss triggered'
            ],
            riskParameters: {
                maxPositionSize: 0.04,
                stopLoss: 0.05,
                takeProfit: 0.12,
                maxLeverage: 5
            },
            isActive: false,
            performance: this.getEmptyPerformance(),
            createdAt: new Date(),
            updatedAt: new Date()
        });
        return strategies;
    }
    generateMeanReversionStrategies(_research) {
        const strategies = [];
        // Bollinger Bands Reversion
        strategies.push({
            id: (0, uuid_1.v4)(),
            name: 'BB Mean Reversion - Dynamic',
            description: 'Dynamic Bollinger Bands mean reversion with trend filter',
            type: 'MEAN_REVERSION',
            symbols: ['ETH'],
            timeframe: '5m',
            parameters: {
                bbPeriod: 20,
                bbStdDev: 2,
                trendFilterMA: 200,
                rsiOversold: 30,
                rsiOverbought: 70
            },
            entryConditions: [
                'price touches lower BB',
                'RSI oversold',
                'no strong downtrend',
                'volume spike confirmation'
            ],
            exitConditions: [
                'price reaches middle BB',
                'RSI overbought',
                'stopLoss triggered'
            ],
            riskParameters: {
                maxPositionSize: 0.025,
                stopLoss: 0.03,
                takeProfit: 0.04,
                maxLeverage: 3
            },
            isActive: false,
            performance: this.getEmptyPerformance(),
            createdAt: new Date(),
            updatedAt: new Date()
        });
        // RSI Extreme Reversal
        strategies.push({
            id: (0, uuid_1.v4)(),
            name: 'RSI Extreme Reversal',
            description: 'RSI extreme reversal strategy with multiple timeframe confirmation',
            type: 'MEAN_REVERSION',
            symbols: ['BTC'],
            timeframe: '15m',
            parameters: {
                rsiPeriod: 14,
                rsiExtremeOversold: 20,
                rsiExtremeOverbought: 80,
                confirmationTimeframe: '1h',
                minReversalCandles: 2
            },
            entryConditions: [
                'RSI extremely oversold/overbought',
                'price reversal pattern',
                'higher timeframe confirmation',
                'volume support'
            ],
            exitConditions: [
                'RSI returns to normal range',
                'price reaches opposite extreme',
                'stopLoss triggered'
            ],
            riskParameters: {
                maxPositionSize: 0.03,
                stopLoss: 0.04,
                takeProfit: 0.06,
                maxLeverage: 4
            },
            isActive: false,
            performance: this.getEmptyPerformance(),
            createdAt: new Date(),
            updatedAt: new Date()
        });
        return strategies;
    }
    generateArbitrageStrategies(_research) {
        const strategies = [];
        // Triangular Arbitrage
        strategies.push({
            id: (0, uuid_1.v4)(),
            name: 'Triangular Arbitrage - Fast',
            description: 'Fast triangular arbitrage across multiple pairs',
            type: 'ARBITRAGE',
            symbols: ['BTC', 'ETH', 'USDT'],
            timeframe: '1m',
            parameters: {
                minProfitThreshold: 0.003, // 0.3%
                maxExecutionTime: 5000, // 5 seconds
                slippageTolerance: 0.001,
                pairs: ['BTC/USDT', 'ETH/USDT', 'ETH/BTC']
            },
            entryConditions: [
                'arbitrage opportunity detected',
                'profit > minProfitThreshold',
                'liquidity sufficient',
                'execution time feasible'
            ],
            exitConditions: [
                'all legs executed',
                'profit realized',
                'timeout reached'
            ],
            riskParameters: {
                maxPositionSize: 0.01,
                stopLoss: 0.01,
                takeProfit: 0.005,
                maxLeverage: 1
            },
            isActive: false,
            performance: this.getEmptyPerformance(),
            createdAt: new Date(),
            updatedAt: new Date()
        });
        return strategies;
    }
    generateAIPredictionStrategies(_research) {
        const strategies = [];
        // AI Sentiment-Based
        strategies.push({
            id: (0, uuid_1.v4)(),
            name: 'AI Sentiment Trading',
            description: 'AI-powered sentiment analysis trading strategy',
            type: 'AI_PREDICTION',
            symbols: ['BTC', 'ETH'],
            timeframe: '30m',
            parameters: {
                sentimentThreshold: 0.6,
                technicalWeight: 0.4,
                sentimentWeight: 0.6,
                updateFrequency: 300000 // 5 minutes
            },
            entryConditions: [
                'AI sentiment > threshold',
                'technical indicators confirm',
                'risk assessment passed'
            ],
            exitConditions: [
                'sentiment reverses',
                'technical exit signal',
                'risk limit reached'
            ],
            riskParameters: {
                maxPositionSize: 0.035,
                stopLoss: 0.06,
                takeProfit: 0.10,
                maxLeverage: 5
            },
            isActive: false,
            performance: this.getEmptyPerformance(),
            createdAt: new Date(),
            updatedAt: new Date()
        });
        return strategies;
    }
    async backtestStrategy(strategy, historicalData) {
        try {
            logger_1.default.info(`Backtesting strategy: ${strategy.name}`);
            const trades = [];
            let capital = 10000; // Starting capital
            let position = 0;
            let entryPrice = 0;
            for (let i = 50; i < historicalData.length; i++) {
                const currentData = historicalData.slice(0, i + 1);
                const currentPrice = historicalData[i].close;
                // Generate signals based on strategy
                const signal = await this.generateSignal(strategy, currentData);
                if (signal.action === 'BUY' && position <= 0) {
                    // Enter long position
                    position = capital * strategy.riskParameters.maxPositionSize;
                    entryPrice = currentPrice;
                    trades.push({
                        id: (0, uuid_1.v4)(),
                        strategyId: strategy.id,
                        symbol: strategy.symbols[0],
                        side: 'BUY',
                        size: position,
                        price: currentPrice,
                        fee: position * 0.001, // 0.1% fee
                        timestamp: historicalData[i].timestamp,
                        type: 'MARKET',
                        status: 'FILLED',
                        entryExit: 'ENTRY'
                    });
                }
                else if (signal.action === 'SELL' && position > 0) {
                    // Exit position
                    const exitPrice = currentPrice;
                    const pnl = (exitPrice - entryPrice) * position / entryPrice;
                    capital += pnl;
                    trades.push({
                        id: (0, uuid_1.v4)(),
                        strategyId: strategy.id,
                        symbol: strategy.symbols[0],
                        side: 'SELL',
                        size: position,
                        price: exitPrice,
                        fee: position * 0.001,
                        pnl,
                        timestamp: historicalData[i].timestamp,
                        type: 'MARKET',
                        status: 'FILLED',
                        entryExit: 'EXIT'
                    });
                    position = 0;
                }
            }
            const result = this.calculateBacktestMetrics(strategy, trades, 10000, capital);
            logger_1.default.info(`Backtest completed for ${strategy.name}: ${result.totalReturn.toFixed(2)}% return`);
            return result;
        }
        catch (error) {
            logger_1.default.error(`Backtest failed for ${strategy.name}:`, error);
            throw error;
        }
    }
    async generateSignal(strategy, marketData) {
        const latestData = marketData[marketData.length - 1];
        const indicators = await ta_module_1.default.analyzeMarket(strategy.symbols[0], strategy.timeframe, marketData);
        let action = 'HOLD';
        let confidence = 0;
        let reason = '';
        switch (strategy.type) {
            case 'TREND_FOLLOWING':
                if (indicators.macd.macd[indicators.macd.macd.length - 1] >
                    indicators.macd.signal[indicators.macd.signal.length - 1]) {
                    action = 'BUY';
                    confidence = 0.7;
                    reason = 'MACD bullish crossover';
                }
                else {
                    action = 'SELL';
                    confidence = 0.7;
                    reason = 'MACD bearish crossover';
                }
                break;
            case 'MEAN_REVERSION':
                const currentRSI = indicators.rsi[indicators.rsi.length - 1];
                if (currentRSI < 30) {
                    action = 'BUY';
                    confidence = 0.8;
                    reason = 'RSI oversold';
                }
                else if (currentRSI > 70) {
                    action = 'SELL';
                    confidence = 0.8;
                    reason = 'RSI overbought';
                }
                break;
            default:
                action = 'HOLD';
                reason = 'No clear signal';
        }
        return {
            id: (0, uuid_1.v4)(),
            symbol: strategy.symbols[0],
            action,
            size: strategy.riskParameters.maxPositionSize,
            price: latestData.close,
            type: 'MARKET',
            timestamp: new Date(),
            confidence,
            strategyId: strategy.id,
            reason
        };
    }
    calculateBacktestMetrics(strategy, trades, initialCapital, finalCapital) {
        const winningTrades = trades.filter(t => t.pnl && t.pnl > 0);
        const losingTrades = trades.filter(t => t.pnl && t.pnl < 0);
        const totalReturn = ((finalCapital - initialCapital) / initialCapital) * 100;
        const winRate = trades.length > 0 ? (winningTrades.length / trades.length) * 100 : 0;
        const totalPnL = trades.reduce((sum, trade) => sum + (trade.pnl || 0), 0);
        const averageWin = winningTrades.length > 0 ?
            winningTrades.reduce((sum, trade) => sum + (trade.pnl || 0), 0) / winningTrades.length : 0;
        const averageLoss = losingTrades.length > 0 ?
            losingTrades.reduce((sum, trade) => sum + (trade.pnl || 0), 0) / losingTrades.length : 0;
        const profitFactor = Math.abs(averageLoss) > 0 ? Math.abs(averageWin / averageLoss) : 0;
        // Calculate max drawdown
        let maxDrawdown = 0;
        let peak = initialCapital;
        let runningCapital = initialCapital;
        trades.forEach(trade => {
            if (trade.pnl) {
                runningCapital += trade.pnl;
                peak = Math.max(peak, runningCapital);
                const drawdown = ((peak - runningCapital) / peak) * 100;
                maxDrawdown = Math.max(maxDrawdown, drawdown);
            }
        });
        // Calculate Sharpe ratio (simplified)
        const returns = trades.filter(t => t.pnl).map(t => (t.pnl || 0) / initialCapital);
        const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
        const returnStd = Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length);
        const sharpeRatio = returnStd > 0 ? avgReturn / returnStd : 0;
        return {
            strategyId: strategy.id,
            period: {
                start: trades.length > 0 ? trades[0].timestamp : new Date(),
                end: trades.length > 0 ? trades[trades.length - 1].timestamp : new Date()
            },
            initialCapital,
            finalCapital,
            totalReturn,
            annualizedReturn: totalReturn * (365 / 30), // Assuming 30 days period
            sharpeRatio,
            maxDrawdown,
            winRate,
            totalTrades: trades.length,
            trades,
            metrics: {
                calmarRatio: totalReturn / Math.max(maxDrawdown, 1),
                sortinoRatio: sharpeRatio * 1.5, // Simplified
                var95: 0, // Would need more complex calculation
                beta: 1, // Would need market data
                alpha: totalReturn - 5 // Assuming 5% market return
            }
        };
    }
    getEmptyPerformance() {
        return {
            totalTrades: 0,
            winningTrades: 0,
            losingTrades: 0,
            winRate: 0,
            totalPnL: 0,
            sharpeRatio: 0,
            maxDrawdown: 0,
            averageWin: 0,
            averageLoss: 0,
            profitFactor: 0
        };
    }
    async optimizeStrategies(strategies) {
        const optimizedStrategies = [];
        for (const strategy of strategies) {
            try {
                // Try GLM optimization first
                const optimized = await this.optimizeStrategy(strategy);
                optimizedStrategies.push(optimized);
            }
            catch (error) {
                logger_1.default.warn(`Failed to optimize strategy ${strategy.name}:`, error);
                optimizedStrategies.push(strategy);
            }
        }
        return optimizedStrategies;
    }
    async optimizeStrategy(strategy) {
        try {
            // Try GLM-based optimization first
            const glmOptimized = await glm_service_1.default.optimizeStrategy(strategy, strategy.performance);
            logger_1.default.info(`Optimized strategy ${strategy.name} using GLM 4.6`);
            return glmOptimized;
        }
        catch (glmError) {
            logger_1.default.warn(`GLM optimization failed for ${strategy.name}, using rule-based fallback:`, glmError);
            // Fallback to simple parameter optimization
            const optimized = { ...strategy };
            // Optimize risk parameters based on strategy type
            switch (strategy.type) {
                case 'TREND_FOLLOWING':
                    optimized.riskParameters.takeProfit = Math.max(strategy.riskParameters.takeProfit, 0.08);
                    optimized.riskParameters.stopLoss = Math.min(strategy.riskParameters.stopLoss, 0.03);
                    break;
                case 'MEAN_REVERSION':
                    optimized.riskParameters.takeProfit = Math.min(strategy.riskParameters.takeProfit, 0.05);
                    optimized.riskParameters.stopLoss = Math.min(strategy.riskParameters.stopLoss, 0.02);
                    break;
                case 'MARKET_MAKING':
                    optimized.riskParameters.maxLeverage = Math.min(strategy.riskParameters.maxLeverage, 2);
                    break;
            }
            optimized.updatedAt = new Date();
            return optimized;
        }
    }
    getStrategy(id) {
        return this.strategies.get(id);
    }
    getAllStrategies() {
        return Array.from(this.strategies.values());
    }
    saveStrategy(strategy) {
        this.strategies.set(strategy.id, strategy);
    }
    deleteStrategy(id) {
        return this.strategies.delete(id);
    }
}
exports.StrategyEngine = StrategyEngine;
const strategyEngine = new StrategyEngine();
exports.default = strategyEngine;
//# sourceMappingURL=strategy-engine.js.map