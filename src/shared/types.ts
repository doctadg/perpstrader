export interface TradingSignal {
  id: string;
  symbol: string;
  action: 'BUY' | 'SELL' | 'HOLD';
  size: number;
  price?: number;
  type: 'MARKET' | 'LIMIT';
  timestamp: Date;
  confidence: number;
  strategyId: string;
  reason: string;
}

export interface Strategy {
  id: string;
  name: string;
  description: string;
  type: 'MARKET_MAKING' | 'TREND_FOLLOWING' | 'MEAN_REVERSION' | 'ARBITRAGE' | 'AI_PREDICTION';
  symbols: string[];
  timeframe: string;
  parameters: Record<string, any>;
  entryConditions: string[];
  exitConditions: string[];
  riskParameters: {
    maxPositionSize: number;
    stopLoss: number;
    takeProfit: number;
    maxLeverage: number;
  };
  isActive: boolean;
  performance: StrategyPerformance;
  createdAt: Date;
  updatedAt: Date;
}

export interface StrategyPerformance {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalPnL: number;
  sharpeRatio: number;
  maxDrawdown: number;
  averageWin: number;
  averageLoss: number;
  profitFactor: number;
}

export interface BacktestResult {
  strategyId: string;
  period: {
    start: Date;
    end: Date;
  };
  initialCapital: number;
  finalCapital: number;
  totalReturn: number;
  annualizedReturn: number;
  sharpeRatio: number;
  maxDrawdown: number;
  winRate: number;
  totalTrades: number;
  trades: Trade[];
  metrics: {
    calmarRatio: number;
    sortinoRatio: number;
    var95: number;
    beta: number;
    alpha: number;
  };
}

export interface Trade {
  id: string;
  strategyId?: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  size: number;
  price: number;
  fee: number;
  pnl?: number;
  timestamp: Date;
  type: 'MARKET' | 'LIMIT';
  status: 'FILLED' | 'PARTIAL' | 'CANCELLED';
  entryExit: 'ENTRY' | 'EXIT';
}

export interface MarketData {
  symbol: string;
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  vwap?: number;
  bid?: number;
  ask?: number;
  bidSize?: number;
  askSize?: number;
}

export interface TechnicalIndicators {
  rsi: number[];
  macd: {
    macd: number[];
    signal: number[];
    histogram: number[];
  };
  bollinger: {
    upper: number[];
    middle: number[];
    lower: number[];
  };
  sma: number[];
  ema: number[];
  volume: {
    ad: number[];
    obv: number[];
  };
  volatility: {
    atr: number[];
    standardDeviation: number[];
  };
}

export interface RiskAssessment {
  approved: boolean;
  suggestedSize: number;
  riskScore: number;
  warnings: string[];
  stopLoss: number;
  takeProfit: number;
  leverage: number;
}

export interface ResearchData {
  topic: string;
  timestamp: Date;
  searchResults: SearchResult[];
  scrapedContent: ScrapedContent[];
  insights: string[];
  sources: string[];
  confidence: number;
}

export interface SearchResult {
  title: string;
  link: string;
  snippet: string;
  position: number;
  date?: string;
  content?: string;
}

export interface ScrapedContent {
  url: string;
  title: string;
  content: string;
  metadata: Record<string, any>;
}

export interface Portfolio {
  totalValue: number;
  availableBalance: number;
  usedBalance: number;
  positions: Position[];
  dailyPnL: number;
  unrealizedPnL: number;
}

export interface Position {
  symbol: string;
  side: 'LONG' | 'SHORT';
  size: number;
  entryPrice: number;
  markPrice: number;
  unrealizedPnL: number;
  leverage: number;
  marginUsed: number;
  entryTime?: Date;  // NEW: Track when position was opened for time-based exits
}

export interface AIInsight {
  id: string;
  type: 'STRATEGY' | 'RISK' | 'MARKET' | 'PERFORMANCE' | 'paper_portfolio';
  title: string;
  description: string;
  confidence: number;
  actionable: boolean;
  timestamp: Date;
  data: Record<string, any>;
}

