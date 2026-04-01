"use strict";
// Run Lifecycle
// Manages run execution flow: submit → build → simulate → send → confirm
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RunLifecycle = void 0;
const state_1 = require("./state");
const plan_validator_1 = require("./plan-validator");
const fee_manager_1 = require("./fee-manager");
const timing_engine_1 = require("./timing-engine");
const step_executor_1 = require("./step-executor");
const defaults_1 = require("../config/defaults");
const logger_1 = __importDefault(require("../../shared/logger"));
class RunLifecycle {
    runs = new Map();
    eventHandlers = [];
    slotTracker;
    aborted = new Set();
    constructor(slotTracker) {
        this.slotTracker = slotTracker;
    }
    /**
     * Register an event handler
     */
    onEvent(handler) {
        this.eventHandlers.push(handler);
    }
    /**
     * Submit a plan for execution
     */
    async submit(plan) {
        // Validate
        const validation = (0, plan_validator_1.validatePlan)(plan);
        if (!validation.valid) {
            throw new Error(`Plan validation failed: ${validation.errors.join('; ')}`);
        }
        if (validation.warnings.length > 0) {
            for (const w of validation.warnings) {
                logger_1.default.warn(`[RunLifecycle] Plan ${plan.runId} warning: ${w}`);
            }
        }
        const state = (0, state_1.createRunState)(plan);
        state.currentSlot = this.slotTracker.slot;
        this.runs.set(plan.runId, state);
        this.emit({ type: 'run:created', runId: plan.runId });
        logger_1.default.info(`[RunLifecycle] Plan ${plan.runId} submitted (${plan.steps.length} steps, route=${plan.route})`);
        return plan.runId;
    }
    /**
     * Execute a submitted run to completion
     */
    async execute(runId) {
        const state = this.runs.get(runId);
        if (!state)
            throw new Error(`Run ${runId} not found`);
        if (state.status !== 'pending')
            throw new Error(`Run ${runId} is ${state.status}, not pending`);
        // Transition to building
        let current = (0, state_1.transitionStatus)(state, 'building');
        current = { ...current, currentSlot: this.slotTracker.slot };
        this.runs.set(runId, current);
        this.emit({ type: 'run:started', runId });
        try {
            const plan = current.plan;
            const isBurst = plan.route === 'burst';
            const feeFn = isBurst ? fee_manager_1.resolveBurstFees : fee_manager_1.resolveFees;
            const feeResolution = feeFn(plan.fees);
            const baseTime = plan.timingBase === 'now' ? Date.now() : Date.now();
            const baseSlot = plan.timingBase === 'slotCurrent' ? this.slotTracker.slot : this.slotTracker.slot;
            // Execute steps sequentially
            for (let i = 0; i < plan.steps.length; i++) {
                // Check abort
                if (this.aborted.has(runId)) {
                    current = (0, state_1.transitionStatus)(current, 'aborted');
                    this.runs.set(runId, current);
                    this.emit({ type: 'run:aborted', runId, reason: 'User requested abort' });
                    return current;
                }
                const step = plan.steps[i];
                current = { ...current, currentStepIndex: i };
                this.runs.set(runId, current);
                this.emit({ type: 'run:step:start', runId, stepIndex: i, stepName: step.name });
                logger_1.default.info(`[RunLifecycle] Run ${runId} step ${i}/${plan.steps.length}: ${step.name} (${step.type})`);
                // Wait for timing target
                await (0, timing_engine_1.delayUntilTarget)(step.at, baseSlot, baseTime);
                // Resolve timing base for subsequent steps
                current = { ...current, currentSlot: this.slotTracker.slot };
                // Build execution context
                const ctx = {
                    state: current,
                    feeResolution,
                    resolveSigner: async (walletId) => {
                        const existing = current.signers.get(walletId);
                        if (existing)
                            return existing;
                        // Placeholder — real implementation loads from key store
                        throw new Error(`Signer ${walletId} not found — implement key store resolution`);
                    },
                    getBlockhash: async () => {
                        // Placeholder — real implementation calls Solana RPC
                        return { blockhash: '', slot: this.slotTracker.slot };
                    },
                    simulate: async (message) => {
                        // Placeholder — real implementation calls simulateTransaction
                        return { success: true, logs: [], unitsConsumed: 0 };
                    },
                    send: async (signature, message) => {
                        // Placeholder — real implementation calls sendRawTransaction
                        return `sig_${Date.now()}`;
                    },
                    sendBundle: async (signedTxs, tipSol) => {
                        // Placeholder — real implementation calls Jito bundle API
                        return `bundle_${Date.now()}`;
                    },
                    resolveWalletGroup: async (groupId) => {
                        // Placeholder — real implementation loads from config/store
                        return [current.plan.creatorWalletId];
                    },
                };
                // Execute the step
                const result = await (0, step_executor_1.executeStep)(step, ctx);
                // Record result
                current = (0, state_1.recordStepResult)(current, result);
                this.runs.set(runId, current);
                if (result.status === 'success') {
                    this.emit({ type: 'run:step:complete', runId, stepIndex: i, result });
                    // Track mint address from create step
                    if (step.type === 'pumpfun.create' && result.signatures?.[0]) {
                        current = { ...current, mintAddress: `mint_from_${result.signatures[0]}` };
                        this.runs.set(runId, current);
                    }
                }
                else {
                    this.emit({ type: 'run:step:failed', runId, stepIndex: i, error: result.error ?? 'Unknown error' });
                    // Fail-fast on critical steps (create)
                    if (step.type === 'pumpfun.create') {
                        current = (0, state_1.failRun)(current, `Create step failed: ${result.error}`);
                        this.runs.set(runId, current);
                        this.emit({ type: 'run:completed', runId, status: 'failed' });
                        logger_1.default.error(`[RunLifecycle] Run ${runId} aborted — create step failed`);
                        return current;
                    }
                }
                // Check timeout
                const elapsed = Date.now() - (current.startedAt ?? Date.now());
                if (elapsed > defaults_1.DEFAULT_LAUNCHER_CONFIG.planTimeoutMs) {
                    current = (0, state_1.failRun)(current, `Plan timeout after ${elapsed}ms`);
                    this.runs.set(runId, current);
                    this.emit({ type: 'run:completed', runId, status: 'failed' });
                    return current;
                }
            }
            // All steps done — transition through simulated → sending → confirmed
            current = (0, state_1.transitionStatus)(current, 'simulated');
            this.runs.set(runId, current);
            current = (0, state_1.transitionStatus)(current, 'sending');
            this.runs.set(runId, current);
            current = (0, state_1.transitionStatus)(current, 'confirmed');
            current = { ...current, completedAt: Date.now() };
            this.runs.set(runId, current);
            this.emit({ type: 'run:completed', runId, status: 'confirmed' });
            logger_1.default.info(`[RunLifecycle] Run ${runId} completed successfully`);
            logger_1.default.info((0, state_1.summarizeRun)(current));
            return current;
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            current = (0, state_1.failRun)(current, msg);
            this.runs.set(runId, current);
            this.emit({ type: 'run:completed', runId, status: 'failed' });
            logger_1.default.error(`[RunLifecycle] Run ${runId} failed: ${msg}`);
            return current;
        }
    }
    /**
     * Abort a running plan
     */
    async abort(runId, reason) {
        this.aborted.add(runId);
        logger_1.default.warn(`[RunLifecycle] Abort requested for ${runId}: ${reason}`);
    }
    /**
     * Get current state of a run
     */
    getState(runId) {
        return this.runs.get(runId);
    }
    /**
     * Get all active (non-terminal) runs
     */
    getActiveRuns() {
        return Array.from(this.runs.values()).filter(s => !(0, state_1.isTerminal)(s));
    }
    /**
     * Emit an event to all handlers
     */
    emit(event) {
        for (const handler of this.eventHandlers) {
            try {
                handler(event);
            }
            catch (error) {
                logger_1.default.warn(`[RunLifecycle] Event handler error: ${error}`);
            }
        }
    }
}
exports.RunLifecycle = RunLifecycle;
//# sourceMappingURL=run-lifecycle.js.map