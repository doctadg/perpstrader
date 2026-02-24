/**
 * Genetic Optimizer
 * Main orchestrator for the strategy evolution process
 */
import { StrategyGenome } from './types';
import { PopulationConfig, EvolutionResult, GenerationStats } from './population-manager';
import { MutationConfig } from './mutation-engine';
import { CrossoverConfig } from './crossover-engine';
import { SelectionConfig, FitnessMetrics } from './selector';
export interface GeneticOptimizerConfig {
    population: Partial<PopulationConfig>;
    mutation: Partial<MutationConfig>;
    crossover: Partial<CrossoverConfig>;
    selection: Partial<SelectionConfig>;
    dbPath?: string;
}
export declare const DEFAULT_GENETIC_CONFIG: GeneticOptimizerConfig;
export interface EvolutionSession {
    id: string;
    startTime: Date;
    endTime?: Date;
    config: GeneticOptimizerConfig;
    status: 'running' | 'completed' | 'failed';
    progress: {
        currentGeneration: number;
        maxGenerations: number;
        bestFitness: number;
        bestSharpeRatio: number;
    };
    result?: EvolutionResult;
}
export declare class GeneticOptimizer {
    private config;
    private populationManager;
    private mutationEngine;
    private crossoverEngine;
    private selector;
    private db;
    private session;
    private backtestEngine;
    constructor(config?: Partial<GeneticOptimizerConfig>);
    /**
     * Initialize database connection and tables
     */
    initialize(): Promise<void>;
    /**
     * Create required database tables
     */
    private createTables;
    /**
     * Load top strategies from the database
     */
    loadTopStrategies(count?: number): Promise<any[]>;
    /**
     * Evaluate genome fitness through backtesting
     */
    evaluateGenome(genome: StrategyGenome): Promise<FitnessMetrics>;
    /**
     * Load market data for backtesting
     */
    private loadMarketData;
    /**
     * Simulate fitness for testing (when backtest engine unavailable)
     */
    private simulateFitness;
    /**
     * Save genome to database
     */
    private saveGenome;
    /**
     * Save evolution session to database
     */
    private saveSession;
    /**
     * Run the complete evolution process
     */
    runEvolution(options?: {
        seedStrategies?: any[];
        onGeneration?: (stats: GenerationStats) => void;
    }): Promise<EvolutionResult>;
    /**
     * Save final evolution results to database
     */
    private saveFinalResults;
    /**
     * Get the best evolved strategy
     */
    getBestStrategy(): any;
    /**
     * Get current session info
     */
    getSession(): EvolutionSession | null;
    /**
     * Close database connection
     */
    close(): void;
}
export default GeneticOptimizer;
//# sourceMappingURL=genetic-optimizer.d.ts.map