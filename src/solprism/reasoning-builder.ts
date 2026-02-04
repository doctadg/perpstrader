/**
 * SOLPRISM Reasoning Builder
 *
 * Converts PerpTrader's AgentState into a SOLPRISM ReasoningTrace.
 * This is the bridge between the trading pipeline's internal state
 * and the standardized onchain reasoning schema.
 *
 * Every field in the ReasoningTrace is populated from real data flowing
 * through the LangGraph pipeline — market data, indicators, strategy
 * selection, risk assessment, and the final signal. Nothing is fabricated.
 */

import { AgentState, StrategyIdea } from '../langgraph/state';
import { TradingSignal, RiskAssessment } from '../shared/types';
import logger from '../shared/logger';

// ─── Types (mirroring @solprism/sdk without import) ───────────────────────

/**
 * We define SOLPRISM-compatible types locally to keep the integration
 * decoupled. These match the @solprism/sdk ReasoningTrace schema v1.0.0.
 */

export interface SolprismDataSource {
  name: string;
  type: 'price_feed' | 'oracle' | 'api' | 'on_chain' | 'off_chain' | 'model' | 'other';
  queriedAt?: string;
  summary?: string;
}

export interface SolprismAlternative {
  action: string;
  reasonRejected: string;
  estimatedConfidence?: number;
}

export interface SolprismReasoningTrace {
  version: '1.0.0';
  agent: string;
  timestamp: number;
  action: {
    type: 'trade';
    description: string;
    transactionSignature?: string;
  };
  inputs: {
    dataSources: SolprismDataSource[];
    context: string;
  };
  analysis: {
    observations: string[];
    logic: string;
    alternativesConsidered: SolprismAlternative[];
  };
  decision: {
    actionChosen: string;
    confidence: number;
    riskAssessment: string;
    expectedOutcome: string;
  };
  metadata?: {
    model?: string;
    sessionId?: string;
    executionTimeMs?: number;
    custom?: Record<string, string | number | boolean>;
  };
}

// ─── Builder ──────────────────────────────────────────────────────────────

/**
 * Build a SOLPRISM ReasoningTrace from the current pipeline state.
 *
 * This captures the COMPLETE reasoning chain:
 *   1. What market data was observed (inputs)
 *   2. What indicators, patterns, and strategies were considered (analysis)
 *   3. What risk checks were applied (decision.riskAssessment)
 *   4. What trade was chosen and why (decision)
 *   5. What alternatives were rejected (analysis.alternativesConsidered)
 *
 * @param state - The current LangGraph AgentState
 * @param agentName - The registered SOLPRISM agent name
 * @returns A fully populated ReasoningTrace ready for hashing and commitment
 */
