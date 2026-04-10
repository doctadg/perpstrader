// =============================================================================
// Agent API Types — Request / Response interfaces for the agent control API
// =============================================================================

import {
  NewsArticle,
  NewsCategory,
  NewsSentiment,
  Position,
  TradingSignal,
  Strategy,
  PredictionPosition,
  NewsMarketLink,
} from '../shared/types';

// -----------------------------------------------------------------------------
// Shared
// -----------------------------------------------------------------------------

export type AgentName = 'news' | 'execution' | 'prediction' | 'pumpfun' | 'safekeeping' | 'research';
export type AgentStatus = 'RUNNING' | 'STOPPED' | 'ERROR' | 'STARTING' | 'STOPPING';
export type HealthLevel = 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' | 'ERROR';

// -----------------------------------------------------------------------------
// Trading Floor Control
// -----------------------------------------------------------------------------

export interface SystemStatusResponse {
  timestamp: string;
  uptime: number;
  health: HealthLevel;
  environment: string;
  version: string;
  agents: AgentStatusSummary[];
  messageBus: {
    connected: boolean;
    subscriptions: number;
  };
  cache: {
    connected: boolean;
  };
  errors: string[];
}

export interface AgentStatusSummary {
  name: AgentName;
  status: AgentStatus;
  uptime?: number;
  lastCycleTime?: string | null;
  cyclesCompleted?: number;
  error?: string | null;
}

export interface AgentsResponse {
  agents: AgentDetail[];
  timestamp: string;
}

export interface AgentDetail {
  name: AgentName;
  status: AgentStatus;
  description: string;
  config: Record<string, any>;
  lastActivity?: string | null;
  cyclesCompleted?: number;
  errorCount?: number;
  enabled: boolean;
}

export interface StartStopAgentResponse {
  success: boolean;
  agent: AgentName;
  action: 'start' | 'stop';
  message: string;
  previousStatus: AgentStatus;
  newStatus: AgentStatus;
}

export interface CycleTriggerRequest {
  symbol?: string;
  force?: boolean;
  reason?: string;
}

export interface CycleTriggerResponse {
  success: boolean;
  cycleId: string;
  message: string;
  timestamp: string;
}

// -----------------------------------------------------------------------------
// Data & Intelligence — News
// -----------------------------------------------------------------------------

export interface AgentNewsQuery {
  limit?: number;
  offset?: number;
  category?: NewsCategory | string;
  sentiment?: NewsSentiment;
  importance?: string;
  search?: string;
}

export interface AgentNewsResponse {
  articles: NewsArticle[];
  total: number;
  limit: number;
  offset: number;
  categories: Record<string, number>;
}

export interface HeatmapResponse {
  generatedAt: string;
  hours: number;
  category: string;
  totalArticles: number;
  totalClusters: number;
  clusters: HeatmapCluster[];
  byCategory: Record<string, any>;
  topMovers: HeatmapMover[];
}

export interface HeatmapCluster {
  id: string;
  title: string;
  category: string;
  heatScore: number;
  articleCount: number;
  sentimentScore: number;
  trend: 'UP' | 'DOWN' | 'NEUTRAL';
  topTags: string[];
  affectedAssets: string[];
  marketLinks?: NewsMarketLink[];
}

export interface HeatmapMover {
  symbol: string;
  name: string;
  priceChange: number;
  volume: number;
  catalysts: string[];
  sentiment: NewsSentiment;
  heatScore: number;
}

// -----------------------------------------------------------------------------
// Data & Intelligence — Signals & Predictions
// -----------------------------------------------------------------------------

export interface SignalsResponse {
  signals: TradingSignal[];
  total: number;
  generatedAt: string;
}

export interface PredictionsResponse {
  positions: PredictionPosition[];
  signals: PredictionSignalSummary[];
  totalPositions: number;
  unrealizedPnL: number;
  timestamp: string;
}

export interface PredictionSignalSummary {
  id: string;
  marketId: string;
  marketTitle: string;
  outcome: 'YES' | 'NO';
  action: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  reason: string;
  edge: number;
  timestamp: string;
}

// -----------------------------------------------------------------------------
// Portfolio Management
// -----------------------------------------------------------------------------

export interface PositionsResponse {
  positions: Position[];
  total: number;
  totalUnrealizedPnL: number;
  timestamp: string;
}

