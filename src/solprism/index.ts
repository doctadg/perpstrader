/**
 * SOLPRISM Integration — Verifiable Onchain Reasoning for PerpTrader
 *
 * This module adds commit-reveal reasoning verification to every trade
 * decision made by the PerpTrader pipeline. Using the SOLPRISM protocol
 * on Solana, each trade's reasoning is:
 *
 *   1. Hashed (SHA-256) and committed onchain BEFORE execution
 *   2. Revealed in full AFTER execution
 *   3. Verifiable by anyone — investors, auditors, the public
 *
 * This creates an immutable audit trail that proves the AI's logic
 * was fixed before the trade, eliminating hindsight bias and enabling
 * true performance attribution.
 *
 * @module solprism
 * @see https://www.solprism.app/
 * @see Program ID: CZcvoryaQNrtZ3qb3gC1h9opcYpzEP1D9Mu1RVwFQeBu
 */

export { getSolprismConfig, loadSolprismConfig } from './config';
export type { SolprismConfig } from './config';

export { buildReasoningTrace } from './reasoning-builder';
export type { SolprismReasoningTrace, SolprismDataSource, SolprismAlternative } from './reasoning-builder';

export {
  solprismWrappedExecute,
  commitTradeReasoning,
  revealTradeReasoning,
} from './solprism-node';
export type { SolprismCommitResult, SolprismRevealResult } from './solprism-node';
