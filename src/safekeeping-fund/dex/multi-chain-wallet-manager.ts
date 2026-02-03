// Safekeeping Fund System - Multi-Chain Wallet Manager
// Unified wallet management across Ethereum, BSC, and Solana

import logger from '../../shared/logger';
import { UniswapV3Client } from './uniswap-v3-client';
import { PancakeswapV3Client } from './pancakeswap-v3-client';
import { MeteoraClient } from './meteora-client';
import { BaseDEXClient } from './base-dex-client';
import type {
  Chain,
  DEX,
  MultiChainWalletConfig,
  Token,
  ChainStatus,
  LiquidityPosition,
  PoolOpportunity,
  AddLiquidityParams,
  RemoveLiquidityParams,
  DEXOperationResult,
  ChainWalletConfig,
} from '../types';
import { DEFAULT_RPC_URLS } from '../constants';

/**
 * Multi-chain balance information
 */
export interface MultiChainBalances {
  ethereum: {
    native: number;
    tokens: Map<string, number>;
  };
  bsc: {
    native: number;
    tokens: Map<string, number>;
  };
  solana: {
    native: number;
    tokens: Map<string, number>;
  };
}

/**
 * Transaction that spans multiple chains
 */
export interface CrossChainTransaction {
  chain: Chain;
  operation: string;
  params: unknown;
}

/**
 * Multi-Chain Wallet Manager
 * Manages wallets and DEX clients across all supported chains
 */
export class MultiChainWalletManager {
  private clients: Map<Chain, BaseDEXClient> = new Map();
  private config: MultiChainWalletConfig;
  private isInitialized: boolean = false;

  // Address cache
  private addresses: Map<Chain, string> = new Map();

  constructor(config: MultiChainWalletConfig) {
    this.config = config;
  }

  // =========================================================================
  // INITIALIZATION
  // =========================================================================

  /**
   * Initialize all chain clients
   */
  async initialize(): Promise<void> {
    try {
      // Initialize Ethereum/Uniswap client
      if (this.config.ethereum?.privateKey) {
        const ethClient = new UniswapV3Client({
          privateKey: this.config.ethereum.privateKey as `0x${string}`,
          rpcUrl: this.config.ethereum.rpcUrl,
        });
        await ethClient.initialize();
        this.clients.set('ethereum', ethClient);
        logger.info('[WalletManager] Ethereum client initialized');
      }

      // Initialize BSC/PancakeSwap client
      if (this.config.bsc?.privateKey) {
        const bscClient = new PancakeswapV3Client({
          privateKey: this.config.bsc.privateKey as `0x${string}`,
          rpcUrl: this.config.bsc.rpcUrl,
        });
        await bscClient.initialize();
        this.clients.set('bsc', bscClient);
        logger.info('[WalletManager] BSC client initialized');
      }

      // Initialize Solana/Meteora client
      if (this.config.solana?.secretKey) {
        const secretKey = typeof this.config.solana.secretKey === 'string'
          ? new Uint8Array(Buffer.from(this.config.solana.secretKey, 'base64'))
          : this.config.solana.secretKey;
        const solClient = new MeteoraClient({
          secretKey,
          rpcUrl: this.config.solana.rpcUrl,
          commitment: this.config.solana.commitment,
        });
        await solClient.initialize();
        this.clients.set('solana', solClient);
        logger.info('[WalletManager] Solana client initialized');
      }

      this.isInitialized = true;

      // Cache addresses
      await this.cacheAddresses();

      logger.info(`[WalletManager] Initialized ${this.clients.size} chain(s)`);
    } catch (error) {
      logger.error(`[WalletManager] Initialization failed: ${error}`);
      throw error;
    }
  }

  /**
   * Cache wallet addresses for all chains
   */
  private async cacheAddresses(): Promise<void> {
    for (const [chain, client] of this.clients) {
      try {
        const address = await this.getAddress(chain);
        this.addresses.set(chain, address);
      } catch (error) {
        logger.warn(`[WalletManager] Failed to get address for ${chain}: ${error}`);
      }
    }
  }

  // =========================================================================
  // CLIENT ACCESS
  // =========================================================================

