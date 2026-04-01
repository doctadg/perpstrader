// Step Executor
// Executes individual plan steps — create, buy, staggered buy, sell

import {
  Step,
  CreateStep,
  BuyStep,
  StaggeredBuyStep,
  PumpFunSellStep,
  SellStep,
  SimulationResult,
  SignerContext,
  TxMetadata,
} from '../../shared/types';
import { StepResult, RunState } from './types';
import { FeeResolution } from './fee-manager';
import { staggerDelay, withTimingRetry } from './timing-engine';
import logger from '../../shared/logger';

// ===== EXECUTOR INTERFACE =====

export interface StepExecutionContext {
  state: RunState;
  feeResolution: FeeResolution;
  /** Get or create a signer for a wallet ID */
  resolveSigner(walletId: string): Promise<SignerContext>;
  /** Get current blockhash */
  getBlockhash(): Promise<{ blockhash: string; slot: number }>;
  /** Simulate a transaction */
  simulate(message: Uint8Array): Promise<SimulationResult>;
  /** Send a signed transaction */
  send(signature: string, message: Uint8Array): Promise<string>;
  /** Send as Jito bundle */
  sendBundle(signedTxs: Array<{ signature: string; message: Uint8Array }>, tipSol: number): Promise<string>;
  /** Resolve a wallet group to individual wallet IDs */
  resolveWalletGroup(groupId: string): Promise<string[]>;
}

// ===== STEP EXECUTORS =====

/**
 * Execute a create step — deploy a new token on pump.fun
 */
export async function executeCreateStep(
  step: CreateStep,
  ctx: StepExecutionContext
): Promise<StepResult> {
  const start = Date.now();

  try {
    const signer = await ctx.resolveSigner(ctx.state.plan.creatorWalletId);
    const { blockhash, slot } = await ctx.getBlockhash();

    logger.info(`[StepExecutor] CREATE: ${step.metadata.name} ($${step.metadata.symbol}) via ${signer.walletId}`);

    // Build the create instruction (placeholder — real implementation calls pump.fun program)
    const message = buildCreateMessage(step, signer, blockhash);

    // Simulate
    const sim = await ctx.simulate(message);
    if (!sim.success) {
      return {
        stepName: step.name,
        stepIndex: ctx.state.currentStepIndex,
        status: 'failed',
        simulation: sim,
        error: `Simulation failed: ${sim.error}`,
        durationMs: Date.now() - start,
      };
    }

    // Send
    const sig = await withTimingRetry(() => ctx.send(signer.publicKey, message));

    logger.info(`[StepExecutor] CREATE confirmed: ${sig}`);

    return {
      stepName: step.name,
      stepIndex: ctx.state.currentStepIndex,
      status: 'success',
      signatures: [sig],
      simulation: sim,
      durationMs: Date.now() - start,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`[StepExecutor] CREATE failed: ${msg}`);
    return {
      stepName: step.name,
      stepIndex: ctx.state.currentStepIndex,
      status: 'failed',
      error: msg,
      durationMs: Date.now() - start,
    };
  }
}

/**
 * Execute a buy step — buy tokens on pump.fun
 */
export async function executeBuyStep(
  step: BuyStep,
  ctx: StepExecutionContext
): Promise<StepResult> {
  const start = Date.now();

  try {
    const walletIds = await resolveWalletIds(step.walletIds, step.walletGroupId, ctx);
    const amounts = resolveWalletAmounts(walletIds, step);
    const { blockhash, slot } = await ctx.getBlockhash();

    logger.info(
      `[StepExecutor] BUY: ${walletIds.length} wallets, amounts: ${JSON.stringify(amounts)} ` +
      `jito=${step.useJitoBundle}`
    );

    if (step.useJitoBundle) {
      return await executeBundleBuy(walletIds, amounts, step, ctx, start);
    }

    // Sequential buys
    const signatures: string[] = [];
    const sims: SimulationResult[] = [];
    let lastError: string | undefined;

    for (let i = 0; i < walletIds.length; i++) {
      const signer = await ctx.resolveSigner(walletIds[i]);
      const message = buildBuyMessage(
        ctx.state.mintAddress!,
        amounts[walletIds[i]],
        signer,
        blockhash,
        ctx.feeResolution
      );

      const sim = await ctx.simulate(message);
      if (!sim.success) {
        lastError = `Simulation failed for ${walletIds[i]}: ${sim.error}`;
        logger.warn(`[StepExecutor] BUY sim failed for ${walletIds[i]}: ${sim.error}`);
        continue;
      }
      sims.push(sim);

      const sig = await withTimingRetry(() => ctx.send(signer.publicKey, message));
      signatures.push(sig);
    }

    if (signatures.length === 0) {
      return {
        stepName: step.name,
        stepIndex: ctx.state.currentStepIndex,
        status: 'failed',
        error: lastError ?? 'No successful buys',
        durationMs: Date.now() - start,
      };
    }

    return {
      stepName: step.name,
      stepIndex: ctx.state.currentStepIndex,
      status: 'success',
      signatures,
      simulation: sims[0],
      durationMs: Date.now() - start,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`[StepExecutor] BUY failed: ${msg}`);
    return {
      stepName: step.name,
      stepIndex: ctx.state.currentStepIndex,
      status: 'failed',
      error: msg,
      durationMs: Date.now() - start,
    };
  }
}

