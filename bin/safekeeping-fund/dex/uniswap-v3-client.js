"use strict";
// Safekeeping Fund System - Uniswap V3 Client
// Ethereum Mainnet Uniswap V3 integration
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UniswapV3Client = void 0;
const viem_1 = require("viem");
const chains_1 = require("viem/chains");
const accounts_1 = require("viem/accounts");
const logger_1 = __importDefault(require("../../shared/logger"));
const base_dex_client_1 = require("./base-dex-client");
const constants_1 = require("../constants");
/**
 * Uniswap V3 Pool ABI (minimal functions needed)
 */
const POOL_ABI = [
    {
        inputs: [],
        name: 'slot0',
        outputs: [
            { internalType: 'uint160', name: 'sqrtPriceX96', type: 'uint160' },
            { internalType: 'int24', name: 'tick', type: 'int24' },
            { internalType: 'uint16', name: 'observationIndex', type: 'uint16' },
            { internalType: 'uint16', name: 'observationCardinality', type: 'uint16' },
            { internalType: 'uint16', name: 'observationCardinalityNext', type: 'uint16' },
            { internalType: 'uint8', name: 'feeProtocol', type: 'uint8' },
            { internalType: 'bool', name: 'unlocked', type: 'bool' },
        ],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [],
        name: 'liquidity',
        outputs: [{ internalType: 'uint128', name: '', type: 'uint128' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [],
        name: 'feeGrowthGlobal0X128',
        outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [],
        name: 'feeGrowthGlobal1X128',
        outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
];
/**
 * ERC20 ABI for token operations
 */
const ERC20_ABI = [
    {
        inputs: [{ internalType: 'address', name: 'account', type: 'address' }],
        name: 'balanceOf',
        outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [],
        name: 'decimals',
        outputs: [{ internalType: 'uint8', name: '', type: 'uint8' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [],
        name: 'symbol',
        outputs: [{ internalType: 'string', name: '', type: 'string' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [
            { internalType: 'address', name: 'spender', type: 'address' },
            { internalType: 'uint256', name: 'amount', type: 'uint256' },
        ],
        name: 'approve',
        outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [
            { internalType: 'address', name: 'owner', type: 'address' },
            { internalType: 'address', name: 'spender', type: 'address' },
        ],
        name: 'allowance',
        outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
];
/**
 * Uniswap V3 DEX Client
 * Handles interaction with Uniswap V3 on Ethereum mainnet
 */
class UniswapV3Client extends base_dex_client_1.BaseDEXClient {
    publicClient;
    walletClient;
    account;
    positions = new Map();
    // Cache for pool data
    poolCache = new Map();
    CACHE_TTL = 30000; // 30 seconds
    constructor(config) {
        super('ethereum', 'uniswap_v3', config.rpcUrl || 'https://eth.llamarpc.com');
        // Create account from private key
        this.account = (0, accounts_1.privateKeyToAccount)(config.privateKey);
        // Create public client for read operations
        this.publicClient = (0, viem_1.createPublicClient)({
            chain: chains_1.mainnet,
            transport: (0, viem_1.http)(this.rpcUrl),
            pollingInterval: 10000,
        });
        // Create wallet client for transactions
        this.walletClient = (0, viem_1.createWalletClient)({
            account: this.account,
            chain: chains_1.mainnet,
            transport: (0, viem_1.http)(this.rpcUrl),
        });
    }
    // =========================================================================
    // INITIALIZATION
    // =========================================================================
    /**
     * Initialize the client connection
     */
    async initialize() {
        try {
            // Test connection with a simple block number call
            const blockNumber = await this.publicClient.getBlockNumber();
            logger_1.default.info(`[UniswapV3] Initialized successfully. Account: ${this.account.address}, Block: ${blockNumber}`);
            this.isConnected = true;
        }
        catch (error) {
            logger_1.default.error(`[UniswapV3] Initialization failed: ${error}`);
            throw error;
        }
    }
    /**
     * Health check for the connection
     */
    async healthCheck() {
        await this.publicClient.getBlockNumber({ cacheTime: 0 });
    }
    // =========================================================================
    // POOL STATE FETCHING
    // =========================================================================
    /**
     * Fetch pool states for monitored pairs
     */
    async fetchPoolStates(pairs) {
        const opportunities = [];
        // Default pairs to monitor
        const defaultPairs = [
            { token0: 'USDC', token1: 'USDT' },
            { token0: 'USDC', token1: 'ETH' },
            { token0: 'USDT', token1: 'ETH' },
            { token0: 'USDC', token1: 'WBTC' },
        ];
        const pairsToCheck = pairs || defaultPairs;
        // Fetch fee tiers to check for each pair
        const feeTiers = [100, 500, 2500, 3000, 10000];
        for (const pair of pairsToCheck) {
            for (const feeTier of feeTiers) {
                try {
                    const opportunity = await this.fetchPoolState(pair.token0, pair.token1, feeTier);
                    if (opportunity) {
                        opportunities.push(opportunity);
                    }
                }
                catch (error) {
                    logger_1.default.debug(`[UniswapV3] Failed to fetch ${pair.token0}/${pair.token1} ${feeTier}bp pool: ${error}`);
                }
            }
        }
        // Sort by effective APR descending
        opportunities.sort((a, b) => b.effectiveAPR - a.effectiveAPR);
        logger_1.default.debug(`[UniswapV3] Found ${opportunities.length} pool opportunities`);
        return opportunities;
    }
    /**
     * Fetch state for a specific pool
     */
    async fetchPoolState(token0Symbol, token1Symbol, feeTier) {
        // Get token addresses
        const token0Address = constants_1.TOKEN_ADDRESSES.ethereum[token0Symbol];
        const token1Address = constants_1.TOKEN_ADDRESSES.ethereum[token1Symbol];
        if (!token0Address || !token1Address) {
            logger_1.default.warn(`[UniswapV3] Unknown token: ${token0Symbol} or ${token1Symbol}`);
            return null;
        }
        // Compute pool address (simplified - in production use proper CREATE2 calculation)
        const poolAddress = await this.getPoolAddress(token0Address, token1Address, feeTier);
        if (!poolAddress) {
            return null; // Pool not found
        }
        // Check cache first
        const cacheKey = `${poolAddress}`;
        const cached = this.poolCache.get(cacheKey);
        if (cached && Date.now() - cached.lastUpdated.getTime() < this.CACHE_TTL) {
            return this.buildOpportunityFromPoolState(cached);
        }
        // Fetch pool state
        const [slot0, liquidity] = await Promise.all([
            this.publicClient.readContract({
                address: poolAddress,
                abi: POOL_ABI,
                functionName: 'slot0',
            }),
            this.publicClient.readContract({
                address: poolAddress,
                abi: POOL_ABI,
                functionName: 'liquidity',
            }),
        ]);
        const sqrtPriceX96 = slot0[0];
        const tick = slot0[1];
        // Get token info
        const [token0Decimals, token1Decimals] = await Promise.all([
            this.publicClient.readContract({
                address: token0Address,
                abi: ERC20_ABI,
                functionName: 'decimals',
            }),
            this.publicClient.readContract({
                address: token1Address,
                abi: ERC20_ABI,
                functionName: 'decimals',
            }),
        ]);
        // Calculate price
        const price = base_dex_client_1.DEXUtils.sqrtPriceX96ToPrice(sqrtPriceX96, token0Decimals, token1Decimals);
        // Fetch pool data from subgraph for TVL and volume
        const subgraphData = await this.fetchSubgraphData(poolAddress);
        // Calculate pool state
        const poolState = {
            address: poolAddress,
            token0: {
                symbol: token0Symbol,
                address: token0Address,
                decimals: token0Decimals,
                chain: 'ethereum',
            },
            token1: {
                symbol: token1Symbol,
                address: token1Address,
                decimals: token1Decimals,
                chain: 'ethereum',
            },
            feeTier,
            sqrtPriceX96: sqrtPriceX96.toString(),
            tick,
            liquidity: liquidity,
            tvl: subgraphData?.tvl || 0,
            volume24h: subgraphData?.volume24h || 0,
            feeAPR: subgraphData?.apr || 0,
            lastUpdated: new Date(),
        };
        // Cache the result
        this.poolCache.set(cacheKey, poolState);
        return this.buildOpportunityFromPoolState(poolState);
    }
    /**
     * Fetch additional data from Uniswap V3 subgraph
     */
    async fetchSubgraphData(poolAddress) {
        try {
            const query = `
        {
          pool(id: "${poolAddress.toLowerCase()}") {
            totalValueLockedUSD
            volumeUSD
            feeTier
            token0 { symbol decimals }
            token1 { symbol decimals }
          }
        }
      `;
            const response = await fetch('https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query }),
            });
            const data = await response.json();
            if (data.data?.pool) {
                const pool = data.data.pool;
                const tvl = parseFloat(pool.totalValueLockedUSD || '0');
                const volume24h = parseFloat(pool.volumeUSD || '0');
                // Calculate fee APR from daily volume
                const feeTier = parseInt(pool.feeTier || '3000') / 1000000; // Convert to percentage
                const dailyFees = volume24h * feeTier;
                const feeAPR = tvl > 0 ? (dailyFees * 365 / tvl) * 100 : 0;
                return { tvl, volume24h, apr: feeAPR };
            }
            return null;
        }
        catch (error) {
            logger_1.default.debug(`[UniswapV3] Subgraph fetch failed: ${error}`);
            return null;
        }
    }
    /**
     * Build PoolOpportunity from PoolState
     */
    async buildOpportunityFromPoolState(pool) {
        const gasCost = await this.estimateGasCost('add_liquidity', { pool });
        const aprBreakdown = await this.calculateEffectiveAPR(pool, gasCost);
        return {
            chain: this.chain,
            dex: this.dex,
            address: pool.address,
            token0: pool.token0,
            token1: pool.token1,
            feeTier: pool.feeTier,
            tvl: pool.tvl,
            volume24h: pool.volume24h,
            feeAPR: pool.feeAPR,
            effectiveAPR: aprBreakdown.effectiveAPR,
            compositeScore: this.calculateCompositeScore(pool, aprBreakdown),
            riskScore: this.calculateRiskScore(pool),
            liquidity: pool.liquidity > 0n ? Number(pool.liquidity) / 1e18 : 0,
            estimatedGasCost: gasCost,
            impermanentLossRisk: this.estimateILRiskFromPair(pool.token0, pool.token1),
            lastUpdated: pool.lastUpdated,
        };
    }
    /**
     * Calculate composite score for ranking
     */
    calculateCompositeScore(pool, aprBreakdown) {
        // Score weights
        const APR_WEIGHT = 0.5;
        const TVL_WEIGHT = 0.3;
        const VOLUME_WEIGHT = 0.2;
        // Normalize values (0-1 scale)
        const aprScore = Math.min(aprBreakdown.effectiveAPR / 50, 1); // Max 50% APR
        const tvlScore = Math.min(pool.tvl / 10000000, 1); // Max $10M TVL
        const volumeScore = Math.min(pool.volume24h / 1000000, 1); // Max $1M daily volume
        return (aprScore * APR_WEIGHT) + (tvlScore * TVL_WEIGHT) + (volumeScore * VOLUME_WEIGHT);
    }
    /**
     * Calculate risk score for a pool
     */
    calculateRiskScore(pool) {
        let risk = 0.5; // Base risk
        // TVL factor - lower TVL = higher risk
        if (pool.tvl < 100000)
            risk += 0.2;
        else if (pool.tvl < 1000000)
            risk += 0.1;
        // Volume factor - lower volume = higher risk
        if (pool.volume24h < 10000)
            risk += 0.1;
        // Fee tier factor - higher fee = usually higher risk
        if (pool.feeTier >= 10000)
            risk += 0.1;
        return Math.min(risk, 1);
    }
    /**
     * Estimate IL risk from token pair
     */
    estimateILRiskFromPair(token0, token1) {
        // Stablecoin pairs have lowest IL risk
        const stablecoins = ['USDC', 'USDT', 'DAI', 'FDUSD'];
        const isStable0 = stablecoins.includes(token0.symbol);
        const isStable1 = stablecoins.includes(token1.symbol);
        if (isStable0 && isStable1)
            return 0.01; // 1% IL risk
        if (isStable0 || isStable1)
            return 0.05; // 5% IL risk
        return 0.15; // 15% IL risk for volatile pairs
    }
    // =========================================================================
    // LIQUIDITY OPERATIONS
    // =========================================================================
    /**
     * Add liquidity to a pool
     */
    async addLiquidity(params) {
        const startTime = Date.now();
        try {
            logger_1.default.info(`[UniswapV3] Adding liquidity to ${params.poolAddress}`);
            // Check and approve tokens if needed
            const pool = this.poolCache.get(params.poolAddress);
            if (pool) {
                await this.ensureApproval(pool.token0.address, constants_1.UNISWAP_ADDRESSES.ethereum.router);
                await this.ensureApproval(pool.token1.address, constants_1.UNISWAP_ADDRESSES.ethereum.router);
            }
            // Build transaction for adding liquidity
            // Note: This is a simplified implementation
            // In production, use the NonfungiblePositionManager for minting positions
            // Execute transaction
            const hash = await this.walletClient.sendTransaction({
                chain: chains_1.mainnet,
                to: constants_1.UNISWAP_ADDRESSES.ethereum.nftManager,
                data: '0x', // Actual encoded calldata
            });
            logger_1.default.info(`[UniswapV3] Add liquidity tx sent: ${hash}`);
            // Wait for confirmation
            const receipt = await this.publicClient.waitForTransactionReceipt({
                hash,
            });
            if (receipt.status !== 'success') {
                throw new Error('Transaction failed');
            }
            const gasUsed = Number(receipt.gasUsed);
            const gasCost = await this.estimateGasCost('add_liquidity', params);
            return {
                success: true,
                txHash: hash,
                actualAmount: params.token0Amount + params.token1Amount,
                gasUsed,
                gasCost,
                duration: Date.now() - startTime,
            };
        }
        catch (error) {
            logger_1.default.error(`[UniswapV3] Add liquidity failed: ${error}`);
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                duration: Date.now() - startTime,
            };
        }
    }
    /**
     * Remove liquidity from a pool
     */
    async removeLiquidity(params) {
        const startTime = Date.now();
        try {
            logger_1.default.info(`[UniswapV3] Removing liquidity from position ${params.positionId}`);
            const hash = await this.walletClient.sendTransaction({
                chain: chains_1.mainnet,
                to: constants_1.UNISWAP_ADDRESSES.ethereum.nftManager,
                data: '0x', // Actual encoded calldata
            });
            const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
            if (receipt.status !== 'success') {
                throw new Error('Transaction failed');
            }
            return {
                success: true,
                txHash: hash,
                duration: Date.now() - startTime,
            };
        }
        catch (error) {
            logger_1.default.error(`[UniswapV3] Remove liquidity failed: ${error}`);
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                duration: Date.now() - startTime,
            };
        }
    }
    /**
     * Get current liquidity positions
     */
    async getPositions() {
        return Array.from(this.positions.values());
    }
    // =========================================================================
    // GAS AND COSTS
    // =========================================================================
    /**
     * Get current gas price in ETH and USD
     */
    async getGasPrice() {
        const gasPrice = await this.publicClient.getGasPrice();
        // Get ETH price (simplified - in production use price oracle)
        const ethPrice = 3000; // Placeholder
        return {
            gasPrice: Number(gasPrice) / 1e9, // Convert to gwei
            gasPriceUsd: (Number(gasPrice) / 1e18) * ethPrice,
        };
    }
    /**
     * Estimate gas cost for an operation
     */
    async estimateGasCost(operation, params) {
        const gasPrice = await this.publicClient.getGasPrice();
        // Estimated gas units for different operations
        const gasEstimates = {
            add_liquidity: 300000,
            remove_liquidity: 250000,
            approve: 50000,
            collect_fees: 100000,
        };
        const gasUnits = gasEstimates[operation] || 200000;
        const gasCostWei = gasUnits * Number(gasPrice);
        const ethPrice = 3000; // Placeholder
        return (gasCostWei / 1e18) * ethPrice;
    }
    /**
     * Get token balance
     */
    async getTokenBalance(tokenAddress) {
        const balance = await this.publicClient.readContract({
            address: tokenAddress,
            abi: ERC20_ABI,
            functionName: 'balanceOf',
            args: [this.account.address],
        });
        return Number(balance) / 1e18; // Assuming 18 decimals
    }
    /**
     * Approve token for spending
     */
    async approveToken(tokenAddress, spender, amount) {
        const startTime = Date.now();
        try {
            const amountToApprove = amount || BigInt(2) ** BigInt(256) - 1n; // Max uint256
            const hash = await this.walletClient.writeContract({
                chain: chains_1.mainnet,
                address: tokenAddress,
                abi: ERC20_ABI,
                functionName: 'approve',
                args: [spender, amountToApprove],
            });
            await this.publicClient.waitForTransactionReceipt({ hash });
            return {
                success: true,
                txHash: hash,
                duration: Date.now() - startTime,
            };
        }
        catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                duration: Date.now() - startTime,
            };
        }
    }
    /**
     * Ensure token is approved for spending
     */
    async ensureApproval(tokenAddress, spender) {
        const allowance = await this.publicClient.readContract({
            address: tokenAddress,
            abi: ERC20_ABI,
            functionName: 'allowance',
            args: [this.account.address, spender],
        });
        // If allowance is low, approve max
        if (allowance < BigInt(1000000) * BigInt(10 ** 18)) {
            await this.approveToken(tokenAddress, spender);
        }
    }
    // =========================================================================
    // IL CALCULATION
    // =========================================================================
    /**
     * Estimate impermanent loss risk for a pool
     */
    async estimateImpermanentLossRisk(pool) {
        return this.estimateILRiskFromPair(pool.token0, pool.token1);
    }
    /**
     * Get pool address for a token pair and fee tier
     * In production, this would use the CREATE2 formula or subgraph lookup
     */
    async getPoolAddress(token0Address, token1Address, feeTier) {
        // Simplified implementation - return known pool addresses for common pairs
        // In production, use subgraph or compute CREATE2 address
        // Common USDC/USDT pool on Uniswap V3 (0.05% fee)
        if ((token0Address.includes('A0b8') || token0Address.includes('a0b8')) &&
            (token1Address.includes('dAC1') || token1Address.includes('dac1')) &&
            feeTier === 100) {
            return '0x3416cf6c708da0db3cd464c0afbbfc66bdaec263';
        }
        // USDC/WETH 0.3% pool
        if ((token0Address.includes('A0b8') || token0Address.includes('a0b8')) &&
            token1Address.includes('C02a') &&
            feeTier === 3000) {
            return '0x8ad599c3a0ff1de082011efddc58f1908eb6e6d8';
        }
        // For other pairs, return null (not implemented in this version)
        logger_1.default.debug(`[UniswapV3] Pool not found for ${token0Address.slice(0, 8)}...${token1Address.slice(0, 8)}... fee ${feeTier}`);
        return null;
    }
    // =========================================================================
    // DISCONNECT
    // =========================================================================
    /**
     * Disconnect and cleanup
     */
    async disconnect() {
        this.poolCache.clear();
        this.positions.clear();
        this.isConnected = false;
        logger_1.default.info('[UniswapV3] Disconnected');
    }
}
exports.UniswapV3Client = UniswapV3Client;
//# sourceMappingURL=uniswap-v3-client.js.map