export interface PortfolioResponse {
  totalValue: number;
  availableBalance: number;
  usedBalance: number;
  dailyPnL: number;
  unrealizedPnL: number;
  exposure: {
    gross: number;
    net: number;
    long: number;
    short: number;
  };
  risk: {
    currentDrawdown: number;
    maxDrawdown: number;
    riskScore: number;
  };
  positionCount: number;
  timestamp: string;
}

export interface TradeRequest {
  symbol: string;
  side: 'BUY' | 'SELL';
  size: number;
  type?: 'MARKET' | 'LIMIT';
  price?: number;
  leverage?: number;
  reason?: string;
  strategyId?: string;
  stopLoss?: number;
  takeProfit?: number;
}

export interface TradeResponse {
  success: boolean;
  orderId?: string;
  tradeId?: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  size: number;
  filledPrice?: number;
  status: 'SUBMITTED' | 'FILLED' | 'REJECTED' | 'ERROR';
  message: string;
  riskAssessment?: {
    approved: boolean;
    riskScore: number;
    warnings: string[];
  };
}

export interface ClosePositionResponse {
  success: boolean;
  positionId: string;
  symbol: string;
  pnl?: number;
  message: string;
}

// -----------------------------------------------------------------------------
// Strategy Control
// -----------------------------------------------------------------------------

export interface StrategiesResponse {
  strategies: StrategySummary[];
  total: number;
  activeCount: number;
  timestamp: string;
}

export interface StrategySummary {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
  symbols: string[];
  performance: {
    winRate: number;
    sharpeRatio: number;
    totalPnL: number;
    totalTrades: number;
    maxDrawdown: number;
    profitFactor: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface StrategyActivateRequest {
  strategyId: string;
}

export interface StrategyActivateResponse {
  success: boolean;
  strategyId: string;
  active: boolean;
  message: string;
}

export interface StrategyDeactivateRequest {
  strategyId: string;
}

export interface StrategyDeactivateResponse {
  success: boolean;
  strategyId: string;
  active: boolean;
  message: string;
}

export interface StrategyCreateRequest {
  name: string;
  description?: string;
  type?: string;
  symbols: string[];
  timeframe?: string;
  parameters?: Record<string, any>;
  entryConditions?: string[];
  exitConditions?: string[];
  riskParameters?: {
    maxPositionSize?: number;
    stopLoss?: number;
    takeProfit?: number;
    maxLeverage?: number;
  };
}

export interface StrategyCreateResponse {
  success: boolean;
  strategyId?: string;
  message: string;
}

export interface EvolutionResponse {
  currentGeneration: number;
  totalGenerations: number;
  populationSize: number;
  bestFitness: number;
  avgFitness: number;
  topPerformers: EvolutionStrategy[];
  fitnessHistory: FitnessDataPoint[];
  timestamp: string;
}

export interface EvolutionStrategy {
  id: string;
  name: string;
  generation: number;
  fitness: number;
  sharpeRatio: number;
  winRate: number;
  pnl: number;
  mutations: string[];
}

export interface FitnessDataPoint {
  generation: number;
  bestFitness: number;
  avgFitness: number;
  populationSize: number;
  timestamp: string;
}

// -----------------------------------------------------------------------------
// Risk Management
// -----------------------------------------------------------------------------

export interface RiskResponse {
  timestamp: string;
  drawdown: {
    current: number;
    max: number;
    daily: number;
  };
  exposure: {
    gross: number;
    net: number;
    long: number;
    short: number;
    utilization: number;
  };
  circuitBreakers: CircuitBreakerInfo[];
  dailyMetrics: {
    pnl: number;
    trades: number;
    wins: number;
    losses: number;
    consecutiveLosses: number;
  };
  riskScore: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  warnings: string[];
}

export interface CircuitBreakerInfo {
  name: string;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  lastTripTime?: string;
  tripCount: number;
  resetTime?: string;
}

export interface RiskLimitsRequest {
  maxPositionSize?: number;
  maxDailyLoss?: number;
  maxLeverage?: number;
  maxDrawdownPercent?: number;
  dailyLossLimit?: number;
  consecutiveLossLimit?: number;
  maxTradesPerDay?: number;
}

export interface RiskLimitsResponse {
  success: boolean;
  previousLimits: Record<string, number>;
  newLimits: Record<string, number>;
  message: string;
}

export interface EmergencyStopResponse {
  success: boolean;
  message: string;
  positionsClosed: number;
  ordersCancelled: number;
  timestamp: string;
}

// -----------------------------------------------------------------------------
// Generic error response
// -----------------------------------------------------------------------------

export interface AgentApiError {
  error: string;
  code?: string;
  details?: string;
  timestamp: string;
}
