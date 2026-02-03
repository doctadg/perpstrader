import type { Chain, DEX, LiquidityPosition, PoolOpportunity, RebalanceAction, RebalanceExecutionResult, ChainStatus, SafetyCheckResult, Anomaly, RiskLevel, MarketRegime, APRBreakdown, RebalanceTrigger, ComponentHealth } from './types';
/**
 * Safekeeping Fund Agent State
 * Flows through all nodes in the LangGraph pipeline
 */
export interface SafekeepingFundState {
    cycleId: string;
    cycleStartTime: Date;
    currentStep: string;
    cycleNumber: number;
    positions: LiquidityPosition[];
    totalValue: number;
    totalEffectiveAPR: number;
    reserveBalance: number;
    chainBreakdown: Map<Chain, number>;
    dexBreakdown: Map<DEX, number>;
    poolOpportunities: PoolOpportunity[];
    bestOpportunity: PoolOpportunity | null;
    topOpportunities: PoolOpportunity[];
    chainStatus: Map<Chain, ChainStatus>;
    rebalanceTrigger: RebalanceTrigger | null;
    rebalanceActions: RebalanceAction[];
    selectedRebalance: RebalanceAction | null;
    executionResults: RebalanceExecutionResult[];
    pendingRebalances: string[];
    safetyChecks: SafetyCheckResult[];
    isPaused: boolean;
    pauseReason?: string;
    emergencyHaltActive: boolean;
    marketAnalysis: string | null;
    aiRecommendations: string[];
    aiRiskLevel: RiskLevel;
    detectedAnomalies: Anomaly[];
    marketRegime: MarketRegime;
    currentAPRBreakdown: APRBreakdown | null;
    weightedAverageAPR: number;
    aprTrend: 'IMPROVING' | 'DECLINING' | 'STABLE';
    historicalAPR: number[];
    executionPlan: ExecutionPlan | null;
    estimatedGasCost: number;
    expectedAPRImprovement: number;
    confidence: number;
    totalRebalances: number;
    successfulRebalances: number;
    totalGasSpent: number;
    totalProfitGenerated: number;
    averageRebalanceDuration: number;
    thoughts: string[];
    errors: string[];
    warnings: string[];
    componentHealth: Map<string, ComponentHealth>;
    lastHealthCheck: Date | null;
}
/**
 * Execution plan for rebalance actions
 */
export interface ExecutionPlan {
    actions: RebalanceAction[];
    totalAmount: number;
    totalGasBudget: number;
    expectedDuration: number;
    dependencies: Map<string, string[]>;
    rollbackPlan?: RollbackPlan;
}
/**
 * Rollback plan for failed executions
 */
export interface RollbackPlan {
    canRollback: boolean;
    steps: RollbackStep[];
    estimatedGasCost: number;
}
/**
 * Individual rollback step
 */
export interface RollbackStep {
    description: string;
    chain: Chain;
    action: string;
    estimatedGas: number;
}
/**
 * Create initial state for a new cycle
 */
export declare function createInitialState(cycleNumber?: number): SafekeepingFundState;
/**
 * Update state with a partial state update
 * Ensures Maps are properly merged
 */
export declare function updateState(current: SafekeepingFundState, updates: Partial<SafekeepingFundState>): SafekeepingFundState;
/**
 * Add a thought to the state's thoughts array
 */
export declare function addThought(state: SafekeepingFundState, thought: string): SafekeepingFundState;
/**
 * Add an error to the state's errors array
 */
export declare function addError(state: SafekeepingFundState, error: string): SafekeepingFundState;
/**
 * Add a warning to the state's warnings array
 */
export declare function addWarning(state: SafekeepingFundState, warning: string): SafekeepingFundState;
/**
 * Check if state indicates a healthy condition
 */
export declare function isStateHealthy(state: SafekeepingFundState): boolean;
/**
 * Check if rebalancing should proceed
 */
export declare function shouldRebalance(state: SafekeepingFundState): boolean;
/**
 * Calculate success rate
 */
export declare function calculateSuccessRate(state: SafekeepingFundState): number;
/**
 * Get state summary for logging
 */
export declare function getStateSummary(state: SafekeepingFundState): string;
/**
 * State transition helper for moving to next step
 */
export declare function transitionTo(state: SafekeepingFundState, nextStep: string, thought?: string): SafekeepingFundState;
/**
 * Create state from previous cycle (for learning)
 */
export declare function createFromPrevious(previous: SafekeepingFundState, cycleNumber: number): SafekeepingFundState;
export type { Chain, DEX, LiquidityPosition, PoolOpportunity, RebalanceAction, RebalanceExecutionResult, ChainStatus, SafetyCheckResult, Anomaly, RiskLevel, MarketRegime, APRBreakdown, RebalanceTrigger, ComponentHealth, };
//# sourceMappingURL=state.d.ts.map