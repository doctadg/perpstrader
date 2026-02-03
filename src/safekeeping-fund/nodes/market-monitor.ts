// Safekeeping Fund System - Market Monitor Node
// Fetches pool states from all DEXs across all chains

import logger from '../../shared/logger';
import { MultiChainWalletManager } from '../dex/multi-chain-wallet-manager';
import type { SafekeepingFundState } from '../state';
import type { ChainStatus, Chain } from '../types';

/**
 * Market Monitor Node
 * Fetches pool opportunities and chain status across all DEXs
 */
export async function marketMonitorNode(
  state: SafekeepingFundState,
  walletManager: MultiChainWalletManager
): Promise<Partial<SafekeepingFundState>> {
  const startTime = Date.now();
  logger.info('[MarketMonitor] Starting market data fetch');

  try {
    // Check all chain statuses in parallel
    const chainStatuses = await walletManager.checkAllChainStatuses();
    const chainStatusMap = new Map<Chain, ChainStatus>();

    for (const [chain, status] of chainStatuses) {
      chainStatusMap.set(chain, status);
      logger.debug(
        `[MarketMonitor] ${chain}: ${status.isConnected ? 'Connected' : 'Disconnected'} ` +
        `(latency: ${status.latency}ms)`
      );
    }

    // Fetch pool opportunities from all chains
    const opportunities = await walletManager.fetchAllPoolOpportunities();

    logger.info(
      `[MarketMonitor] Found ${opportunities.length} opportunities across ` +
      `${chainStatusMap.size} chain(s) in ${Date.now() - startTime}ms`
    );

    // Calculate current positions value
    const positions = await walletManager.getAllPositions();
    const totalValue = positions.reduce((sum, p) => sum + p.totalValue, 0);
    const avgAPR = positions.length > 0
      ? positions.reduce((sum, p) => sum + p.effectiveAPR, 0) / positions.length
      : 0;

    // Build chain breakdown
    const chainBreakdown = new Map<Chain, number>();
    for (const position of positions) {
      const current = chainBreakdown.get(position.chain) || 0;
      chainBreakdown.set(position.chain, current + position.totalValue);
    }

    return {
      currentStep: 'MARKET_MONITOR_COMPLETE',
      poolOpportunities: opportunities,
      topOpportunities: opportunities.slice(0, 5),
      bestOpportunity: opportunities[0] || null,
      chainStatus: chainStatusMap,
      positions,
      totalValue,
      totalEffectiveAPR: avgAPR,
      chainBreakdown,
      thoughts: [
        ...state.thoughts,
        `Fetched ${opportunities.length} pool opportunities from ${chainStatusMap.size} chain(s)`,
        `Current portfolio value: $${totalValue.toFixed(2)} with avg APR: ${avgAPR.toFixed(2)}%`,
        `Best opportunity: ${opportunities[0]?.address || 'none'} at ${opportunities[0]?.effectiveAPR.toFixed(2) || 0}% APR`,
      ],
    };
  } catch (error) {
    logger.error(`[MarketMonitor] Failed: ${error}`);
    return {
      currentStep: 'MARKET_MONITOR_ERROR',
      errors: [...state.errors, `Market monitor failed: ${error}`],
      thoughts: [...state.thoughts, 'Market monitor encountered an error'],
    };
  }
}

/**
 * Quick health check for all chains
 */
export async function quickHealthCheck(
  walletManager: MultiChainWalletManager
): Promise<{ healthy: boolean; chainStatuses: Map<Chain, ChainStatus> }> {
  try {
    const chainStatuses = await walletManager.checkAllChainStatuses();
    const allConnected = Array.from(chainStatuses.values()).every(s => s.isConnected);

    return {
      healthy: allConnected && chainStatuses.size > 0,
      chainStatuses,
    };
  } catch (error) {
    logger.error(`[MarketMonitor] Health check failed: ${error}`);
    return {
      healthy: false,
      chainStatuses: new Map(),
    };
  }
}
