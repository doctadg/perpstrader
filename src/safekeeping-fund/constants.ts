// Safekeeping Fund System - Constants
// Configuration constants for the autonomous rebalancing system

import type { Chain, DEX, BaseAsset } from './types';

/**
 * Default RPC endpoints for each chain
 */
export const DEFAULT_RPC_URLS: Record<Chain, string> = {
  ethereum: 'https://eth.llamarpc.com',
  bsc: 'https://bsc-dataseed.binance.org',
  solana: 'https://api.mainnet-beta.solana.com',
};

/**
 * Chain IDs for each network
 */
export const CHAIN_IDS: Record<Chain, number> = {
  ethereum: 1,
  bsc: 56,
  solana: 0, // Solana uses different addressing
};

/**
 * Default base assets for the multi-asset basket
 */
export const DEFAULT_BASE_ASSETS: BaseAsset[] = [
  {
    symbol: 'USDC',
    address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // Ethereum mainnet
    chain: 'ethereum',
    percentage: 0.30,
  },
  {
    symbol: 'USDT',
    address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', // Ethereum mainnet
    chain: 'ethereum',
    percentage: 0.25,
  },
  {
    symbol: 'USDC',
    address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', // BSC
    chain: 'bsc',
    percentage: 0.15,
  },
  {
    symbol: 'ETH',
    address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
    chain: 'ethereum',
    percentage: 0.15,
  },
  {
    symbol: 'WBTC',
    address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', // Ethereum mainnet
    chain: 'ethereum',
    percentage: 0.10,
  },
  {
    symbol: 'SOL',
    address: 'So11111111111111111111111111111111111111112', // Native SOL
    chain: 'solana',
    percentage: 0.05,
  },
];

/**
 * Common token addresses across chains
 */
export const TOKEN_ADDRESSES = {
  ethereum: {
    USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    DAI: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
    WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    WBTC: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
  },
  bsc: {
    USDC: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
    USDT: '0x55d398326f99059fF775485246999027B3197955',
    WBNB: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
    BTCB: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c',
  },
  solana: {
    USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    SOL: 'So11111111111111111111111111111111111111112', // Native
    RAY: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
  },
};

/**
 * Uniswap V3 Router and Quoter addresses
 */
export const UNISWAP_ADDRESSES = {
  ethereum: {
    router: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
    quoter: '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6',
    factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
    nftManager: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
  },
};

/**
 * PancakeSwap V3 addresses on BSC
 */
export const PANCAKESWAP_ADDRESSES = {
  bsc: {
    router: '0x1b81D678ffb9C0263b24A97847620C99d213eB14',
    quoter: '0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997',
    factory: '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865',
    nftManager: '0x46A15B0b27311cedF172AB29E4f4766fbE7F4364',
  },
};

/**
 * Meteora program addresses on Solana
 */
export const METEORA_ADDRESSES = {
  dlmmProgram: 'LBUZKhRxPF3XUpBCjp4YzTKgLccJ4499yssvFfvbKL',
  permissionLbPair: 'E5ARnPmYDkCFsHf1SjaHcZBj3ieNECzM4VH2CmFVjGh',
};

/**
 * Default fee tiers to scan (in basis points)
 */
export const DEFAULT_FEE_TIERS = [100, 500, 2500, 3000, 10000];

/**
 * Trading pairs to monitor
 */
export const MONITORED_PAIRS = [
  // Stablecoin pairs (low risk)
  { token0: 'USDC', token1: 'USDT' },
  { token0: 'USDC', token1: 'DAI' },
  { token0: 'USDT', token1: 'DAI' },

  // Major pairs (medium risk)
  { token0: 'ETH', token1: 'USDC' },
  { token0: 'ETH', token1: 'USDT' },
  { token0: 'WBTC', token1: 'USDC' },
  { token0: 'WBTC', token1: 'USDT' },
  { token0: 'SOL', token1: 'USDC' },
  { token0: 'SOL', token1: 'USDT' },

  // Volatile pairs (higher risk, higher potential return)
  { token0: 'ETH', token1: 'WBTC' },
  { token0: 'SOL', token1: 'ETH' },
];

