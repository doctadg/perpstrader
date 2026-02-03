import type { Chain, DEX, BaseAsset } from './types';
/**
 * Default RPC endpoints for each chain
 */
export declare const DEFAULT_RPC_URLS: Record<Chain, string>;
/**
 * Chain IDs for each network
 */
export declare const CHAIN_IDS: Record<Chain, number>;
/**
 * Default base assets for the multi-asset basket
 */
export declare const DEFAULT_BASE_ASSETS: BaseAsset[];
/**
 * Common token addresses across chains
 */
export declare const TOKEN_ADDRESSES: {
    ethereum: {
        USDC: string;
        USDT: string;
        DAI: string;
        WETH: string;
        WBTC: string;
    };
    bsc: {
        USDC: string;
        USDT: string;
        WBNB: string;
        BTCB: string;
    };
    solana: {
        USDC: string;
        USDT: string;
        SOL: string;
        RAY: string;
    };
};
/**
 * Uniswap V3 Router and Quoter addresses
 */
export declare const UNISWAP_ADDRESSES: {
    ethereum: {
        router: string;
        quoter: string;
        factory: string;
        nftManager: string;
    };
};
/**
 * PancakeSwap V3 addresses on BSC
 */
export declare const PANCAKESWAP_ADDRESSES: {
    bsc: {
        router: string;
        quoter: string;
        factory: string;
        nftManager: string;
    };
};
/**
 * Meteora program addresses on Solana
 */
export declare const METEORA_ADDRESSES: {
    dlmmProgram: string;
    permissionLbPair: string;
};
/**
 * Default fee tiers to scan (in basis points)
 */
export declare const DEFAULT_FEE_TIERS: number[];
/**
 * Trading pairs to monitor
 */
export declare const MONITORED_PAIRS: {
    token0: string;
    token1: string;
}[];
/**
 * Default safety limits
 */
export declare const DEFAULT_SAFETY_LIMITS: {
    maxSlippage: number;
    maxGasEth: number;
    maxGasBsc: number;
    maxGasSol: number;
    maxTradeSize: number;
    minPoolLiquidity: number;
    maxPositions: number;
    maxDailyRebalances: number;
    minAPRImprovement: number;
};
/**
 * Default rebalancing configuration
 */
export declare const DEFAULT_REBALANCING_CONFIG: {
    continuous: {
        enabled: boolean;
        checkIntervalMs: number;
        aprDeltaThreshold: number;
    };
    scheduled: {
        enabled: boolean;
        frequency: "daily";
        time: string;
    };
};
/**
 * Gas price thresholds (in gwei for EVM, lamports for Solana)
 */
export declare const GAS_THRESHOLDS: {
    ethereum: {
        low: number;
        medium: number;
        high: number;
        critical: number;
    };
    bsc: {
        low: number;
        medium: number;
        high: number;
        critical: number;
    };
    solana: {
        low: number;
        medium: number;
        high: number;
        critical: number;
    };
};
/**
 * Risk scoring weights
 */
export declare const RISK_WEIGHTS: {
    volatility: number;
    liquidity: number;
    impermanentLoss: number;
    chainRisk: number;
    auditRisk: number;
};
/**
 * Composite score weights for pool ranking
 */
export declare const SCORE_WEIGHTS: {
    apr: number;
    risk: number;
    gas: number;
    liquidity: number;
};
/**
 * Circuit breaker thresholds
 */
export declare const CIRCUIT_BREAKER_CONFIGS: {
    'safekeeping-execution': {
        threshold: number;
        timeout: number;
    };
    'safekeeping-apr-fetch': {
        threshold: number;
        timeout: number;
    };
    'safekeeping-ethereum-rpc': {
        threshold: number;
        timeout: number;
    };
    'safekeeping-bsc-rpc': {
        threshold: number;
        timeout: number;
    };
    'safekeeping-solana-rpc': {
        threshold: number;
        timeout: number;
    };
    'safekeeping-ai-analysis': {
        threshold: number;
        timeout: number;
    };
};
/**
 * APR data source priorities
 */
export declare const APR_SOURCE_PRIORITIES: {
    onChain: number;
    subgraph: number;
    api: number;
};
/**
 * API endpoints for external APR data
 */
