// Safekeeping Fund System - Agent State
// State management for the LangGraph-based safekeeping fund agent

import type {
  Chain,
  DEX,
  LiquidityPosition,
  PoolOpportunity,
  RebalanceAction,
  RebalanceExecutionResult,
  ChainStatus,
  SafetyCheckResult,
  Anomaly,
  RiskLevel,
  MarketRegime,
  APRBreakdown,
  RebalanceTrigger,
  ComponentHealth,
} from './types';

/**
 * Safekeeping Fund Agent State
 * Flows through all nodes in the LangGraph pipeline
 */
export interface SafekeepingFundState {
  // =========================================================================
  // CYCLE METADATA
  // =========================================================================
  cycleId: string;
  cycleStartTime: Date;
  currentStep: string;
  cycleNumber: number;

  // =========================================================================
  // PORTFOLIO STATE
  // =========================================================================
  positions: LiquidityPosition[];
  totalValue: number;
  totalEffectiveAPR: number;
  reserveBalance: number;        // Idle reserve balance
  chainBreakdown: Map<Chain, number>;
  dexBreakdown: Map<DEX, number>;

  // =========================================================================
  // MARKET OPPORTUNITIES
  // =========================================================================
  poolOpportunities: PoolOpportunity[];
  bestOpportunity: PoolOpportunity | null;
  topOpportunities: PoolOpportunity[];  // Top 5 opportunities

  // =========================================================================
  // CHAIN STATUS
  // =========================================================================
  chainStatus: Map<Chain, ChainStatus>;

  // =========================================================================
  // REBALANCING STATE
  // =========================================================================
  rebalanceTrigger: RebalanceTrigger | null;
  rebalanceActions: RebalanceAction[];
  selectedRebalance: RebalanceAction | null;
  executionResults: RebalanceExecutionResult[];
  pendingRebalances: string[];     // Action IDs pending execution

  // =========================================================================
  // SAFETY & RISK
  // =========================================================================
  safetyChecks: SafetyCheckResult[];
  isPaused: boolean;
  pauseReason?: string;
  emergencyHaltActive: boolean;

  // =========================================================================
  // AI ANALYSIS
  // =========================================================================
  marketAnalysis: string | null;
  aiRecommendations: string[];
  aiRiskLevel: RiskLevel;
  detectedAnomalies: Anomaly[];
  marketRegime: MarketRegime;

  // =========================================================================
  // APR ANALYSIS
  // =========================================================================
  currentAPRBreakdown: APRBreakdown | null;
  weightedAverageAPR: number;
  aprTrend: 'IMPROVING' | 'DECLINING' | 'STABLE';
  historicalAPR: number[];

  // =========================================================================
  // EXECUTION CONTEXT
  // =========================================================================
  executionPlan: ExecutionPlan | null;
  estimatedGasCost: number;
  expectedAPRImprovement: number;
  confidence: number;              // AI confidence in rebalance (0-1)

  // =========================================================================
  // LEARNING & METRICS
  // =========================================================================
  totalRebalances: number;
  successfulRebalances: number;
  totalGasSpent: number;
  totalProfitGenerated: number;
  averageRebalanceDuration: number;

  // =========================================================================
  // LOGGING
  // =========================================================================
  thoughts: string[];
  errors: string[];
  warnings: string[];

