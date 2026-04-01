// Orchestrator State Management
// Manages run state transitions and persistence for the orchestrator

import { Plan, RunStatus } from '../../shared/types';
import { RunState, StepResult } from './types';
import logger from '../../shared/logger';

/**
 * Create initial run state from a validated plan
 */
export function createRunState(plan: Plan): RunState {
  return {
    runId: plan.runId,
    plan,
    status: 'pending',
    currentStepIndex: -1,
    stepResults: [],
    createdAt: Date.now(),
    signers: new Map(),
    currentSlot: 0,
  };
}

/**
 * Valid status transitions
 */
const VALID_TRANSITIONS: Record<RunStatus, RunStatus[]> = {
  pending: ['building', 'aborted'],
  building: ['simulated', 'failed', 'aborted'],
  simulated: ['sending', 'failed', 'aborted'],
  sending: ['confirmed', 'failed', 'aborted'],
  confirmed: [],
  failed: [],
  aborted: [],
};

/**
 * Transition run to a new status. Throws if transition is invalid.
 */
export function transitionStatus(state: RunState, next: RunStatus): RunState {
  const current = state.status;
  const allowed = VALID_TRANSITIONS[current];

  if (!allowed || !allowed.includes(next)) {
    throw new Error(
      `Invalid status transition: ${current} → ${next} (runId=${state.runId})`
    );
  }

  logger.info(`[Orchestrator] Run ${state.runId}: ${current} → ${next}`);

  return {
    ...state,
    status: next,
    startedAt: next === 'building' && !state.startedAt ? Date.now() : state.startedAt,
    completedAt: ['confirmed', 'failed', 'aborted'].includes(next)
      ? Date.now()
      : undefined,
  };
}

/**
 * Record a step result onto the run state
 */
export function recordStepResult(state: RunState, result: StepResult): RunState {
  return {
    ...state,
    stepResults: [...state.stepResults, result],
    currentStepIndex: result.stepIndex,
  };
}

/**
 * Mark the run as failed with an error message
 */
export function failRun(state: RunState, error: string): RunState {
  return {
    ...transitionStatus(state, 'failed'),
    error,
    completedAt: Date.now(),
  };
}

/**
 * Get elapsed time since run started
 */
export function elapsedMs(state: RunState): number {
  if (!state.startedAt) return 0;
  return (state.completedAt || Date.now()) - state.startedAt;
}

/**
 * Check if run is in a terminal state
 */
export function isTerminal(state: RunState): boolean {
  return ['confirmed', 'failed', 'aborted'].includes(state.status);
}

/**
 * Summarize run for logging
 */
export function summarizeRun(state: RunState): string {
  const steps = state.stepResults;
  const succeeded = steps.filter(s => s.status === 'success').length;
  const failed = steps.filter(s => s.status === 'failed').length;
  const sigs = steps.flatMap(s => s.signatures ?? []);

  return [
    `Run ${state.runId} [${state.status}]`,
    `  Steps: ${succeeded}/${steps.length} succeeded, ${failed} failed`,
    `  Duration: ${elapsedMs(state)}ms`,
    `  Signatures: ${sigs.length}`,
    state.error ? `  Error: ${state.error}` : '',
  ].filter(Boolean).join('\n');
}
