// Executor Node
// Executes approved trading signals

import { AgentState } from '../state';
import executionEngine from '../../execution-engine/execution-engine';
import logger from '../../shared/logger';

/**
 * Executor Node
 * Executes approved trading signals through the execution engine
 */
export async function executorNode(state: AgentState): Promise<Partial<AgentState>> {
    logger.info(`[ExecutorNode] Executing signal for ${state.signal?.symbol}`);

    if (!state.signal || !state.riskAssessment || !state.shouldExecute) {
        return {
            currentStep: 'EXECUTION_SKIPPED',
            executionResult: null,
            shouldLearn: false,
            thoughts: [...state.thoughts, 'No signal to execute'],
        };
    }

    try {
        const signal = state.signal;
        const riskAssessment = state.riskAssessment;

        logger.info(`[ExecutorNode] Executing: ${signal.action} ${signal.symbol} x${signal.size.toFixed(4)}`);

        // Execute through execution engine
        const trade = await executionEngine.executeSignal(signal, riskAssessment);
        const shouldLearn = trade.status === 'FILLED';

        const isPaperTrade = !executionEngine.isConfigured() || process.env.PAPER_TRADING === 'true';
        const modeLabel = isPaperTrade ? '[PAPER]' : '[LIVE]';

        logger.info(
            `${modeLabel} Trade result: ${trade.side} ${trade.size} ${trade.symbol} @ ${trade.price} (${trade.status})`
        );

        return {
            currentStep: 'EXECUTION_COMPLETE',
            executionResult: trade,
            shouldLearn,
            thoughts: [
                ...state.thoughts,
                `${modeLabel} Executed: ${trade.side} ${trade.size.toFixed(4)} ${trade.symbol} @ ${trade.price.toFixed(2)} (${trade.status})`,
                `Trade ID: ${trade.id}`,
                `Status: ${trade.status}`,
            ],
        };
    } catch (error) {
        logger.error('[ExecutorNode] Execution failed:', error);
        return {
            currentStep: 'EXECUTION_ERROR',
            executionResult: null,
            shouldLearn: false,
            errors: [...state.errors, `Execution error: ${error}`],
        };
    }
}

export default executorNode;
