"use strict";
/**
 * Strategy Evolution Engine
 *
 * Genetic algorithm-based strategy optimization for PerpsTrader.
 * Evolves trading strategy parameters through mutation, crossover,
 * and selection based on backtest performance (Sharpe ratio).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.genomeToStrategy = exports.createRandomGenome = exports.TIMEFRAME_OPTIONS = exports.PARAMETER_BOUNDS = exports.Selector = exports.CrossoverEngine = exports.MutationEngine = exports.PopulationManager = exports.GeneticOptimizer = void 0;
var genetic_optimizer_1 = require("./genetic-optimizer");
Object.defineProperty(exports, "GeneticOptimizer", { enumerable: true, get: function () { return genetic_optimizer_1.GeneticOptimizer; } });
var population_manager_1 = require("./population-manager");
Object.defineProperty(exports, "PopulationManager", { enumerable: true, get: function () { return population_manager_1.PopulationManager; } });
var mutation_engine_1 = require("./mutation-engine");
Object.defineProperty(exports, "MutationEngine", { enumerable: true, get: function () { return mutation_engine_1.MutationEngine; } });
var crossover_engine_1 = require("./crossover-engine");
Object.defineProperty(exports, "CrossoverEngine", { enumerable: true, get: function () { return crossover_engine_1.CrossoverEngine; } });
var selector_1 = require("./selector");
Object.defineProperty(exports, "Selector", { enumerable: true, get: function () { return selector_1.Selector; } });
var types_1 = require("./types");
Object.defineProperty(exports, "PARAMETER_BOUNDS", { enumerable: true, get: function () { return types_1.PARAMETER_BOUNDS; } });
Object.defineProperty(exports, "TIMEFRAME_OPTIONS", { enumerable: true, get: function () { return types_1.TIMEFRAME_OPTIONS; } });
Object.defineProperty(exports, "createRandomGenome", { enumerable: true, get: function () { return types_1.createRandomGenome; } });
Object.defineProperty(exports, "genomeToStrategy", { enumerable: true, get: function () { return types_1.genomeToStrategy; } });
//# sourceMappingURL=index.js.map