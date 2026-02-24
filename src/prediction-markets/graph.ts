// Prediction Markets Orchestrator (Hardened)

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
import positionReconciler from './position-reconciler';
import riskManager from './risk-manager';
import alertingService from './alerting-service';
import logger from '../shared/logger';

export { PredictionAgentState, createInitialPredictionState };

function updateStatus(state: PredictionAgentState, status: 'RUNNING' | 'IDLE' | 'ERROR') {
  const portfolio = predictionExecutionEngine.getPortfolio();
  const selectedIntel = state.selectedIdea ? state.marketIntel[state.selectedIdea.marketId] : null;
  const intelList = Object.values(state.marketIntel || {});
  const marketsWithNews = intelList.filter(intel => intel.linkedNewsCount > 0).length;
  const marketsWithHeat = intelList.filter(intel => intel.linkedClusterCount > 0).length;
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
      marketIntel: {
        selected: selectedIntel,
        coverage: {
          marketsWithNews,
          marketsWithHeat,
        },
      },
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
  private stopLossCheckInterval: NodeJS.Timeout | null = null;
  private reconciliationInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startBackgroundTasks();
  }

  private startBackgroundTasks(): void {
    // Check stop losses every 30 seconds
    this.stopLossCheckInterval = setInterval(() => {
      this.checkStopLosses();
    }, 30000);

    // Reconcile positions every 5 minutes
    this.reconciliationInterval = setInterval(() => {
      positionReconciler.reconcile();
    }, 300000);
  }

  private async checkStopLosses(): Promise<void> {
    try {
      const exits = predictionExecutionEngine.checkStopLosses();
      
      for (const exit of exits) {
        logger.warn(`[PredictionOrchestrator] Stop loss triggered: ${exit.position.marketTitle}`);
        
        // Send alert
        await alertingService.stopLossTriggered(
          exit.position,
          exit.exitPrice,
          exit.pnl
        );

        // Execute stop loss (in real implementation)
        // For now, just log it - would need to create a sell signal
      }
    } catch (error) {
      logger.error('[PredictionOrchestrator] Stop loss check failed:', error);
    }
  }

  async invoke(initialState: PredictionAgentState): Promise<PredictionAgentState> {
    let state = { ...initialState };
    updateStatus(state, 'RUNNING');

    try {
      logger.info(`[PredictionOrchestrator] Starting prediction cycle ${state.cycleId}`);

      // Check emergency stop
      if (riskManager.isEmergencyStop()) {
        logger.error('[PredictionOrchestrator] 🚨 EMERGENCY STOP ACTIVE - skipping cycle');
        return {
          ...state,
          currentStep: 'EMERGENCY_STOP',
          errors: [...state.errors, 'Emergency stop is active'],
        };
      }

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
      
      // Send error alert
      await alertingService.error(error as Error, 'Prediction cycle');
      
      updateStatus(state, 'ERROR');
      return {
        ...state,
        errors: [...state.errors, `Orchestrator error: ${error}`],
        currentStep: 'ERROR',
      };
    }
  }

  /**
   * Trigger emergency stop - halt all trading
   */
  public triggerEmergencyStop(reason: string): void {
    riskManager.triggerEmergencyStop(reason);
    alertingService.emergencyStop(reason, predictionExecutionEngine.getPortfolio());
  }

  /**
   * Reset emergency stop
   */
  public resetEmergencyStop(): void {
    riskManager.resetEmergencyStop();
  }

  /**
   * Emergency close all positions
   */
  public async emergencyCloseAll(): Promise<void> {
    await predictionExecutionEngine.emergencyCloseAll();
  }

  /**
   * Get system health status
   */
  public getHealth(): {
    orchestrator: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
    emergencyStop: boolean;
    reconciliation: ReturnType<typeof positionReconciler.getHealth>;
    execution: ReturnType<typeof predictionExecutionEngine.getHealth>;
  } {
    return {
      orchestrator: riskManager.isEmergencyStop() ? 'CRITICAL' : 'HEALTHY',
      emergencyStop: riskManager.isEmergencyStop(),
      reconciliation: positionReconciler.getHealth(),
      execution: predictionExecutionEngine.getHealth(),
    };
  }

  /**
   * Clean up resources
   */
  public destroy(): void {
    if (this.stopLossCheckInterval) {
      clearInterval(this.stopLossCheckInterval);
    }
    if (this.reconciliationInterval) {
      clearInterval(this.reconciliationInterval);
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
