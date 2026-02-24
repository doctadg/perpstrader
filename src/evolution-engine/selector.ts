/**
 * Selector
 * Selects top strategies for next generation based on fitness metrics
 */

import { StrategyGenome } from './types';

export interface SelectionConfig {
  selectionMethod: 'tournament' | 'roulette' | 'rank' | 'truncation';
  tournamentSize: number;      // For tournament selection
  eliteCount: number;          // Number of best genomes to always keep
  diversityPreservation: number; // Percentage of slots reserved for diversity
}

export const DEFAULT_SELECTION_CONFIG: SelectionConfig = {
  selectionMethod: 'tournament',
  tournamentSize: 3,
  eliteCount: 2,
  diversityPreservation: 0.1,
};

export interface FitnessMetrics {
  sharpeRatio: number;
  totalReturn: number;
  maxDrawdown: number;
  winRate: number;
  profitFactor: number;
  totalTrades: number;
}

export class Selector {
  private config: SelectionConfig;

  constructor(config: Partial<SelectionConfig> = {}) {
    this.config = { ...DEFAULT_SELECTION_CONFIG, ...config };
  }

  /**
   * Calculate fitness score from backtest metrics
   * Uses Sharpe ratio as primary fitness with penalties for high drawdown
   */
  calculateFitness(metrics: FitnessMetrics): number {
    // Base fitness is Sharpe ratio
    let fitness = metrics.sharpeRatio;

    // Apply drawdown penalty (exponential penalty for drawdown > 20%)
    if (metrics.maxDrawdown > 0.2) {
      fitness *= Math.exp(-(metrics.maxDrawdown - 0.2) * 5);
    }

    // Minimum trades requirement (avoid overfitting to few trades)
    if (metrics.totalTrades < 10) {
      fitness *= metrics.totalTrades / 10;
    }

    // Win rate bonus (slight preference for consistency)
    if (metrics.winRate > 0.5) {
      fitness *= 1 + (metrics.winRate - 0.5) * 0.2;
    }

    // Profit factor bonus
    if (metrics.profitFactor > 1) {
      fitness *= 1 + (metrics.profitFactor - 1) * 0.1;
    }

    // Ensure non-negative fitness
    return Math.max(0, fitness);
  }

  /**
   * Calculate fitness from a genome's existing metrics
   */
  calculateGenomeFitness(genome: StrategyGenome): number {
    if (!genome.sharpeRatio || !genome.maxDrawdown || !genome.totalTrades) {
      return genome.fitness || 0;
    }

    return this.calculateFitness({
      sharpeRatio: genome.sharpeRatio,
      totalReturn: genome.totalReturn || 0,
      maxDrawdown: genome.maxDrawdown,
      winRate: genome.winRate || 0,
      profitFactor: 0, // Not stored in genome
      totalTrades: genome.totalTrades,
    });
  }

  /**
   * Select next generation from population
   */
  selectNextGeneration(
    population: StrategyGenome[],
    targetSize: number
  ): StrategyGenome[] {
    // Ensure all genomes have fitness calculated
    const evaluated = population.map(g => ({
      ...g,
      fitness: g.fitness ?? this.calculateGenomeFitness(g),
    }));

    // Sort by fitness
    const sorted = [...evaluated].sort((a, b) => (b.fitness || 0) - (a.fitness || 0));

    const selected: StrategyGenome[] = [];

    // 1. Elitism: Keep top performers unchanged
    const elites = sorted.slice(0, this.config.eliteCount);
    selected.push(...elites);

    // 2. Diversity preservation: Select some dissimilar genomes
    const diversitySlots = Math.floor(targetSize * this.config.diversityPreservation);
    const diversitySelections = this.selectDiverseGenomes(
      sorted.slice(this.config.eliteCount),
      diversitySlots
    );
    selected.push(...diversitySelections);

    // 3. Fill remaining slots using selection method
    const remainingSlots = targetSize - selected.length;
    const candidates = sorted.filter(g => !selected.some(s => s.id === g.id));
    
    const methodSelections = this.selectByMethod(candidates, remainingSlots);
    selected.push(...methodSelections);

    return selected.slice(0, targetSize);
  }

  /**
   * Select genomes using configured method
   */
  private selectByMethod(candidates: StrategyGenome[], count: number): StrategyGenome[] {
    switch (this.config.selectionMethod) {
      case 'tournament':
        return this.tournamentSelection(candidates, count);
      case 'roulette':
        return this.rouletteSelection(candidates, count);
      case 'rank':
        return this.rankSelection(candidates, count);
      case 'truncation':
        return this.truncationSelection(candidates, count);
      default:
        return this.tournamentSelection(candidates, count);
    }
  }

  /**
   * Tournament selection
   */
  private tournamentSelection(candidates: StrategyGenome[], count: number): StrategyGenome[] {
    const selected: StrategyGenome[] = [];

    while (selected.length < count) {
      let best = candidates[Math.floor(Math.random() * candidates.length)];

      for (let i = 1; i < this.config.tournamentSize; i++) {
        const contender = candidates[Math.floor(Math.random() * candidates.length)];
        if ((contender.fitness || 0) > (best.fitness || 0)) {
          best = contender;
        }
      }

      selected.push(best);
    }

    return selected;
  }

  /**
   * Roulette wheel (fitness proportionate) selection
   */
  private rouletteSelection(candidates: StrategyGenome[], count: number): StrategyGenome[] {
    const fitnesses = candidates.map(g => Math.max(0, g.fitness || 0));
    const totalFitness = fitnesses.reduce((a, b) => a + b, 0);

    if (totalFitness === 0) {
      // If no fitness, select randomly
      return Array.from({ length: count }, () => 
        candidates[Math.floor(Math.random() * candidates.length)]
      );
    }

    const selected: StrategyGenome[] = [];
    while (selected.length < count) {
      let random = Math.random() * totalFitness;
      for (let i = 0; i < candidates.length; i++) {
        random -= fitnesses[i];
        if (random <= 0) {
          selected.push(candidates[i]);
          break;
        }
      }
    }

    return selected;
  }

