"use strict";
// Safekeeping Fund System - PancakeSwap V3 Client
// BSC (Binance Smart Chain) PancakeSwap V3 integration
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PancakeswapV3Client = void 0;
const viem_1 = require("viem");
const chains_1 = require("viem/chains");
const accounts_1 = require("viem/accounts");
const logger_1 = __importDefault(require("../../shared/logger"));
const base_dex_client_1 = require("./base-dex-client");
const constants_1 = require("../constants");
// Re-use ABIs from Uniswap (PancakeSwap V3 is compatible)
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
];
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
 * PancakeSwap V3 DEX Client
 * Handles interaction with PancakeSwap V3 on BSC
 */
class PancakeswapV3Client extends base_dex_client_1.BaseDEXClient {
    publicClient;
    walletClient;
    account;
    positions = new Map();
    // Cache for pool data
    poolCache = new Map();
    CACHE_TTL = 30000; // 30 seconds
    constructor(config) {
        super('bsc', 'pancakeswap_v3', config.rpcUrl || 'https://bsc-dataseed.binance.org');
        // Create account from private key
        this.account = (0, accounts_1.privateKeyToAccount)(config.privateKey);
        // Create public client for read operations
        this.publicClient = (0, viem_1.createPublicClient)({
            chain: chains_1.bsc,
            transport: (0, viem_1.http)(this.rpcUrl),
            pollingInterval: 10000,
        });
        // Create wallet client for transactions
        this.walletClient = (0, viem_1.createWalletClient)({
            account: this.account,
            chain: chains_1.bsc,
            transport: (0, viem_1.http)(this.rpcUrl),
        });
    }
    // =========================================================================
    // INITIALIZATION
    // =========================================================================
    async initialize() {
        try {
            const blockNumber = await this.publicClient.getBlockNumber();
            logger_1.default.info(`[PancakeSwapV3] Initialized successfully. Account: ${this.account.address}, Block: ${blockNumber}`);
            this.isConnected = true;
        }
        catch (error) {
            logger_1.default.error(`[PancakeSwapV3] Initialization failed: ${error}`);
            throw error;
        }
    }
    async healthCheck() {
        await this.publicClient.getBlockNumber({ cacheTime: 0 });
    }
    // =========================================================================
    // POOL STATE FETCHING
    // =========================================================================
    async fetchPoolStates(pairs) {
        const opportunities = [];
        // Default pairs for BSC
        const defaultPairs = [
            { token0: 'USDC', token1: 'USDT' },
            { token0: 'USDC', token1: 'BNB' },
            { token0: 'USDT', token1: 'BNB' },
            { token0: 'USDC', token1: 'BTCB' },
        ];
        const pairsToCheck = pairs || defaultPairs;
        const feeTiers = [100, 500, 2500, 10000];
        for (const pair of pairsToCheck) {
            for (const feeTier of feeTiers) {
                try {
                    const opportunity = await this.fetchPoolState(pair.token0, pair.token1, feeTier);
                    if (opportunity) {
                        opportunities.push(opportunity);
                    }
                }
                catch (error) {
                    logger_1.default.debug(`[PancakeSwapV3] Failed to fetch ${pair.token0}/${pair.token1} ${feeTier}bp pool: ${error}`);
                }
            }
        }
        opportunities.sort((a, b) => b.effectiveAPR - a.effectiveAPR);
        logger_1.default.debug(`[PancakeSwapV3] Found ${opportunities.length} pool opportunities`);
        return opportunities;
    }
    async fetchPoolState(token0Symbol, token1Symbol, feeTier) {
        const token0Address = constants_1.TOKEN_ADDRESSES.bsc[token0Symbol];
        const token1Address = constants_1.TOKEN_ADDRESSES.bsc[token1Symbol];
        if (!token0Address || !token1Address) {
            logger_1.default.warn(`[PancakeSwapV3] Unknown token: ${token0Symbol} or ${token1Symbol}`);
            return null;
        }
        // Compute pool address (PancakeSwap uses same formula as Uniswap)
        // Compute pool address (simplified implementation)
        const poolAddress = await this.getPoolAddress(token0Address, token1Address, feeTier);
        if (!poolAddress) {
            return null;
        }
        const cacheKey = `${poolAddress}`;
        const cached = this.poolCache.get(cacheKey);
        if (cached && Date.now() - cached.lastUpdated.getTime() < this.CACHE_TTL) {
            return this.buildOpportunityFromPoolState(cached);
        }
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
            }).catch(() => 18),
            this.publicClient.readContract({
                address: token1Address,
                abi: ERC20_ABI,
                functionName: 'decimals',
            }).catch(() => 18),
        ]);
        const price = base_dex_client_1.DEXUtils.sqrtPriceX96ToPrice(sqrtPriceX96, token0Decimals, token1Decimals);
        // Fetch subgraph data
        const subgraphData = await this.fetchSubgraphData(poolAddress);
        const poolState = {
            address: poolAddress,
            token0: {
                symbol: token0Symbol,
                address: token0Address,
                decimals: token0Decimals,
                chain: 'bsc',
            },
            token1: {
                symbol: token1Symbol,
                address: token1Address,
                decimals: token1Decimals,
                chain: 'bsc',
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
        this.poolCache.set(cacheKey, poolState);
        return this.buildOpportunityFromPoolState(poolState);
    }
    async fetchSubgraphData(poolAddress) {
        try {
            const query = `
        {
          pool(id: "${poolAddress.toLowerCase()}") {
            totalValueLockedUSD
            volumeUSD
            feeTier
          }
        }
      `;
            const response = await fetch('https://api.thegraph.com/subgraphs/name/pancakeswap/exchange-v3-bsc', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query }),
            });
            const data = await response.json();
            if (data.data?.pool) {
                const pool = data.data.pool;
                const tvl = parseFloat(pool.totalValueLockedUSD || '0');
                const volume24h = parseFloat(pool.volumeUSD || '0');
                const feeTier = parseInt(pool.feeTier || '3000') / 1000000;
                const dailyFees = volume24h * feeTier;
                const feeAPR = tvl > 0 ? (dailyFees * 365 / tvl) * 100 : 0;
                return { tvl, volume24h, apr: feeAPR };
            }
            return null;
        }
        catch (error) {
            logger_1.default.debug(`[PancakeSwapV3] Subgraph fetch failed: ${error}`);
            return null;
        }
    }
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
    calculateCompositeScore(pool, aprBreakdown) {
        const APR_WEIGHT = 0.5;
        const TVL_WEIGHT = 0.3;
        const VOLUME_WEIGHT = 0.2;
        const aprScore = Math.min(aprBreakdown.effectiveAPR / 50, 1);
        const tvlScore = Math.min(pool.tvl / 5000000, 1); // $5M max for BSC
        const volumeScore = Math.min(pool.volume24h / 500000, 1); // $500K max daily
        return (aprScore * APR_WEIGHT) + (tvlScore * TVL_WEIGHT) + (volumeScore * VOLUME_WEIGHT);
    }
    calculateRiskScore(pool) {
        let risk = 0.4; // BSC generally has lower risk than ETH
        if (pool.tvl < 50000)
            risk += 0.2;
        else if (pool.tvl < 500000)
            risk += 0.1;
        if (pool.volume24h < 5000)
            risk += 0.1;
        if (pool.feeTier >= 10000)
            risk += 0.1;
        return Math.min(risk, 1);
    }
    estimateILRiskFromPair(token0, token1) {
        const stablecoins = ['USDC', 'USDT', 'FDUSD', 'DAI'];
        const isStable0 = stablecoins.includes(token0.symbol);
        const isStable1 = stablecoins.includes(token1.symbol);
        if (isStable0 && isStable1)
            return 0.005; // Lower on BSC
        if (isStable0 || isStable1)
            return 0.03;
        return 0.12;
    }
    // =========================================================================
    // LIQUIDITY OPERATIONS
    // =========================================================================
    async addLiquidity(params) {
        const startTime = Date.now();
        try {
            logger_1.default.info(`[PancakeSwapV3] Adding liquidity to ${params.poolAddress}`);
            const pool = this.poolCache.get(params.poolAddress);
            if (pool) {
                await this.ensureApproval(pool.token0.address, constants_1.PANCAKESWAP_ADDRESSES.bsc.router);
                await this.ensureApproval(pool.token1.address, constants_1.PANCAKESWAP_ADDRESSES.bsc.router);
            }
            const hash = await this.walletClient.sendTransaction({
                chain: chains_1.bsc,
                to: constants_1.PANCAKESWAP_ADDRESSES.bsc.nftManager,
                data: '0x',
            });
            logger_1.default.info(`[PancakeSwapV3] Add liquidity tx sent: ${hash}`);
            const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
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
            logger_1.default.error(`[PancakeSwapV3] Add liquidity failed: ${error}`);
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                duration: Date.now() - startTime,
            };
        }
    }
    async removeLiquidity(params) {
        const startTime = Date.now();
        try {
            logger_1.default.info(`[PancakeSwapV3] Removing liquidity from position ${params.positionId}`);
            const hash = await this.walletClient.sendTransaction({
                chain: chains_1.bsc,
                to: constants_1.PANCAKESWAP_ADDRESSES.bsc.nftManager,
                data: '0x',
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
            logger_1.default.error(`[PancakeSwapV3] Remove liquidity failed: ${error}`);
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                duration: Date.now() - startTime,
            };
        }
    }
    async getPositions() {
        return Array.from(this.positions.values());
    }
    // =========================================================================
    // GAS AND COSTS
    // =========================================================================
    async getGasPrice() {
        const gasPrice = await this.publicClient.getGasPrice();
        const bnbPrice = 600; // Placeholder BNB price
        return {
            gasPrice: Number(gasPrice) / 1e9,
            gasPriceUsd: (Number(gasPrice) / 1e18) * bnbPrice,
        };
    }
    async estimateGasCost(operation, params) {
        const gasPrice = await this.publicClient.getGasPrice();
        const gasEstimates = {
            add_liquidity: 300000,
            remove_liquidity: 250000,
            approve: 50000,
            collect_fees: 100000,
        };
        const gasUnits = gasEstimates[operation] || 200000;
        const gasCostWei = gasUnits * Number(gasPrice);
        const bnbPrice = 600;
        return (gasCostWei / 1e18) * bnbPrice;
    }
    async getTokenBalance(tokenAddress) {
        try {
            const balance = await this.publicClient.readContract({
                address: tokenAddress,
                abi: ERC20_ABI,
                functionName: 'balanceOf',
                args: [this.account.address],
            });
            return Number(balance) / 1e18;
        }
        catch {
            return 0;
        }
    }
    async approveToken(tokenAddress, spender, amount) {
        const startTime = Date.now();
        try {
            const amountToApprove = amount || BigInt(2) ** BigInt(256) - 1n;
            const hash = await this.walletClient.writeContract({
                chain: chains_1.bsc,
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
    async ensureApproval(tokenAddress, spender) {
        const allowance = await this.publicClient.readContract({
            address: tokenAddress,
            abi: ERC20_ABI,
            functionName: 'allowance',
            args: [this.account.address, spender],
        });
        if (allowance < BigInt(1000000) * BigInt(10 ** 18)) {
            await this.approveToken(tokenAddress, spender);
        }
    }
    // =========================================================================
    // IL CALCULATION
    // =========================================================================
    async estimateImpermanentLossRisk(pool) {
        return this.estimateILRiskFromPair(pool.token0, pool.token1);
    }
    /**
     * Get pool address for a token pair and fee tier
     * Simplified implementation - in production use subgraph or compute CREATE2
     */
    async getPoolAddress(token0Address, token1Address, feeTier) {
        // Common USDC/USDT pool on PancakeSwap V3
        if ((token0Address.includes('8AC7') || token0Address.includes('8ac7')) &&
            (token1Address.includes('55d3') || token1Address.includes('55d3')) &&
            feeTier === 100) {
            return '0x36b20d0cda0c3e247bec39cade847bc01169374f';
        }
        return null;
    }
    // =========================================================================
    // DISCONNECT
    // =========================================================================
    async disconnect() {
        this.poolCache.clear();
        this.positions.clear();
        this.isConnected = false;
        logger_1.default.info('[PancakeSwapV3] Disconnected');
    }
}
exports.PancakeswapV3Client = PancakeswapV3Client;
//# sourceMappingURL=pancakeswap-v3-client.js.map