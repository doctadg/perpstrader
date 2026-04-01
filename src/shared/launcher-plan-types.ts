/**
 * Shared Plan type re-exports from printterminal's planTypes.
 * These mirror the Zod schemas so we can build Plan objects without importing Zod at runtime.
 */

export type Timing =
  | { mode: 'slot'; slotOffset: number; jitterMs?: number }
  | { mode: 'time'; ms: number; jitterMs?: number };

export interface FeesProfile {
  mode: 'auto' | 'custom';
  microLamportsPerCU?: number;
  computeUnitLimit?: number;
  burstBlock0?: boolean;
  jitoTipSol?: number;
}

export interface CreateStep {
  name: string;
  type: 'pumpfun.create';
  at: Timing;
  metadata: { name: string; symbol: string; uri: string };
  devBuyAmount?: number;
}

export interface BuyStep {
  name: string;
  type: 'pumpfun.buy';
  walletIds?: string[];
  walletGroupId?: string;
  walletAmounts?: Record<string, number>;
  amountSolEach?: number;
  amountSolMin?: number;
  amountSolMax?: number;
  useJitoBundle?: boolean;
  at: Timing;
}

export type Step = CreateStep | BuyStep;

export interface Plan {
  runId: string;
  route: 'burst' | 'plain' | 'staggered';
  timingBase: 'now' | 'slotCurrent';
  fees: FeesProfile;
  policyId: string;
  creatorWalletId: string;
  mintSecretKey?: string;
  steps: Step[];
}

export type RunStatus = 'pending' | 'building' | 'simulated' | 'sending' | 'confirmed' | 'failed' | 'aborted';
