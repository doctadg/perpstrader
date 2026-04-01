import { Plan } from '../../shared/types';
import { RunState, OrchestratorEventHandler } from './types';
import { SlotTracker } from './timing-engine';
export declare class RunLifecycle {
    private runs;
    private eventHandlers;
    private slotTracker;
    private aborted;
    constructor(slotTracker: SlotTracker);
    /**
     * Register an event handler
     */
    onEvent(handler: OrchestratorEventHandler): void;
    /**
     * Submit a plan for execution
     */
    submit(plan: Plan): Promise<string>;
    /**
     * Execute a submitted run to completion
     */
    execute(runId: string): Promise<RunState>;
    /**
     * Abort a running plan
     */
    abort(runId: string, reason: string): Promise<void>;
    /**
     * Get current state of a run
     */
    getState(runId: string): RunState | undefined;
    /**
     * Get all active (non-terminal) runs
     */
    getActiveRuns(): RunState[];
    /**
     * Emit an event to all handlers
     */
    private emit;
}
//# sourceMappingURL=run-lifecycle.d.ts.map