  /**
   * Get DEX client for a chain
   */
  getClient(chain: Chain): BaseDEXClient | undefined {
    return this.clients.get(chain);
  }

  /**
   * Get all initialized clients
   */
  getAllClients(): BaseDEXClient[] {
    return Array.from(this.clients.values());
  }

  /**
   * Check if a chain is supported
   */
  isChainSupported(chain: Chain): boolean {
    return this.clients.has(chain);
  }

  /**
   * Get all supported chains
   */
  getSupportedChains(): Chain[] {
    return Array.from(this.clients.keys());
  }

  // =========================================================================
  // ADDRESS INFORMATION
  // =========================================================================

  /**
   * Get wallet address for a chain
   */
  getAddress(chain: Chain): string {
    const client = this.clients.get(chain);
    if (!client) {
      throw new Error(`Chain ${chain} not initialized`);
    }

    // Return address based on chain type
    if (chain === 'solana') {
      // Solana keypair address would be stored in the Meteora client
      return 'solana-address-placeholder';
    }

    // EVM chains - derive from private key
    const chainConfig = this.config[chain as keyof typeof this.config] as ChainWalletConfig | undefined;
    if (chainConfig?.privateKey) {
      // For EVM chains, address is derived from private key
      // This is a simplified approach - in production, derive properly
      return `0x${chainConfig.privateKey.slice(2, 42)}`;
    }

    return '0x0000000000000000000000000000000000000000';
  }

  /**
   * Get all wallet addresses
   */
  getAllAddresses(): Map<Chain, string> {
    return new Map(this.addresses);
  }

  // =========================================================================
  // BALANCE MANAGEMENT
  // =========================================================================

  /**
   * Get balances across all chains
   */
  async getAllBalances(): Promise<MultiChainBalances> {
    const balances: MultiChainBalances = {
      ethereum: { native: 0, tokens: new Map() },
      bsc: { native: 0, tokens: new Map() },
      solana: { native: 0, tokens: new Map() },
    };

    for (const [chain, client] of this.clients) {
      try {
        // Get native token balance
        const gasData = await client.getGasPrice();
        // Note: This is simplified - actual implementation would query chain-specific balances

        // Get token balances for base assets
        const tokens = new Map<string, number>();
        // Fetch specific token balances based on chain

        balances[chain] = {
          native: 0, // Would fetch actual native balance
          tokens,
        };
      } catch (error) {
        logger.warn(`[WalletManager] Failed to fetch balances for ${chain}: ${error}`);
      }
    }

    return balances;
  }

  /**
   * Get total portfolio value across all chains
   */
  async getTotalPortfolioValue(): Promise<number> {
    let totalValue = 0;

    const positions = await this.getAllPositions();
    for (const position of positions) {
      totalValue += position.totalValue;
    }

    return totalValue;
  }

  // =========================================================================
  // POOL OPERATIONS
  // =========================================================================

  /**
   * Fetch pool opportunities from all chains in parallel
   */
  async fetchAllPoolOpportunities(
    pairs?: Array<{ token0: string; token1: string }>
  ): Promise<PoolOpportunity[]> {
    const allOpportunities: PoolOpportunity[] = [];

    const fetchPromises = Array.from(this.clients.values()).map(async (client) => {
      try {
        return await client.fetchPoolStates(pairs);
      } catch (error) {
        logger.warn(`[WalletManager] Failed to fetch pools for ${client.getChain()}: ${error}`);
        return [];
      }
    });

    const results = await Promise.all(fetchPromises);
    for (const opportunities of results) {
      allOpportunities.push(...opportunities);
    }

    // Sort by effective APR descending
    allOpportunities.sort((a, b) => b.effectiveAPR - a.effectiveAPR);

    logger.debug(`[WalletManager] Found ${allOpportunities.length} total pool opportunities`);

    return allOpportunities;
  }

  /**
   * Get all positions across all chains
   */
  async getAllPositions(): Promise<LiquidityPosition[]> {
    const allPositions: LiquidityPosition[] = [];

    for (const client of this.clients.values()) {
      try {
        const positions = await client.getPositions();
        allPositions.push(...positions);
      } catch (error) {
        logger.warn(`[WalletManager] Failed to get positions for ${client.getChain()}: ${error}`);
      }
    }

    return allPositions;
  }

