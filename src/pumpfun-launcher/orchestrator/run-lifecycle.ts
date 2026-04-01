// Run Lifecycle
// Manages run execution flow: submit → build → simulate → send → confirm

import { Plan, RunStatus } from '../../shared/types';
import { RunState, StepResult, OrchestratorEvent, OrchestratorEventHandler } from './types';
import { createRunState, transitionStatus, recordStepResult, failRun, isTerminal, summarizeRun } from './state';
import { validatePlan, ValidationResult } from './plan-validator';
import { resolveFees, resolveBurstFees, FeeResolution } from './fee-manager';
import { delayUntilTarget, SlotTracker } from './timing-engine';
import { executeStep, StepExecutionContext } from './step-executor';
import { DEFAULT_LAUNCHER_CONFIG } from '../config/defaults';
import logger from '../../shared/logger';

export class RunLifecycle {
  private runs: Map<string, RunState> = new Map();
  private eventHandlers: OrchestratorEventHandler[] = [];
  private slotTracker: SlotTracker;
  private aborted: Set<string> = new Set();

  constructor(slotTracker: SlotTracker) {
    this.slotTracker = slotTracker;
  }

  /**
   * Register an event handler
   */
  onEvent(handler: OrchestratorEventHandler): void {
    this.eventHandlers.push(handler);
  }

  /**
   * Submit a plan for execution
   */
  async submit(plan: Plan): Promise<string> {
    // Validate
    const validation = validatePlan(plan);
    if (!validation.valid) {
      throw new Error(`Plan validation failed: ${validation.errors.join('; ')}`);
    }

    if (validation.warnings.length > 0) {
      for (const w of validation.warnings) {
        logger.warn(`[RunLifecycle] Plan ${plan.runId} warning: ${w}`);
      }
    }

    const state = createRunState(plan);
    state.currentSlot = this.slotTracker.slot;
    this.runs.set(plan.runId, state);

    this.emit({ type: 'run:created', runId: plan.runId });
    logger.info(`[RunLifecycle] Plan ${plan.runId} submitted (${plan.steps.length} steps, route=${plan.route})`);

    return plan.runId;
  }

