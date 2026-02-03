// Prediction Market Risk Gate Node

import { PredictionAgentState } from '../state';
import predictionExecutionEngine from '../execution-engine';
import logger from '../../shared/logger';
import { PredictionRiskAssessment, PredictionSignal } from '../../shared/types';

const MAX_POSITION_PCT = Number.parseFloat(process.env.PREDICTION_MAX_POSITION_PCT || '0.05');

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export async function riskGateNode(state: PredictionAgentState): Promise<Partial<PredictionAgentState>> {
  logger.info('[PredictionRiskGate] Evaluating risk');

  const portfolio = state.portfolio || predictionExecutionEngine.getPortfolio();

  if (!state.selectedIdea || !state.shouldExecute) {
    return {
      currentStep: 'RISK_GATE_SKIPPED',
      signal: null,
      riskAssessment: null,
      shouldExecute: false,
      portfolio,
      thoughts: [...state.thoughts, 'No selected idea for risk evaluation'],
    };
  }

  const market = state.activeMarkets.find(m => m.id === state.selectedIdea?.marketId);
  const price = state.selectedIdea.outcome === 'YES' ? market?.yesPrice : market?.noPrice;

  if (typeof price !== 'number' || !Number.isFinite(price)) {
    return {
      currentStep: 'RISK_GATE_NO_PRICE',
      signal: null,
      riskAssessment: null,
      shouldExecute: false,
      portfolio,
      thoughts: [...state.thoughts, 'Missing market price for risk evaluation'],
    };
  }
  const priceValue = price;

  const maxPositionUsd = portfolio.totalValue * MAX_POSITION_PCT;
  const minSizeUsd = Math.min(10, portfolio.availableBalance);
  const suggestedSizeUsd = clamp(
    maxPositionUsd * state.selectedIdea.confidence,
    minSizeUsd,
    portfolio.availableBalance
  );

  const opposing = portfolio.positions.find(
    position => position.marketId === state.selectedIdea?.marketId && position.outcome !== state.selectedIdea?.outcome
  );

  let action: PredictionSignal['action'] = 'BUY';
  let outcome: PredictionSignal['outcome'] = state.selectedIdea.outcome;
  let sizeUsd = suggestedSizeUsd;
  let reason = state.selectedIdea.rationale;

  if (opposing) {
    action = 'SELL';
    outcome = opposing.outcome;
    sizeUsd = Math.min(opposing.shares * opposing.lastPrice, suggestedSizeUsd);
    reason = 'Reduce opposing position before new entry';
  }

  const riskAssessment: PredictionRiskAssessment = {
    approved: sizeUsd > 0 && sizeUsd <= portfolio.availableBalance,
    suggestedSizeUsd: sizeUsd,
    riskScore: clamp(1 - state.selectedIdea.confidence, 0, 1),
    warnings: sizeUsd <= 0 ? ['No available balance for prediction trade'] : [],
    maxLossUsd: sizeUsd,
  };

  const signal: PredictionSignal = {
    id: state.selectedIdea.id,
    marketId: state.selectedIdea.marketId,
    outcome,
    action,
    sizeUsd,
    price: priceValue,
    confidence: state.selectedIdea.confidence,
    reason,
    timestamp: new Date(),
  };

  return {
    currentStep: riskAssessment.approved ? 'RISK_GATE_APPROVED' : 'RISK_GATE_REJECTED',
    signal,
    riskAssessment,
    shouldExecute: riskAssessment.approved,
    portfolio,
    thoughts: [
      ...state.thoughts,
      `Risk score ${(riskAssessment.riskScore * 100).toFixed(0)}%, size $${sizeUsd.toFixed(2)}`,
    ],
  };
}

export default riskGateNode;
