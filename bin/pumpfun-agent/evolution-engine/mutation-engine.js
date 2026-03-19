"use strict";
/**
 * Mutation Engine
 * Handles mutation of strategy parameters using various mutation strategies
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MutationEngine = exports.DEFAULT_MUTATION_CONFIG = void 0;
const types_1 = require("./types");
exports.DEFAULT_MUTATION_CONFIG = {
    mutationRate: 0.3,
    mutationStrength: 0.2,
    adaptiveMutation: true,
    elitePreservation: 2,
};
class MutationEngine {
    config;
    generationMutationRate;
    constructor(config = {}) {
        this.config = { ...exports.DEFAULT_MUTATION_CONFIG, ...config };
        this.generationMutationRate = this.config.mutationRate;
    }
    /**
     * Apply mutation to a genome
     */
    mutate(genome, isElite = false) {
        const { v4: uuidv4 } = require('uuid');
        // Don't mutate elite genomes
        if (isElite) {
            return {
                ...genome,
                id: uuidv4(),
                parentIds: [genome.id],
                generation: genome.generation + 1,
                fitness: undefined,
                sharpeRatio: undefined,
                totalReturn: undefined,
                maxDrawdown: undefined,
                winRate: undefined,
                totalTrades: undefined,
                backtestResult: undefined,
                createdAt: new Date(),
            };
        }
        const mutatedParams = {
            entryThresholds: this.mutateGroup(genome.parameters.entryThresholds, 'entryThresholds'),
            riskParameters: this.mutateGroup(genome.parameters.riskParameters, 'riskParameters'),
            timingParameters: this.mutateTimingParameters(genome.parameters.timingParameters),
            filterParameters: this.mutateGroup(genome.parameters.filterParameters, 'filterParameters'),
        };
        // Ensure consistency after mutation
        this.validateAndFixParameters(mutatedParams);
        return {
            id: uuidv4(),
            parentIds: [genome.id],
            generation: genome.generation + 1,
            parameters: mutatedParams,
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
     * Mutate a group of numeric parameters
     */
    mutateGroup(group, groupName) {
        const bounds = types_1.PARAMETER_BOUNDS[groupName];
        const mutated = {};
        for (const [key, value] of Object.entries(group)) {
            if (Math.random() < this.generationMutationRate) {
                mutated[key] = this.mutateValue(value, bounds[key]);
            }
            else {
                mutated[key] = value;
            }
        }
        return mutated;
    }
    /**
     * Mutate timing parameters (includes string timeframe)
     */
    mutateTimingParameters(timing) {
        const bounds = types_1.PARAMETER_BOUNDS.timingParameters;
        // Potentially mutate timeframe
        let timeframe = timing.timeframe;
        if (Math.random() < this.generationMutationRate * 0.5) {
            timeframe = this.mutateTimeframe(timing.timeframe);
        }
        return {
            timeframe,
            maxHoldTime: Math.random() < this.generationMutationRate
                ? this.mutateValue(timing.maxHoldTime, bounds.maxHoldTime)
                : timing.maxHoldTime,
            minHoldTime: Math.random() < this.generationMutationRate
                ? this.mutateValue(timing.minHoldTime, bounds.minHoldTime)
                : timing.minHoldTime,
        };
    }
    /**
     * Mutate a single numeric value
     */
    mutateValue(value, bounds) {
        const range = bounds.max - bounds.min;
        const mutationAmount = (Math.random() - 0.5) * 2 * range * this.config.mutationStrength;
        let newValue = value + mutationAmount;
        // Ensure within bounds
        newValue = Math.max(bounds.min, Math.min(bounds.max, newValue));
        // Apply step if specified
        if (bounds.step) {
            newValue = Math.round(newValue / bounds.step) * bounds.step;
        }
        // Round if integer
        if (bounds.integer) {
            newValue = Math.round(newValue);
        }
        return newValue;
    }
    /**
     * Mutate timeframe by shifting up or down
     */
    mutateTimeframe(current) {
        const index = types_1.TIMEFRAME_OPTIONS.indexOf(current);
        if (index === -1)
            return types_1.TIMEFRAME_OPTIONS[0];
        const shift = Math.random() < 0.5 ? -1 : 1;
        const newIndex = Math.max(0, Math.min(types_1.TIMEFRAME_OPTIONS.length - 1, index + shift));
        return types_1.TIMEFRAME_OPTIONS[newIndex];
    }
    /**
     * Validate and fix parameter consistency
     */
    validateAndFixParameters(params) {
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
     * Apply adaptive mutation based on population diversity
     */
    updateAdaptiveMutation(population) {
        if (!this.config.adaptiveMutation || population.length < 2)
            return;
        // Calculate average fitness diversity
        const fitnesses = population
            .map(g => g.fitness)
            .filter(f => f !== undefined);
        if (fitnesses.length < 2)
            return;
        const avg = fitnesses.reduce((a, b) => a + b, 0) / fitnesses.length;
        const variance = fitnesses.reduce((sum, f) => sum + Math.pow(f - avg, 2), 0) / fitnesses.length;
        const stdDev = Math.sqrt(variance);
        // If diversity is low, increase mutation rate
        const diversity = stdDev / Math.abs(avg || 1);
        if (diversity < 0.1) {
            this.generationMutationRate = Math.min(0.8, this.config.mutationRate * 1.5);
        }
        else if (diversity > 0.5) {
            this.generationMutationRate = Math.max(0.1, this.config.mutationRate * 0.8);
        }
        else {
            this.generationMutationRate = this.config.mutationRate;
        }
    }
    /**
     * Reset mutation rate for new generation
     */
    resetMutationRate() {
        this.generationMutationRate = this.config.mutationRate;
    }
    /**
     * Batch mutate a population
     */
    mutatePopulation(population, offspringCount) {
        const offspring = [];
        // Sort by fitness for elite preservation
        const sorted = [...population].sort((a, b) => (b.fitness || 0) - (a.fitness || 0));
        this.updateAdaptiveMutation(population);
        for (let i = 0; i < offspringCount; i++) {
            // Select parent (tournament selection)
            const parent = this.selectParent(sorted);
            const isElite = i < this.config.elitePreservation;
            offspring.push(this.mutate(parent, isElite));
        }
        this.resetMutationRate();
        return offspring;
    }
    /**
     * Select parent using tournament selection
     */
    selectParent(population) {
        const tournamentSize = Math.min(3, population.length);
        let best = population[Math.floor(Math.random() * population.length)];
        for (let i = 1; i < tournamentSize; i++) {
            const contender = population[Math.floor(Math.random() * population.length)];
            if ((contender.fitness || 0) > (best.fitness || 0)) {
                best = contender;
            }
        }
        return best;
    }
}
exports.MutationEngine = MutationEngine;
exports.default = MutationEngine;
//# sourceMappingURL=mutation-engine.js.map