  // =========================================================================
  // HEALTH & MONITORING
  // =========================================================================
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
  dependencies: Map<string, string[]>;  // Action ID -> Dependencies
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
export function createInitialState(cycleNumber: number = 0): SafekeepingFundState {
  return {
    // Cycle metadata
    cycleId: crypto.randomUUID(),
    cycleStartTime: new Date(),
    currentStep: 'INIT',
    cycleNumber,

    // Portfolio state
    positions: [],
    totalValue: 0,
    totalEffectiveAPR: 0,
    reserveBalance: 0,
    chainBreakdown: new Map(),
    dexBreakdown: new Map(),

    // Market opportunities
    poolOpportunities: [],
    bestOpportunity: null,
    topOpportunities: [],

    // Chain status
    chainStatus: new Map(),

    // Rebalancing state
    rebalanceTrigger: null,
    rebalanceActions: [],
    selectedRebalance: null,
    executionResults: [],
    pendingRebalances: [],

    // Safety & risk
    safetyChecks: [],
    isPaused: false,
    pauseReason: undefined,
    emergencyHaltActive: false,

    // AI analysis
    marketAnalysis: null,
    aiRecommendations: [],
    aiRiskLevel: 'MEDIUM',
    detectedAnomalies: [],
    marketRegime: 'SIDEWAYS',

    // APR analysis
    currentAPRBreakdown: null,
    weightedAverageAPR: 0,
    aprTrend: 'STABLE',
    historicalAPR: [],

    // Execution context
    executionPlan: null,
    estimatedGasCost: 0,
    expectedAPRImprovement: 0,
    confidence: 0,

    // Learning & metrics
    totalRebalances: 0,
    successfulRebalances: 0,
    totalGasSpent: 0,
    totalProfitGenerated: 0,
    averageRebalanceDuration: 0,

    // Logging
    thoughts: [],
    errors: [],
    warnings: [],

    // Health & monitoring
    componentHealth: new Map(),
    lastHealthCheck: null,
  };
}

/**
 * Update state with a partial state update
 * Ensures Maps are properly merged
 */
export function updateState(
  current: SafekeepingFundState,
  updates: Partial<SafekeepingFundState>
): SafekeepingFundState {
  const newState = { ...current };

  // Handle Map merges with proper type handling
  for (const key of Object.keys(updates)) {
    const value = updates[key as keyof SafekeepingFundState];

    if (value instanceof Map && newState[key as keyof SafekeepingFundState] instanceof Map) {
      // Merge Maps properly - spread after converting to array
      const currentMap = newState[key as keyof SafekeepingFundState] as Map<unknown, unknown>;
      const updateMap = value as Map<unknown, unknown>;
      const mergedMap = new Map([...Array.from(currentMap.entries()), ...Array.from(updateMap.entries())]);
      (newState[key as keyof SafekeepingFundState] as Map<unknown, unknown>) = mergedMap;
    } else if (value !== undefined) {
      (newState[key as keyof SafekeepingFundState] as unknown) = value;
    }
  }

  return newState;
}

/**
 * Add a thought to the state's thoughts array
 */
export function addThought(state: SafekeepingFundState, thought: string): SafekeepingFundState {
  return {
    ...state,
    thoughts: [...state.thoughts, `[${new Date().toISOString()}] ${thought}`],
  };
}

/**
 * Add an error to the state's errors array
 */
export function addError(state: SafekeepingFundState, error: string): SafekeepingFundState {
  return {
    ...state,
    errors: [...state.errors, `[${new Date().toISOString()}] ${error}`],
  };
}

/**
 * Add a warning to the state's warnings array
 */
export function addWarning(state: SafekeepingFundState, warning: string): SafekeepingFundState {
  return {
    ...state,
    warnings: [...state.warnings, `[${new Date().toISOString()}] ${warning}`],
  };
}

/**
 * Check if state indicates a healthy condition
 */
export function isStateHealthy(state: SafekeepingFundState): boolean {
  return (
    !state.isPaused &&
    !state.emergencyHaltActive &&
    state.errors.length === 0 &&
    state.detectedAnomalies.filter(a => a.severity === 'CRITICAL').length === 0
  );
}

/**
 * Check if rebalancing should proceed
 */
export function shouldRebalance(state: SafekeepingFundState): boolean {
  return (
    isStateHealthy(state) &&
    state.selectedRebalance !== null &&
    state.safetyChecks.every(check => check.passed)
  );
}

/**
 * Calculate success rate
 */
export function calculateSuccessRate(state: SafekeepingFundState): number {
  if (state.totalRebalances === 0) return 1;
  return state.successfulRebalances / state.totalRebalances;
}

/**
 * Get state summary for logging
 */
export function getStateSummary(state: SafekeepingFundState): string {
  return `
Safekeeping Fund State Summary
===============================
Cycle ID: ${state.cycleId}
Step: ${state.currentStep}
Total Value: $${state.totalValue.toFixed(2)}
Effective APR: ${state.totalEffectiveAPR.toFixed(2)}%
Positions: ${state.positions.length}
Opportunities Found: ${state.poolOpportunities.length}
Best APR: ${state.bestOpportunity?.effectiveAPR.toFixed(2) || 0}%
Paused: ${state.isPaused}
Errors: ${state.errors.length}
Thoughts: ${state.thoughts.length}
`.trim();
}

/**
 * State transition helper for moving to next step
 */
export function transitionTo(
  state: SafekeepingFundState,
  nextStep: string,
  thought?: string
): SafekeepingFundState {
  let newState = {
    ...state,
    currentStep: nextStep,
  };

  if (thought) {
    newState = addThought(newState, thought);
  }

  return newState;
}

/**
 * Create state from previous cycle (for learning)
 */
export function createFromPrevious(
  previous: SafekeepingFundState,
  cycleNumber: number
): SafekeepingFundState {
  const newState = createInitialState(cycleNumber);

  // Preserve historical data
  newState.historicalAPR = [...previous.historicalAPR];
  if (previous.totalEffectiveAPR > 0) {
    newState.historicalAPR.push(previous.totalEffectiveAPR);
    // Keep only last 100 data points
    if (newState.historicalAPR.length > 100) {
      newState.historicalAPR = newState.historicalAPR.slice(-100);
    }
  }

  // Preserve cumulative metrics
  newState.totalRebalances = previous.totalRebalances;
  newState.successfulRebalances = previous.successfulRebalances;
  newState.totalGasSpent = previous.totalGasSpent;
  newState.totalProfitGenerated = previous.totalProfitGenerated;

  return newState;
}

// Re-export types for convenience
export type {
  Chain,
  DEX,
  LiquidityPosition,
  PoolOpportunity,
  RebalanceAction,
  RebalanceExecutionResult,
  ChainStatus,
  SafetyCheckResult,
  Anomaly,
  RiskLevel,
  MarketRegime,
  APRBreakdown,
  RebalanceTrigger,
  ComponentHealth,
};