export declare const APR_API_ENDPOINTS: {
    defiLlama: string;
    coingecko: string;
};
/**
 * Subgraph endpoints
 */
export declare const SUBGRAPH_ENDPOINTS: {
    uniswapV3: string;
    pancakeswapV3: string;
};
/**
 * Transaction deadlines
 */
export declare const TRANSACTION_DEADLINES: {
    default: number;
    urgent: number;
    relaxed: number;
};
/**
 * Slippage tolerances
 */
export declare const SLIPPAGE_TOLERANCES: {
    conservative: number;
    standard: number;
    aggressive: number;
    veryAggressive: number;
};
/**
 * Position sizing strategies
 */
export declare const POSITION_SIZING: {
    conservative: number;
    standard: number;
    aggressive: number;
    veryAggressive: number;
};
/**
 * IL (Impermanent Loss) calculation constants
 */
export declare const IL_CALCULATION: {
    lookbackPeriod: number;
    minSamples: number;
    maxPriceDeviation: number;
};
/**
 * Health check intervals
 */
export declare const HEALTH_CHECK_INTERVALS: {
    rpc: number;
    apr: number;
    positions: number;
    full: number;
};
/**
 * Logging levels
 */
export declare const LOG_LEVELS: {
    readonly ERROR: "error";
    readonly WARN: "warn";
    readonly INFO: "info";
    readonly DEBUG: "debug";
};
/**
 * Default cycle interval
 */
export declare const DEFAULT_CYCLE_INTERVAL: number;
/**
 * Maximum retry attempts for operations
 */
export declare const MAX_RETRIES: {
    transaction: number;
    aprFetch: number;
    rpcCall: number;
    aiAnalysis: number;
};
/**
 * Retry delays (in milliseconds)
 */
export declare const RETRY_DELAYS: {
    base: number;
    max: number;
    exponentialBase: number;
};
/**
 * Cache TTLs (in milliseconds)
 */
export declare const CACHE_TTLS: {
    poolState: number;
    aprData: number;
    gasPrice: number;
    tokenPrice: number;
    aiAnalysis: number;
};
/**
 * Emergency halt conditions
 */
export declare const EMERGENCY_HALT_CONDITIONS: readonly ["manual_pause", "circuit_breaker_open", "gas_spike", "price_manipulation_detected", "unauthorized_signer", "balance_anomaly", "approval_required", "critical_anomaly_detected"];
/**
 * DEX to chain mapping
 */
export declare const DEX_TO_CHAIN: Record<DEX, Chain>;
/**
 * Chain to DEXs mapping
 */
export declare const CHAIN_TO_DEXS: Record<Chain, DEX[]>;
/**
 * Native token symbols
 */
export declare const NATIVE_TOKENS: Record<Chain, string>;
/**
 * Decimal places for token display
 */
export declare const TOKEN_DECIMALS: {
    USDC: number;
    USDT: number;
    DAI: number;
    ETH: number;
    WETH: number;
    WBTC: number;
    SOL: number;
    BNB: number;
    WBNB: number;
    BTCB: number;
};
/**
 * Minimum liquidity thresholds by tier
 */
export declare const LIQUIDITY_TIERS: {
    micro: number;
    small: number;
    medium: number;
    large: number;
    whale: number;
};
/**
 * APR ranges for classification
 */
export declare const APR_RANGES: {
    veryLow: {
        min: number;
        max: number;
    };
    low: {
        min: number;
        max: number;
    };
    medium: {
        min: number;
        max: number;
    };
    high: {
        min: number;
        max: number;
    };
    veryHigh: {
        min: number;
        max: number;
    };
};
/**
 * Priority levels for rebalance actions
 */
export declare const ACTION_PRIORITIES: {
    readonly LOW: 1;
    readonly MEDIUM: 2;
    readonly HIGH: 3;
    readonly URGENT: 4;
};
/**
 * Maximum age for cached data
 */
export declare const MAX_CACHE_AGE: {
    poolState: number;
    priceData: number;
    gasPrice: number;
};
//# sourceMappingURL=constants.d.ts.map