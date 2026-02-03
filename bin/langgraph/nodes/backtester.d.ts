import { AgentState, StrategyIdea } from '../state';
import { BacktestResult, MarketData } from '../../shared/types';
/**
 * Backtester Node
 * Tests strategy ideas against historical data using vectorized operations
 */
export declare function backtesterNode(state: AgentState): Promise<Partial<AgentState>>;
/**
 * Vectorized backtest using typed arrays for performance
 */
export declare function vectorizedBacktest(idea: StrategyIdea, candles: MarketData[], closes?: Float64Array): Promise<BacktestResult>;
export default backtesterNode;
//# sourceMappingURL=backtester.d.ts.map