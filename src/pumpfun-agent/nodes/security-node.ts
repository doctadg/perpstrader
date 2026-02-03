// Security Node - Analyze contract security for tokens
// Checks mint authority, freeze authority, and other security parameters

import logger from '../../shared/logger';
import { PumpFunAgentState, ContractSecurity } from '../../shared/types';
import { addThought, updateStep } from '../state';

/**
 * Analyze contract security for all queued tokens
 */
export async function securityNode(state: PumpFunAgentState): Promise<Partial<PumpFunAgentState>> {
  if (state.queuedTokens.length === 0) {
    logger.warn('[SecurityNode] No tokens to analyze');
    return {
      ...addThought(state, 'No tokens to analyze'),
      ...updateStep(state, 'NO_TOKENS'),
    };
  }

  logger.info(`[SecurityNode] Analyzing security for ${state.queuedTokens.length} tokens`);

  // Import Solana RPC service
  let solanaRPC: any;
  try {
    solanaRPC = (await import('../services/solana-rpc')).default;
  } catch (error) {
    logger.error('[SecurityNode] Failed to import Solana RPC service');
    return {
      ...addThought(state, 'Failed to import Solana RPC service'),
      ...updateStep(state, 'ERROR'),
    };
  }

  const securityAnalyses = new Map<string, ContractSecurity>();

  // Analyze security with concurrency limit
  const concurrency = 10;
  for (let i = 0; i < state.queuedTokens.length; i += concurrency) {
    const batch = state.queuedTokens.slice(i, i + concurrency);

    await Promise.allSettled(
      batch.map(async (item: any) => {
        const token = item.token || item;

        try {
          const security = await solanaRPC.getMintInfo(token.mintAddress);
          securityAnalyses.set(token.mintAddress, security);
        } catch (error) {
          logger.debug(`[SecurityNode] Failed to analyze ${token.symbol}: ${error}`);
          // Return high-risk default on error
          securityAnalyses.set(token.mintAddress, {
            mintAuthority: null,
            freezeAuthority: null,
            decimals: 0,
            supply: 0n,
            isMintable: false,
            isFreezable: false,
            metadataHash: '',
            riskLevel: 'HIGH',
          });
        }
      })
    );
  }

  // Calculate security statistics
  let highRisk = 0;
  let mediumRisk = 0;
  let lowRisk = 0;

  for (const security of securityAnalyses.values()) {
    if (security.riskLevel === 'HIGH') highRisk++;
    else if (security.riskLevel === 'MEDIUM') mediumRisk++;
    else lowRisk++;
  }

  logger.info(`[SecurityNode] Analyzed ${securityAnalyses.size} tokens (H:${highRisk} M:${mediumRisk} L:${lowRisk})`);

  return {
    ...addThought(state, `Security analysis: ${lowRisk} low, ${mediumRisk} medium, ${highRisk} high risk`),
    ...updateStep(state, 'SECURITY_ANALYZED'),
    thoughts: [
      ...state.thoughts,
      `Security: ${lowRisk} low risk, ${mediumRisk} medium, ${highRisk} high risk`,
    ],
  };
}

export { addThought, updateStep } from '../state';
