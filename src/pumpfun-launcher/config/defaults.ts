// Default configuration for pumpfun-launcher

import { FeesProfile } from '../../shared/types';

export interface LauncherConfig {
  /** Max concurrent runs */
  maxConcurrentRuns: number;
  /** Default SOL commitment level */
  commitment: 'processed' | 'confirmed' | 'finalized';
  /** Blockhash staleness threshold in slots */
  blockhashStaleSlots: number;
  /** Default fee profile when plan says "auto" */
  autoFeeProfile: {
    microLamportsPerCU: number;
    computeUnitLimit: number;
  };
  /** How often to poll slot tracker (ms) */
  slotPollIntervalMs: number;
  /** Abort if plan execution exceeds this (ms) */
  planTimeoutMs: number;
  /** Retry count for individual step sends */
  stepSendRetries: number;
  /** Delay between retries (ms) */
  stepRetryDelayMs: number;
  /** Jito bundle tip floor (SOL) for burst route */
  jitoTipFloorSol: number;
  /** Jito bundle tip ceil (SOL) for burst route */
  jitoTipCeilSol: number;
}

export const DEFAULT_LAUNCHER_CONFIG: LauncherConfig = {
  maxConcurrentRuns: 3,
  commitment: 'confirmed',
  blockhashStaleSlots: 120,
  autoFeeProfile: {
    microLamportsPerCU: 1_500_000,
    computeUnitLimit: 400_000,
  },
  slotPollIntervalMs: 400,
  planTimeoutMs: 5 * 60 * 1000, // 5 min
  stepSendRetries: 3,
  stepRetryDelayMs: 1000,
  jitoTipFloorSol: 0.001,
  jitoTipCeilSol: 0.01,
};

export const DEFAULT_FEES_PROFILE: FeesProfile = {
  mode: 'auto',
  microLamportsPerCU: 1_500_000,
  computeUnitLimit: 400_000,
  burstBlock0: false,
  jitoTipSol: 0.001,
};

// ===== Orchestrator defaults =====

export const ORCHESTRATOR_DEFAULTS = {
  launchIntervalMs: 30 * 60 * 1000,    // 30 min
  dailyBudgetSol: 2.0,
  buyAmountSolPerWallet: 0.05,
  numBuyerWallets: 10,
  jitoTipSol: 0.005,
  targetMcapUsd: 5000,
  printterminalUrl: 'http://localhost:3001',
  narrativeCooldownMs: 24 * 60 * 60 * 1000, // 24h
  dataDir: './data/pumpfun-launcher',
  minNarrativeScore: 30,
} as const;

// ===== Position Manager defaults =====

export const POSITION_DEFAULTS = {
  targetMcapUsd: 5000,
  extendedTargetMcapUsd: 10000,
  maxHoldTimeMs: 30 * 60 * 1000, // 30 min
  stopLossPct: 0.5,
  momentumMultiplier: 2.0,
  momentumWindowMs: 5 * 60 * 1000, // 5 min
  sweepAfterSell: true,
  sellSlippageBps: 1000,
  pollIntervalMs: 5000,
} as const;
