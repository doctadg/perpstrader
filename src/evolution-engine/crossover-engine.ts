/**
 * Crossover Engine
 * Handles recombination of strategy parameters from parent genomes
 */

import { StrategyGenome, StrategyParameters, PARAMETER_BOUNDS } from './types';

export interface CrossoverConfig {
  crossoverRate: number;       // Probability of crossover vs cloning
  uniformCrossoverRate: number; // For uniform crossover, probability per gene
  blendingAlpha: number;       // For blending crossover (0-1)
  method: 'single-point' | 'multi-point' | 'uniform' | 'blend' | 'adaptive';
}

export const DEFAULT_CROSSOVER_CONFIG: CrossoverConfig = {
  crossoverRate: 0.8,
  uniformCrossoverRate: 0.5,
  blendingAlpha: 0.5,
  method: 'adaptive',
};

export class CrossoverEngine {
  private config: CrossoverConfig;

  constructor(config: Partial<CrossoverConfig> = {}) {
    this.config = { ...DEFAULT_CROSSOVER_CONFIG, ...config };
  }

  /**
   * Perform crossover between two parent genomes
   */
  crossover(parent1: StrategyGenome, parent2: StrategyGenome): StrategyGenome {
    const { v4: uuidv4 } = require('uuid');

    // Decide whether to perform crossover
    if (Math.random() > this.config.crossoverRate) {
      // Return clone of better parent
      const better = (parent1.fitness || 0) >= (parent2.fitness || 0) ? parent1 : parent2;
      return this.cloneGenome(better);
    }

    // Select crossover method
    let method = this.config.method;
    if (method === 'adaptive') {
      method = this.selectAdaptiveMethod(parent1, parent2);
    }

    const childParams = this.performCrossoverByMethod(
      parent1.parameters,
      parent2.parameters,
      method
    );

    // Validate and fix parameters
    this.validateAndFixParameters(childParams);

    return {
      id: uuidv4(),
      parentIds: [parent1.id, parent2.id],
      generation: Math.max(parent1.generation, parent2.generation) + 1,
      parameters: childParams,
      fitness: undefined,
      sharpeRatio: undefined,
      totalReturn: undefined,
      maxDrawdown: undefined,
      winRate: undefined,
      totalTrades: undefined,
      createdAt: new Date(),
      backtestResult: undefined,
    };
  }

  /**
   * Select crossover method adaptively based on parent similarity
   */
  private selectAdaptiveMethod(parent1: StrategyGenome, parent2: StrategyGenome): CrossoverConfig['method'] {
    const similarity = this.calculateSimilarity(parent1.parameters, parent2.parameters);
    
    // If parents are very similar, use blending to explore between them
    if (similarity > 0.8) return 'blend';
    // If parents are very different, use single-point to preserve good blocks
    if (similarity < 0.4) return 'single-point';
    // Otherwise use uniform for diverse recombination
    return 'uniform';
  }

  /**
   * Perform crossover based on selected method
   */
  private performCrossoverByMethod(
    p1: StrategyParameters,
    p2: StrategyParameters,
    method: CrossoverConfig['method']
  ): StrategyParameters {
    switch (method) {
      case 'single-point':
        return this.singlePointCrossover(p1, p2);
      case 'multi-point':
        return this.multiPointCrossover(p1, p2);
      case 'uniform':
        return this.uniformCrossover(p1, p2);
      case 'blend':
        return this.blendCrossover(p1, p2);
      default:
        return this.uniformCrossover(p1, p2);
    }
  }

  /**
   * Single-point crossover: swap all parameters after a random point
   */
  private singlePointCrossover(p1: StrategyParameters, p2: StrategyParameters): StrategyParameters {
    const crossoverPoint = Math.floor(Math.random() * 4);

    return {
      entryThresholds: crossoverPoint >= 0 ? { ...p1.entryThresholds } : { ...p2.entryThresholds },
      riskParameters: crossoverPoint >= 1 ? { ...p1.riskParameters } : { ...p2.riskParameters },
      timingParameters: crossoverPoint >= 2 
        ? this.crossoverTiming(p1.timingParameters, p2.timingParameters, true) 
        : this.crossoverTiming(p2.timingParameters, p1.timingParameters, true),
      filterParameters: crossoverPoint >= 3 ? { ...p1.filterParameters } : { ...p2.filterParameters },
    };
  }

  /**
   * Multi-point crossover: swap at multiple random points
   */
  private multiPointCrossover(p1: StrategyParameters, p2: StrategyParameters): StrategyParameters {
    return {
      entryThresholds: this.groupMultiPointCrossover(p1.entryThresholds, p2.entryThresholds),
      riskParameters: this.groupMultiPointCrossover(p1.riskParameters, p2.riskParameters),
      timingParameters: this.crossoverTiming(p1.timingParameters, p2.timingParameters, false),
      filterParameters: this.groupMultiPointCrossover(p1.filterParameters, p2.filterParameters),
    };
  }

