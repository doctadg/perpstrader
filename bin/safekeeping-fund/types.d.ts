/**
 * Supported blockchain networks
 */
export type Chain = 'ethereum' | 'bsc' | 'solana';
/**
 * Supported decentralized exchanges
 */
export type DEX = 'uniswap_v3' | 'pancakeswap_v3' | 'meteora';
/**
 * Rebalance action types
 */
export type RebalanceActionType = 'MINT' | 'BURN' | 'REALLOCATE' | 'COLLECT';
/**
 * Risk levels for opportunities and positions
 */
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
/**
 * Token representation
 */
export interface Token {
    symbol: string;
    address: string;
    decimals: number;
    chain: Chain;
}
/**
 * Pool opportunity found during market scanning
 */
export interface PoolOpportunity {
    chain: Chain;
    dex: DEX;
    address: string;
    token0: Token;
    token1: Token;
    feeTier: number;
    tvl: number;
    volume24h: number;
    feeAPR: number;
    effectiveAPR: number;
    compositeScore: number;
    riskScore: number;
    liquidity: number;
    estimatedGasCost: number;
    impermanentLossRisk: number;
    lastUpdated: Date;
}
/**
 * Current liquidity position
 */
export interface LiquidityPosition {
    id: string;
    chain: Chain;
    dex: DEX;
    poolAddress: string;
    token0: Token;
    token1: Token;
    amount0: number;
    amount1: number;
    totalValue: number;
    effectiveAPR: number;
    feeTier: number;
    tickLower?: number;
    tickUpper?: number;
    entryTimestamp: Date;
    lastUpdated: Date;
}
/**
 * Rebalance action to be executed
 */
export interface RebalanceAction {
    id: string;
    type: RebalanceActionType;
    fromPool?: PoolOpportunity;
    toPool?: PoolOpportunity;
    percentage: number;
    amount: number;
    estimatedGas: number;
    expectedImprovement: number;
    priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
    reason: string;
    timestamp: Date;
}
/**
 * Rebalance execution result
 */
export interface RebalanceExecutionResult {
    actionId: string;
    success: boolean;
    txHash?: string;
    actualAmount: number;
    actualGasCost: number;
    gasCost?: number;
    gasUsed?: number;
    error?: string;
    duration: number;
    timestamp: Date;
}
/**
 * Chain health status
 */
export interface ChainStatus {
    chain: Chain;
    isConnected: boolean;
    blockNumber?: number;
    gasPrice?: number;
    gasPriceUsd?: number;
    latency: number;
    lastUpdated: Date;
}
/**
 * Safety check result
 */
export interface SafetyCheckResult {
    name: string;
    passed: boolean;
    reason?: string;
    severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
    timestamp: Date;
}
/**
 * AI analysis result
 */
export interface AIAnalysis {
    summary: string;
    recommendations: string[];
    riskLevel: RiskLevel;
    marketRegime: MarketRegime;
    marketConditions: string;
    anomalies: Anomaly[];
    suggestedAllocations: PoolAllocation[];
    timestamp: Date;
}
/**
 * Detected anomaly
 */
export interface Anomaly {
    type: string;
    severity: RiskLevel;
    description: string;
    recommendedAction: string;
    timestamp: Date;
}
/**
 * Pool allocation recommendation
 */
export interface PoolAllocation {
    poolAddress: string;
    chain: Chain;
    dex: DEX;
    percentage: number;
    amount: number;
    expectedAPR: number;
    riskScore: number;
}
/**
 * Base asset configuration for multi-asset basket
 */
export interface BaseAsset {
    symbol: string;
    address: string;
    chain: Chain;
    percentage: number;
}
/**
 * Wallet configuration for a chain
 */
export interface ChainWalletConfig {
    privateKey?: string;
    rpcUrl: string;
    chainId: number;
    explorerUrl?: string;
}
/**
 * Multi-chain wallet configuration
 */
export interface MultiChainWalletConfig {
    ethereum?: ChainWalletConfig;
    bsc?: ChainWalletConfig;
    solana?: {
        secretKey?: string | Uint8Array;
        rpcUrl: string;
        commitment?: 'processed' | 'confirmed' | 'finalized';
    };
}
/**
 * DEX Operation Result
 */
