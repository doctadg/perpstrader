/**
 * Main Orchestrator — ties together narrative-scanner, coin-generator, position-manager, and printterminal API.
 * Runs on a configurable interval, each cycle: scan narratives → pick best → generate coin → launch → monitor.
 */
import { OrchestratorConfig } from './config';
import { LaunchRecord, OrchestratorState } from './orch-types';
export declare class Orchestrator {
    private config;
    private client;
    private scanner;
    private generator;
    private positionMgr;
    private state;
    private history;
    private timer?;
    private running;
    constructor(opts?: Partial<OrchestratorConfig>);
    /** Start the orchestrator loop */
    start(): Promise<void>;
    /** Stop the orchestrator loop */
    stop(): Promise<void>;
    /** Main cycle: scan → pick → generate → launch → monitor */
    private cycle;
    /** Pick the best narrative that hasn't been used recently */
    private pickBestNarrative;
    /** Build a Plan object matching printterminal's PlanSchema */
    private buildPlan;
    /** Calculate total SOL spent in a plan */
    private calculateSolSpent;
    /** Reset daily budget at midnight UTC */
    private maybeResetDailyBudget;
    private recordResult;
    private loadHistory;
    private persistHistory;
    getState(): OrchestratorState;
    getHistory(): LaunchRecord[];
}
//# sourceMappingURL=orchestrator.d.ts.map