  /**
   * Multi-point crossover for a parameter group
   */
  private groupMultiPointCrossover(
    group1: Record<string, number>,
    group2: Record<string, number>
  ): any {
    const result: Record<string, number> = {};
    const keys = Object.keys(group1);

    for (const key of keys) {
      // Randomly select from either parent
      result[key] = Math.random() < 0.5 ? group1[key] : group2[key];
    }

    return result;
  }

  /**
   * Uniform crossover: randomly select each parameter independently
   */
  private uniformCrossover(p1: StrategyParameters, p2: StrategyParameters): StrategyParameters {
    return {
      entryThresholds: this.groupUniformCrossover(p1.entryThresholds, p2.entryThresholds),
      riskParameters: this.groupUniformCrossover(p1.riskParameters, p2.riskParameters),
      timingParameters: this.crossoverTiming(p1.timingParameters, p2.timingParameters, false),
      filterParameters: this.groupUniformCrossover(p1.filterParameters, p2.filterParameters),
    };
  }

  /**
   * Uniform crossover for a parameter group
   */
  private groupUniformCrossover(
    group1: Record<string, number>,
    group2: Record<string, number>
  ): any {
    const result: Record<string, number> = {};
    const keys = Object.keys(group1);

    for (const key of keys) {
      result[key] = Math.random() < this.config.uniformCrossoverRate ? group1[key] : group2[key];
    }

    return result;
  }

  /**
   * Blend crossover: create values between parents (good for fine-tuning)
   */
  private blendCrossover(p1: StrategyParameters, p2: StrategyParameters): StrategyParameters {
    return {
      entryThresholds: this.groupBlendCrossover(p1.entryThresholds, p2.entryThresholds, 'entryThresholds'),
      riskParameters: this.groupBlendCrossover(p1.riskParameters, p2.riskParameters, 'riskParameters'),
      timingParameters: this.blendTimingCrossover(p1.timingParameters, p2.timingParameters),
      filterParameters: this.groupBlendCrossover(p1.filterParameters, p2.filterParameters, 'filterParameters'),
    };
  }

  /**
   * Blend crossover for a parameter group
   */
  private groupBlendCrossover(
    group1: Record<string, number>,
    group2: Record<string, number>,
    groupName: string
  ): any {
    const result: Record<string, number> = {};
    const bounds = PARAMETER_BOUNDS[groupName];

    for (const key of Object.keys(group1)) {
      const min = Math.min(group1[key], group2[key]);
      const max = Math.max(group1[key], group2[key]);
      const range = max - min;
      
      // Extend range by alpha
      const extendedMin = min - range * this.config.blendingAlpha;
      const extendedMax = max + range * this.config.blendingAlpha;
      
      // Sample from extended range
      let value = extendedMin + Math.random() * (extendedMax - extendedMin);
      
      // Apply bounds and step
      if (bounds[key]) {
        const { min: boundMin, max: boundMax, step, integer } = bounds[key];
        value = Math.max(boundMin, Math.min(boundMax, value));
        if (step) value = Math.round(value / step) * step;
        if (integer) value = Math.round(value);
      }
      
      result[key] = value;
    }

    return result;
  }

  /**
   * Handle timing parameters crossover
   */
  private crossoverTiming(
    t1: StrategyParameters['timingParameters'],
    t2: StrategyParameters['timingParameters'],
    useFirst: boolean
  ): StrategyParameters['timingParameters'] {
    if (useFirst) {
      return { ...t1 };
    }
    return Math.random() < 0.5 ? { ...t1 } : { ...t2 };
  }

  /**
   * Blend timing parameters
   */
  private blendTimingCrossover(
    t1: StrategyParameters['timingParameters'],
    t2: StrategyParameters['timingParameters']
  ): StrategyParameters['timingParameters'] {
    const bounds = PARAMETER_BOUNDS.timingParameters;
    
    return {
      timeframe: Math.random() < 0.5 ? t1.timeframe : t2.timeframe,
      maxHoldTime: this.blendValue(t1.maxHoldTime, t2.maxHoldTime, bounds.maxHoldTime),
      minHoldTime: this.blendValue(t1.minHoldTime, t2.minHoldTime, bounds.minHoldTime),
    };
  }

  /**
   * Blend two values
   */
  private blendValue(v1: number, v2: number, bounds: { min: number; max: number; step?: number; integer?: boolean }): number {
    const min = Math.min(v1, v2);
    const max = Math.max(v1, v2);
    const range = max - min;
    
    let value = min - range * this.config.blendingAlpha + 
                Math.random() * (max - min + 2 * range * this.config.blendingAlpha);
    
    value = Math.max(bounds.min, Math.min(bounds.max, value));
    if (bounds.step) value = Math.round(value / bounds.step) * bounds.step;
    if (bounds.integer) value = Math.round(value);
    
    return value;
  }

