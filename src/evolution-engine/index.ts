/**
 * Strategy Evolution Engine
 * 
 * Genetic algorithm-based strategy optimization for PerpsTrader.
 * Evolves trading strategy parameters through mutation, crossover,
 * and selection based on backtest performance (Sharpe ratio).
 */

export { GeneticOptimizer, EvolutionSession } from './genetic-optimizer';
export { PopulationManager, PopulationConfig, GenerationStats, EvolutionResult } from './population-manager';
export { MutationEngine, MutationConfig } from './mutation-engine';
export { CrossoverEngine, CrossoverConfig } from './crossover-engine';
export { Selector, SelectionConfig, FitnessMetrics } from './selector';
export {
  StrategyParameters,
  StrategyGenome,
  ParameterBounds,
  PARAMETER_BOUNDS,
  TIMEFRAME_OPTIONS,
  createRandomGenome,
  genomeToStrategy,
} from './types';