export interface DEXOperationResult {
    success: boolean;
    txHash?: string;
    actualAmount?: number;
    gasUsed?: number;
    gasCost?: number;
    error?: string;
    duration: number;
}
/**
 * Rebalancing strategy configuration
 */
export interface RebalancingConfig {
    continuous: {
        enabled: boolean;
        checkIntervalMs: number;
        aprDeltaThreshold: number;
    };
    scheduled: {
        enabled: boolean;
        frequency: 'hourly' | 'daily' | 'weekly';
        time?: string;
    };
}
/**
 * Safety limits configuration
 */
export interface SafetyLimitsConfig {
    maxSlippage: number;
    maxGasEth: number;
    maxGasBsc: number;
    maxGasSol: number;
    maxTradeSize: number;
    minPoolLiquidity: number;
    maxPositions: number;
    maxDailyRebalances: number;
}
/**
 * Safekeeping fund configuration
 */
export interface SafekeepingFundConfig {
    enabled: boolean;
    wallets: MultiChainWalletConfig;
    baseAssets: BaseAsset[];
    rebalancing: RebalancingConfig;
    safety: SafetyLimitsConfig;
    initialFundValue: number;
    minReservePercentage: number;
}
/**
 * Transaction context for execution
 */
export interface TransactionContext {
    chain: Chain;
    dex: DEX;
    action: RebalanceActionType;
    maxGasPrice?: number;
    slippageTolerance: number;
    deadlineMinutes: number;
}
/**
 * Add liquidity parameters
 */
export interface AddLiquidityParams {
    poolAddress: string;
    token0Amount: number;
    token1Amount: number;
    tickLower?: number;
    tickUpper?: number;
    slippageTolerance: number;
    deadlineMinutes: number;
}
/**
 * Remove liquidity parameters
 */
export interface RemoveLiquidityParams {
    positionId: string;
    percentage: number;
    slippageTolerance: number;
    deadlineMinutes: number;
}
/**
 * Portfolio snapshot
 */
export interface PortfolioSnapshot {
    timestamp: Date;
    totalValue: number;
    positions: LiquidityPosition[];
    chainBreakdown: Map<Chain, number>;
    dexBreakdown: Map<DEX, number>;
    averageAPR: number;
    dailyPnL?: number;
}
/**
 * Historical performance metrics
 */
export interface PerformanceMetrics {
    periodStart: Date;
    periodEnd: Date;
    initialValue: number;
    finalValue: number;
    totalReturn: number;
    totalReturnUsd: number;
    avgAPR: number;
    rebalanceCount: number;
    gasSpent: number;
    netProfit: number;
    sharpeRatio?: number;
    maxDrawdown: number;
}
/**
 * Audit event
 */
export interface AuditEvent {
    id: string;
    eventType: string;
    timestamp: Date;
    cycleId?: string;
    data: Record<string, unknown>;
    status: 'SUCCESS' | 'FAILED' | 'PENDING';
}
/**
 * Rebalance trigger
 */
export interface RebalanceTrigger {
    shouldRebalance: boolean;
    reason: string;
    urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    estimatedImprovement?: number;
    timestamp: Date;
}
/**
 * Market regime classification
 */
export type MarketRegime = 'BULL' | 'BEAR' | 'SIDEWAYS' | 'VOLATILE';
/**
 * IL (Impermanent Loss) calculation result
 */
export interface ILCalculation {
    currentPriceRatio: number;
    entryPriceRatio: number;
    impermanentLoss: number;
    hodlValue: number;
    lpValue: number;
}
/**
 * APR calculation breakdown
 */
export interface APRBreakdown {
    tradingFeeAPR: number;
    rewardAPR: number;
    impermanentLoss: number;
    gasCostAPR: number;
    effectiveAPR: number;
}
/**
 * Priority queue item for rebalance actions
 */
export interface QueuedRebalance {
    action: RebalanceAction;
    scheduledTime?: Date;
    dependencies: string[];
    retryCount: number;
    maxRetries: number;
}
/**
 * Health check result for a component
 */
export interface ComponentHealth {
    component: string;
    status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' | 'CRITICAL';
    message: string;
    lastCheck: Date;
    metrics: Record<string, number | string>;
}
//# sourceMappingURL=types.d.ts.map