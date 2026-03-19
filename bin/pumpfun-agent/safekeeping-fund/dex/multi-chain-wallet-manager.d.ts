import { BaseDEXClient } from './base-dex-client';
import type { Chain, MultiChainWalletConfig, ChainStatus, LiquidityPosition, PoolOpportunity, AddLiquidityParams, RemoveLiquidityParams, DEXOperationResult } from '../types';
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
export declare class MultiChainWalletManager {
    private clients;
    private config;
    private isInitialized;
    private addresses;
    constructor(config: MultiChainWalletConfig);
    /**
     * Initialize all chain clients
     */
    initialize(): Promise<void>;
    /**
     * Cache wallet addresses for all chains
     */
    private cacheAddresses;
    /**
     * Get DEX client for a chain
     */
    getClient(chain: Chain): BaseDEXClient | undefined;
    /**
     * Get all initialized clients
     */
    getAllClients(): BaseDEXClient[];
    /**
     * Check if a chain is supported
     */
    isChainSupported(chain: Chain): boolean;
    /**
     * Get all supported chains
     */
    getSupportedChains(): Chain[];
    /**
     * Get wallet address for a chain
     */
    getAddress(chain: Chain): string;
    /**
     * Get all wallet addresses
     */
    getAllAddresses(): Map<Chain, string>;
    /**
     * Get balances across all chains
     */
    getAllBalances(): Promise<MultiChainBalances>;
    /**
     * Get total portfolio value across all chains
     */
    getTotalPortfolioValue(): Promise<number>;
    /**
     * Fetch pool opportunities from all chains in parallel
     */
    fetchAllPoolOpportunities(pairs?: Array<{
        token0: string;
        token1: string;
    }>): Promise<PoolOpportunity[]>;
    /**
     * Get all positions across all chains
     */
    getAllPositions(): Promise<LiquidityPosition[]>;
    /**
     * Add liquidity to a pool
     */
    addLiquidity(chain: Chain, params: AddLiquidityParams): Promise<DEXOperationResult>;
    /**
     * Remove liquidity from a position
     */
    removeLiquidity(chain: Chain, params: RemoveLiquidityParams): Promise<DEXOperationResult>;
    /**
     * Check health status of all chains
     */
    checkAllChainStatuses(): Promise<Map<Chain, ChainStatus>>;
    /**
     * Get aggregate health status
     */
    getHealthStatus(): {
        isHealthy: boolean;
        chainsConnected: number;
        chainsTotal: number;
    };
    /**
     * Get gas prices for all chains
     */
    getAllGasPrices(): Promise<Map<Chain, {
        gasPrice: number;
        gasPriceUsd: number;
    }>>;
    /**
     * Find cheapest chain for operations
     */
    getCheapestChain(): Promise<Chain | null>;
    /**
     * Disconnect all clients
     */
    disconnect(): Promise<void>;
    /**
     * Check if initialized
     */
    isReady(): boolean;
    private normalizeSolanaSecretKey;
    private deriveChainAddress;
}
//# sourceMappingURL=multi-chain-wallet-manager.d.ts.map