  /**
   * Rank-based selection (less pressure than fitness proportionate)
   */
  private rankSelection(candidates: StrategyGenome[], count: number): StrategyGenome[] {
    const sorted = [...candidates].sort((a, b) => (b.fitness || 0) - (a.fitness || 0));
    const n = sorted.length;
    
    // Linear rank probabilities
    const rankSum = (n * (n + 1)) / 2;

    const selected: StrategyGenome[] = [];
    while (selected.length < count) {
      const random = Math.random() * rankSum;
      let cumulative = 0;
      
      for (let rank = 0; rank < n; rank++) {
        cumulative += (n - rank);
        if (random <= cumulative) {
          selected.push(sorted[rank]);
          break;
        }
      }
    }

    return selected;
  }

  /**
   * Truncation selection (top X%)
   */
  private truncationSelection(candidates: StrategyGenome[], count: number): StrategyGenome[] {
    const sorted = [...candidates].sort((a, b) => (b.fitness || 0) - (a.fitness || 0));
    const cutoff = Math.ceil(candidates.length * 0.5); // Top 50%
    const topCandidates = sorted.slice(0, cutoff);

    return Array.from({ length: count }, () => 
      topCandidates[Math.floor(Math.random() * topCandidates.length)]
    );
  }

  /**
   * Select diverse genomes using crowding distance
   */
  private selectDiverseGenomes(candidates: StrategyGenome[], count: number): StrategyGenome[] {
    if (candidates.length <= count) return candidates;

    const selected: StrategyGenome[] = [];
    const available = [...candidates];

    // Start with the best
    available.sort((a, b) => (b.fitness || 0) - (a.fitness || 0));
    selected.push(available.shift()!);

    while (selected.length < count && available.length > 0) {
      // Find the genome with maximum minimum distance to selected
      let maxMinDistance = -1;
      let maxIndex = 0;

      for (let i = 0; i < available.length; i++) {
        const minDistance = Math.min(...selected.map(s => this.calculateDistance(available[i], s)));
        if (minDistance > maxMinDistance) {
          maxMinDistance = minDistance;
          maxIndex = i;
        }
      }

      selected.push(available[maxIndex]);
      available.splice(maxIndex, 1);
    }

    return selected;
  }

  /**
   * Calculate Euclidean distance between two genomes in parameter space
   */
  private calculateDistance(g1: StrategyGenome, g2: StrategyGenome): number {
    let sumSquaredDiff = 0;
    let count = 0;

    const addDiff = (a: number, b: number) => {
      sumSquaredDiff += Math.pow(a - b, 2);
      count++;
    };

    // Entry thresholds
    Object.keys(g1.parameters.entryThresholds).forEach(key => {
      addDiff(g1.parameters.entryThresholds[key], g2.parameters.entryThresholds[key]);
    });

    // Risk parameters
    Object.keys(g1.parameters.riskParameters).forEach(key => {
      addDiff(g1.parameters.riskParameters[key], g2.parameters.riskParameters[key]);
    });

    // Filter parameters
    Object.keys(g1.parameters.filterParameters).forEach(key => {
      addDiff(g1.parameters.filterParameters[key], g2.parameters.filterParameters[key]);
    });

    // Timing parameters
    addDiff(g1.parameters.timingParameters.maxHoldTime, g2.parameters.timingParameters.maxHoldTime);
    addDiff(g1.parameters.timingParameters.minHoldTime, g2.parameters.timingParameters.minHoldTime);

    return Math.sqrt(sumSquaredDiff / count);
  }

  /**
   * Check for convergence in population
   */
  checkConvergence(population: StrategyGenome[], threshold: number = 0.05): boolean {
    if (population.length < 2) return false;

    // Calculate average pairwise distance
    let totalDistance = 0;
    let pairs = 0;

    for (let i = 0; i < population.length; i++) {
      for (let j = i + 1; j < population.length; j++) {
        totalDistance += this.calculateDistance(population[i], population[j]);
        pairs++;
      }
    }

    const avgDistance = totalDistance / pairs;
    
    // Also check fitness variance
    const fitnesses = population.map(g => g.fitness || 0);
    const avgFitness = fitnesses.reduce((a, b) => a + b, 0) / fitnesses.length;
    const variance = fitnesses.reduce((sum, f) => sum + Math.pow(f - avgFitness, 2), 0) / fitnesses.length;
    const cv = avgFitness > 0 ? Math.sqrt(variance) / avgFitness : 0;

    // Converged if both distance and fitness variation are low
    return avgDistance < threshold && cv < threshold;
  }

  /**
   * Get statistics about the population
   */
  getPopulationStats(population: StrategyGenome[]) {
    const fitnesses = population.map(g => g.fitness || 0);
    const avg = fitnesses.reduce((a, b) => a + b, 0) / fitnesses.length;
    const min = Math.min(...fitnesses);
    const max = Math.max(...fitnesses);
    const variance = fitnesses.reduce((sum, f) => sum + Math.pow(f - avg, 2), 0) / fitnesses.length;

    return {
      size: population.length,
      avgFitness: avg,
      minFitness: min,
      maxFitness: max,
      stdDev: Math.sqrt(variance),
      bestGenome: population.find(g => g.fitness === max),
    };
  }
}

export default Selector;
