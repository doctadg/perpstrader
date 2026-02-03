"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AGGRESSIVE_STRATEGIES = void 0;
exports.getAggressiveStrategies = getAggressiveStrategies;
const uuid_1 = require("uuid");
exports.AGGRESSIVE_STRATEGIES = [
    // ===================== HIGH FREQUENCY STRATEGIES =====================
    {
        id: (0, uuid_1.v4)(),
        name: '1-Minute Scalping - Ultra Fast',
        description: 'Rapid 1-minute trades on micro movements with 2x leverage',
        type: 'TREND_FOLLOWING',
        symbols: ['BTC', 'ETH', 'SOL'],
        timeframe: '1m',
        parameters: {
            emaFast: 5,
            emaSlow: 20,
            rsiOverbought: 70,
            rsiOversold: 30,
            volumeThreshold: 1.5
        },
        entryConditions: [
            'Fast EMA crosses Slow EMA',
            'RSI exits oversold/overbought zone',
            'Volume surge > 1.5x average'
        ],
        exitConditions: [
            'Opposite EMA crossover',
            'RSI enters extreme zone',
            'Stop loss hit'
        ],
        riskParameters: {
            maxPositionSize: 0.08,
            stopLoss: 0.015,
            takeProfit: 0.03,
            maxLeverage: 2
        },
        isActive: true,
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
            profitFactor: 0
        },
        createdAt: new Date(),
        updatedAt: new Date()
    },
    {
        id: (0, uuid_1.v4)(),
        name: 'Order Book Imbalance - Speed',
        description: 'Trade on order book imbalances with instant execution',
        type: 'MARKET_MAKING',
        symbols: ['BTC', 'ETH'],
        timeframe: '1m',
        parameters: {
            bidAskRatioThreshold: 1.5,
            spreadThreshold: 0.001,
            depthLevels: 5
        },
        entryConditions: [
            'Bid/Ask ratio > 1.5 or < 0.67',
            'Spread < 0.1%',
            'Large order detected'
        ],
        exitConditions: [
            'Ratio normalizes',
            'Spread widens > 0.2%',
            'Quick profit target'
        ],
        riskParameters: {
            maxPositionSize: 0.05,
            stopLoss: 0.01,
            takeProfit: 0.02,
            maxLeverage: 3
        },
        isActive: true,
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
            profitFactor: 0
        },
        createdAt: new Date(),
        updatedAt: new Date()
    },
    // ===================== MOMENTUM STRATEGIES =====================
    {
        id: (0, uuid_1.v4)(),
        name: '5-Minute Momentum Surge',
        description: 'Catch momentum surges on 5-minute candles with 4x leverage',
        type: 'TREND_FOLLOWING',
        symbols: ['BTC', 'ETH', 'SOL'],
        timeframe: '5m',
        parameters: {
            momentumThreshold: 0.02,
            volumeSpike: 2.0,
            rsiConfirm: 50
        },
        entryConditions: [
            'Price change > 2% in 5m',
            'Volume spike > 2x average',
            'RSI confirmation direction'
        ],
        exitConditions: [
            'Momentum fades (price change < 0.5%)',
            'Volume returns to normal',
            'Stop loss / take profit'
        ],
        riskParameters: {
            maxPositionSize: 0.10,
            stopLoss: 0.025,
            takeProfit: 0.06,
            maxLeverage: 4
        },
        isActive: true,
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
            profitFactor: 0
        },
        createdAt: new Date(),
        updatedAt: new Date()
    },
    {
        id: (0, uuid_1.v4)(),
        name: '15-Minute Breakout Hunter',
        description: 'Trade 15-minute breakouts with 5x leverage',
        type: 'TREND_FOLLOWING',
        symbols: ['BTC', 'ETH'],
        timeframe: '15m',
        parameters: {
            lookback: 20,
            breakoutThreshold: 0.03,
            volumeConfirmation: 1.8
        },
        entryConditions: [
            'Price breaks 20-candle high/low',
            'Breakout > 3%',
            'Volume confirmation > 1.8x'
        ],
        exitConditions: [
            'Breakout fails (pullback < -1.5%)',
            'Price reaches target',
            'Time stop (45 minutes)'
        ],
        riskParameters: {
            maxPositionSize: 0.12,
            stopLoss: 0.03,
            takeProfit: 0.08,
            maxLeverage: 5
        },
        isActive: true,
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
            profitFactor: 0
        },
        createdAt: new Date(),
        updatedAt: new Date()
    },
    // ===================== MEAN REVERSION STRATEGIES =====================
    {
        id: (0, uuid_1.v4)(),
        name: 'Bollinger Band Bounce - 5m',
        description: 'Mean reversion on 5-minute Bollinger Bands with 3x leverage',
        type: 'MEAN_REVERSION',
        symbols: ['BTC', 'ETH', 'SOL'],
        timeframe: '5m',
        parameters: {
            period: 20,
            stdDev: 2.5,
            rsiExtreme: 75
        },
        entryConditions: [
            'Price touches 2.5 std dev band',
            'RSI in extreme zone (>75 or <25)',
            'Volume confirmation'
        ],
        exitConditions: [
            'Price returns to middle band',
            'Stop loss hit',
            'Time exit (30 minutes)'
        ],
        riskParameters: {
            maxPositionSize: 0.08,
            stopLoss: 0.02,
            takeProfit: 0.04,
            maxLeverage: 3
        },
        isActive: true,
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
            profitFactor: 0
        },
        createdAt: new Date(),
        updatedAt: new Date()
    },
    {
        id: (0, uuid_1.v4)(),
        name: 'RSI Overbought/Oversold Fade',
        description: 'Fade extreme RSI readings on 5m timeframe',
        type: 'MEAN_REVERSION',
        symbols: ['BTC', 'ETH'],
        timeframe: '5m',
        parameters: {
            rsiOverbought: 80,
            rsiOversold: 20,
            lookback: 14
        },
        entryConditions: [
            'RSI > 80 (fade long)',
            'RSI < 20 (fade short)',
            'Price at support/resistance'
        ],
        exitConditions: [
            'RSI crosses back to 50',
            'Stop loss hit',
            'Profit target reached'
        ],
        riskParameters: {
            maxPositionSize: 0.07,
            stopLoss: 0.018,
            takeProfit: 0.035,
            maxLeverage: 3
        },
        isActive: true,
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
            profitFactor: 0
        },
        createdAt: new Date(),
        updatedAt: new Date()
    },
    // ===================== ARBITRAGE STRATEGIES =====================
    {
        id: (0, uuid_1.v4)(),
        name: 'Funding Rate Arbitrage - Delta Neutral',
        description: 'Capture funding rate differentials with delta-neutral positions',
        type: 'ARBITRAGE',
        symbols: ['BTC', 'ETH'],
        timeframe: '1h',
        parameters: {
            fundingThreshold: 0.0001,
            spreadTolerance: 0.005,
            hedgeRatio: 1.0
        },
        entryConditions: [
            'Funding rate > 0.01% (long collect)',
            'Or funding rate < -0.01% (short collect)',
            'Spread within tolerance'
        ],
        exitConditions: [
            'Funding rate reverses',
            'Spread widens beyond tolerance',
            '8 hours passed'
        ],
        riskParameters: {
            maxPositionSize: 0.15,
            stopLoss: 0.005,
            takeProfit: 0.02,
            maxLeverage: 2
        },
        isActive: true,
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
            profitFactor: 0
        },
        createdAt: new Date(),
        updatedAt: new Date()
    },
    {
        id: (0, uuid_1.v4)(),
        name: 'Basis Trading - Calendar Spread',
        description: 'Exploit price differences between perpetual and spot',
        type: 'ARBITRAGE',
        symbols: ['BTC', 'ETH'],
        timeframe: '1h',
        parameters: {
            basisThreshold: 0.01,
            entryBasis: 0.02,
            exitBasis: 0.005
        },
        entryConditions: [
            'Perpetual - spot basis > 2%',
            'Liquidity sufficient',
            'Funding confirms direction'
        ],
        exitConditions: [
            'Basis converges to < 0.5%',
            'Stop loss hit',
            '24 hour max hold'
        ],
        riskParameters: {
            maxPositionSize: 0.12,
            stopLoss: 0.008,
            takeProfit: 0.015,
            maxLeverage: 3
        },
        isActive: true,
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
            profitFactor: 0
        },
        createdAt: new Date(),
        updatedAt: new Date()
    },
    // ===================== VOLATILITY STRATEGIES =====================
    {
        id: (0, uuid_1.v4)(),
        name: 'Volatility Breakout - 15m',
        description: 'Trade on sudden volatility increases with 4x leverage',
        type: 'TREND_FOLLOWING',
        symbols: ['BTC', 'ETH', 'SOL'],
        timeframe: '15m',
        parameters: {
            atrMultiplier: 2.0,
            atrPeriod: 14,
            volumeSpike: 2.5
        },
        entryConditions: [
            'Price move > 2x ATR',
            'Volume spike > 2.5x',
            'Breakout confirmed'
        ],
        exitConditions: [
            'Volatility returns to normal',
            'Price reversal signal',
            'Stop loss / take profit'
        ],
        riskParameters: {
            maxPositionSize: 0.10,
            stopLoss: 0.025,
            takeProfit: 0.07,
            maxLeverage: 4
        },
        isActive: true,
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
            profitFactor: 0
        },
        createdAt: new Date(),
        updatedAt: new Date()
    },
    {
        id: (0, uuid_1.v4)(),
        name: 'Gap Trading - 15m',
        description: 'Trade morning and overnight gaps with 3x leverage',
        type: 'TREND_FOLLOWING',
        symbols: ['BTC', 'ETH'],
        timeframe: '15m',
        parameters: {
            gapThreshold: 0.015,
            fillPercentage: 0.5,
            maxHoldingMinutes: 60
        },
        entryConditions: [
            'Open > close previous day by > 1.5%',
            'Volume confirms direction',
            'No immediate fill'
        ],
        exitConditions: [
            'Gap filled 50%',
            'Stop loss hit',
            '1 hour time limit'
        ],
        riskParameters: {
            maxPositionSize: 0.08,
            stopLoss: 0.02,
            takeProfit: 0.05,
            maxLeverage: 3
        },
        isActive: true,
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
            profitFactor: 0
        },
        createdAt: new Date(),
        updatedAt: new Date()
    },
    // ===================== AI PREDICTION STRATEGIES =====================
    {
        id: (0, uuid_1.v4)(),
        name: 'GLM 4.7 Signal Integration',
        description: 'Execute GLM 4.7 AI-generated signals with adaptive risk',
        type: 'AI_PREDICTION',
        symbols: ['BTC', 'ETH', 'SOL'],
        timeframe: '5m',
        parameters: {
            minConfidence: 0.65,
            maxPositionPerSignal: 0.10,
            signalTimeoutMinutes: 15
        },
        entryConditions: [
            'GLM signal confidence > 65%',
            'Technical indicators confirm',
            'Risk within limits'
        ],
        exitConditions: [
            'GLM signal expiration',
            'Stop loss hit',
            'Take profit reached'
        ],
        riskParameters: {
            maxPositionSize: 0.12,
            stopLoss: 0.025,
            takeProfit: 0.06,
            maxLeverage: 5
        },
        isActive: true,
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
            profitFactor: 0
        },
        createdAt: new Date(),
        updatedAt: new Date()
    },
    // ===================== PREDICTION MARKET STRATEGIES =====================
    {
        id: (0, uuid_1.v4)(),
        name: 'Polymarket Value Betting',
        description: 'Bet on undervalued prediction markets with 2x leverage',
        type: 'AI_PREDICTION',
        symbols: ['BTC', 'ETH'],
        timeframe: '1h',
        parameters: {
            minEdge: 0.05,
            maxEdge: 0.15,
            confidence: 0.65,
            winRate: 0.60
        },
        entryConditions: [
            'Implied odds > 50% (underdog)',
            'Market sentiment bullish/bearish',
            'Volume spike detected'
        ],
        exitConditions: [
            'Price moves toward fair value',
            'Time decay (closer to resolution)',
            'Stop loss hit'
        ],
        riskParameters: {
            maxPositionSize: 0.05,
            stopLoss: 0.08,
            takeProfit: 0.15,
            maxLeverage: 2
        },
        isActive: true,
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
            profitFactor: 0
        },
        createdAt: new Date(),
        updatedAt: new Date()
    },
    {
        id: (0, uuid_1.v4)(),
        name: 'Polymarket Sentiment Arbitrage',
        description: 'Exploit sentiment differences between Polymarket and crypto spot',
        type: 'AI_PREDICTION',
        symbols: ['BTC', 'ETH'],
        timeframe: '1h',
        parameters: {
            sentimentSpread: 0.05,
            confidence: 0.70,
            minVolume: 10000
        },
        entryConditions: [
            'Sentiment spread detected',
            'Volume divergence',
            'Technical confirmation'
        ],
        exitConditions: [
            'Spread closes',
            'Take profit reached',
            'Stop loss hit'
        ],
        riskParameters: {
            maxPositionSize: 0.06,
            stopLoss: 0.06,
            takeProfit: 0.12,
            maxLeverage: 3
        },
        isActive: true,
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
            profitFactor: 0
        },
        createdAt: new Date(),
        updatedAt: new Date()
    },
    // ===================== MULTI-TIMEFRAME STRATEGIES =====================
    {
        id: (0, uuid_1.v4)(),
        name: 'Multi-Timeframe Momentum',
        description: 'Trade when 1m, 5m, and 15m align with 4x leverage',
        type: 'TREND_FOLLOWING',
        symbols: ['BTC', 'ETH'],
        timeframe: '5m',
        parameters: {
            ema1m: 9,
            ema5m: 21,
            ema15m: 55,
            confirmation: 3
        },
        entryConditions: [
            '1m EMA(9) aligned with trend',
            '5m EMA(21) aligned with trend',
            '15m EMA(55) aligned with trend',
            'All 3 timeframes agree'
        ],
        exitConditions: [
            'Any timeframe reverses',
            'Stop loss hit',
            'Take profit reached'
        ],
        riskParameters: {
            maxPositionSize: 0.10,
            stopLoss: 0.025,
            takeProfit: 0.07,
            maxLeverage: 4
        },
        isActive: true,
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
            profitFactor: 0
        },
        createdAt: new Date(),
        updatedAt: new Date()
    },
    {
        id: (0, uuid_1.v4)(),
        name: 'Multi-Timeframe Mean Reversion',
        description: 'Fade extremes when multiple timeframes agree on overbought/oversold',
        type: 'MEAN_REVERSION',
        symbols: ['BTC', 'ETH', 'SOL'],
        timeframe: '15m',
        parameters: {
            rsi1m: 14,
            rsi5m: 14,
            rsi15m: 14,
            extremeThreshold: 80
        },
        entryConditions: [
            'RSI > 80 or < 20 on all timeframes',
            'Extreme oversold/overbought',
            'Price at support/resistance'
        ],
        exitConditions: [
            'RSI crosses back to 50 on any timeframe',
            'Stop loss hit',
            'Profit target reached'
        ],
        riskParameters: {
            maxPositionSize: 0.08,
            stopLoss: 0.022,
            takeProfit: 0.05,
            maxLeverage: 3
        },
        isActive: true,
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
            profitFactor: 0
        },
        createdAt: new Date(),
        updatedAt: new Date()
    },
    // ===================== SPECIALIZED STRATEGIES =====================
    {
        id: (0, uuid_1.v4)(),
        name: 'News-Driven Momentum',
        description: 'Trade major news events with 5x maximum leverage',
        type: 'TREND_FOLLOWING',
        symbols: ['BTC', 'ETH', 'SOL'],
        timeframe: '5m',
        parameters: {
            newsSentimentThreshold: 0.7,
            volumeSpike: 3.0,
            maxHoldMinutes: 30
        },
        entryConditions: [
            'Major news released (ETF, regulation, etc.)',
            'Positive/negative sentiment > 70%',
            'Volume spike > 3x average'
        ],
        exitConditions: [
            'News momentum fades',
            'Stop loss hit',
            'Take profit reached',
            '30 minute max hold'
        ],
        riskParameters: {
            maxPositionSize: 0.15,
            stopLoss: 0.035,
            takeProfit: 0.10,
            maxLeverage: 5
        },
        isActive: true,
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
            profitFactor: 0
        },
        createdAt: new Date(),
        updatedAt: new Date()
    }
];
function getAggressiveStrategies() {
    return exports.AGGRESSIVE_STRATEGIES;
}
//# sourceMappingURL=aggressive-strategies.js.map