/**
 * Default safety limits
 */
export const DEFAULT_SAFETY_LIMITS = {
  maxSlippage: 0.01,          // 1% max slippage
  maxGasEth: 0.001,           // 0.001 ETH max gas
  maxGasBsc: 0.0005,          // 0.0005 BNB max gas
  maxGasSol: 0.01,            // 0.01 SOL max gas
  maxTradeSize: 10000,        // $10,000 max single trade
  minPoolLiquidity: 100000,   // $100,000 minimum pool liquidity
  maxPositions: 5,            // Maximum 5 concurrent positions
  maxDailyRebalances: 12,     // Maximum 12 rebalances per day
  minAPRImprovement: 0.5,     // Minimum 0.5% APR improvement to rebalance
};

/**
 * Default rebalancing configuration
 */
export const DEFAULT_REBALANCING_CONFIG = {
  continuous: {
    enabled: true,
    checkIntervalMs: 5 * 60 * 1000,  // 5 minutes
    aprDeltaThreshold: 0.5,           // 0.5% APR improvement threshold
  },
  scheduled: {
    enabled: true,
    frequency: 'daily' as const,
    time: '02:00 UTC',                // 2 AM UTC (low activity period)
  },
};

/**
 * Gas price thresholds (in gwei for EVM, lamports for Solana)
 */
export const GAS_THRESHOLDS = {
  ethereum: {
    low: 15,
    medium: 30,
    high: 50,
    critical: 100,
  },
  bsc: {
    low: 3,
    medium: 5,
    high: 10,
    critical: 20,
  },
  solana: {
    low: 1000,        // lamports per compute unit
    medium: 5000,
    high: 10000,
    critical: 25000,
  },
};

/**
 * Risk scoring weights
 */
export const RISK_WEIGHTS = {
  volatility: 0.3,
  liquidity: 0.25,
  impermanentLoss: 0.25,
  chainRisk: 0.1,
  auditRisk: 0.1,
};

/**
 * Composite score weights for pool ranking
 */
export const SCORE_WEIGHTS = {
  apr: 0.4,
  risk: 0.3,
  gas: 0.2,
  liquidity: 0.1,
};

/**
 * Circuit breaker thresholds
 */
export const CIRCUIT_BREAKER_CONFIGS = {
  'safekeeping-execution': { threshold: 3, timeout: 60000 },
  'safekeeping-apr-fetch': { threshold: 10, timeout: 120000 },
  'safekeeping-ethereum-rpc': { threshold: 5, timeout: 30000 },
  'safekeeping-bsc-rpc': { threshold: 5, timeout: 30000 },
  'safekeeping-solana-rpc': { threshold: 5, timeout: 30000 },
  'safekeeping-ai-analysis': { threshold: 5, timeout: 90000 },
};

/**
 * APR data source priorities
 */
export const APR_SOURCE_PRIORITIES = {
  onChain: 1,
  subgraph: 2,
  api: 3,
};

/**
 * API endpoints for external APR data
 */
export const APR_API_ENDPOINTS = {
  defiLlama: 'https://yields.llama.fi/pools',
  coingecko: 'https://api.coingecko.com/api/v3/onchain/networks',
};

/**
 * Subgraph endpoints
 */
export const SUBGRAPH_ENDPOINTS = {
  uniswapV3: 'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3',
  pancakeswapV3: 'https://api.thegraph.com/subgraphs/name/pancakeswap/exchange-v3-eth',
};

/**
 * Transaction deadlines
 */
export const TRANSACTION_DEADLINES = {
  default: 20,              // 20 minutes default
  urgent: 5,                // 5 minutes for urgent transactions
  relaxed: 60,              // 60 minutes for non-urgent
};

/**
 * Slippage tolerances
 */
export const SLIPPAGE_TOLERANCES = {
  conservative: 0.001,      // 0.1%
  standard: 0.005,          // 0.5%
  aggressive: 0.01,         // 1%
  veryAggressive: 0.03,     // 3%
};

/**
 * Position sizing strategies
 */
