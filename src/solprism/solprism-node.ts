/**
 * SOLPRISM Commit-Reveal Node
 *
 * This is the core integration point. It wraps trade execution with
 * SOLPRISM's commit-reveal protocol so every trade decision is
 * cryptographically provable onchain:
 *
 *   1. BEFORE execution → commit a SHA-256 hash of the full reasoning
 *   2. Execute the trade (unchanged pipeline logic)
 *   3. AFTER execution → reveal the full reasoning onchain
 *
 * This means investors can independently verify:
 *   • The reasoning was produced BEFORE the trade (no hindsight bias)
 *   • The reasoning hash matches what was committed (no post-hoc edits)
 *   • Every position has an auditable decision trail
 *
 * The node is designed to be non-blocking: if SOLPRISM is disabled or
 * the Solana transaction fails, the trade still executes. Verifiability
 * is additive, never a bottleneck.
 *
 * @see https://www.solprism.app/
 */

import { Connection, Keypair } from '@solana/web3.js';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';

import { AgentState } from '../langgraph/state';
import { Trade } from '../shared/types';
import { buildReasoningTrace, SolprismReasoningTrace } from './reasoning-builder';
import { getSolprismConfig, SolprismConfig } from './config';
import logger from '../shared/logger';

// ─── SDK Imports ──────────────────────────────────────────────────────────
// These mirror @solprism/sdk exports. The actual SDK is a dependency,
// but we use dynamic import to avoid breaking the build when the
// SDK is not installed (graceful degradation).

let SolprismClient: any = null;
let sdkLoaded = false;

async function loadSdk(): Promise<boolean> {
  if (sdkLoaded) return SolprismClient !== null;
  sdkLoaded = true;

  try {
    const sdk = await import('@solprism/sdk');
    SolprismClient = sdk.SolprismClient;
    logger.info('[SOLPRISM] SDK loaded successfully');
    return true;
  } catch {
    logger.warn('[SOLPRISM] @solprism/sdk not installed — using local hash-only mode');
    return false;
  }
}

// ─── Local Hashing (fallback when SDK is unavailable) ─────────────────────

