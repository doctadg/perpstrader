/**
 * Selector
 * Selects top strategies for next generation based on fitness metrics
 */
import { StrategyGenome } from './types';
export interface SelectionConfig {
    selectionMethod: 'tournament' | 'roulette' | 'rank' | 'truncation';
    tournamentSize: number;
    eliteCount: number;
    diversityPreservation: number;
}
export declare const DEFAULT_SELECTION_CONFIG: SelectionConfig;
export interface FitnessMetrics {
    sharpeRatio: number;
    totalReturn: number;
    maxDrawdown: number;
    winRate: number;
    profitFactor: number;
    totalTrades: number;
}
export declare class Selector {
    private config;
    constructor(config?: Partial<SelectionConfig>);
    /**
     * Calculate fitness score from backtest metrics
     * Uses Sharpe ratio as primary fitness with penalties for high drawdown
     */
    calculateFitness(metrics: FitnessMetrics): number;
    /**
     * Calculate fitness from a genome's existing metrics
     */
    calculateGenomeFitness(genome: StrategyGenome): number;
    /**
     * Select next generation from population
     */
    selectNextGeneration(population: StrategyGenome[], targetSize: number): StrategyGenome[];
    /**
     * Select genomes using configured method
     */
    private selectByMethod;
    /**
     * Tournament selection
     */
    private tournamentSelection;
    /**
     * Roulette wheel (fitness proportionate) selection
     */
    private rouletteSelection;
    /**
     * Rank-based selection (less pressure than fitness proportionate)
     */
    private rankSelection;
    /**
     * Truncation selection (top X%)
     */
    private truncationSelection;
    /**
     * Select diverse genomes using crowding distance
     */
    private selectDiverseGenomes;
    /**
     * Calculate Euclidean distance between two genomes in parameter space
     */
    private calculateDistance;
    /**
     * Check for convergence in population
     */
    checkConvergence(population: StrategyGenome[], threshold?: number): boolean;
    /**
     * Get statistics about the population
     */
    getPopulationStats(population: StrategyGenome[]): {
        size: number;
        avgFitness: number;
        minFitness: number;
        maxFitness: number;
        stdDev: number;
        bestGenome: StrategyGenome | undefined;
    };
}
export default Selector;
//# sourceMappingURL=selector.d.ts.map