export const POSITION_SIZING = {
  conservative: 0.1,        // 10% per position
  standard: 0.25,           // 25% per position
  aggressive: 0.5,          // 50% per position
  veryAggressive: 1.0,      // 100% all in
};

/**
 * IL (Impermanent Loss) calculation constants
 */
export const IL_CALCULATION = {
  lookbackPeriod: 24 * 60 * 60 * 1000,  // 24 hours
  minSamples: 100,                      // Minimum price samples
  maxPriceDeviation: 0.5,               // 50% max deviation
};

/**
 * Health check intervals
 */
export const HEALTH_CHECK_INTERVALS = {
  rpc: 30000,                // 30 seconds
  apr: 60000,                // 1 minute
  positions: 120000,         // 2 minutes
  full: 300000,              // 5 minutes
};

/**
 * Logging levels
 */
export const LOG_LEVELS = {
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug',
} as const;

/**
 * Default cycle interval
 */
export const DEFAULT_CYCLE_INTERVAL = 5 * 60 * 1000; // 5 minutes

/**
 * Maximum retry attempts for operations
 */
export const MAX_RETRIES = {
  transaction: 3,
  aprFetch: 5,
  rpcCall: 3,
  aiAnalysis: 2,
};

/**
 * Retry delays (in milliseconds)
 */
export const RETRY_DELAYS = {
  base: 1000,
  max: 10000,
  exponentialBase: 2,
};

/**
 * Cache TTLs (in milliseconds)
 */
export const CACHE_TTLS = {
  poolState: 30000,          // 30 seconds
  aprData: 60000,            // 1 minute
  gasPrice: 15000,           // 15 seconds
  tokenPrice: 30000,         // 30 seconds
  aiAnalysis: 300000,        // 5 minutes
};

/**
 * Emergency halt conditions
 */
export const EMERGENCY_HALT_CONDITIONS = [
  'manual_pause',
  'circuit_breaker_open',
  'gas_spike',
  'price_manipulation_detected',
  'unauthorized_signer',
  'balance_anomaly',
  'approval_required',
  'critical_anomaly_detected',
] as const;

/**
 * DEX to chain mapping
 */
export const DEX_TO_CHAIN: Record<DEX, Chain> = {
  uniswap_v3: 'ethereum',
  pancakeswap_v3: 'bsc',
  meteora: 'solana',
};

/**
 * Chain to DEXs mapping
 */
export const CHAIN_TO_DEXS: Record<Chain, DEX[]> = {
  ethereum: ['uniswap_v3'],
  bsc: ['pancakeswap_v3'],
  solana: ['meteora'],
};

/**
 * Native token symbols
 */
export const NATIVE_TOKENS: Record<Chain, string> = {
  ethereum: 'ETH',
  bsc: 'BNB',
  solana: 'SOL',
};

/**
 * Decimal places for token display
 */
export const TOKEN_DECIMALS = {
  USDC: 6,
  USDT: 6,
  DAI: 18,
  ETH: 18,
  WETH: 18,
  WBTC: 8,
  SOL: 9,
  BNB: 18,
  WBNB: 18,
  BTCB: 18,
};

/**
 * Minimum liquidity thresholds by tier
 */
export const LIQUIDITY_TIERS = {
  micro: 10000,              // $10,000
  small: 50000,              // $50,000
  medium: 200000,            // $200,000
  large: 1000000,            // $1,000,000
  whale: 10000000,           // $10,000,000
};

/**
 * APR ranges for classification
 */
export const APR_RANGES = {
  veryLow: { min: 0, max: 5 },
  low: { min: 5, max: 10 },
  medium: { min: 10, max: 20 },
  high: { min: 20, max: 50 },
  veryHigh: { min: 50, max: Infinity },
};

/**
 * Priority levels for rebalance actions
 */
export const ACTION_PRIORITIES = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  URGENT: 4,
} as const;

/**
 * Maximum age for cached data
 */
export const MAX_CACHE_AGE = {
  poolState: 60000,          // 1 minute
  priceData: 30000,          // 30 seconds
  gasPrice: 20000,           // 20 seconds
};