  // =========================================================================
  // LIQUIDITY OPERATIONS
  // =========================================================================

  /**
   * Add liquidity to a pool
   */
  async addLiquidity(
    chain: Chain,
    params: AddLiquidityParams
  ): Promise<DEXOperationResult> {
    const client = this.clients.get(chain);
    if (!client) {
      return {
        success: false,
        error: `Chain ${chain} not initialized`,
        duration: 0,
      };
    }

    return await client.addLiquidity(params);
  }

  /**
   * Remove liquidity from a position
   */
  async removeLiquidity(
    chain: Chain,
    params: RemoveLiquidityParams
  ): Promise<DEXOperationResult> {
    const client = this.clients.get(chain);
    if (!client) {
      return {
        success: false,
        error: `Chain ${chain} not initialized`,
        duration: 0,
      };
    }

    return await client.removeLiquidity(params);
  }

  // =========================================================================
  // HEALTH CHECKS
  // =========================================================================

  /**
   * Check health status of all chains
   */
  async checkAllChainStatuses(): Promise<Map<Chain, ChainStatus>> {
    const statuses = new Map<Chain, ChainStatus>();

    const checkPromises = Array.from(this.clients.entries()).map(
      async ([chain, client]) => {
        try {
          const status = await client.checkConnection();
          return [chain, status];
        } catch (error) {
          return [
            chain,
            {
              chain,
              isConnected: false,
              latency: 0,
              lastUpdated: new Date(),
            },
          ];
        }
      }
    );

    const results = await Promise.all(checkPromises);
    for (const [chain, status] of results) {
      statuses.set(chain as Chain, status as ChainStatus);
    }

    return statuses;
  }

  /**
   * Get aggregate health status
   */
  getHealthStatus(): {
    isHealthy: boolean;
    chainsConnected: number;
    chainsTotal: number;
  } {
    const chainsTotal = this.clients.size;
    const chainsConnected = Array.from(this.clients.values()).filter(c => c.getConnectionStatus()).length;

    return {
      isHealthy: chainsConnected === chainsTotal && chainsTotal > 0,
      chainsConnected,
      chainsTotal,
    };
  }

  // =========================================================================
  // GAS AND COST ESTIMATION
  // =========================================================================

  /**
   * Get gas prices for all chains
   */
  async getAllGasPrices(): Promise<Map<Chain, { gasPrice: number; gasPriceUsd: number }>> {
    const gasPrices = new Map();

    for (const [chain, client] of this.clients) {
      try {
        const gasData = await client.getGasPrice();
        gasPrices.set(chain, gasData);
      } catch (error) {
        logger.warn(`[WalletManager] Failed to get gas price for ${chain}: ${error}`);
      }
    }

    return gasPrices;
  }

  /**
   * Find cheapest chain for operations
   */
  async getCheapestChain(): Promise<Chain | null> {
    const gasPrices = await this.getAllGasPrices();

    if (gasPrices.size === 0) {
      return null;
    }

    let cheapestChain: Chain | null = null;
    let lowestGasPrice = Infinity;

    for (const [chain, gasData] of gasPrices) {
      if (gasData.gasPriceUsd < lowestGasPrice) {
        lowestGasPrice = gasData.gasPriceUsd;
        cheapestChain = chain;
      }
    }

    return cheapestChain;
  }

  // =========================================================================
  // DISCONNECT
  // =========================================================================

  /**
   * Disconnect all clients
   */
  async disconnect(): Promise<void> {
    const disconnectPromises = Array.from(this.clients.values()).map(client =>
      client.disconnect().catch(error => {
        logger.warn(`[WalletManager] Error disconnecting client: ${error}`);
      })
    );

    await Promise.all(disconnectPromises);
    this.clients.clear();
    this.addresses.clear();
    this.isInitialized = false;

    logger.info('[WalletManager] Disconnected all chains');
  }

  /**
   * Check if initialized
   */
  isReady(): boolean {
    return this.isInitialized && this.clients.size > 0;
  }
}
