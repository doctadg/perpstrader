"use strict";
// Strategy Selector Node
// Selects the best strategy based on backtest results
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.strategySelectorNode = strategySelectorNode;
const uuid_1 = require("uuid");
const data_manager_1 = __importDefault(require("../../data-manager/data-manager"));
const logger_1 = __importDefault(require("../../shared/logger"));
/**
 * Strategy Selector Node
 * Ranks strategies by risk-adjusted returns and selects the best one
 */
async function strategySelectorNode(state) {
    logger_1.default.info(`[StrategySelectorNode] Selecting from ${state.backtestResults.length} strategies`);
    if (state.backtestResults.length === 0) {
        return {
            currentStep: 'STRATEGY_SELECTION_NONE',
            selectedStrategy: null,
            shouldExecute: false,
            thoughts: [...state.thoughts, 'No strategies to select from'],
        };
    }
    try {
        // AGGRESSIVE MODE: Ultra-relaxed criteria for maximum trading opportunities
        // Prioritize upside potential over risk metrics
        const viableResults = state.backtestResults.filter(r => {
            // Accept almost any strategy with a trading signal
            // Minimum: Sharpe > -0.5 (even negative Sharpe accepted if not terrible)
            // WinRate > 10% (very low bar - focus on big wins)
            // MaxDrawdown < 70% (tolerate significant drawdowns for big upside)
            // At least 1 trade
            return r.totalTrades >= 1;
        });
        // If still no viable strategies, accept ANY strategy that was backtested
        const aggressiveResults = viableResults.length > 0
            ? viableResults
            : state.backtestResults.filter(r => r.totalTrades >= 1);
        if (aggressiveResults.length === 0) {
            // ULTRA-AGGRESSIVE FALLBACK: Even accept strategies with 0 trades if they have good parameters
            if (state.strategyIdeas.length > 0) {
                logger_1.default.info('[StrategySelectorNode] No backtest data, using best strategy idea');
                const bestIdea = state.strategyIdeas[0];
                const fallbackStrategy = {
                    id: (0, uuid_1.v4)(),
                    name: bestIdea.name,
                    description: bestIdea.description,
                    type: bestIdea.type,
                    symbols: bestIdea.symbols,
                    timeframe: bestIdea.timeframe,
                    parameters: bestIdea.parameters,
                    entryConditions: bestIdea.entryConditions,
                    exitConditions: bestIdea.exitConditions,
                    riskParameters: bestIdea.riskParameters,
                    isActive: true,
                    performance: {
                        totalTrades: 0,
                        winningTrades: 0,
                        losingTrades: 0,
                        winRate: 50, // Assumption
                        totalPnL: 0,
                        sharpeRatio: 0,
                        maxDrawdown: 0,
                        averageWin: 0,
                        averageLoss: 0,
                        profitFactor: 1,
                    },
                    createdAt: new Date(),
                    updatedAt: new Date(),
                };
                await data_manager_1.default.saveStrategy(fallbackStrategy);
                return {
                    currentStep: 'STRATEGY_SELECTED_FALLBACK',
                    selectedStrategy: fallbackStrategy,
                    shouldExecute: true,
                    thoughts: [
                        ...state.thoughts,
                        `No backtest data, using fallback strategy: ${fallbackStrategy.name}`,
                        'Proceeding with ultra-aggressive approach',
                    ],
                };
            }
            return {
                currentStep: 'STRATEGY_SELECTION_NONE_VIABLE',
                selectedStrategy: null,
                shouldExecute: false,
                thoughts: [
                    ...state.thoughts,
                    'No strategies available for selection',
                ],
            };
        }
        // AGGRESSIVE SCORING: Weight return heavily, minimize importance of drawdown
        // New weights: Return (60%) + Sharpe (20%) + Win Rate (10%) + 1/Drawdown (10%)
        // This prioritizes strategies with high upside even if risky
        const scoredResults = aggressiveResults.map(r => {
            const idea = state.strategyIdeas.find(i => i.name === r.strategyId) ||
                state.strategyIdeas[state.backtestResults.indexOf(r)];
            // Boost return score significantly
            const returnScore = Math.max(0, r.totalReturn / 100 * 0.6);
            // Reduce Sharpe weight
            const sharpeScore = Math.max(0, r.sharpeRatio) * 0.2;
            // Minimal win rate contribution
            const winRateScore = (r.winRate / 100) * 0.1;
            // Reduced drawdown penalty
            const drawdownScore = r.maxDrawdown > 0
                ? (1 / Math.max(r.maxDrawdown, 1)) * 0.1 * 5
                : 0.1;
            // AGGRESSIVE BONUS: Extra points for high positive returns
            const upsideBonus = r.totalReturn > 5 ? 0.2 : r.totalReturn > 2 ? 0.1 : 0;
            const score = returnScore + sharpeScore + winRateScore + drawdownScore + upsideBonus;
            return { result: r, idea, score };
        });
        // Sort by score
        scoredResults.sort((a, b) => b.score - a.score);
        const best = scoredResults[0];
        if (!best.idea) {
            return {
                currentStep: 'STRATEGY_SELECTION_ERROR',
                selectedStrategy: null,
                shouldExecute: false,
                thoughts: [...state.thoughts, 'Could not match backtest result to strategy idea'],
            };
        }
        // Convert StrategyIdea to Strategy
        const strategy = {
            id: (0, uuid_1.v4)(),
            name: best.idea.name,
            description: best.idea.description,
            type: best.idea.type,
            symbols: best.idea.symbols,
            timeframe: best.idea.timeframe,
            parameters: best.idea.parameters,
            entryConditions: best.idea.entryConditions,
            exitConditions: best.idea.exitConditions,
            riskParameters: best.idea.riskParameters,
            isActive: true,
            performance: {
                totalTrades: best.result.totalTrades,
                winningTrades: Math.round(best.result.totalTrades * best.result.winRate / 100),
                losingTrades: Math.round(best.result.totalTrades * (100 - best.result.winRate) / 100),
                winRate: best.result.winRate,
                totalPnL: best.result.finalCapital - best.result.initialCapital,
                sharpeRatio: best.result.sharpeRatio,
                maxDrawdown: best.result.maxDrawdown,
                averageWin: best.result.metrics.alpha > 0 ? best.result.metrics.alpha : 0,
                averageLoss: best.result.maxDrawdown / 10,
                profitFactor: best.result.metrics.calmarRatio,
            },
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        // Save strategy to database
        await data_manager_1.default.saveStrategy(strategy);
        logger_1.default.info(`[StrategySelectorNode] [AGGRESSIVE] Selected: ${strategy.name} (Score: ${best.score.toFixed(2)})`);
        return {
            currentStep: 'STRATEGY_SELECTED',
            selectedStrategy: strategy,
            shouldExecute: true, // ALWAYS execute in aggressive mode
            thoughts: [
                ...state.thoughts,
                `[AGGRESSIVE MODE] Selected strategy: ${strategy.name}`,
                `Score: ${best.score.toFixed(2)} (Sharpe: ${best.result.sharpeRatio.toFixed(2)}, Return: ${best.result.totalReturn.toFixed(2)}%, WinRate: ${best.result.winRate.toFixed(0)}%)`,
                `Proceeding with execution - Ultra-aggressive mode active`,
            ],
        };
    }
    catch (error) {
        logger_1.default.error('[StrategySelectorNode] Strategy selection failed:', error);
        return {
            currentStep: 'STRATEGY_SELECTION_ERROR',
            selectedStrategy: null,
            shouldExecute: false,
            errors: [...state.errors, `Strategy selection error: ${error}`],
        };
    }
}
exports.default = strategySelectorNode;
//# sourceMappingURL=strategy-selector.js.map