export interface SystemStatus {
  agent: 'RUNNING' | 'STOPPED' | 'ERROR';
  execution: 'RUNNING' | 'STOPPED' | 'ERROR';
  research: 'RUNNING' | 'STOPPED' | 'ERROR';
  data: 'RUNNING' | 'STOPPED' | 'ERROR';
  dashboard: 'RUNNING' | 'STOPPED' | 'ERROR';
  uptime: number;
  lastUpdate: Date;
  errors: string[];
}

export interface Config {
  app: {
    name: string;
    version: string;
    environment: 'development' | 'production';
    logLevel: 'debug' | 'info' | 'warn' | 'error';
  };
  hyperliquid: {
    privateKey: string;
    testnet: boolean;
    baseUrl: string;
    mainAddress?: string;
  };
  searchApi: {
    baseUrl: string;
    timeout: number;
  };
  glm: {
    apiKey: string;
    baseUrl: string;
    model: string;
    timeout: number;
  };
  openrouter: {
    apiKey: string;
    baseUrl: string;
    labelingModel: string;
    embeddingModel: string;
    timeout: number;
  };
  database: {
    type: 'sqlite' | 'postgresql';
    connection: string;
  };
  risk: {
    maxPositionSize: number;
    maxDailyLoss: number;
    maxLeverage: number;
    emergencyStop: boolean;
  };
  trading: {
    symbols: string[];
    timeframes: string[];
    strategies: string[];
  };
  solana?: {
    rpcUrl?: string;
    wsUrl?: string;
    commitment?: 'processed' | 'confirmed' | 'finalized';
  };
  pumpfun?: {
    subscribeDurationMs?: number;
    minScoreThreshold?: number;
    cycleIntervalMs?: number;
    weights?: {
      website?: number;
      social?: number;
      security?: number;
      glm?: number;
    };
  };
}

export type NewsCategory = 'CRYPTO' | 'STOCKS' | 'ECONOMICS' | 'GEOPOLITICS' | 'TECH' | 'COMMODITIES' | 'SPORTS' | 'FOOTBALL' | 'BASKETBALL' | 'TENNIS' | 'MMA' | 'GOLF';

export type NewsImportance = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type NewsSentiment = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

export interface NewsItem {
  id: string;
  title: string;
  content?: string;
  summary?: string;
  source: string;
  url: string;
  publishedAt?: Date;
  categories: NewsCategory[];
  tags: string[];
  sentiment: NewsSentiment;
  importance: NewsImportance;
  snippet: string;
  scrapedAt: Date;
  createdAt: Date;
  marketLinks?: NewsMarketLink[];
  metadata?: Record<string, any>;
}

export interface NewsArticle {
  id: string;
  title: string;
  content: string;
  source: string;
  url: string;
  publishedAt?: Date;
  categories: NewsCategory[];
  tags: string[];
  sentiment: NewsSentiment;
  importance: NewsImportance;
  snippet: string;
  summary: string;
  scrapedAt: Date;
  createdAt: Date;
  marketLinks?: NewsMarketLink[];
  metadata?: Record<string, any>;
}

export interface NewsSearchQuery {
  category: NewsCategory;
  queries: string[];
}

export interface NewsStats {
  total: number;
  byCategory: Record<NewsCategory, number>;
  byImportance: Record<NewsImportance, number>;
  bySentiment: Record<NewsSentiment, number>;
  latestArticle: Date | null;
  totalTags: number;
}

export interface NewsMarketLink {
  marketId: string;
  marketSlug?: string;
  marketTitle: string;
  score: number;
  source: 'KEYWORD' | 'LLM' | 'MANUAL';
  matchedTerms?: string[];
}

export interface PredictionOutcome {
  id?: string;
  name: string;
  price: number;
}

export interface PredictionMarket {
  id: string;
  slug?: string;
  title: string;
  category?: string;
  status: 'OPEN' | 'CLOSED' | 'RESOLVED' | 'UNKNOWN';
  outcomes: PredictionOutcome[];
  yesPrice?: number;
  noPrice?: number;
  volume?: number;
  volume24hr?: number;
  volume1wk?: number;
  volume1mo?: number;
  volume1yr?: number;
  liquidity?: number;
  closeTime?: Date | null;
  source?: 'POLYMARKET';
  updatedAt: Date;
  metadata?: Record<string, any>;
}

