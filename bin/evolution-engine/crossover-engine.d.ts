/**
 * Crossover Engine
 * Handles recombination of strategy parameters from parent genomes
 */
import { StrategyGenome } from './types';
export interface CrossoverConfig {
    crossoverRate: number;
    uniformCrossoverRate: number;
    blendingAlpha: number;
    method: 'single-point' | 'multi-point' | 'uniform' | 'blend' | 'adaptive';
}
export declare const DEFAULT_CROSSOVER_CONFIG: CrossoverConfig;
export declare class CrossoverEngine {
    private config;
    constructor(config?: Partial<CrossoverConfig>);
    /**
     * Perform crossover between two parent genomes
     */
    crossover(parent1: StrategyGenome, parent2: StrategyGenome): StrategyGenome;
    /**
     * Select crossover method adaptively based on parent similarity
     */
    private selectAdaptiveMethod;
    /**
     * Perform crossover based on selected method
     */
    private performCrossoverByMethod;
    /**
     * Single-point crossover: swap all parameters after a random point
     */
    private singlePointCrossover;
    /**
     * Multi-point crossover: swap at multiple random points
     */
    private multiPointCrossover;
    /**
     * Multi-point crossover for a parameter group
     */
    private groupMultiPointCrossover;
    /**
     * Uniform crossover: randomly select each parameter independently
     */
    private uniformCrossover;
    /**
     * Uniform crossover for a parameter group
     */
    private groupUniformCrossover;
    /**
     * Blend crossover: create values between parents (good for fine-tuning)
     */
    private blendCrossover;
    /**
     * Blend crossover for a parameter group
     */
    private groupBlendCrossover;
    /**
     * Handle timing parameters crossover
     */
    private crossoverTiming;
    /**
     * Blend timing parameters
     */
    private blendTimingCrossover;
    /**
     * Blend two values
     */
    private blendValue;
    /**
     * Calculate similarity between two parameter sets
     */
    private calculateSimilarity;
    /**
     * Clone a genome (for when crossover is not performed)
     */
    private cloneGenome;
    /**
     * Validate and fix parameter consistency
     */
    private validateAndFixParameters;
    /**
     * Create offspring from a mating pool
     */
    createOffspring(matingPool: StrategyGenome[], offspringCount: number): StrategyGenome[];
    /**
     * Select parent using fitness-proportionate selection
     */
    private selectParent;
}
export default CrossoverEngine;
//# sourceMappingURL=crossover-engine.d.ts.map