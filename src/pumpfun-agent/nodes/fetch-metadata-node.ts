// Fetch Metadata Node - Fetch token metadata for discovered tokens
// Gets detailed metadata from pump.fun API or Metaplex

import logger from '../../shared/logger';
import { PumpFunAgentState } from '../../shared/types';
import { addThought, updateStep } from '../state';

/**
 * Fetch metadata for all discovered tokens
 */
export async function fetchMetadataNode(state: PumpFunAgentState): Promise<Partial<PumpFunAgentState>> {
  if (state.discoveredTokens.length === 0) {
    logger.warn('[FetchMetadataNode] No tokens to fetch metadata for');
    return {
      ...addThought(state, 'No tokens to fetch metadata for'),
      ...updateStep(state, 'NO_TOKENS'),
    };
  }

  logger.info(`[FetchMetadataNode] Fetching metadata for ${state.discoveredTokens.length} tokens`);

  // Import services
  let solanaRPC: any;
  try {
    solanaRPC = (await import('../services/solana-rpc')).default;
  } catch (error) {
    logger.error('[FetchMetadataNode] Failed to import Solana RPC service');
    return {
      ...addThought(state, 'Failed to import Solana RPC service'),
      ...updateStep(state, 'ERROR'),
    };
  }

  const tokensWithMetadata: Array<{
    token: any;
    metadata: any;
  }> = [];

  // Fetch metadata for each token (with concurrency limit)
  const concurrency = 5;
  for (let i = 0; i < state.discoveredTokens.length; i += concurrency) {
    const batch = state.discoveredTokens.slice(i, i + concurrency);

    const results = await Promise.allSettled(
      batch.map(async (token) => {
        try {
          const metadata = await solanaRPC.getTokenMetadata(token.mintAddress);
          const tokenExtras = token as any;
          return {
            token,
            metadata: metadata || {
              name: token.name,
              symbol: token.symbol,
              description: tokenExtras.description || '',
              image: tokenExtras.image || '',
              website: tokenExtras.website || undefined,
              twitter: tokenExtras.twitter || undefined,
              telegram: tokenExtras.telegram || undefined,
              discord: tokenExtras.discord || undefined,
            },
          };
        } catch (error) {
          logger.debug(`[FetchMetadataNode] Failed to fetch metadata for ${token.symbol}: ${error}`);
          const tokenExtras = token as any;
          return {
            token,
            metadata: {
              name: token.name,
              symbol: token.symbol,
              description: tokenExtras.description || '',
              image: tokenExtras.image || '',
              website: tokenExtras.website || undefined,
              twitter: tokenExtras.twitter || undefined,
              telegram: tokenExtras.telegram || undefined,
              discord: tokenExtras.discord || undefined,
            },
          };
        }
      })
    );

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.metadata) {
        tokensWithMetadata.push(result.value);
      }
    }
  }

  logger.info(`[FetchMetadataNode] Fetched metadata for ${tokensWithMetadata.length} tokens`);

  return {
    ...addThought(state, `Fetched metadata for ${tokensWithMetadata.length}/${state.discoveredTokens.length} tokens`),
    ...updateStep(state, 'METADATA_FETCHED'),
    queuedTokens: tokensWithMetadata.map((t: any) => ({ ...t.token, metadata: t.metadata })),
  };
}

// Re-export addThought and updateStep for other nodes
export { addThought, updateStep } from '../state';