/**
 * Execute a staggered buy — wallets buy with random delays between them
 */
export async function executeStaggeredBuyStep(
  step: StaggeredBuyStep,
  ctx: StepExecutionContext
): Promise<StepResult> {
  const start = Date.now();

  try {
    const walletIds = await resolveWalletIds(step.walletIds, step.walletGroupId, ctx);
    const amounts = resolveWalletAmounts(walletIds, step);

    logger.info(
      `[StepExecutor] STAGGERED BUY: ${walletIds.length} wallets, ` +
      `delay ${step.delayMinMs}-${step.delayMaxMs}ms`
    );

    const signatures: string[] = [];

    for (let i = 0; i < walletIds.length; i++) {
      if (i > 0) {
        const delay = staggerDelay(step.delayMinMs, step.delayMaxMs);
        logger.debug(`[StepExecutor] Stagger delay: ${delay.toFixed(0)}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      const signer = await ctx.resolveSigner(walletIds[i]);
      const { blockhash } = await ctx.getBlockhash();

      const message = buildBuyMessage(
        ctx.state.mintAddress!,
        amounts[walletIds[i]],
        signer,
        blockhash,
        ctx.feeResolution
      );

      const sim = await ctx.simulate(message);
      if (!sim.success) {
        logger.warn(`[StepExecutor] Staggered BUY sim failed for ${walletIds[i]}: ${sim.error}`);
        continue;
      }

      const sig = await withTimingRetry(() => ctx.send(signer.publicKey, message));
      signatures.push(sig);
    }

    return {
      stepName: step.name,
      stepIndex: ctx.state.currentStepIndex,
      status: signatures.length > 0 ? 'success' : 'failed',
      signatures,
      error: signatures.length === 0 ? 'All staggered buys failed' : undefined,
      durationMs: Date.now() - start,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      stepName: step.name,
      stepIndex: ctx.state.currentStepIndex,
      status: 'failed',
      error: msg,
      durationMs: Date.now() - start,
    };
  }
}

/**
 * Execute a pump.fun sell step
 */
export async function executePumpFunSellStep(
  step: PumpFunSellStep,
  ctx: StepExecutionContext
): Promise<StepResult> {
  const start = Date.now();

  try {
    const walletIds = await resolveWalletIds(step.walletIds, step.walletGroupId, ctx);
    const { blockhash } = await ctx.getBlockhash();

    logger.info(`[StepExecutor] SELL: ${walletIds.length} wallets, ${step.amountTokensEach} tokens each`);

    const signatures: string[] = [];

    for (const walletId of walletIds) {
      const signer = await ctx.resolveSigner(walletId);
      const message = buildPumpFunSellMessage(
        ctx.state.mintAddress!,
        step.amountTokensEach,
        step.decimals,
        signer,
        blockhash,
        ctx.feeResolution
      );

      const sim = await ctx.simulate(message);
      if (!sim.success) {
        logger.warn(`[StepExecutor] SELL sim failed for ${walletId}: ${sim.error}`);
        continue;
      }

      const sig = await withTimingRetry(() => ctx.send(signer.publicKey, message));
      signatures.push(sig);
    }

    return {
      stepName: step.name,
      stepIndex: ctx.state.currentStepIndex,
      status: signatures.length > 0 ? 'success' : 'failed',
      signatures,
      error: signatures.length === 0 ? 'All sells failed' : undefined,
      durationMs: Date.now() - start,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      stepName: step.name,
      stepIndex: ctx.state.currentStepIndex,
      status: 'failed',
      error: msg,
      durationMs: Date.now() - start,
    };
  }
}

/**
 * Execute a DEX sell step
 */
export async function executeDexSellStep(
  step: SellStep,
  ctx: StepExecutionContext
): Promise<StepResult> {
  const start = Date.now();

  try {
    const { blockhash } = await ctx.getBlockhash();

    logger.info(
      `[StepExecutor] DEX SELL: ${step.walletIds.length} wallets, ` +
      `${step.percentEach}% of ${step.tokenMint}`
    );

    const signatures: string[] = [];

    for (const walletId of step.walletIds) {
      const signer = await ctx.resolveSigner(walletId);
      const message = buildDexSellMessage(
        step.tokenMint,
        step.percentEach,
        step.minOutBps,
        signer,
        blockhash,
        ctx.feeResolution
      );

      const sim = await ctx.simulate(message);
      if (!sim.success) {
        logger.warn(`[StepExecutor] DEX SELL sim failed for ${walletId}: ${sim.error}`);
        continue;
      }

      const sig = await withTimingRetry(() => ctx.send(signer.publicKey, message));
      signatures.push(sig);
    }

    return {
      stepName: step.name,
      stepIndex: ctx.state.currentStepIndex,
      status: signatures.length > 0 ? 'success' : 'failed',
      signatures,
      error: signatures.length === 0 ? 'All DEX sells failed' : undefined,
      durationMs: Date.now() - start,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      stepName: step.name,
      stepIndex: ctx.state.currentStepIndex,
      status: 'failed',
      error: msg,
      durationMs: Date.now() - start,
    };
  }
}

/**
 * Dispatch a step to the correct executor based on type
 */
export async function executeStep(
  step: Step,
  ctx: StepExecutionContext
): Promise<StepResult> {
  switch (step.type) {
    case 'pumpfun.create':
      return executeCreateStep(step, ctx);
    case 'pumpfun.buy':
      return executeBuyStep(step, ctx);
    case 'pumpfun.buy.staggered':
      return executeStaggeredBuyStep(step, ctx);
    case 'pumpfun.sell':
      return executePumpFunSellStep(step, ctx);
    case 'dex.sell':
      return executeDexSellStep(step, ctx);
    default:
      return {
        stepName: (step as any).name ?? 'unknown',
        stepIndex: ctx.state.currentStepIndex,
        status: 'failed',
        error: `Unknown step type: ${(step as any).type}`,
        durationMs: 0,
      };
  }
}

// ===== INTERNAL HELPERS =====

async function resolveWalletIds(
  walletIds: string[] | undefined,
  groupId: string | undefined,
  ctx: StepExecutionContext
): Promise<string[]> {
  if (walletIds && walletIds.length > 0) return walletIds;
  if (groupId) return ctx.resolveWalletGroup(groupId);
  return [ctx.state.plan.creatorWalletId];
}

function resolveWalletAmounts(
  walletIds: string[],
  step: BuyStep | StaggeredBuyStep
): Record<string, number> {
  const amounts: Record<string, number> = {};

  for (const wid of walletIds) {
    if (step.walletAmounts && step.walletAmounts[wid] !== undefined) {
      amounts[wid] = step.walletAmounts[wid];
    } else if (step.amountSolEach !== undefined) {
      amounts[wid] = step.amountSolEach;
    } else if (step.amountSolMin !== undefined && step.amountSolMax !== undefined) {
      amounts[wid] = step.amountSolMin + Math.random() * (step.amountSolMax - step.amountSolMin);
    } else {
      amounts[wid] = 0.01; // Safe fallback
    }
  }

  return amounts;
}

async function executeBundleBuy(
  walletIds: string[],
  amounts: Record<string, number>,
  step: BuyStep,
  ctx: StepExecutionContext,
  startTime: number
): Promise<StepResult> {
  const signedTxs: Array<{ signature: string; message: Uint8Array }> = [];

  for (const walletId of walletIds) {
    const signer = await ctx.resolveSigner(walletId);
    const { blockhash } = await ctx.getBlockhash();

    const message = buildBuyMessage(
      ctx.state.mintAddress!,
      amounts[walletId],
      signer,
      blockhash,
      ctx.feeResolution
    );

    signedTxs.push({ signature: signer.publicKey, message });
  }

  const bundleId = await ctx.sendBundle(signedTxs, ctx.feeResolution.jitoTipSol ?? 0.001);

  return {
    stepName: step.name,
    stepIndex: ctx.state.currentStepIndex,
    status: 'success',
    signatures: [bundleId],
    durationMs: Date.now() - startTime,
  };
}

// ===== PLACEHOLDER BUILDERS =====
// These return empty Uint8Arrays — real implementation plugs in @solana/web3.js

function buildCreateMessage(step: CreateStep, signer: SignerContext, blockhash: string): Uint8Array {
  // TODO: Build real pump.fun create instruction via @solana/web3.js
  return new Uint8Array(0);
}

function buildBuyMessage(
  mint: string,
  amountSol: number,
  signer: SignerContext,
  blockhash: string,
  fees: FeeResolution
): Uint8Array {
  // TODO: Build real pump.fun buy instruction
  return new Uint8Array(0);
}

function buildPumpFunSellMessage(
  mint: string,
  amountTokens: number,
  decimals: number,
  signer: SignerContext,
  blockhash: string,
  fees: FeeResolution
): Uint8Array {
  // TODO: Build real pump.fun sell instruction
  return new Uint8Array(0);
}

function buildDexSellMessage(
  tokenMint: string,
  percent: number,
  minOutBps: number | undefined,
  signer: SignerContext,
  blockhash: string,
  fees: FeeResolution
): Uint8Array {
  // TODO: Build real DEX swap instruction (Jupiter/Raydium)
  return new Uint8Array(0);
}