export interface PredictionMarketSnapshot {
  marketId: string;
  timestamp: Date;
  yesPrice: number | null;
  noPrice: number | null;
  volume?: number | null;
  liquidity?: number | null;
}

export interface PredictionIdea {
  id: string;
  marketId: string;
  marketTitle: string;
  outcome: 'YES' | 'NO';
  impliedProbability: number;
  predictedProbability: number;
  edge: number;
  confidence: number;
  timeHorizon: string;
  catalysts: string[];
  rationale: string;
}

export interface PredictionBacktestResult {
  ideaId: string;
  marketId: string;
  period: { start: Date; end: Date };
  totalReturn: number;
  averageReturn: number;
  winRate: number;
  maxDrawdown: number;
  tradesSimulated: number;
  sharpeRatio: number;
}

export interface PredictionSignal {
  id: string;
  marketId: string;
  outcome: 'YES' | 'NO';
  action: 'BUY' | 'SELL' | 'HOLD';
  sizeUsd: number;
  price: number;
  confidence: number;
  reason: string;
  timestamp: Date;
}

export interface PredictionRiskAssessment {
  approved: boolean;
  suggestedSizeUsd: number;
  riskScore: number;
  warnings: string[];
  maxLossUsd: number;
}

export interface PredictionTrade {
  id: string;
  marketId: string;
  marketTitle: string;
  outcome: 'YES' | 'NO';
  side: 'BUY' | 'SELL';
  shares: number;
  price: number;
  fee: number;
  pnl?: number;
  timestamp: Date;
  status: 'FILLED' | 'CANCELLED';
  reason?: string;
}

export interface PredictionPosition {
  marketId: string;
  marketTitle: string;
  outcome: 'YES' | 'NO';
  shares: number;
  averagePrice: number;
  lastPrice: number;
  unrealizedPnL: number;
  openedAt: Date;
}

export interface PredictionPortfolio {
  totalValue: number;
  availableBalance: number;
  usedBalance: number;
  realizedPnL: number;
  unrealizedPnL: number;
  positions: PredictionPosition[];
}

// ============================================================================
// ENHANCED TITLE SYSTEM TYPES
// ============================================================================

export type NumericalEntityType = 'price' | 'percentage' | 'volume' | 'amount' | 'index' | 'rate' | 'timestamp';

export interface NumericalEntity {
  type: NumericalEntityType;
  value: number;
  originalString: string;
  currency?: string;  // USD, EUR, BTC, etc.
  unit?: string;      // %, B, M, K, etc.
  context?: string;   // Surrounding text for context
}

export interface TitleMetrics {
  hasAsset: boolean;
  hasAction: boolean;
  hasNumber: boolean;
  hasReason: boolean;
  wordCount: number;
  qualityScore: number;  // 0-5 based on rubric
}

export interface TitleFormats {
  full: string;         // "BTC surges 8% to $98,500 on spot ETF approval"
  medium: string;       // "BTC surges 8% on ETF approval"
  short: string;        // "BTC surges 8%"
  ticker: string;       // "BTC +8%"
}

export interface MarketContext {
  asset: string;
  assetSymbol?: string;
  currentPrice?: number;
  priceChange24h?: number;
  volume24h?: number;
  marketCap?: number;
  relatedAssets?: string[];
}

export interface EnhancedTitle {
  original: string;
  cleaned: string;
  enhanced: string;
  formats: TitleFormats;
  metrics: TitleMetrics;
  extractedNumbers: NumericalEntity[];
  extractedEntities: string[];
  subEventType?: string;
  confidence: number;  // 0-1
}

