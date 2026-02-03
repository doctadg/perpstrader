import { MultiChainWalletManager } from '../dex/multi-chain-wallet-manager';
import type { SafekeepingFundState } from '../state';
import type { RebalanceAction, AddLiquidityParams, RemoveLiquidityParams } from '../types';
/**
 * Execute Node
 * Executes the selected rebalance action
 */
export declare function executeNode(state: SafekeepingFundState, walletManager: MultiChainWalletManager): Promise<Partial<SafekeepingFundState>>;
/**
 * Build add liquidity parameters from action
 */
export declare function buildAddLiquidityParams(action: RebalanceAction, token0Amount: number, token1Amount: number): AddLiquidityParams;
/**
 * Build remove liquidity parameters from action
 */
export declare function buildRemoveLiquidityParams(action: RebalanceAction): RemoveLiquidityParams;
//# sourceMappingURL=execute.d.ts.map