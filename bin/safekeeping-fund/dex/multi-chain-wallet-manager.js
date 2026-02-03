"use strict";
// Safekeeping Fund System - Multi-Chain Wallet Manager
// Unified wallet management across Ethereum, BSC, and Solana
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MultiChainWalletManager = void 0;
const logger_1 = __importDefault(require("../../shared/logger"));
const uniswap_v3_client_1 = require("./uniswap-v3-client");
const pancakeswap_v3_client_1 = require("./pancakeswap-v3-client");
const meteora_client_1 = require("./meteora-client");
/**
 * Multi-Chain Wallet Manager
 * Manages wallets and DEX clients across all supported chains
 */
class MultiChainWalletManager {
    clients = new Map();
    config;
    isInitialized = false;
    // Address cache
    addresses = new Map();
    constructor(config) {
        this.config = config;
    }
    // =========================================================================
    // INITIALIZATION
    // =========================================================================
    /**
     * Initialize all chain clients
     */
    async initialize() {
        try {
            // Initialize Ethereum/Uniswap client
            if (this.config.ethereum?.privateKey) {
                const ethClient = new uniswap_v3_client_1.UniswapV3Client({
                    privateKey: this.config.ethereum.privateKey,
                    rpcUrl: this.config.ethereum.rpcUrl,
                });
                await ethClient.initialize();
                this.clients.set('ethereum', ethClient);
                logger_1.default.info('[WalletManager] Ethereum client initialized');
            }
            // Initialize BSC/PancakeSwap client
            if (this.config.bsc?.privateKey) {
                const bscClient = new pancakeswap_v3_client_1.PancakeswapV3Client({
                    privateKey: this.config.bsc.privateKey,
                    rpcUrl: this.config.bsc.rpcUrl,
                });
                await bscClient.initialize();
                this.clients.set('bsc', bscClient);
                logger_1.default.info('[WalletManager] BSC client initialized');
            }
            // Initialize Solana/Meteora client
            if (this.config.solana?.secretKey) {
                const secretKey = typeof this.config.solana.secretKey === 'string'
                    ? new Uint8Array(Buffer.from(this.config.solana.secretKey, 'base64'))
                    : this.config.solana.secretKey;
                const solClient = new meteora_client_1.MeteoraClient({
                    secretKey,
                    rpcUrl: this.config.solana.rpcUrl,
                    commitment: this.config.solana.commitment,
                });
                await solClient.initialize();
                this.clients.set('solana', solClient);
                logger_1.default.info('[WalletManager] Solana client initialized');
            }
            this.isInitialized = true;
            // Cache addresses
            await this.cacheAddresses();
            logger_1.default.info(`[WalletManager] Initialized ${this.clients.size} chain(s)`);
        }
        catch (error) {
            logger_1.default.error(`[WalletManager] Initialization failed: ${error}`);
            throw error;
        }
    }
    /**
     * Cache wallet addresses for all chains
     */
    async cacheAddresses() {
        for (const [chain, client] of this.clients) {
            try {
                const address = await this.getAddress(chain);
                this.addresses.set(chain, address);
            }
            catch (error) {
                logger_1.default.warn(`[WalletManager] Failed to get address for ${chain}: ${error}`);
            }
        }
    }
    // =========================================================================
    // CLIENT ACCESS
    // =========================================================================
    /**
     * Get DEX client for a chain
     */
    getClient(chain) {
        return this.clients.get(chain);
    }
    /**
     * Get all initialized clients
     */
    getAllClients() {
        return Array.from(this.clients.values());
    }
    /**
     * Check if a chain is supported
     */
    isChainSupported(chain) {
        return this.clients.has(chain);
    }
    /**
     * Get all supported chains
     */
    getSupportedChains() {
        return Array.from(this.clients.keys());
    }
    // =========================================================================
    // ADDRESS INFORMATION
    // =========================================================================
    /**
     * Get wallet address for a chain
     */
    getAddress(chain) {
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
        const chainConfig = this.config[chain];
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
    getAllAddresses() {
        return new Map(this.addresses);
    }
    // =========================================================================
    // BALANCE MANAGEMENT
    // =========================================================================
    /**
     * Get balances across all chains
     */
    async getAllBalances() {
        const balances = {
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
                const tokens = new Map();
                // Fetch specific token balances based on chain
                balances[chain] = {
                    native: 0, // Would fetch actual native balance
                    tokens,
                };
            }
            catch (error) {
                logger_1.default.warn(`[WalletManager] Failed to fetch balances for ${chain}: ${error}`);
            }
        }
        return balances;
    }
    /**
     * Get total portfolio value across all chains
     */
    async getTotalPortfolioValue() {
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
    async fetchAllPoolOpportunities(pairs) {
        const allOpportunities = [];
        const fetchPromises = Array.from(this.clients.values()).map(async (client) => {
            try {
                return await client.fetchPoolStates(pairs);
            }
            catch (error) {
                logger_1.default.warn(`[WalletManager] Failed to fetch pools for ${client.getChain()}: ${error}`);
                return [];
            }
        });
        const results = await Promise.all(fetchPromises);
        for (const opportunities of results) {
            allOpportunities.push(...opportunities);
        }
        // Sort by effective APR descending
        allOpportunities.sort((a, b) => b.effectiveAPR - a.effectiveAPR);
        logger_1.default.debug(`[WalletManager] Found ${allOpportunities.length} total pool opportunities`);
        return allOpportunities;
    }
    /**
     * Get all positions across all chains
     */
    async getAllPositions() {
        const allPositions = [];
        for (const client of this.clients.values()) {
            try {
                const positions = await client.getPositions();
                allPositions.push(...positions);
            }
            catch (error) {
                logger_1.default.warn(`[WalletManager] Failed to get positions for ${client.getChain()}: ${error}`);
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
    async addLiquidity(chain, params) {
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
    async removeLiquidity(chain, params) {
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
    async checkAllChainStatuses() {
        const statuses = new Map();
        const checkPromises = Array.from(this.clients.entries()).map(async ([chain, client]) => {
            try {
                const status = await client.checkConnection();
                return [chain, status];
            }
            catch (error) {
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
        });
        const results = await Promise.all(checkPromises);
        for (const [chain, status] of results) {
            statuses.set(chain, status);
        }
        return statuses;
    }
    /**
     * Get aggregate health status
     */
    getHealthStatus() {
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
    async getAllGasPrices() {
        const gasPrices = new Map();
        for (const [chain, client] of this.clients) {
            try {
                const gasData = await client.getGasPrice();
                gasPrices.set(chain, gasData);
            }
            catch (error) {
                logger_1.default.warn(`[WalletManager] Failed to get gas price for ${chain}: ${error}`);
            }
        }
        return gasPrices;
    }
    /**
     * Find cheapest chain for operations
     */
    async getCheapestChain() {
        const gasPrices = await this.getAllGasPrices();
        if (gasPrices.size === 0) {
            return null;
        }
        let cheapestChain = null;
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
    async disconnect() {
        const disconnectPromises = Array.from(this.clients.values()).map(client => client.disconnect().catch(error => {
            logger_1.default.warn(`[WalletManager] Error disconnecting client: ${error}`);
        }));
        await Promise.all(disconnectPromises);
        this.clients.clear();
        this.addresses.clear();
        this.isInitialized = false;
        logger_1.default.info('[WalletManager] Disconnected all chains');
    }
    /**
     * Check if initialized
     */
    isReady() {
        return this.isInitialized && this.clients.size > 0;
    }
}
exports.MultiChainWalletManager = MultiChainWalletManager;
//# sourceMappingURL=multi-chain-wallet-manager.js.map