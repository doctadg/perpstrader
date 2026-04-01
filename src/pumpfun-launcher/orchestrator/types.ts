// Orchestrator Types
// Core types for the plan execution orchestrator

import {
  Plan,
  Step,
  RunStatus,
  Timing,
  SignerContext,
  TxMetadata,
  SimulationResult,
  FeePriorityEstimate,
} from '../../shared/types';

// Re-export plan types for convenience
export type {
  Plan,
  Step,
  RunStatus,
  Timing,
  SignerContext,
  TxMetadata,
  SimulationResult,
  FeePriorityEstimate,
};

// ===== STEP RESULTS =====

export interface StepResult {
  stepName: string;
  stepIndex: number;
  status: 'success' | 'failed' | 'skipped';
  signatures?: string[];
  simulation?: SimulationResult;
  error?: string;
  durationMs: number;
}

// ===== RUN STATE =====

export interface RunState {
  runId: string;
  plan: Plan;
  status: RunStatus;
  currentStepIndex: number;
  stepResults: StepResult[];
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  error?: string;
  /** Resolved signer contexts keyed by walletId */
  signers: Map<string, SignerContext>;
  /** Mint address resolved after create step */
  mintAddress?: string;
  /** Blockhash at execution time */
  blockhash?: string;
  blockhashSlot?: number;
  /** Current slot (updated continuously) */
  currentSlot: number;
}

// ===== ORCHESTRATOR EVENTS =====

export type OrchestratorEvent =
  | { type: 'run:created'; runId: string }
  | { type: 'run:started'; runId: string }
  | { type: 'run:step:start'; runId: string; stepIndex: number; stepName: string }
  | { type: 'run:step:complete'; runId: string; stepIndex: number; result: StepResult }
  | { type: 'run:step:failed'; runId: string; stepIndex: number; error: string }
  | { type: 'run:completed'; runId: string; status: RunStatus }
  | { type: 'run:aborted'; runId: string; reason: string };

export type OrchestratorEventHandler = (event: OrchestratorEvent) => void | Promise<void>;

// ===== ORCHESTRATOR INTERFACE =====

export interface IOrchestrator {
  /** Queue a plan for execution, returns runId */
  submit(plan: Plan): Promise<string>;
  /** Abort a running plan */
  abort(runId: string, reason: string): Promise<void>;
  /** Get current state of a run */
  getState(runId: string): RunState | undefined;
  /** Subscribe to orchestrator events */
  onEvent(handler: OrchestratorEventHandler): void;
  /** Start the orchestrator loop */
  start(): Promise<void>;
  /** Graceful shutdown */
  stop(): Promise<void>;
}