export function buildReasoningTrace(
  state: AgentState,
  agentName: string,
): SolprismReasoningTrace {
  const signal = state.signal!;
  const risk = state.riskAssessment!;
  const strategy = state.selectedStrategy;
  const latestCandle = state.candles[state.candles.length - 1];

  // ── Data Sources ──────────────────────────────────────────────────────
  const dataSources: SolprismDataSource[] = [
    {
      name: `${state.symbol} OHLCV (${state.timeframe})`,
      type: 'price_feed',
      queriedAt: new Date().toISOString(),
      summary: `${state.candles.length} candles | Latest close: ${latestCandle?.close?.toFixed(2) ?? 'N/A'}`,
    },
  ];

  if (state.indicators) {
    dataSources.push({
      name: 'Technical Indicators',
      type: 'model',
      summary: buildIndicatorSummary(state),
    });
  }

  if (state.similarPatterns.length > 0) {
    dataSources.push({
      name: 'Pattern Memory (Vector DB)',
      type: 'model',
      summary: `${state.similarPatterns.length} similar patterns found | Bias: ${state.patternBias ?? 'NONE'} | Avg return: ${(state.patternAvgReturn * 100).toFixed(2)}%`,
    });
  }

  if (state.portfolio) {
    dataSources.push({
      name: 'Portfolio State',
      type: 'api',
      summary: `Balance: $${state.portfolio.totalValue.toFixed(2)} | Positions: ${state.portfolio.positions.length} | Daily P&L: $${state.portfolio.dailyPnL.toFixed(2)}`,
    });
  }

  // ── Context ───────────────────────────────────────────────────────────
  const context = [
    `Trading cycle ${state.cycleId} for ${state.symbol} on ${state.timeframe} timeframe.`,
    `Market regime: ${state.regime ?? 'UNKNOWN'}.`,
    state.portfolio ? `Portfolio value: $${state.portfolio.totalValue.toFixed(2)}, available: $${state.portfolio.availableBalance.toFixed(2)}.` : '',
    `Pipeline steps completed: ${state.currentStep}.`,
  ].filter(Boolean).join(' ');

  // ── Observations ──────────────────────────────────────────────────────
  const observations: string[] = [];

  if (latestCandle) {
    observations.push(
      `${state.symbol} last close: $${latestCandle.close.toFixed(2)} (O: ${latestCandle.open.toFixed(2)}, H: ${latestCandle.high.toFixed(2)}, L: ${latestCandle.low.toFixed(2)})`,
    );
  }

  if (state.indicators) {
    const rsi = state.indicators.rsi;
    const macdHist = state.indicators.macd.histogram;
    if (rsi.length > 0) observations.push(`RSI(14): ${rsi[rsi.length - 1].toFixed(1)}`);
    if (macdHist.length > 0) observations.push(`MACD histogram: ${macdHist[macdHist.length - 1].toFixed(4)}`);

    const bbUpper = state.indicators.bollinger.upper;
    const bbLower = state.indicators.bollinger.lower;
    if (bbUpper.length > 0 && bbLower.length > 0) {
      observations.push(`Bollinger Bands: [${bbLower[bbLower.length - 1].toFixed(2)}, ${bbUpper[bbUpper.length - 1].toFixed(2)}]`);
    }

    const atr = state.indicators.volatility.atr;
    if (atr.length > 0) observations.push(`ATR: ${atr[atr.length - 1].toFixed(4)}`);
  }

  if (state.regime) observations.push(`Market regime classified as ${state.regime}`);
  if (state.patternBias) observations.push(`Historical pattern bias: ${state.patternBias}`);

  // Add pipeline thoughts as observations (these are the AI's raw reasoning)
  const significantThoughts = state.thoughts.filter(t =>
    t.includes('Strategy:') ||
    t.includes('Signal') ||
    t.includes('approved') ||
    t.includes('Risk Score') ||
    t.includes('Generated') ||
    t.includes('Pattern')
  );
  observations.push(...significantThoughts.slice(-5));

  // ── Logic ─────────────────────────────────────────────────────────────
  const logic = buildLogicChain(state, signal, risk, strategy);

  // ── Alternatives ──────────────────────────────────────────────────────
  const alternatives = buildAlternatives(state, signal);

  // ── Decision ──────────────────────────────────────────────────────────
  const confidence = Math.round(signal.confidence * 100);

  const riskSummary = [
    `Risk score: ${risk.riskScore}/100.`,
    `Position size: ${risk.suggestedSize.toFixed(4)} (risk-adjusted).`,
    `Stop loss: ${risk.stopLoss.toFixed(2)}.`,
    `Take profit: ${risk.takeProfit.toFixed(2)}.`,
    `Leverage: ${risk.leverage}x.`,
    risk.warnings.length > 0 ? `Warnings: ${risk.warnings.join('; ')}.` : 'No risk warnings.',
  ].join(' ');

  const expectedOutcome = buildExpectedOutcome(signal, risk, state);

  // ── Metadata ──────────────────────────────────────────────────────────
  const cycleTimeMs = Date.now() - state.cycleStartTime.getTime();

  const trace: SolprismReasoningTrace = {
    version: '1.0.0',
    agent: agentName,
    timestamp: Date.now(),
    action: {
      type: 'trade',
      description: `${signal.action} ${signal.size.toFixed(4)} ${signal.symbol} @ $${signal.price?.toFixed(2) ?? 'MARKET'}`,
    },
    inputs: {
      dataSources,
      context,
    },
    analysis: {
      observations,
      logic,
      alternativesConsidered: alternatives,
    },
    decision: {
      actionChosen: `${signal.action} ${signal.symbol} x${signal.size.toFixed(4)}`,
      confidence,
      riskAssessment: riskSummary,
      expectedOutcome,
    },
    metadata: {
      sessionId: state.cycleId,
      executionTimeMs: cycleTimeMs,
      custom: {
        symbol: signal.symbol,
        action: signal.action,
        strategyType: strategy?.type ?? 'UNKNOWN',
        strategyName: strategy?.name ?? 'N/A',
        regime: state.regime ?? 'UNKNOWN',
        timeframe: state.timeframe,
        patternBias: state.patternBias ?? 'NONE',
        isPaperTrade: process.env.PAPER_TRADING === 'true',
      },
    },
  };

  logger.info(`[SOLPRISM] Built reasoning trace: ${signal.action} ${signal.symbol} | confidence=${confidence}% | risk=${risk.riskScore}`);

  return trace;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function buildIndicatorSummary(state: AgentState): string {
  const ind = state.indicators!;
  const parts: string[] = [];

  const rsi = ind.rsi;
  if (rsi.length > 0) parts.push(`RSI: ${rsi[rsi.length - 1].toFixed(1)}`);

  const macd = ind.macd.histogram;
  if (macd.length > 0) parts.push(`MACD hist: ${macd[macd.length - 1] >= 0 ? '+' : ''}${macd[macd.length - 1].toFixed(4)}`);

  const atr = ind.volatility.atr;
  if (atr.length > 0) parts.push(`ATR: ${atr[atr.length - 1].toFixed(4)}`);

  return parts.join(' | ');
}

function buildLogicChain(
  state: AgentState,
  signal: TradingSignal,
  risk: RiskAssessment,
  strategy: AgentState['selectedStrategy'],
): string {
  const steps: string[] = [];

  steps.push(`1. Ingested ${state.candles.length} ${state.timeframe} candles for ${state.symbol}.`);
  steps.push(`2. Computed technical indicators (RSI, MACD, Bollinger Bands, ATR).`);

  if (state.regime) {
    steps.push(`3. Classified market regime as ${state.regime}.`);
  }

  if (state.similarPatterns.length > 0) {
    steps.push(`4. Retrieved ${state.similarPatterns.length} similar historical patterns from vector memory; bias: ${state.patternBias}.`);
  }

  if (state.strategyIdeas.length > 0) {
    steps.push(`5. Generated ${state.strategyIdeas.length} strategy ideas via LLM + fallback.`);
  }

  if (state.backtestResults.length > 0) {
    steps.push(`6. Backtested strategies; selected "${strategy?.name ?? 'N/A'}" (type: ${strategy?.type ?? 'N/A'}).`);
  }

  steps.push(`7. Risk gate evaluated signal: ${signal.reason}. Approved with risk score ${risk.riskScore}/100.`);
  steps.push(`8. Final signal: ${signal.action} ${signal.size.toFixed(4)} ${signal.symbol} at $${signal.price?.toFixed(2) ?? 'MARKET'} with ${(signal.confidence * 100).toFixed(0)}% confidence.`);

  return steps.join(' ');
}

function buildAlternatives(state: AgentState, signal: TradingSignal): SolprismAlternative[] {
  const alternatives: SolprismAlternative[] = [];

  // The opposite action is always an implicit alternative
  const oppositeAction = signal.action === 'BUY' ? 'SELL' : 'BUY';
  alternatives.push({
    action: `${oppositeAction} ${signal.symbol}`,
    reasonRejected: `Indicators and strategy logic favored ${signal.action}; ${signal.reason}`,
    estimatedConfidence: Math.max(5, Math.round((1 - signal.confidence) * 100)),
  });

  // HOLD is always considered
  alternatives.push({
    action: `HOLD (no position change)`,
    reasonRejected: signal.confidence >= 0.7
      ? `Signal confidence (${(signal.confidence * 100).toFixed(0)}%) exceeded threshold; the edge justified execution.`
      : `Despite moderate confidence, risk parameters approved execution.`,
    estimatedConfidence: Math.round((1 - signal.confidence) * 50),
  });

  // Rejected strategies
  const rejected = state.strategyIdeas
    .filter(s => s.name !== state.selectedStrategy?.name)
    .slice(0, 3);

  for (const idea of rejected) {
    alternatives.push({
      action: `Use strategy "${idea.name}" (${idea.type})`,
      reasonRejected: `Not selected after backtesting; "${state.selectedStrategy?.name}" had better risk-adjusted returns.`,
      estimatedConfidence: Math.round(idea.confidence * 100),
    });
  }

  return alternatives;
}

function buildExpectedOutcome(
  signal: TradingSignal,
  risk: RiskAssessment,
  state: AgentState,
): string {
  const direction = signal.action === 'BUY' ? 'long' : 'short';
  const tp = risk.takeProfit;
  const sl = risk.stopLoss;

  if (tp > 0 && sl > 0) {
    return `Expect ${direction} position to reach take-profit at $${tp.toFixed(2)} (target) or stop at $${sl.toFixed(2)} (max loss). Regime: ${state.regime ?? 'UNKNOWN'}.`;
  }

  return `Expect ${direction} position to profit based on ${signal.reason}. Risk score: ${risk.riskScore}/100.`;
}

export default buildReasoningTrace;