  /**
   * Calculate similarity between two parameter sets
   */
  private calculateSimilarity(p1: StrategyParameters, p2: StrategyParameters): number {
    let totalDiff = 0;
    let count = 0;

    // Compare numeric parameters
    const compareGroup = (g1: Record<string, number>, g2: Record<string, number>, bounds: Record<string, { min: number; max: number }>) => {
      for (const key of Object.keys(g1)) {
        const range = bounds[key].max - bounds[key].min;
        const diff = Math.abs(g1[key] - g2[key]) / range;
        totalDiff += diff;
        count++;
      }
    };

    compareGroup(p1.entryThresholds, p2.entryThresholds, PARAMETER_BOUNDS.entryThresholds);
    compareGroup(p1.riskParameters, p2.riskParameters, PARAMETER_BOUNDS.riskParameters);
    compareGroup(p1.filterParameters, p2.filterParameters, PARAMETER_BOUNDS.filterParameters);

    // Timeframe similarity
    if (p1.timingParameters.timeframe === p2.timingParameters.timeframe) {
      totalDiff += 0;
    } else {
      totalDiff += 1;
    }
    count++;

    // Timing numeric parameters
    const timeBounds = PARAMETER_BOUNDS.timingParameters;
    totalDiff += Math.abs(p1.timingParameters.maxHoldTime - p2.timingParameters.maxHoldTime) / 
                 (timeBounds.maxHoldTime.max - timeBounds.maxHoldTime.min);
    totalDiff += Math.abs(p1.timingParameters.minHoldTime - p2.timingParameters.minHoldTime) / 
                 (timeBounds.minHoldTime.max - timeBounds.minHoldTime.min);
    count += 2;

    return 1 - (totalDiff / count);
  }

  /**
   * Clone a genome (for when crossover is not performed)
   */
  private cloneGenome(parent: StrategyGenome): StrategyGenome {
    const { v4: uuidv4 } = require('uuid');

    return {
      id: uuidv4(),
      parentIds: [parent.id],
      generation: parent.generation + 1,
      parameters: JSON.parse(JSON.stringify(parent.parameters)),
      fitness: undefined,
      sharpeRatio: undefined,
      totalReturn: undefined,
      maxDrawdown: undefined,
      winRate: undefined,
      totalTrades: undefined,
      createdAt: new Date(),
      backtestResult: undefined,
    };
  }

  /**
   * Validate and fix parameter consistency
   */
  private validateAndFixParameters(params: StrategyParameters): void {
    // Ensure emaFast < emaSlow
    if (params.entryThresholds.emaFast >= params.entryThresholds.emaSlow) {
      params.entryThresholds.emaSlow = params.entryThresholds.emaFast + 5;
    }

    // Ensure minVolatility < maxVolatility
    if (params.filterParameters.minVolatility >= params.filterParameters.maxVolatility) {
      params.filterParameters.maxVolatility = params.filterParameters.minVolatility + 0.01;
    }

    // Ensure minHoldTime < maxHoldTime
    if (params.timingParameters.minHoldTime >= params.timingParameters.maxHoldTime) {
      params.timingParameters.maxHoldTime = params.timingParameters.minHoldTime + 10;
    }

    // Ensure RSI thresholds make sense
    if (params.entryThresholds.rsiOversold >= params.entryThresholds.rsiOverbought) {
      const mid = (params.entryThresholds.rsiOversold + params.entryThresholds.rsiOverbought) / 2;
      params.entryThresholds.rsiOversold = Math.max(10, mid - 15);
      params.entryThresholds.rsiOverbought = Math.min(90, mid + 15);
    }
  }

  /**
   * Create offspring from a mating pool
   */
  createOffspring(matingPool: StrategyGenome[], offspringCount: number): StrategyGenome[] {
    const offspring: StrategyGenome[] = [];

    while (offspring.length < offspringCount) {
      // Select two parents using tournament selection
      const parent1 = this.selectParent(matingPool);
      const parent2 = this.selectParent(matingPool);

      if (parent1.id === parent2.id) {
        // If same parent selected twice, clone it
        offspring.push(this.cloneGenome(parent1));
      } else {
        offspring.push(this.crossover(parent1, parent2));
      }
    }

    return offspring;
  }

  /**
   * Select parent using fitness-proportionate selection
   */
  private selectParent(pool: StrategyGenome[]): StrategyGenome {
    // Use roulette wheel selection based on fitness
    const fitnesses = pool.map(g => Math.max(0, g.fitness || 0));
    const totalFitness = fitnesses.reduce((a, b) => a + b, 0);

    if (totalFitness === 0) {
      return pool[Math.floor(Math.random() * pool.length)];
    }

    let random = Math.random() * totalFitness;
    for (let i = 0; i < pool.length; i++) {
      random -= fitnesses[i];
      if (random <= 0) {
        return pool[i];
      }
    }

    return pool[pool.length - 1];
  }
}

export default CrossoverEngine;