function sortKeys(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(sortKeys);
  if (typeof obj === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj as Record<string, unknown>).sort()) {
      sorted[key] = sortKeys((obj as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return obj;
}

function hashTrace(trace: SolprismReasoningTrace): { hash: Uint8Array; hex: string } {
  const canonical = JSON.stringify(sortKeys(trace));
  const hash = createHash('sha256').update(canonical, 'utf-8').digest();
  return {
    hash: new Uint8Array(hash),
    hex: hash.toString('hex'),
  };
}

// ─── Wallet Loader ────────────────────────────────────────────────────────

let _wallet: Keypair | null = null;

function loadWallet(config: SolprismConfig): Keypair | null {
  if (_wallet) return _wallet;

  try {
    const raw = readFileSync(config.keypairPath, 'utf-8');
    const secretKey = Uint8Array.from(JSON.parse(raw));
    _wallet = Keypair.fromSecretKey(secretKey);
    logger.info(`[SOLPRISM] Wallet loaded: ${_wallet.publicKey.toBase58()}`);
    return _wallet;
  } catch (err) {
    logger.error(`[SOLPRISM] Failed to load wallet from ${config.keypairPath}:`, err);
    return null;
  }
}

// ─── Client Singleton ─────────────────────────────────────────────────────

let _client: any = null;

async function getClient(config: SolprismConfig): Promise<any | null> {
  if (_client) return _client;

  const hasSdk = await loadSdk();
  if (!hasSdk || !SolprismClient) return null;

  try {
    _client = new SolprismClient(config.rpcUrl, config.programId);
    return _client;
  } catch (err) {
    logger.error('[SOLPRISM] Failed to create client:', err);
    return null;
  }
}

// ─── State Extension ──────────────────────────────────────────────────────

/**
 * SOLPRISM fields appended to AgentState after commit/reveal.
 * These are added to the state's thoughts array and returned
 * as extra metadata without modifying the core state interface.
 */
export interface SolprismCommitResult {
  /** SHA-256 hash of the reasoning trace (hex) */
  reasoningHash: string;
  /** Solana transaction signature for the commit (null if offline) */
  commitSignature: string | null;
  /** Onchain commitment PDA address (null if offline) */
  commitmentAddress: string | null;
  /** The full reasoning trace (for later reveal) */
  trace: SolprismReasoningTrace;
  /** Whether the commitment was sent onchain */
  onchain: boolean;
}

export interface SolprismRevealResult {
  /** Solana transaction signature for the reveal */
  revealSignature: string | null;
  /** URI where reasoning is stored */
  reasoningUri: string | null;
}

// ─── Pre-Execution: Commit Reasoning ──────────────────────────────────────

/**
 * Commit the reasoning hash onchain BEFORE trade execution.
 *
 * This is the critical step that proves the reasoning existed
 * before the trade was placed. The hash is a SHA-256 digest of
 * the canonical JSON-serialized reasoning trace.
 *
 * @param state - Current pipeline state (must have signal + riskAssessment)
 * @returns Commit result with hash and optional onchain signature
 */
export async function commitTradeReasoning(
  state: AgentState,
): Promise<SolprismCommitResult | null> {
  const config = getSolprismConfig();

  if (!config.enabled) return null;
  if (!state.signal || !state.riskAssessment || !state.shouldExecute) return null;

  try {
    // Build the reasoning trace from pipeline state
    const trace = buildReasoningTrace(state, config.agentName);

    // Hash it deterministically
    const { hash, hex } = hashTrace(trace);

    logger.info(`[SOLPRISM] Reasoning hash: ${hex.slice(0, 16)}...`);
    logger.info(`[SOLPRISM] Committing reasoning BEFORE trade execution...`);

    // Try to commit onchain
    const wallet = loadWallet(config);
    const client = await getClient(config);

    let commitSignature: string | null = null;
    let commitmentAddress: string | null = null;
    let onchain = false;

    if (client && wallet) {
      try {
        // Ensure agent is registered
        const isRegistered = await client.isAgentRegistered(wallet.publicKey);
        if (!isRegistered) {
          logger.info(`[SOLPRISM] Registering agent "${config.agentName}" onchain...`);
          await client.registerAgent(wallet, config.agentName);
        }

        // Commit the reasoning hash
        const result = await client.commitReasoning(wallet, trace);
        commitSignature = result.signature;
        commitmentAddress = result.commitmentAddress;
        onchain = true;

        logger.info(`[SOLPRISM] ✅ Reasoning committed onchain`);
        logger.info(`[SOLPRISM]    Signature: ${commitSignature}`);
        logger.info(`[SOLPRISM]    Commitment: ${commitmentAddress}`);
        logger.info(`[SOLPRISM]    Explorer: https://www.solprism.app/`);
      } catch (err) {
        logger.warn(`[SOLPRISM] Onchain commit failed (trade will still execute):`, err);
        // Non-fatal: the hash is still computed locally
      }
    } else {
      logger.info(`[SOLPRISM] Offline mode — reasoning hash computed locally: ${hex}`);
    }

    return {
      reasoningHash: hex,
      commitSignature,
      commitmentAddress,
      trace,
      onchain,
    };
  } catch (err) {
    logger.error('[SOLPRISM] Failed to build/commit reasoning:', err);
    return null;
  }
}

// ─── Post-Execution: Reveal Reasoning ─────────────────────────────────────

/**
 * Reveal the full reasoning onchain AFTER trade execution.
 *
 * This publishes the URI where the full reasoning trace can be
 * retrieved, allowing anyone to verify it matches the committed hash.
 *
 * @param commitResult - The commit result from pre-execution
 * @param trade - The executed trade (for adding tx reference)
 * @returns Reveal result with signature and URI
 */
export async function revealTradeReasoning(
  commitResult: SolprismCommitResult,
  trade: Trade | null,
): Promise<SolprismRevealResult | null> {
  const config = getSolprismConfig();

  if (!config.enabled || !config.autoReveal) return null;
  if (!commitResult.onchain || !commitResult.commitmentAddress) return null;

  try {
    const wallet = loadWallet(config);
    const client = await getClient(config);

    if (!client || !wallet) return null;

    // Optionally attach the trade's transaction reference to the trace
    if (trade) {
      commitResult.trace.action.transactionSignature = trade.id;
    }

    // Store reasoning (in production, this would go to IPFS or a dedicated store)
    const reasoningUri = config.storageUri
      ? `${config.storageUri}/reasoning/${commitResult.reasoningHash}`
      : `solprism://${commitResult.commitmentAddress}`;

    // Reveal onchain
    const result = await client.revealReasoning(
      wallet,
      commitResult.commitmentAddress,
      reasoningUri,
    );

    logger.info(`[SOLPRISM] ✅ Reasoning revealed onchain`);
    logger.info(`[SOLPRISM]    Reveal tx: ${result.signature}`);
    logger.info(`[SOLPRISM]    Reasoning URI: ${reasoningUri}`);

    return {
      revealSignature: result.signature,
      reasoningUri,
    };
  } catch (err) {
    logger.warn(`[SOLPRISM] Onchain reveal failed (non-fatal):`, err);
    return null;
  }
}

// ─── Integrated Pipeline Node ─────────────────────────────────────────────

/**
 * SOLPRISM-wrapped executor node.
 *
 * Drop-in replacement for the standard executor that adds
 * commit-reveal reasoning verification around trade execution.
 *
 * Flow:
 *   1. Build reasoning trace from current state
 *   2. Commit hash onchain (pre-trade)
 *   3. Execute the trade (standard pipeline)
 *   4. Reveal reasoning onchain (post-trade)
 *   5. Return enriched state with SOLPRISM metadata
 *
 * If SOLPRISM is disabled, this passes through to the standard executor
 * with zero overhead.
 *
 * @param state - Current pipeline state
 * @param executeFn - The actual trade execution function
 * @returns Updated state with SOLPRISM thoughts appended
 */
export async function solprismWrappedExecute(
  state: AgentState,
  executeFn: (state: AgentState) => Promise<Partial<AgentState>>,
): Promise<Partial<AgentState>> {
  const config = getSolprismConfig();

  // If SOLPRISM is disabled, passthrough
  if (!config.enabled) {
    return executeFn(state);
  }

  // ── Step 1: Commit reasoning BEFORE execution ─────────────────────────
  const commitResult = await commitTradeReasoning(state);

  const solprismThoughts: string[] = [];

  if (commitResult) {
    solprismThoughts.push(`[SOLPRISM] Reasoning hash: ${commitResult.reasoningHash.slice(0, 16)}...`);

    if (commitResult.onchain) {
      solprismThoughts.push(`[SOLPRISM] ✅ Committed onchain: ${commitResult.commitSignature?.slice(0, 16)}...`);
    } else {
      solprismThoughts.push(`[SOLPRISM] Reasoning hashed locally (offline mode)`);
    }
  }

  // ── Step 2: Execute the trade ─────────────────────────────────────────
  const result = await executeFn(state);

  // ── Step 3: Reveal reasoning AFTER execution ──────────────────────────
  if (commitResult && result.executionResult) {
    const revealResult = await revealTradeReasoning(commitResult, result.executionResult);

    if (revealResult?.revealSignature) {
      solprismThoughts.push(`[SOLPRISM] ✅ Reasoning revealed onchain: ${revealResult.revealSignature.slice(0, 16)}...`);
      solprismThoughts.push(`[SOLPRISM] Full reasoning verifiable at: https://www.solprism.app/`);
    }
  }

  // ── Step 4: Merge SOLPRISM thoughts into result ───────────────────────
  return {
    ...result,
    thoughts: [
      ...(result.thoughts || state.thoughts),
      ...solprismThoughts,
    ],
  };
}

export default solprismWrappedExecute;
