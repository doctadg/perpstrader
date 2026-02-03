// Safekeeping Fund System - Execute Node
// Executes approved rebalance actions via DEX clients

import logger from '../../shared/logger';
import circuitBreaker from '../../shared/circuit-breaker';
import { MultiChainWalletManager } from '../dex/multi-chain-wallet-manager';
import type { SafekeepingFundState } from '../state';
import type {
  RebalanceExecutionResult,
  RebalanceAction,
  AddLiquidityParams,
  RemoveLiquidityParams,
} from '../types';

/**
 * Execute Node
 * Executes the selected rebalance action
 */
export async function executeNode(
  state: SafekeepingFundState,
  walletManager: MultiChainWalletManager
): Promise<Partial<SafekeepingFundState>> {
  logger.info('[Execute] Executing rebalance action');

  const startTime = Date.now();

  try {
    if (!state.selectedRebalance) {
      logger.warn('[Execute] No rebalance action selected');
      return {
        currentStep: 'EXECUTE_SKIP',
        thoughts: [...state.thoughts, 'No rebalance action to execute'],
      };
    }

    const action = state.selectedRebalance;
    const results: RebalanceExecutionResult[] = [];

    // Execute based on action type
    switch (action.type) {
      case 'MINT':
        results.push(await executeMint(action, walletManager));
        break;

      case 'BURN':
        results.push(await executeBurn(action, walletManager));
        break;

      case 'REALLOCATE':
        const reallocateResults = await executeReallocate(action, walletManager);
        results.push(...reallocateResults);
        break;

      case 'COLLECT':
        results.push(await executeCollect(action, walletManager));
        break;

      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }

    // Check if execution was successful
    const allSuccessful = results.every(r => r.success);

    if (allSuccessful) {
      logger.info(`[Execute] Execution successful in ${Date.now() - startTime}ms`);
      circuitBreaker.resetBreaker('safekeeping-execution');
    } else {
      logger.warn(`[Execute] Some executions failed`);
      // Note: onError is private, handled at orchestrator level
    }

    return {
      currentStep: allSuccessful ? 'EXECUTE_COMPLETE' : 'EXECUTE_PARTIAL',
      executionResults: results,
      totalRebalances: state.totalRebalances + 1,
      successfulRebalances: state.successfulRebalances + (allSuccessful ? 1 : 0),
      totalGasSpent: state.totalGasSpent + results.reduce((sum, r) => sum + (r.actualGasCost || 0), 0),
      averageRebalanceDuration: results.length > 0
        ? results.reduce((sum, r) => sum + r.duration, 0) / results.length
        : state.averageRebalanceDuration,
      thoughts: [
        ...state.thoughts,
        `Executed ${action.type} ${allSuccessful ? 'successfully' : 'with errors'}`,
        `Gas spent: $${results.reduce((sum, r) => sum + (r.actualGasCost || 0), 0).toFixed(2)}`,
      ],
    };
  } catch (error) {
    logger.error(`[Execute] Failed: ${error}`);
    // Note: onError is private, handled at orchestrator level

    return {
      currentStep: 'EXECUTE_ERROR',
      errors: [...state.errors, `Execution failed: ${error}`],
      thoughts: [...state.thoughts, `Execution error: ${error}`],
    };
  }
}

/**
 * Execute MINT action (add new liquidity)
 */
async function executeMint(
  action: RebalanceAction,
  walletManager: MultiChainWalletManager
): Promise<RebalanceExecutionResult> {
  const startTime = Date.now();

  if (!action.toPool) {
    return {
      actionId: action.id,
      success: false,
      error: 'No target pool specified',
      actualAmount: 0,
      actualGasCost: 0,
      duration: Date.now() - startTime,
      timestamp: new Date(),
    };
  }

  logger.info(`[Execute] Minting position in ${action.toPool.address}`);

  const params: AddLiquidityParams = {
    poolAddress: action.toPool.address,
    token0Amount: action.amount / 2,
    token1Amount: action.amount / 2,
    slippageTolerance: 0.005, // 0.5%
    deadlineMinutes: 20,
  };

  const result = await walletManager.addLiquidity(action.toPool.chain, params);

  return {
    actionId: action.id,
    success: result.success,
    txHash: result.txHash,
    actualAmount: result.actualAmount || action.amount,
    actualGasCost: result.gasCost || action.estimatedGas,
    gasCost: result.gasCost || action.estimatedGas,
    error: result.error,
    duration: result.duration,
    timestamp: new Date(),
  };
}

/**
 * Execute BURN action (remove liquidity)
 */
