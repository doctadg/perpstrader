// Prediction Markets Orchestrator

import { PredictionAgentState, createInitialPredictionState } from './state';
import {
  marketDataNode,
  newsContextNode,
  theorizerNode,
  backtesterNode,
  ideaSelectorNode,
  riskGateNode,
  executorNode,
  learnerNode,
} from './nodes';
import predictionStore from '../data/prediction-store';
import predictionExecutionEngine from './execution-engine';
import logger from '../shared/logger';

export { PredictionAgentState, createInitialPredictionState };

function updateStatus(state: PredictionAgentState, status: 'RUNNING' | 'IDLE' | 'ERROR') {
  const portfolio = predictionExecutionEngine.getPortfolio();
  predictionStore.updateAgentStatus({
    status,
    currentCycleId: state.cycleId,
    currentStep: state.currentStep,
    lastUpdate: new Date(),
    lastCycleStart: state.cycleStartTime,
    lastCycleEnd: status === 'IDLE' || status === 'ERROR' ? new Date() : null,
    lastTradeId: state.executionResult?.id || null,
    lastTradeAt: state.executionResult?.timestamp || null,
    activeMarkets: state.activeMarkets.length,
    openPositions: portfolio.positions.length,
    metadata: {
      selectedMarket: state.selectedIdea?.marketTitle,
      tradeOutcome: state.executionResult?.outcome,
      portfolio: {
        totalValue: portfolio.totalValue,
        availableBalance: portfolio.availableBalance,
        realizedPnL: portfolio.realizedPnL,
        unrealizedPnL: portfolio.unrealizedPnL,
      },
    },
  });
}

export class PredictionOrchestrator {
  async invoke(initialState: PredictionAgentState): Promise<PredictionAgentState> {
    let state = { ...initialState };
    updateStatus(state, 'RUNNING');

    try {
      logger.info(`[PredictionOrchestrator] Starting prediction cycle ${state.cycleId}`);

      state = { ...state, ...await marketDataNode(state) };
      updateStatus(state, 'RUNNING');

      if (state.activeMarkets.length === 0) {
        return {
          ...state,
          currentStep: 'NO_MARKETS',
        };
      }

      state = { ...state, ...await newsContextNode(state) };
      updateStatus(state, 'RUNNING');

      state = { ...state, ...await theorizerNode(state) };
      updateStatus(state, 'RUNNING');

      state = { ...state, ...await backtesterNode(state) };
      updateStatus(state, 'RUNNING');

      state = { ...state, ...await ideaSelectorNode(state) };
      updateStatus(state, 'RUNNING');

      state = { ...state, ...await riskGateNode(state) };
      updateStatus(state, 'RUNNING');

      if (state.shouldExecute && state.signal && state.riskAssessment?.approved) {
        state = { ...state, ...await executorNode(state) };
        updateStatus(state, 'RUNNING');

        if (state.executionResult) {
          state = { ...state, ...await learnerNode(state) };
          updateStatus(state, 'RUNNING');
        }
      } else {
        logger.info('[PredictionOrchestrator] Skipping execution (no approved signal)');
      }

      updateStatus(state, 'IDLE');
      return state;
    } catch (error) {
      logger.error('[PredictionOrchestrator] Cycle failed:', error);
      updateStatus(state, 'ERROR');
      return {
        ...state,
        errors: [...state.errors, `Orchestrator error: ${error}`],
        currentStep: 'ERROR',
      };
    }
  }
}

const orchestrator = new PredictionOrchestrator();

export function buildPredictionGraph(): PredictionOrchestrator {
  return orchestrator;
}

export async function runPredictionCycle(): Promise<PredictionAgentState> {
  logger.info('[PredictionOrchestrator] Starting prediction cycle');

  const initialState = createInitialPredictionState();
  const result = await orchestrator.invoke(initialState);

  logger.info(`[PredictionOrchestrator] Cycle completed. Ideas: ${result.ideas.length}, Errors: ${result.errors.length}`);
  return result;
}

export default buildPredictionGraph;
