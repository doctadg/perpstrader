"use strict";
/**
 * Crossover Engine
 * Handles recombination of strategy parameters from parent genomes
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CrossoverEngine = exports.DEFAULT_CROSSOVER_CONFIG = void 0;
const types_1 = require("./types");
exports.DEFAULT_CROSSOVER_CONFIG = {
    crossoverRate: 0.8,
    uniformCrossoverRate: 0.5,
    blendingAlpha: 0.5,
    method: 'adaptive',
};
class CrossoverEngine {
    config;
    constructor(config = {}) {
        this.config = { ...exports.DEFAULT_CROSSOVER_CONFIG, ...config };
    }
    /**
     * Perform crossover between two parent genomes
     */
    crossover(parent1, parent2) {
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
        const childParams = this.performCrossoverByMethod(parent1.parameters, parent2.parameters, method);
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
    selectAdaptiveMethod(parent1, parent2) {
        const similarity = this.calculateSimilarity(parent1.parameters, parent2.parameters);
        // If parents are very similar, use blending to explore between them
        if (similarity > 0.8)
            return 'blend';
        // If parents are very different, use single-point to preserve good blocks
        if (similarity < 0.4)
            return 'single-point';
        // Otherwise use uniform for diverse recombination
        return 'uniform';
    }
    /**
     * Perform crossover based on selected method
     */
    performCrossoverByMethod(p1, p2, method) {
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
    singlePointCrossover(p1, p2) {
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
    multiPointCrossover(p1, p2) {
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
    groupMultiPointCrossover(group1, group2) {
        const result = {};
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
    uniformCrossover(p1, p2) {
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
    groupUniformCrossover(group1, group2) {
        const result = {};
        const keys = Object.keys(group1);
        for (const key of keys) {
            result[key] = Math.random() < this.config.uniformCrossoverRate ? group1[key] : group2[key];
        }
        return result;
    }
    /**
     * Blend crossover: create values between parents (good for fine-tuning)
     */
    blendCrossover(p1, p2) {
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
    groupBlendCrossover(group1, group2, groupName) {
        const result = {};
        const bounds = types_1.PARAMETER_BOUNDS[groupName];
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
                if (step)
                    value = Math.round(value / step) * step;
                if (integer)
                    value = Math.round(value);
            }
            result[key] = value;
        }
        return result;
    }
    /**
     * Handle timing parameters crossover
     */
    crossoverTiming(t1, t2, useFirst) {
        if (useFirst) {
            return { ...t1 };
        }
        return Math.random() < 0.5 ? { ...t1 } : { ...t2 };
    }
    /**
     * Blend timing parameters
     */
    blendTimingCrossover(t1, t2) {
        const bounds = types_1.PARAMETER_BOUNDS.timingParameters;
        return {
            timeframe: Math.random() < 0.5 ? t1.timeframe : t2.timeframe,
            maxHoldTime: this.blendValue(t1.maxHoldTime, t2.maxHoldTime, bounds.maxHoldTime),
            minHoldTime: this.blendValue(t1.minHoldTime, t2.minHoldTime, bounds.minHoldTime),
        };
    }
    /**
     * Blend two values
     */
    blendValue(v1, v2, bounds) {
        const min = Math.min(v1, v2);
        const max = Math.max(v1, v2);
        const range = max - min;
        let value = min - range * this.config.blendingAlpha +
            Math.random() * (max - min + 2 * range * this.config.blendingAlpha);
        value = Math.max(bounds.min, Math.min(bounds.max, value));
        if (bounds.step)
            value = Math.round(value / bounds.step) * bounds.step;
        if (bounds.integer)
            value = Math.round(value);
        return value;
    }
    /**
     * Calculate similarity between two parameter sets
     */
    calculateSimilarity(p1, p2) {
        let totalDiff = 0;
        let count = 0;
        // Compare numeric parameters
        const compareGroup = (g1, g2, bounds) => {
            for (const key of Object.keys(g1)) {
                const range = bounds[key].max - bounds[key].min;
                const diff = Math.abs(g1[key] - g2[key]) / range;
                totalDiff += diff;
                count++;
            }
        };
        compareGroup(p1.entryThresholds, p2.entryThresholds, types_1.PARAMETER_BOUNDS.entryThresholds);
        compareGroup(p1.riskParameters, p2.riskParameters, types_1.PARAMETER_BOUNDS.riskParameters);
        compareGroup(p1.filterParameters, p2.filterParameters, types_1.PARAMETER_BOUNDS.filterParameters);
        // Timeframe similarity
        if (p1.timingParameters.timeframe === p2.timingParameters.timeframe) {
            totalDiff += 0;
        }
        else {
            totalDiff += 1;
        }
        count++;
        // Timing numeric parameters
        const timeBounds = types_1.PARAMETER_BOUNDS.timingParameters;
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
    cloneGenome(parent) {
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
     * Create offspring from a mating pool
     */
    createOffspring(matingPool, offspringCount) {
        const offspring = [];
        while (offspring.length < offspringCount) {
            // Select two parents using tournament selection
            const parent1 = this.selectParent(matingPool);
            const parent2 = this.selectParent(matingPool);
            if (parent1.id === parent2.id) {
                // If same parent selected twice, clone it
                offspring.push(this.cloneGenome(parent1));
            }
            else {
                offspring.push(this.crossover(parent1, parent2));
            }
        }
        return offspring;
    }
    /**
     * Select parent using fitness-proportionate selection
     */
    selectParent(pool) {
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
exports.CrossoverEngine = CrossoverEngine;
exports.default = CrossoverEngine;
//# sourceMappingURL=crossover-engine.js.map