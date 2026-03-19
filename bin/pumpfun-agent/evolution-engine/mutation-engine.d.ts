/**
 * Mutation Engine
 * Handles mutation of strategy parameters using various mutation strategies
 */
import { StrategyGenome } from './types';
export interface MutationConfig {
    mutationRate: number;
    mutationStrength: number;
    adaptiveMutation: boolean;
    elitePreservation: number;
}
export declare const DEFAULT_MUTATION_CONFIG: MutationConfig;
export declare class MutationEngine {
    private config;
    private generationMutationRate;
    constructor(config?: Partial<MutationConfig>);
    /**
     * Apply mutation to a genome
     */
    mutate(genome: StrategyGenome, isElite?: boolean): StrategyGenome;
    /**
     * Mutate a group of numeric parameters
     */
    private mutateGroup;
    /**
     * Mutate timing parameters (includes string timeframe)
     */
    private mutateTimingParameters;
    /**
     * Mutate a single numeric value
     */
    private mutateValue;
    /**
     * Mutate timeframe by shifting up or down
     */
    private mutateTimeframe;
    /**
     * Validate and fix parameter consistency
     */
    private validateAndFixParameters;
    /**
     * Apply adaptive mutation based on population diversity
     */
    updateAdaptiveMutation(population: StrategyGenome[]): void;
    /**
     * Reset mutation rate for new generation
     */
    resetMutationRate(): void;
    /**
     * Batch mutate a population
     */
    mutatePopulation(population: StrategyGenome[], offspringCount: number): StrategyGenome[];
    /**
     * Select parent using tournament selection
     */
    private selectParent;
}
export default MutationEngine;
//# sourceMappingURL=mutation-engine.d.ts.map