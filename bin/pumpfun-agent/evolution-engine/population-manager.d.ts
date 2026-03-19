/**
 * Population Manager
 * Manages generations of strategy variants
 */
import { StrategyGenome } from './types';
import { MutationEngine } from './mutation-engine';
import { CrossoverEngine } from './crossover-engine';
import { Selector, FitnessMetrics } from './selector';
export interface PopulationConfig {
    populationSize: number;
    offspringCount: number;
    maxGenerations: number;
    convergenceThreshold: number;
    stagnationLimit: number;
    seedPopulationSize: number;
}
export declare const DEFAULT_POPULATION_CONFIG: PopulationConfig;
export interface GenerationStats {
    generation: number;
    bestFitness: number;
    avgFitness: number;
    worstFitness: number;
    bestSharpeRatio: number;
    bestTotalReturn: number;
    bestMaxDrawdown: number;
    bestWinRate: number;
    diversity: number;
    convergence: boolean;
    improved: boolean;
}
export interface EvolutionResult {
    success: boolean;
    generations: number;
    bestGenome: StrategyGenome;
    finalPopulation: StrategyGenome[];
    history: GenerationStats[];
    reason: 'converged' | 'max_generations' | 'stagnation' | 'error';
    error?: string;
}
export declare class PopulationManager {
    private config;
    private mutationEngine;
    private crossoverEngine;
    private selector;
    private currentGeneration;
    private population;
    private history;
    private bestFitnessEver;
    private stagnationCount;
    private generationCache;
    constructor(config?: Partial<PopulationConfig>, mutationEngine?: MutationEngine, crossoverEngine?: CrossoverEngine, selector?: Selector);
    /**
     * Initialize population with random genomes
     */
    initializePopulation(seedGenomes?: StrategyGenome[]): StrategyGenome[];
    /**
     * Initialize from top performing strategies
     */
    initializeFromTopStrategies(topStrategies: any[]): StrategyGenome[];
    /**
     * Convert strategy to parameters
     */
    private strategyToParameters;
    /**
     * Evolve to next generation
     */
    evolveNextGeneration(evaluateFitness: (genome: StrategyGenome) => Promise<FitnessMetrics>): Promise<GenerationStats>;
    /**
     * Create offspring through mutation and crossover
     */
    private createOffspring;
    /**
     * Run complete evolution process
     */
    runEvolution(evaluateFitness: (genome: StrategyGenome) => Promise<FitnessMetrics>, onGeneration?: (stats: GenerationStats) => void): Promise<EvolutionResult>;
    /**
     * Calculate statistics for current generation
     */
    private calculateGenerationStats;
    /**
     * Calculate simple distance between genomes
     */
    private calculateSimpleDistance;
    /**
     * Get the best genome from current population
     */
    getBestGenome(): StrategyGenome;
    /**
     * Get current population
     */
    getPopulation(): StrategyGenome[];
    /**
     * Get generation history
     */
    getHistory(): GenerationStats[];
    /**
     * Get current generation number
     */
    getCurrentGeneration(): number;
    /**
     * Cache generation for retrieval
     */
    private cacheGeneration;
    /**
     * Get cached generation
     */
    getCachedGeneration(gen: number): StrategyGenome[] | undefined;
    /**
     * Clear all caches
     */
    clearCache(): void;
}
export default PopulationManager;
//# sourceMappingURL=population-manager.d.ts.map