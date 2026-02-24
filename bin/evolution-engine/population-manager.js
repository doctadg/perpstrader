"use strict";
/**
 * Population Manager
 * Manages generations of strategy variants
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PopulationManager = exports.DEFAULT_POPULATION_CONFIG = void 0;
const types_1 = require("./types");
const mutation_engine_1 = require("./mutation-engine");
const crossover_engine_1 = require("./crossover-engine");
const selector_1 = require("./selector");
exports.DEFAULT_POPULATION_CONFIG = {
    populationSize: 5,
    offspringCount: 20,
    maxGenerations: 10,
    convergenceThreshold: 0.01,
    stagnationLimit: 3,
    seedPopulationSize: 20,
};
class PopulationManager {
    config;
    mutationEngine;
    crossoverEngine;
    selector;
    currentGeneration = 0;
    population = [];
    history = [];
    bestFitnessEver = -Infinity;
    stagnationCount = 0;
    generationCache = new Map();
    constructor(config = {}, mutationEngine, crossoverEngine, selector) {
        this.config = { ...exports.DEFAULT_POPULATION_CONFIG, ...config };
        this.mutationEngine = mutationEngine || new mutation_engine_1.MutationEngine();
        this.crossoverEngine = crossoverEngine || new crossover_engine_1.CrossoverEngine();
        this.selector = selector || new selector_1.Selector();
    }
    /**
     * Initialize population with random genomes
     */
    initializePopulation(seedGenomes) {
        this.currentGeneration = 0;
        this.population = [];
        this.history = [];
        this.bestFitnessEver = -Infinity;
        this.stagnationCount = 0;
        this.generationCache.clear();
        if (seedGenomes && seedGenomes.length > 0) {
            // Use provided seed genomes
            this.population = seedGenomes.map(g => ({
                ...g,
                generation: 0,
                parentIds: [],
            }));
            // Fill remaining with random genomes
            while (this.population.length < this.config.seedPopulationSize) {
                this.population.push((0, types_1.createRandomGenome)(0));
            }
        }
        else {
            // Create entirely random population
            for (let i = 0; i < this.config.seedPopulationSize; i++) {
                this.population.push((0, types_1.createRandomGenome)(0));
            }
        }
        // Limit to seed population size
        this.population = this.population.slice(0, this.config.seedPopulationSize);
        this.cacheGeneration(0, this.population);
        return this.population;
    }
    /**
     * Initialize from top performing strategies
     */
    initializeFromTopStrategies(topStrategies) {
        const seedGenomes = topStrategies.map((strategy, index) => ({
            id: strategy.id || `seed-${index}`,
            parentIds: [],
            generation: 0,
            parameters: this.strategyToParameters(strategy),
            fitness: strategy.performance?.sharpeRatio || 0,
            sharpeRatio: strategy.performance?.sharpeRatio,
            totalReturn: strategy.performance?.totalPnL,
            maxDrawdown: strategy.performance?.maxDrawdown,
            winRate: strategy.performance?.winRate,
            totalTrades: strategy.performance?.totalTrades,
            createdAt: new Date(),
        }));
        return this.initializePopulation(seedGenomes);
    }
    /**
     * Convert strategy to parameters
     */
    strategyToParameters(strategy) {
        return {
            entryThresholds: {
                rsiOverbought: strategy.parameters?.rsiOverbought || 70,
                rsiOversold: strategy.parameters?.rsiOversold || 30,
                emaFast: strategy.parameters?.emaFast || 12,
                emaSlow: strategy.parameters?.emaSlow || 26,
                volumeThreshold: strategy.parameters?.volumeThreshold || 1.5,
                macdSignalThreshold: strategy.parameters?.macdSignalThreshold || 0,
            },
            riskParameters: {
                stopLoss: strategy.riskParameters?.stopLoss || 0.02,
                takeProfit: strategy.riskParameters?.takeProfit || 0.04,
                maxPositionSize: strategy.riskParameters?.maxPositionSize || 0.05,
                maxLeverage: strategy.riskParameters?.maxLeverage || 2,
                trailingStop: strategy.riskParameters?.trailingStop || 0,
            },
            timingParameters: {
                timeframe: strategy.timeframe || '15m',
                maxHoldTime: strategy.parameters?.maxHoldTime || 240,
                minHoldTime: strategy.parameters?.minHoldTime || 5,
            },
            filterParameters: {
                minVolatility: strategy.parameters?.minVolatility || 0.01,
                maxVolatility: strategy.parameters?.maxVolatility || 0.05,
                trendStrength: strategy.parameters?.trendStrength || 0.3,
                correlationThreshold: strategy.parameters?.correlationThreshold || 0,
            },
        };
    }
    /**
     * Evolve to next generation
     */
    async evolveNextGeneration(evaluateFitness) {
        this.currentGeneration++;
        // Create offspring through mutation and crossover
        const offspring = this.createOffspring();
        // Evaluate fitness of offspring
        const evaluatedOffspring = [];
        for (const genome of offspring) {
            try {
                const metrics = await evaluateFitness(genome);
                evaluatedOffspring.push({
                    ...genome,
                    fitness: this.selector.calculateFitness(metrics),
                    sharpeRatio: metrics.sharpeRatio,
                    totalReturn: metrics.totalReturn,
                    maxDrawdown: metrics.maxDrawdown,
                    winRate: metrics.winRate,
                    totalTrades: metrics.totalTrades,
                });
            }
            catch (error) {
                console.error(`[PopulationManager] Error evaluating genome ${genome.id}:`, error);
                // Assign low fitness to failed evaluations
                evaluatedOffspring.push({
                    ...genome,
                    fitness: 0,
                    sharpeRatio: 0,
                    totalReturn: 0,
                    maxDrawdown: 1,
                    winRate: 0,
                    totalTrades: 0,
                });
            }
        }
        // Combine current population with offspring
        const combined = [...this.population, ...evaluatedOffspring];
        // Select next generation
        this.population = this.selector.selectNextGeneration(combined, this.config.populationSize);
        // Cache generation
        this.cacheGeneration(this.currentGeneration, this.population);
        // Calculate and store stats
        const stats = this.calculateGenerationStats();
        this.history.push(stats);
        // Update stagnation counter
        if (stats.bestFitness > this.bestFitnessEver + this.config.convergenceThreshold) {
            this.bestFitnessEver = stats.bestFitness;
            this.stagnationCount = 0;
            stats.improved = true;
        }
        else {
            this.stagnationCount++;
            stats.improved = false;
        }
        return stats;
    }
    /**
     * Create offspring through mutation and crossover
     */
    createOffspring() {
        // Sort population by fitness for elite preservation
        const sorted = [...this.population].sort((a, b) => (b.fitness || 0) - (a.fitness || 0));
        const offspring = [];
        // 60% from crossover
        const crossoverCount = Math.floor(this.config.offspringCount * 0.6);
        const crossoverOffspring = this.crossoverEngine.createOffspring(sorted, crossoverCount);
        offspring.push(...crossoverOffspring);
        // 40% from mutation
        const mutationCount = this.config.offspringCount - crossoverCount;
        const mutationOffspring = this.mutationEngine.mutatePopulation(sorted, mutationCount);
        offspring.push(...mutationOffspring);
        return offspring;
    }
    /**
     * Run complete evolution process
     */
    async runEvolution(evaluateFitness, onGeneration) {
        try {
            while (this.currentGeneration < this.config.maxGenerations) {
                const stats = await this.evolveNextGeneration(evaluateFitness);
                if (onGeneration) {
                    onGeneration(stats);
                }
                // Check for convergence
                if (stats.convergence) {
                    return {
                        success: true,
                        generations: this.currentGeneration,
                        bestGenome: this.getBestGenome(),
                        finalPopulation: this.population,
                        history: this.history,
                        reason: 'converged',
                    };
                }
                // Check for stagnation
                if (this.stagnationCount >= this.config.stagnationLimit) {
                    return {
                        success: true,
                        generations: this.currentGeneration,
                        bestGenome: this.getBestGenome(),
                        finalPopulation: this.population,
                        history: this.history,
                        reason: 'stagnation',
                    };
                }
            }
            return {
                success: true,
                generations: this.currentGeneration,
                bestGenome: this.getBestGenome(),
                finalPopulation: this.population,
                history: this.history,
                reason: 'max_generations',
            };
        }
        catch (error) {
            return {
                success: false,
                generations: this.currentGeneration,
                bestGenome: this.getBestGenome(),
                finalPopulation: this.population,
                history: this.history,
                reason: 'error',
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }
    /**
     * Calculate statistics for current generation
     */
    calculateGenerationStats() {
        const fitnesses = this.population.map(g => g.fitness || 0);
        const sharpeRatios = this.population.map(g => g.sharpeRatio || 0);
        const returns = this.population.map(g => g.totalReturn || 0);
        const drawdowns = this.population.map(g => g.maxDrawdown || 0);
        const winRates = this.population.map(g => g.winRate || 0);
        const avgFitness = fitnesses.reduce((a, b) => a + b, 0) / fitnesses.length;
        const bestFitness = Math.max(...fitnesses);
        const worstFitness = Math.min(...fitnesses);
        // Calculate diversity as average pairwise distance
        let diversity = 0;
        let pairs = 0;
        for (let i = 0; i < this.population.length; i++) {
            for (let j = i + 1; j < this.population.length; j++) {
                diversity += this.calculateSimpleDistance(this.population[i], this.population[j]);
                pairs++;
            }
        }
        diversity = pairs > 0 ? diversity / pairs : 0;
        // Check convergence
        const convergence = this.selector.checkConvergence(this.population, 0.05);
        return {
            generation: this.currentGeneration,
            bestFitness,
            avgFitness,
            worstFitness,
            bestSharpeRatio: Math.max(...sharpeRatios),
            bestTotalReturn: Math.max(...returns),
            bestMaxDrawdown: Math.min(...drawdowns),
            bestWinRate: Math.max(...winRates),
            diversity,
            convergence,
            improved: false, // Set by evolveNextGeneration
        };
    }
    /**
     * Calculate simple distance between genomes
     */
    calculateSimpleDistance(g1, g2) {
        let sum = 0;
        let count = 0;
        const add = (a, b) => {
            sum += Math.abs(a - b);
            count++;
        };
        Object.values(g1.parameters.entryThresholds).forEach((v, i) => add(v, Object.values(g2.parameters.entryThresholds)[i]));
        Object.values(g1.parameters.riskParameters).forEach((v, i) => add(v, Object.values(g2.parameters.riskParameters)[i]));
        Object.values(g1.parameters.filterParameters).forEach((v, i) => add(v, Object.values(g2.parameters.filterParameters)[i]));
        return sum / count;
    }
    /**
     * Get the best genome from current population
     */
    getBestGenome() {
        return this.population.reduce((best, current) => (current.fitness || 0) > (best.fitness || 0) ? current : best);
    }
    /**
     * Get current population
     */
    getPopulation() {
        return [...this.population];
    }
    /**
     * Get generation history
     */
    getHistory() {
        return [...this.history];
    }
    /**
     * Get current generation number
     */
    getCurrentGeneration() {
        return this.currentGeneration;
    }
    /**
     * Cache generation for retrieval
     */
    cacheGeneration(gen, population) {
        this.generationCache.set(gen, JSON.parse(JSON.stringify(population)));
    }
    /**
     * Get cached generation
     */
    getCachedGeneration(gen) {
        return this.generationCache.get(gen);
    }
    /**
     * Clear all caches
     */
    clearCache() {
        this.generationCache.clear();
    }
}
exports.PopulationManager = PopulationManager;
exports.default = PopulationManager;
//# sourceMappingURL=population-manager.js.map