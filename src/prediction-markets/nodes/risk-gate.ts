// Prediction Market Risk Gate Node (Hardened)

import { PredictionAgentState } from '../state';
import predictionExecutionEngine from '../execution-engine';
import riskManager from '../risk-manager';
import logger from '../../shared/logger';
import { PredictionRiskAssessment } from '../../shared/types';

export async function riskGateNode(state: PredictionAgentState): Promise<Partial<PredictionAgentState>> {
  logger.info('[PredictionRiskGate] Evaluating risk with comprehensive checks');

  const portfolio = state.portfolio || predictionExecutionEngine.getPortfolio();

  // Check emergency stop first
  if (riskManager.isEmergencyStop()) {
    logger.error('[PredictionRiskGate] 🚨 EMERGENCY STOP IS ACTIVE - rejecting all trades');
    return {
      currentStep: 'RISK_GATE_EMERGENCY_STOP',
      signal: null,
      riskAssessment: {
        approved: false,
        suggestedSizeUsd: 0,
        riskScore: 1,
        warnings: ['EMERGENCY STOP active - all trading halted'],
        maxLossUsd: 0,
      },
      shouldExecute: false,
      portfolio,
      thoughts: [...state.thoughts, 'EMERGENCY STOP active - trading halted'],
    };
  }

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
      riskAssessment: {
        approved: false,
        suggestedSizeUsd: 0,
        riskScore: 1,
        warnings: ['Missing market price for risk evaluation'],
        maxLossUsd: 0,
      },
      shouldExecute: false,
      portfolio,
      thoughts: [...state.thoughts, 'Missing market price for risk evaluation'],
    };
  }
  const priceValue = price;

  // Check for opposing position (this logic is preserved but also handled by risk manager)
  const opposing = portfolio.positions.find(
    position => position.marketId === state.selectedIdea?.marketId && position.outcome !== state.selectedIdea?.outcome
  );

  let action: PredictionRiskAssessment['approved'] extends true ? 'BUY' | 'SELL' : never = 'BUY';
  let outcome = state.selectedIdea.outcome;
  let reason = state.selectedIdea.rationale;

  if (opposing) {
    action = 'SELL';
    outcome = opposing.outcome;
    reason = 'Reduce opposing position before new entry';
  }

  // Use comprehensive risk manager for assessment
  const riskAssessment = riskManager.assessTrade(
    state.selectedIdea,
    portfolio.totalValue,
    portfolio.availableBalance,
    portfolio.positions
  );

  // Override with opposing position logic if needed
  if (opposing && riskAssessment.approved) {
    const maxCloseSize = opposing.shares * opposing.lastPrice;
    riskAssessment.suggestedSizeUsd = Math.min(riskAssessment.suggestedSizeUsd, maxCloseSize);
  }

  const signal = {
    id: state.selectedIdea.id,
    marketId: state.selectedIdea.marketId,
    outcome,
    action,
    sizeUsd: riskAssessment.suggestedSizeUsd,
    price: priceValue,
    confidence: state.selectedIdea.confidence,
    reason,
    timestamp: new Date(),
  };

  // Log risk assessment details
  logger.info({
    event: 'RISK_ASSESSMENT',
    approved: riskAssessment.approved,
    riskScore: riskAssessment.riskScore.toFixed(2),
    suggestedSize: riskAssessment.suggestedSizeUsd.toFixed(2),
    warnings: riskAssessment.warnings,
    portfolioValue: portfolio.totalValue.toFixed(2),
    availableBalance: portfolio.availableBalance.toFixed(2),
    positionCount: portfolio.positions.length,
  }, `[PredictionRiskGate] Risk score ${(riskAssessment.riskScore * 100).toFixed(0)}%, size $${riskAssessment.suggestedSizeUsd.toFixed(2)}`);

  return {
    currentStep: riskAssessment.approved ? 'RISK_GATE_APPROVED' : 'RISK_GATE_REJECTED',
    signal,
    riskAssessment,
    shouldExecute: riskAssessment.approved,
    portfolio,
    thoughts: [
      ...state.thoughts,
      `Risk score ${(riskAssessment.riskScore * 100).toFixed(0)}%, size $${riskAssessment.suggestedSizeUsd.toFixed(2)}`,
      ...riskAssessment.warnings.map(w => `Warning: ${w}`),
    ],
  };
}

export default riskGateNode;
