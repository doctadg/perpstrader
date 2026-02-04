/**
 * SOLPRISM Configuration
 *
 * Manages connection settings for the SOLPRISM onchain reasoning protocol.
 * SOLPRISM commits a hash of every trade's reasoning BEFORE execution,
 * then reveals the full logic afterward — giving investors a verifiable
 * audit trail with zero hindsight bias.
 *
 * @see https://www.solprism.app/
 */

import logger from '../shared/logger';

// ─── Environment ──────────────────────────────────────────────────────────

export interface SolprismConfig {
  /** Whether SOLPRISM integration is enabled */
  enabled: boolean;
  /** Solana RPC URL (defaults to devnet) */
  rpcUrl: string;
  /** SOLPRISM program ID onchain */
  programId: string;
  /** Path to the agent's Solana keypair file */
  keypairPath: string;
  /** Agent display name registered on SOLPRISM */
  agentName: string;
  /** Whether to auto-reveal reasoning after trade execution */
  autoReveal: boolean;
  /** Base URI for storing reasoning traces (e.g. IPFS gateway or API) */
  storageUri: string;
  /** Network: devnet or mainnet-beta */
  network: 'devnet' | 'mainnet-beta';
}

/** Default SOLPRISM program ID (deployed on Solana) */
const DEFAULT_PROGRAM_ID = 'CZcvoryaQNrtZ3qb3gC1h9opcYpzEP1D9Mu1RVwFQeBu';

/**
 * Load SOLPRISM configuration from environment variables.
 *
 * Required env vars (when enabled):
 *   SOLPRISM_ENABLED=true
 *   SOLPRISM_KEYPAIR_PATH=/path/to/keypair.json
 *
 * Optional env vars:
 *   SOLPRISM_RPC_URL=https://api.devnet.solana.com
 *   SOLPRISM_PROGRAM_ID=CZcvory...
 *   SOLPRISM_AGENT_NAME=PerpTrader
 *   SOLPRISM_AUTO_REVEAL=true
 *   SOLPRISM_STORAGE_URI=https://your-storage.example.com
 *   SOLPRISM_NETWORK=devnet
 */
export function loadSolprismConfig(): SolprismConfig {
  const enabled = process.env.SOLPRISM_ENABLED === 'true';
  const network = (process.env.SOLPRISM_NETWORK || 'devnet') as 'devnet' | 'mainnet-beta';

  const defaultRpc = network === 'mainnet-beta'
    ? 'https://api.mainnet-beta.solana.com'
    : 'https://api.devnet.solana.com';

  const config: SolprismConfig = {
    enabled,
    rpcUrl: process.env.SOLPRISM_RPC_URL || defaultRpc,
    programId: process.env.SOLPRISM_PROGRAM_ID || DEFAULT_PROGRAM_ID,
    keypairPath: process.env.SOLPRISM_KEYPAIR_PATH || '',
    agentName: process.env.SOLPRISM_AGENT_NAME || 'PerpTrader',
    autoReveal: process.env.SOLPRISM_AUTO_REVEAL !== 'false', // default true
    storageUri: process.env.SOLPRISM_STORAGE_URI || '',
    network,
  };

  if (enabled) {
    if (!config.keypairPath) {
      logger.warn('[SOLPRISM] Enabled but SOLPRISM_KEYPAIR_PATH not set — disabling');
      config.enabled = false;
    } else {
      logger.info(`[SOLPRISM] Onchain reasoning verification enabled`);
      logger.info(`[SOLPRISM] Network: ${config.network} | Program: ${config.programId}`);
      logger.info(`[SOLPRISM] Agent: ${config.agentName} | Auto-reveal: ${config.autoReveal}`);
    }
  } else {
    logger.info('[SOLPRISM] Onchain reasoning verification disabled (set SOLPRISM_ENABLED=true to enable)');
  }

  return config;
}

// ─── Singleton ────────────────────────────────────────────────────────────

let _config: SolprismConfig | null = null;

export function getSolprismConfig(): SolprismConfig {
  if (!_config) {
    _config = loadSolprismConfig();
  }
  return _config;
}

export default getSolprismConfig;
