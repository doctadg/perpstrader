"use strict";
// Strategy Ideation Node
// Generates trading strategy ideas using the LLM with a fallback
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.strategyIdeationNode = strategyIdeationNode;
const glm_service_1 = __importDefault(require("../../shared/glm-service"));
const logger_1 = __importDefault(require("../../shared/logger"));
const DEFAULT_STRATEGY_LIMIT = Number.parseInt(process.env.STRATEGY_IDEATION_LIMIT || '10', 10) || 10;
async function strategyIdeationNode(state) {
    logger_1.default.info(`[StrategyIdeationNode] Generating strategy ideas for ${state.symbol}`);
    if (!state.indicators || state.candles.length < 50) {
        return {
            currentStep: 'STRATEGY_IDEATION_SKIPPED',
            strategyIdeas: [],
            thoughts: [...state.thoughts, 'Skipped strategy ideation: insufficient data'],
        };
    }
    const latestCandle = state.candles[state.candles.length - 1];
    const recentRSI = state.indicators.rsi.slice(-5);
    const recentMACD = state.indicators.macd.histogram.slice(-5);
    const patternBias = derivePatternBias(state);
    const researchData = {
        topic: `${state.symbol} ${state.timeframe} Trading Strategy`,
        timestamp: new Date(),
        searchResults: [],
        scrapedContent: [],
        insights: [
            `Current price: ${latestCandle.close.toFixed(2)}`,
            `Market regime: ${state.regime ?? 'unknown'}`,
            `RSI trend: ${recentRSI.map(r => r.toFixed(0)).join(' → ')}`,
            `MACD histogram: ${recentMACD.map(m => (m >= 0 ? '+' : '-')).join('')}`,
            patternBias,
        ],
        sources: ['Market Data', 'Technical Indicators', 'Pattern Memory'],
        confidence: 0.7,
    };
    try {
        const strategies = await glm_service_1.default.generateTradingStrategies(researchData);
        const strategyIdeas = mapStrategiesToIdeas(strategies, state).slice(0, DEFAULT_STRATEGY_LIMIT);
        if (strategyIdeas.length === 0) {
            const fallbackIdeas = generateFallbackIdeas(state);
            return {
                currentStep: 'STRATEGY_IDEATION_FALLBACK',
                strategyIdeas: fallbackIdeas,
                thoughts: [
                    ...state.thoughts,
                    'LLM returned no strategies, using fallback ideas',
                    `Generated ${fallbackIdeas.length} fallback strategies`,
                ],
            };
        }
        return {
            currentStep: 'STRATEGY_IDEATION_COMPLETE',
            strategyIdeas,
            thoughts: [
                ...state.thoughts,
                `Generated ${strategyIdeas.length} strategy ideas`,
                ...strategyIdeas.map(idea => `Strategy: ${idea.name} (${idea.type})`),
            ],
        };
    }
    catch (error) {
        logger_1.default.error('[StrategyIdeationNode] Strategy ideation failed:', error);
        const fallbackIdeas = generateFallbackIdeas(state);
        return {
            currentStep: 'STRATEGY_IDEATION_FALLBACK',
            strategyIdeas: fallbackIdeas,
            thoughts: [
                ...state.thoughts,
                'LLM strategy generation failed, using fallback ideas',
                `Generated ${fallbackIdeas.length} fallback strategies`,
            ],
            errors: [...state.errors, `Strategy ideation error: ${error}`],
        };
    }
}
function derivePatternBias(state) {
    if (!state.similarPatterns || state.similarPatterns.length === 0) {
        return 'No similar historical patterns found';
    }
    const bullish = state.similarPatterns.filter(p => p.outcome === 'BULLISH').length;
    const bearish = state.similarPatterns.filter(p => p.outcome === 'BEARISH').length;
    const avgReturn = state.similarPatterns.reduce((sum, p) => sum + p.historicalReturn, 0) / state.similarPatterns.length;
    const bias = bullish === bearish ? 'NEUTRAL' : bullish > bearish ? 'BULLISH' : 'BEARISH';
    return `Pattern bias: ${bias}, avg return ${(avgReturn * 100).toFixed(2)}%`;
}
function mapStrategiesToIdeas(strategies, state) {
    return strategies.map(strategy => ({
        name: strategy.name,
        description: strategy.description,
        type: strategy.type,
        symbols: strategy.symbols.includes(state.symbol) ? strategy.symbols : [state.symbol, ...strategy.symbols],
        timeframe: strategy.timeframe || state.timeframe,
        entryConditions: strategy.entryConditions || [],
        exitConditions: strategy.exitConditions || [],
        parameters: normalizeParameters(strategy.parameters),
        riskParameters: strategy.riskParameters,
        confidence: 0.7,
        reasoning: `Generated from ${state.regime ?? 'unknown'} regime and pattern context`,
    }));
}
function normalizeParameters(parameters) {
    const normalized = {};
    for (const [key, value] of Object.entries(parameters || {})) {
        const numericValue = Number(value);
        if (Number.isFinite(numericValue)) {
            normalized[key] = numericValue;
        }
    }
    return normalized;
}
function generateFallbackIdeas(state) {
    const baseRisk = {
        maxPositionSize: 0.06,
        stopLoss: 0.03,
        takeProfit: 0.06,
        maxLeverage: 4,
    };
    return [
        {
            name: 'RSI Mean Reversion',
            description: 'Mean reversion on RSI extremes with Bollinger confirmation.',
            type: 'MEAN_REVERSION',
            symbols: [state.symbol],
            timeframe: state.timeframe,
            entryConditions: ['RSI < 30 near lower Bollinger Band', 'RSI > 70 near upper Bollinger Band'],
            exitConditions: ['RSI crosses 50', 'Stop loss hit'],
            parameters: { rsiPeriod: 14, oversold: 30, overbought: 70, bbPeriod: 20, bbStdDev: 2 },
            riskParameters: { ...baseRisk },
            confidence: 0.6,
            reasoning: `Fallback mean reversion for ${state.regime ?? 'unknown'} regime`,
        },
        {
            name: 'Fast SMA Trend',
            description: 'Trend following on fast SMA crossover.',
            type: 'TREND_FOLLOWING',
            symbols: [state.symbol],
            timeframe: state.timeframe,
            entryConditions: ['Fast SMA crosses above slow SMA for long', 'Fast SMA crosses below slow SMA for short'],
            exitConditions: ['Opposite crossover', 'Stop loss hit'],
            parameters: { fastPeriod: 9, slowPeriod: 21 },
            riskParameters: { ...baseRisk, maxPositionSize: 0.07 },
            confidence: 0.55,
            reasoning: `Fallback trend strategy for ${state.regime ?? 'unknown'} regime`,
        },
        {
            name: 'Volatility Breakout',
            description: 'Breakout strategy using recent volatility expansion.',
            type: 'TREND_FOLLOWING',
            symbols: [state.symbol],
            timeframe: state.timeframe,
            entryConditions: ['Price closes above recent range', 'Volume spike confirms breakout'],
            exitConditions: ['Breakout fails', 'Stop loss hit'],
            parameters: { rangePeriod: 20, volumeMultiplier: 1.5 },
            riskParameters: { ...baseRisk, takeProfit: 0.08 },
            confidence: 0.5,
            reasoning: 'Fallback breakout strategy for uncertain regimes',
        },
    ];
}
exports.default = strategyIdeationNode;
//# sourceMappingURL=strategy-ideation.js.map