export type SubEventType =
  | 'seizure'
  | 'approval'
  | 'launch'
  | 'hack'
  | 'sanction'
  | 'earnings'
  | 'price_surge'
  | 'price_drop'
  | 'breakout'
  | 'partnership'
  | 'listing'
  | 'delisting'
  | 'merger'
  | 'acquisition'
  | 'proposal'
  | 'ruling'
  | 'protest'
  | 'conflict'
  | 'governance'
  | 'stablecoin_peg'
  | 'liquidation_cascade'
  | 'oracle_exploit'
  | 'bridge_exploit'
  | 'smart_contract'
  | 'whale_alert'
  | 'etf_flow'
  | 'regulation'
  | 'other';

export type TimeHorizon = 'IMMEDIATE' | 'SHORT_TERM' | 'MEDIUM_TERM' | 'LONG_TERM';

export interface TimeHorizonClassification {
  horizon: TimeHorizon;
  expectedDuration?: string;  // "2-3 hours", "1-2 days", etc.
  reason: string;
}

export interface MarketImpactScore {
  score: number;             // 0-100
  affectedAssets: string[];  // ["BTC", "ETH"]
  expectedVolatility: number;
  timeToImpact?: string;
}

// ============================================================================
// pump.fun Token Analysis Types
// ============================================================================

export interface PumpFunToken {
  mintAddress: string;
  name: string;
  symbol: string;
  metadataUri: string;
  bondingCurveKey?: string;
  createdAt: Date;
  txSignature?: string;
}

export interface TokenMetadata {
  name: string;
  symbol: string;
  description: string;
  image: string;
  website?: string;
  twitter?: string;
  telegram?: string;
  discord?: string;
  extensions?: Record<string, any>;
}

export interface ContractSecurity {
  mintAuthority: string | null;
  freezeAuthority: string | null;
  decimals: number;
  supply: bigint;
  isMintable: boolean;
  isFreezable: boolean;
  metadataHash: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface WebsiteAnalysis {
  url: string;
  exists: boolean;
  hasContent: boolean;
  contentQuality: number;  // 0-1
  hasWhitepaper: boolean;
  hasTeamInfo: boolean;
  hasRoadmap: boolean;
  hasTokenomics: boolean;
  sslValid: boolean;
  ageDays?: number;
  glmAnalysis: string;
}

export interface SocialAnalysis {
  twitter: {
    exists: boolean;
    followerCount: number;
    tweetCount: number;
    createdAt?: Date;
    bio: string;
    verified: boolean;
    sentimentScore: number;  // 0-1
  };
  telegram: {
    exists: boolean;
    memberCount: number;
    isChannel: boolean;
    description: string;
  };
  discord: {
    exists: boolean;
    memberCount: number;
    inviteActive: boolean;
  };
  overallPresenceScore: number;  // 0-1
  glmAnalysis: string;
}

export type TokenRecommendation = 'STRONG_BUY' | 'BUY' | 'HOLD' | 'AVOID' | 'STRONG_AVOID';

export interface TokenAnalysis {
  id: string;
  token: PumpFunToken;
  metadata: TokenMetadata;
  security: ContractSecurity;
  website: WebsiteAnalysis;
  social: SocialAnalysis;

  // Scores
  websiteScore: number;      // 0-1
  socialScore: number;       // 0-1
  securityScore: number;     // 0-1
  overallScore: number;      // 0-1 weighted composite

  // AI Analysis
  rationale: string;
  redFlags: string[];
  greenFlags: string[];
  recommendation: TokenRecommendation;

  // Processing
  analyzedAt: Date;
  cycleId: string;
  errors: string[];
}

export interface PumpFunAgentState {
  cycleId: string;
  cycleStartTime: Date;
  currentStep: string;
  discoveredTokens: PumpFunToken[];
  queuedTokens: PumpFunToken[];
  analyzedTokens: TokenAnalysis[];
  highConfidenceTokens: TokenAnalysis[];
  storedCount: number;
  duplicateCount: number;
  thoughts: string[];
  errors: string[];
  stats: {
    totalDiscovered: number;
    totalAnalyzed: number;
    totalStored: number;
    totalDuplicates: number;
    averageScore: number;
    byRecommendation: Record<TokenRecommendation, number>;
  };
}
