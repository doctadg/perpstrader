export type ExperimentStatus = 'pending' | 'running' | 'completed' | 'failed' | 'adopted' | 'discarded';
export interface Experiment {
    id: string;
    status: ExperimentStatus;
    experimentType: string;
    parameters: Record<string, any>;
    metrics: Record<string, number>;
    result: string;
    description: string;
    createdAt: string;
    completedAt: string | null;
    commitHash: string | null;
}
export interface ExperimentInput {
    id?: string;
    experimentType: string;
    parameters?: Record<string, any>;
    description?: string;
    commitHash?: string;
}
export interface ExperimentUpdate {
    status?: ExperimentStatus;
    metrics?: Record<string, number>;
    result?: string;
    completedAt?: string;
    commitHash?: string;
}
export interface ExperimentFilter {
    status?: ExperimentStatus;
    experimentType?: string;
}
export interface ExperimentStats {
    total: number;
    pending: number;
    running: number;
    completed: number;
    failed: number;
    adopted: number;
    discarded: number;
    successRate: number;
    adoptionRate: number;
    avgMetrics: Record<string, number>;
}
export declare class ExperimentStore {
    private db;
    private dbPath;
    private initialized;
    constructor();
    /**
     * Initialize database connection and create tables
     */
    initialize(): Promise<void>;
    /**
     * Create the experiments table if not exists
     */
    private createTable;
    /**
     * Insert a new experiment
     */
    createExperiment(input: ExperimentInput): Promise<Experiment>;
    /**
     * Update an existing experiment
     */
    updateExperiment(id: string, updates: ExperimentUpdate): Promise<void>;
    /**
     * Get a single experiment by id
     */
    getExperiment(id: string): Promise<Experiment>;
    /**
     * List experiments with optional filtering
     */
    getExperiments(filter?: ExperimentFilter, limit?: number, offset?: number): Promise<Experiment[]>;
    /**
     * Get best experiments ordered by a specific metric descending
     */
    getBestExperiments(metric: string, limit?: number): Promise<Experiment[]>;
    /**
     * Get the most recently completed experiment
     */
    getLatestResult(): Promise<Experiment | null>;
    /**
     * Get aggregate statistics
     */
    getStats(): Promise<ExperimentStats>;
    /**
     * Remove experiments older than the given number of days
     */
    cleanupOldExperiments(daysOld?: number): Promise<number>;
    /**
     * Close database connection
     */
    close(): void;
    private rowToExperiment;
}
export declare const experimentStore: ExperimentStore;
export default experimentStore;
//# sourceMappingURL=experiment-store.d.ts.map