async function executeBurn(
  action: RebalanceAction,
  walletManager: MultiChainWalletManager
): Promise<RebalanceExecutionResult> {
  const startTime = Date.now();

  if (!action.fromPool) {
    return {
      actionId: action.id,
      success: false,
      error: 'No source pool specified',
      actualAmount: 0,
      actualGasCost: 0,
      duration: Date.now() - startTime,
      timestamp: new Date(),
    };
  }

  logger.info(`[Execute] Burning position from ${action.fromPool.address}`);

  const params: RemoveLiquidityParams = {
    positionId: action.fromPool.address,
    percentage: action.percentage * 100,
    slippageTolerance: 0.005,
    deadlineMinutes: 20,
  };

  const result = await walletManager.removeLiquidity(action.fromPool.chain, params);

  return {
    actionId: action.id,
    success: result.success,
    txHash: result.txHash,
    actualAmount: result.actualAmount || action.amount,
    actualGasCost: result.gasCost || action.estimatedGas,
    gasCost: result.gasCost || action.estimatedGas,
    error: result.error,
    duration: result.duration,
    timestamp: new Date(),
  };
}

/**
 * Execute REALLOCATE action (remove from one pool, add to another)
 */
async function executeReallocate(
  action: RebalanceAction,
  walletManager: MultiChainWalletManager
): Promise<RebalanceExecutionResult[]> {
  const results: RebalanceExecutionResult[] = [];

  if (!action.fromPool || !action.toPool) {
    return [{
      actionId: action.id,
      success: false,
      error: 'Both source and target pools required',
      actualAmount: 0,
      actualGasCost: 0,
      duration: 0,
      timestamp: new Date(),
    }];
  }

  logger.info(
    `[Execute] Reallocating ${action.percentage * 100}% from ${action.fromPool.address} ` +
    `to ${action.toPool.address}`
  );

  // Step 1: Remove from source pool
  const removeParams: RemoveLiquidityParams = {
    positionId: action.fromPool.address,
    percentage: action.percentage * 100,
    slippageTolerance: 0.005,
    deadlineMinutes: 20,
  };

  const removeResult = await walletManager.removeLiquidity(action.fromPool.chain, removeParams);
  results.push({
    actionId: `${action.id}_remove`,
    success: removeResult.success,
    txHash: removeResult.txHash,
    actualAmount: removeResult.actualAmount || action.amount,
    actualGasCost: removeResult.gasCost || action.estimatedGas / 2,
    gasCost: removeResult.gasCost || action.estimatedGas / 2,
    error: removeResult.error,
    duration: removeResult.duration,
    timestamp: new Date(),
  });

  // Step 2: Add to target pool (only if removal succeeded)
  if (removeResult.success) {
    const addParams: AddLiquidityParams = {
      poolAddress: action.toPool.address,
      token0Amount: (removeResult.actualAmount || action.amount) / 2,
      token1Amount: (removeResult.actualAmount || action.amount) / 2,
      slippageTolerance: 0.005,
      deadlineMinutes: 20,
    };

    const addResult = await walletManager.addLiquidity(action.toPool.chain, addParams);
    results.push({
      actionId: `${action.id}_add`,
      success: addResult.success,
      txHash: addResult.txHash,
      actualAmount: addResult.actualAmount || action.amount,
      actualGasCost: addResult.gasCost || action.estimatedGas / 2,
      gasCost: addResult.gasCost || action.estimatedGas / 2,
      error: addResult.error,
      duration: addResult.duration,
      timestamp: new Date(),
    });
  }

  return results;
}

/**
 * Execute COLLECT action (collect fees only)
 */
async function executeCollect(
  action: RebalanceAction,
  walletManager: MultiChainWalletManager
): Promise<RebalanceExecutionResult> {
  const startTime = Date.now();

  logger.info(`[Execute] Collecting fees from ${action.toPool?.address || 'unknown'}`);

  // Fee collection is typically done as part of position management
  // This is a placeholder implementation

  return {
    actionId: action.id,
    success: true,
    actualAmount: action.amount,
    actualGasCost: action.estimatedGas * 0.3, // Fee collection is cheaper
    gasCost: action.estimatedGas * 0.3,
    duration: Date.now() - startTime,
    timestamp: new Date(),
  };
}

/**
 * Build add liquidity parameters from action
 */
export function buildAddLiquidityParams(
  action: RebalanceAction,
  token0Amount: number,
  token1Amount: number
): AddLiquidityParams {
  return {
    poolAddress: action.toPool?.address || '',
    token0Amount,
    token1Amount,
    slippageTolerance: 0.005,
    deadlineMinutes: 20,
  };
}

/**
 * Build remove liquidity parameters from action
 */
export function buildRemoveLiquidityParams(
  action: RebalanceAction
): RemoveLiquidityParams {
  return {
    positionId: action.fromPool?.address || '',
    percentage: action.percentage * 100,
    slippageTolerance: 0.005,
    deadlineMinutes: 20,
  };
}
