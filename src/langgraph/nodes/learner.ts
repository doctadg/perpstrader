// Learner Node
// Re-enabled with vector store for learning from trade outcomes

import { AgentState } from '../state';
import logger from '../../shared/logger';
import vectorStore from '../../data/vector-store';

/**
 * Learner Node
 * Records trade outcomes and patterns for future learning
 * This enables the system to improve over time by remembering what worked
 */
export async function learnerNode(state: AgentState): Promise<Partial<AgentState>> {
    logger.info(`[LearnerNode] Processing learning for cycle ${state.cycleId}`);

    // Check if learning should occur
    if (!state.shouldLearn) {
        return {
            currentStep: 'LEARNING_SKIPPED_NO_FLAG',
            thoughts: [...state.thoughts, 'Learning skipped: shouldLearn flag not set'],
        };
    }

    try {
        // Initialize vector store
        await vectorStore.initialize();

        const thoughts = [...state.thoughts];
        const errors = [...state.errors];
        let patternsStored = 0;
        let tradesStored = 0;

        // Store the current market pattern with outcome
        if (state.candles && state.candles.length >= 20 && state.indicators) {
            // Determine outcome based on execution result or next price movement
            let outcome: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
            let historicalReturn = 0;

            if (state.executionResult) {
                // If trade was executed, use P&L to determine outcome
                if (state.executionResult.pnl && state.executionResult.pnl !== 0) {
                    historicalReturn = state.executionResult.pnl / (state.executionResult.price * state.executionResult.size);
                    outcome = historicalReturn > 0.01 ? 'BULLISH' : historicalReturn < -0.01 ? 'BEARISH' : 'NEUTRAL';
                }
            } else if (state.candles.length >= 2) {
                // If no trade, use price movement over last few candles
                const startPrice = state.candles[0]?.close || state.candles[0]?.open || 0;
                const endPrice = state.candles[state.candles.length - 1]?.close || 0;
                historicalReturn = (endPrice - startPrice) / (startPrice || 1);
                outcome = historicalReturn > 0.005 ? 'BULLISH' : historicalReturn < -0.005 ? 'BEARISH' : 'NEUTRAL';
            }

            // Store pattern for future recall
            try {
                const patternId = await vectorStore.storePattern(
                    state.symbol,
                    state.timeframe,
                    state.candles,
                    state.indicators,
                    outcome,
                    historicalReturn,
                    state.regime || 'RANGING'
                );
                patternsStored++;
                thoughts.push(`Stored pattern ${patternId} with outcome ${outcome} (${(historicalReturn * 100).toFixed(2)}%)`);
            } catch (error) {
                const msg = `Failed to store pattern: ${error instanceof Error ? error.message : String(error)}`;
                errors.push(msg);
                logger.warn(`[LearnerNode] ${msg}`);
            }
        }

        // Store trade outcome for learning
        if (state.executionResult && state.indicators && state.candles) {
            try {
                await vectorStore.storeTradeOutcome(
                    state.selectedStrategy?.id || 'unknown',
                    state.symbol,
                    state.indicators,
                    state.candles,
                    state.executionResult.pnl || 0,
                    {
                        strategy: state.selectedStrategy?.name || 'unknown',
                        regime: state.regime || 'RANGING',
                        signal: state.signal?.action || 'NONE',
                        confidence: state.signal?.confidence || 0,
                        timestamp: new Date().toISOString(),
                    }
                );
                tradesStored++;
                thoughts.push(`Stored trade outcome: PnL $${(state.executionResult.pnl || 0).toFixed(2)}`);
            } catch (error) {
                const msg = `Failed to store trade outcome: ${error instanceof Error ? error.message : String(error)}`;
                errors.push(msg);
                logger.warn(`[LearnerNode] ${msg}`);
            }
        }

        // Get vector store statistics
        const stats = await vectorStore.getStats();

        thoughts.push(
            `Learning complete: ${patternsStored} patterns, ${tradesStored} trades stored`,
            `Vector store stats: ${stats.patterns} patterns, ${stats.trades} trades total`
        );

        logger.info(`[LearnerNode] Stored ${patternsStored} patterns, ${tradesStored} trades`);

        return {
            currentStep: 'LEARNING_COMPLETE',
            thoughts,
            errors,
        };

    } catch (error) {
        logger.error('[LearnerNode] Learning failed:', error);

        return {
            currentStep: 'LEARNING_ERROR',
            thoughts: [
                ...state.thoughts,
                `Learning failed: ${error instanceof Error ? error.message : String(error)}`,
            ],
            errors: [
                ...state.errors,
                `Learning error: ${error instanceof Error ? error.message : String(error)}`,
            ],
        };
    }
}

export default learnerNode;
