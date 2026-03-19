import 'dotenv/config';
import { ExperimentStore, Experiment } from './experiment-store';
export interface AutoResearchBridgeConfig {
    experimentInterval: number;
    autoAdoptThreshold: number;
    adoptMetric: string;
    maxConcurrentExperiments: number;
    gpuBudget: number;
    triggerChannels: string[];
    experimentTimeoutMs: number;
    resultPollIntervalMs: number;
}
interface BridgeStatus {
    isRunning: boolean;
    activeExperiments: number;
    totalExperiments: number;
    adoptedCount: number;
    lastExperimentAt: string | null;
    lastError: string | null;
    uptimeMs: number;
}
export declare class AutoResearchBridge {
    private config;
    private _store;
    private _queue;
    /** Public accessor for experiment store (used by registered commands) */
    get store(): ExperimentStore;
    private redisSubscriber;
    private redisPublisher;
    private isRunning;
    private startedAt;
    private cycleTimer;
    private resultPollTimer;
    private lastExperimentAt;
    private lastError;
    private activeProcesses;
    private retryCounts;
    private readonly MAX_RETRIES;
    constructor(config?: Partial<AutoResearchBridgeConfig>);
    /**
     * Start the bridge: init connections, begin monitoring
     */
    start(): Promise<void>;
    /**
     * Graceful shutdown
     */
    stop(): Promise<void>;
    /**
     * Trigger a new experiment by spawning the Python script
     */
    triggerExperiment(experimentType: string, params?: Record<string, any>): Promise<Experiment>;
    /**
     * Run a full experiment cycle: trigger → wait → evaluate → adopt/discard
     */
    runExperimentCycle(): Promise<void>;
    /**
     * Check for newly completed experiments in SQLite
     */
    checkResults(): Promise<Experiment[]>;
    /**
     * Adopt an experiment: promote it into the research engine's idea queue
     */
    adoptExperiment(experimentId: string): Promise<void>;
    /**
     * Discard an experiment that didn't meet thresholds
     */
    discardExperiment(experimentId: string): Promise<void>;
    /**
     * Get current bridge status
     */
    getStatus(): BridgeStatus;
    /**
     * Get stats — delegates to experiment-store
     */
    getStats(): Promise<ExperimentStats & BridgeStatus>;
    /**
     * Spawn a Python experiment process
     */
    private spawnExperimentProcess;
    /**
     * Parse process stdout for metrics and results
     */
    private parseProcessOutput;
    /**
     * Handle experiment failure with retry logic
     */
    private handleExperimentFailure;
    private connectRedis;
    private disconnectRedis;
    /**
     * Publish status update to Redis
     */
    private publishStatus;
    private scheduleExperimentCycle;
    private scheduleResultPolling;
    /**
     * Wait for the latest triggered experiment to produce a result
     */
    private waitForLatestResult;
    private getDbPath;
    private sleep;
}
export declare const autoResearchBridge: AutoResearchBridge;
export default autoResearchBridge;
import type { ExperimentStats } from './experiment-store';
/**
 * Register AutoResearch bridge commands with the research control system.
 * Call this during application startup to wire up the bridge.
 *
 * Usage in research-control or main entrypoint:
 *   import { registerAutoResearchBridge } from './research-engine/autoresearch-bridge';
 *   registerAutoResearchBridge();
 */
export declare function registerAutoResearchBridge(): {
    bridge: AutoResearchBridge;
    commands: Record<string, (...args: any[]) => Promise<any>>;
};
//# sourceMappingURL=autoresearch-bridge.d.ts.map