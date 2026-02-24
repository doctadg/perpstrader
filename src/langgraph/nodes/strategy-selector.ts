// Strategy Selector Node
// Selects the best strategy based on backtest results

import { AgentState } from '../state';
import { Strategy } from '../../shared/types';
import { v4 as uuidv4 } from 'uuid';
import dataManager from '../../data-manager/data-manager';
import logger from '../../shared/logger';

// MINIMUM QUALITY THRESHOLDS (previously ultra-aggressive, now with basic sanity checks)
const MIN_SHARPE_RATIO = -0.3; // Reduced from aggressive -0.5, but still allows some exploration
const MIN_WIN_RATE = 0.15; // Minimum 15% win rate (up from 10%)
const MAX_DRAWDOWN = 0.80; // Maximum 80% drawdown (down from 70% tolerance)
const MIN_TRADES = 3; // Minimum trades for statistical significance
const MIN_TOTAL_RETURN = -10; // Allow strategies that don't lose more than 10%

/**
 * Strategy Selector Node
 * Ranks strategies by risk-adjusted returns and selects the best one
 * 
 * ENHANCED: Added minimum quality thresholds to prevent spam from untested strategies
 */
export async function strategySelectorNode(state: AgentState): Promise<Partial<AgentState>> {
    logger.info(`[StrategySelectorNode] Selecting from ${state.backtestResults.length} strategies`);

    if (state.backtestResults.length === 0) {
        return {
            currentStep: 'STRATEGY_SELECTION_NONE',
            selectedStrategy: null,
            shouldExecute: false,
            thoughts: [...state.thoughts, 'No strategies to select from'],
        };
    }

    try {
        // ENHANCED: Filter with minimum quality thresholds
        const viableResults = state.backtestResults.filter(r => {
            // Must have minimum trades for statistical significance
            if (r.totalTrades < MIN_TRADES) {
                logger.debug(`[StrategySelectorNode] Filtered out ${r.strategyId}: only ${r.totalTrades} trades (min: ${MIN_TRADES})`);
                return false;
            }
            
            // Check Sharpe ratio isn't catastrophically bad
            if (r.sharpeRatio < MIN_SHARPE_RATIO) {
                logger.debug(`[StrategySelectorNode] Filtered out ${r.strategyId}: Sharpe ${r.sharpeRatio.toFixed(2)} < ${MIN_SHARPE_RATIO}`);
                return false;
            }
            
            // Check win rate meets minimum
            if (r.winRate < MIN_WIN_RATE * 100) {
                logger.debug(`[StrategySelectorNode] Filtered out ${r.strategyId}: Win rate ${r.winRate.toFixed(1)}% < ${MIN_WIN_RATE * 100}%`);
                return false;
            }
            
            // Check drawdown isn't catastrophic
            if (r.maxDrawdown > MAX_DRAWDOWN * 100) {
                logger.debug(`[StrategySelectorNode] Filtered out ${r.strategyId}: Drawdown ${r.maxDrawdown.toFixed(1)}% > ${MAX_DRAWDOWN * 100}%`);
                return false;
            }
            
            // Check total return isn't a total loss
            if (r.totalReturn < MIN_TOTAL_RETURN) {
                logger.debug(`[StrategySelectorNode] Filtered out ${r.strategyId}: Return ${r.totalReturn.toFixed(1)}% < ${MIN_TOTAL_RETURN}%`);
                return false;
            }
            
            return true;
        });

        // If no viable strategies pass quality filters, be more lenient but still require some data
        const fallbackResults = viableResults.length > 0
            ? viableResults
            : state.backtestResults.filter(r => r.totalTrades >= 1);

        if (fallbackResults.length === 0) {
            // No strategies with any trades - use best strategy idea with warnings
            if (state.strategyIdeas.length > 0) {
                logger.warn('[StrategySelectorNode] No backtest data available, using best strategy idea with caution');
                const bestIdea = state.strategyIdeas[0];

                const fallbackStrategy: Strategy = {
                    id: uuidv4(),
                    name: bestIdea.name,
                    description: bestIdea.description,
                    type: bestIdea.type,
                    symbols: bestIdea.symbols,
                    timeframe: bestIdea.timeframe,
                    parameters: bestIdea.parameters,
                    entryConditions: bestIdea.entryConditions,
                    exitConditions: bestIdea.exitConditions,
                    riskParameters: {
                        ...bestIdea.riskParameters,
                        // Reduce position size for untested strategies
                        maxPositionSize: bestIdea.riskParameters.maxPositionSize * 0.5,
                    },
                    isActive: true,
                    performance: {
                        totalTrades: 0,
                        winningTrades: 0,
                        losingTrades: 0,
                        winRate: 50,
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

                await dataManager.saveStrategy(fallbackStrategy);

                return {
                    currentStep: 'STRATEGY_SELECTED_FALLBACK',
                    selectedStrategy: fallbackStrategy,
                    shouldExecute: true,
                    thoughts: [
                        ...state.thoughts,
                        `No backtest data, using fallback strategy: ${fallbackStrategy.name}`,
                        'WARNING: Strategy has no backtest data - using reduced position size',
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

        // ENHANCED: Balanced scoring that still prioritizes returns but respects risk
        // Weights: Return (40%) + Sharpe (25%) + Win Rate (20%) + Drawdown Penalty (15%)
        const scoredResults = fallbackResults.map(r => {
            const idea = state.strategyIdeas.find(i => i.name === r.strategyId) ||
                state.strategyIdeas[state.backtestResults.indexOf(r)];

            // Return score (40% weight) - normalized to 0-0.4 range
            const returnScore = Math.max(0, Math.min(r.totalReturn / 50, 1)) * 0.4;

            // Sharpe ratio score (25% weight) - normalized, bonus for positive Sharpe
            const sharpeScore = Math.max(0, (r.sharpeRatio + 1) / 3) * 0.25;

            // Win rate score (20% weight)
            const winRateScore = (r.winRate / 100) * 0.2;

            // Drawdown penalty (15% weight) - less penalty for lower drawdown
            const drawdownScore = r.maxDrawdown < 100 
                ? ((100 - r.maxDrawdown) / 100) * 0.15
                : 0;

            // SMALL bonus for high positive returns (capped)
            const upsideBonus = r.totalReturn > 10 ? 0.05 : r.totalReturn > 5 ? 0.025 : 0;

            // PENALTY for very few trades (low statistical significance)
            const sampleSizePenalty = r.totalTrades < MIN_TRADES ? -0.1 : 0;

            const score = returnScore + sharpeScore + winRateScore + drawdownScore + upsideBonus + sampleSizePenalty;

            return { result: r, idea, score };
        });

        // Sort by score descending
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

        // Log all scored results for debugging
        logger.info(`[StrategySelectorNode] Top 3 strategies:`);
        scoredResults.slice(0, 3).forEach((s, i) => {
            logger.info(`  ${i + 1}. ${s.idea.name}: score=${s.score.toFixed(3)}, return=${s.result.totalReturn.toFixed(1)}%, sharpe=${s.result.sharpeRatio.toFixed(2)}, winRate=${s.result.winRate.toFixed(0)}%, trades=${s.result.totalTrades}`);
        });

        // Convert StrategyIdea to Strategy
        const strategy: Strategy = {
            id: uuidv4(),
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
        await dataManager.saveStrategy(strategy);

        logger.info(`[StrategySelectorNode] Selected: ${strategy.name} (Score: ${best.score.toFixed(3)}, Trades: ${best.result.totalTrades})`);

        return {
            currentStep: 'STRATEGY_SELECTED',
            selectedStrategy: strategy,
            shouldExecute: true,
            thoughts: [
                ...state.thoughts,
                `Selected strategy: ${strategy.name}`,
                `Score: ${best.score.toFixed(3)} (Sharpe: ${best.result.sharpeRatio.toFixed(2)}, Return: ${best.result.totalReturn.toFixed(2)}%, WinRate: ${best.result.winRate.toFixed(0)}%, Trades: ${best.result.totalTrades})`,
            ],
        };
    } catch (error) {
        logger.error('[StrategySelectorNode] Strategy selection failed:', error);
        return {
            currentStep: 'STRATEGY_SELECTION_ERROR',
            selectedStrategy: null,
            shouldExecute: false,
            errors: [...state.errors, `Strategy selection error: ${error}`],
        };
    }
}

export default strategySelectorNode;
