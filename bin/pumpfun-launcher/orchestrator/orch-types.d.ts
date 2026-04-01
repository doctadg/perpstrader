/**
 * Orchestrator Types — Launch records, state, cycle results
 */
export type LaunchStatus = 'success' | 'failed' | 'pending' | 'skipped';
export interface LaunchRecord {
    id: string;
    cycleId: string;
    timestamp: number;
    /** Narrative that triggered this launch */
    narrative: string;
    narrativeScore: number;
    coinName: string;
    coinSymbol: string;
    metadataUri: string;
    planRunId: string;
    mintAddress: string;
    status: LaunchStatus;
    solSpent: number;
    printterminalRunId?: string;
    error?: string;
}
export interface OrchestratorState {
    status: 'idle' | 'running' | 'stopped';
    totalLaunched: number;
    totalSuccess: number;
    totalFailed: number;
    solSpentToday: number;
    lastCycleAt: number;
}
export interface CycleResult {
    cycleId: string;
    status: 'launched' | 'skipped' | 'error';
    record?: LaunchRecord;
    reason?: string;
    error?: string;
    durationMs: number;
}
//# sourceMappingURL=orch-types.d.ts.map