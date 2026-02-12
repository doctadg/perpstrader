import { PredictionAgentState, createInitialPredictionState } from './state';
import predictionExecutionEngine from './execution-engine';
import positionReconciler from './position-reconciler';
export { PredictionAgentState, createInitialPredictionState };
export declare class PredictionOrchestrator {
    private stopLossCheckInterval;
    private reconciliationInterval;
    constructor();
    private startBackgroundTasks;
    private checkStopLosses;
    invoke(initialState: PredictionAgentState): Promise<PredictionAgentState>;
    /**
     * Trigger emergency stop - halt all trading
     */
    triggerEmergencyStop(reason: string): void;
    /**
     * Reset emergency stop
     */
    resetEmergencyStop(): void;
    /**
     * Emergency close all positions
     */
    emergencyCloseAll(): Promise<void>;
    /**
     * Get system health status
     */
    getHealth(): {
        orchestrator: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
        emergencyStop: boolean;
        reconciliation: ReturnType<typeof positionReconciler.getHealth>;
        execution: ReturnType<typeof predictionExecutionEngine.getHealth>;
    };
    /**
     * Clean up resources
     */
    destroy(): void;
}
export declare function buildPredictionGraph(): PredictionOrchestrator;
export declare function runPredictionCycle(): Promise<PredictionAgentState>;
export default buildPredictionGraph;
//# sourceMappingURL=graph.d.ts.map