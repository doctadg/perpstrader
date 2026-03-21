import { AgentState, StrategyIdea } from '../state';
import { BacktestResult, MarketData } from '../../shared/types';
/**
 * Backtester Node
 * Tests strategy ideas against historical data using vectorized operations
 */
export declare function backtesterNode(state: AgentState): Promise<Partial<AgentState>>;
/**
 * Vectorized backtest with realistic execution simulation.
 *
 * Realism features:
 * - Commission deducted from capital on every trade
 * - Slippage applied on entry and exit (average bps, always against trader)
 * - Next-bar execution (signal on candle N, fill at candle N+1 open)
 * - Intrabar stop/take-profit using candle high/low
 * - Position cooldown (min bars between entries)
 * - Funding rate charged while in position
 * - Volume filter to skip low-liquidity entries
 * - Proper Sortino (downside deviation), VaR95 (5th percentile), expectancy
 */
export declare function vectorizedBacktest(idea: StrategyIdea, candles: MarketData[], closes?: Float64Array): Promise<BacktestResult>;
export default backtesterNode;
//# sourceMappingURL=backtester.d.ts.map