  /**
   * Execute a submitted run to completion
   */
  async execute(runId: string): Promise<RunState> {
    const state = this.runs.get(runId);
    if (!state) throw new Error(`Run ${runId} not found`);
    if (state.status !== 'pending') throw new Error(`Run ${runId} is ${state.status}, not pending`);

    // Transition to building
    let current = transitionStatus(state, 'building');
    current = { ...current, currentSlot: this.slotTracker.slot };
    this.runs.set(runId, current);
    this.emit({ type: 'run:started', runId });

    try {
      const plan = current.plan;
      const isBurst = plan.route === 'burst';
      const feeFn = isBurst ? resolveBurstFees : resolveFees;
      const feeResolution = feeFn(plan.fees);
      const baseTime = plan.timingBase === 'now' ? Date.now() : Date.now();
      const baseSlot = plan.timingBase === 'slotCurrent' ? this.slotTracker.slot : this.slotTracker.slot;

      // Execute steps sequentially
      for (let i = 0; i < plan.steps.length; i++) {
        // Check abort
        if (this.aborted.has(runId)) {
          current = transitionStatus(current, 'aborted');
          this.runs.set(runId, current);
          this.emit({ type: 'run:aborted', runId, reason: 'User requested abort' });
          return current;
        }

        const step = plan.steps[i];
        current = { ...current, currentStepIndex: i };
        this.runs.set(runId, current);

        this.emit({ type: 'run:step:start', runId, stepIndex: i, stepName: step.name });
        logger.info(`[RunLifecycle] Run ${runId} step ${i}/${plan.steps.length}: ${step.name} (${step.type})`);

        // Wait for timing target
        await delayUntilTarget(step.at, baseSlot, baseTime);

        // Resolve timing base for subsequent steps
        current = { ...current, currentSlot: this.slotTracker.slot };

        // Build execution context
        const ctx: StepExecutionContext = {
          state: current,
          feeResolution,
          resolveSigner: async (walletId: string) => {
            const existing = current.signers.get(walletId);
            if (existing) return existing;
            // Placeholder — real implementation loads from key store
            throw new Error(`Signer ${walletId} not found — implement key store resolution`);
          },
          getBlockhash: async () => {
            // Placeholder — real implementation calls Solana RPC
            return { blockhash: '', slot: this.slotTracker.slot };
          },
          simulate: async (message: Uint8Array) => {
            // Placeholder — real implementation calls simulateTransaction
            return { success: true, logs: [], unitsConsumed: 0 };
          },
          send: async (signature: string, message: Uint8Array) => {
            // Placeholder — real implementation calls sendRawTransaction
            return `sig_${Date.now()}`;
          },
          sendBundle: async (signedTxs, tipSol) => {
            // Placeholder — real implementation calls Jito bundle API
            return `bundle_${Date.now()}`;
          },
          resolveWalletGroup: async (groupId: string) => {
            // Placeholder — real implementation loads from config/store
            return [current.plan.creatorWalletId];
          },
        };

        // Execute the step
        const result = await executeStep(step, ctx);

        // Record result
        current = recordStepResult(current, result);
        this.runs.set(runId, current);

        if (result.status === 'success') {
          this.emit({ type: 'run:step:complete', runId, stepIndex: i, result });
          // Track mint address from create step
          if (step.type === 'pumpfun.create' && result.signatures?.[0]) {
            current = { ...current, mintAddress: `mint_from_${result.signatures[0]}` };
            this.runs.set(runId, current);
          }
        } else {
          this.emit({ type: 'run:step:failed', runId, stepIndex: i, error: result.error ?? 'Unknown error' });

          // Fail-fast on critical steps (create)
          if (step.type === 'pumpfun.create') {
            current = failRun(current, `Create step failed: ${result.error}`);
            this.runs.set(runId, current);
            this.emit({ type: 'run:completed', runId, status: 'failed' });
            logger.error(`[RunLifecycle] Run ${runId} aborted — create step failed`);
            return current;
          }
        }

        // Check timeout
        const elapsed = Date.now() - (current.startedAt ?? Date.now());
        if (elapsed > DEFAULT_LAUNCHER_CONFIG.planTimeoutMs) {
          current = failRun(current, `Plan timeout after ${elapsed}ms`);
          this.runs.set(runId, current);
          this.emit({ type: 'run:completed', runId, status: 'failed' });
          return current;
        }
      }

      // All steps done — transition through simulated → sending → confirmed
      current = transitionStatus(current, 'simulated');
      this.runs.set(runId, current);

      current = transitionStatus(current, 'sending');
      this.runs.set(runId, current);

      current = transitionStatus(current, 'confirmed');
      current = { ...current, completedAt: Date.now() };
      this.runs.set(runId, current);

      this.emit({ type: 'run:completed', runId, status: 'confirmed' });
      logger.info(`[RunLifecycle] Run ${runId} completed successfully`);
      logger.info(summarizeRun(current));

      return current;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      current = failRun(current, msg);
      this.runs.set(runId, current);
      this.emit({ type: 'run:completed', runId, status: 'failed' });
      logger.error(`[RunLifecycle] Run ${runId} failed: ${msg}`);
      return current;
    }
  }

  /**
   * Abort a running plan
   */
  async abort(runId: string, reason: string): Promise<void> {
    this.aborted.add(runId);
    logger.warn(`[RunLifecycle] Abort requested for ${runId}: ${reason}`);
  }

  /**
   * Get current state of a run
   */
  getState(runId: string): RunState | undefined {
    return this.runs.get(runId);
  }

  /**
   * Get all active (non-terminal) runs
   */
  getActiveRuns(): RunState[] {
    return Array.from(this.runs.values()).filter(s => !isTerminal(s));
  }

  /**
   * Emit an event to all handlers
   */
  private emit(event: OrchestratorEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (error) {
        logger.warn(`[RunLifecycle] Event handler error: ${error}`);
      }
    }
  }
}
