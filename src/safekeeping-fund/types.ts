// Safekeeping Fund System - Type Definitions
// Comprehensive types for multi-chain DEX liquidity management

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
  feeTier: number;          // Fee tier in basis points (e.g., 3000 for 0.3%)
  tvl: number;              // Total Value Locked in USD
  volume24h: number;        // 24h trading volume in USD
  feeAPR: number;           // Raw fee APR before adjustments
  effectiveAPR: number;     // APR accounting for fees, IL, gas costs
  compositeScore: number;   // Combined score for ranking
  riskScore: number;        // Risk score (0-1, lower is better)
  liquidity: number;        // Available liquidity depth
  estimatedGasCost: number; // Estimated gas cost in USD
  impermanentLossRisk: number; // IL risk factor (0-1)
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
  amount0: number;          // Amount of token0 deposited
  amount1: number;          // Amount of token1 deposited
  totalValue: number;       // Total USD value
  effectiveAPR: number;     // Current effective APR
  feeTier: number;
  tickLower?: number;       // For concentrated liquidity (Uniswap V3)
  tickUpper?: number;       // For concentrated liquidity (Uniswap V3)
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
  percentage: number;       // Percentage of total portfolio to reallocate
  amount: number;           // USD amount to reallocate
  estimatedGas: number;     // Estimated gas cost in USD
  expectedImprovement: number; // Expected APR improvement
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  reason: string;           // Why this rebalance is recommended
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
  gasCost?: number;          // Alias for actualGasCost (for compatibility)
  gasUsed?: number;          // Gas units used
  error?: string;
  duration: number;         // Execution time in ms
  timestamp: Date;
}

/**
 * Chain health status
 */
export interface ChainStatus {
  chain: Chain;
  isConnected: boolean;
  blockNumber?: number;
  gasPrice?: number;        // Current gas price in gwei/lamports
  gasPriceUsd?: number;     // Gas price in USD
  latency: number;          // RPC latency in ms
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
  percentage: number;       // Percentage of portfolio
  amount: number;           // USD amount
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
  percentage: number;       // Target portfolio percentage
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
  // Continuous monitoring settings
  continuous: {
    enabled: boolean;
    checkIntervalMs: number;
    aprDeltaThreshold: number;  // Min APR improvement to trigger
  };
  // Scheduled rebalance settings
  scheduled: {
    enabled: boolean;
    frequency: 'hourly' | 'daily' | 'weekly';
    time?: string;             // For daily/weekly, e.g., "02:00 UTC"
  };
}

/**
 * Safety limits configuration
 */
export interface SafetyLimitsConfig {
  maxSlippage: number;         // Maximum acceptable slippage (0-1)
  maxGasEth: number;           // Max gas cost in ETH
  maxGasBsc: number;           // Max gas cost in BNB
  maxGasSol: number;           // Max gas cost in SOL
  maxTradeSize: number;        // Max single trade size in USD
  minPoolLiquidity: number;    // Minimum pool liquidity to enter
  maxPositions: number;         // Maximum concurrent positions
  maxDailyRebalances: number;  // Maximum rebalances per day
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
  initialFundValue: number;    // Initial fund value in USD
  minReservePercentage: number; // Percentage to keep as reserve
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
  percentage: number;         // Percentage to remove (0-100)
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
  totalReturn: number;        // Percentage return
  totalReturnUsd: number;
  avgAPR: number;
  rebalanceCount: number;
  gasSpent: number;
  netProfit: number;          // After gas costs
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
  impermanentLoss: number;    // As decimal (e.g., -0.025 for -2.5%)
  hodlValue: number;
  lpValue: number;
}

/**
 * APR calculation breakdown
 */
export interface APRBreakdown {
  tradingFeeAPR: number;      // From trading fees
  rewardAPR: number;          // From token rewards/staking
  impermanentLoss: number;    // Expected IL impact
  gasCostAPR: number;         // Annualized gas cost impact
  effectiveAPR: number;       // Final effective APR
}

/**
 * Priority queue item for rebalance actions
 */
export interface QueuedRebalance {
  action: RebalanceAction;
  scheduledTime?: Date;
  dependencies: string[];     // Other action IDs that must complete first
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
