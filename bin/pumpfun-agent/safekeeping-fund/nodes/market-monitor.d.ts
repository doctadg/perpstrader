import { MultiChainWalletManager } from '../dex/multi-chain-wallet-manager';
import type { SafekeepingFundState } from '../state';
import type { ChainStatus, Chain } from '../types';
/**
 * Market Monitor Node
 * Fetches pool opportunities and chain status across all DEXs
 */
export declare function marketMonitorNode(state: SafekeepingFundState, walletManager: MultiChainWalletManager): Promise<Partial<SafekeepingFundState>>;
/**
 * Quick health check for all chains
 */
export declare function quickHealthCheck(walletManager: MultiChainWalletManager): Promise<{
    healthy: boolean;
    chainStatuses: Map<Chain, ChainStatus>;
}>;
//# sourceMappingURL=market-monitor.d.ts.map