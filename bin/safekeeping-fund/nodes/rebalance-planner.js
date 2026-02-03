"use strict";
// Safekeeping Fund System - Rebalance Planner Node
// Plans and prioritizes rebalance actions based on APR analysis and AI recommendations
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.rebalancePlannerNode = rebalancePlannerNode;
exports.calculateOptimalAllocation = calculateOptimalAllocation;
const logger_1 = __importDefault(require("../../shared/logger"));
const constants_1 = require("../constants");
/**
 * Rebalance Planner Node
 * Generates rebalance actions based on opportunities and market conditions
 */
async function rebalancePlannerNode(state) {
    logger_1.default.info('[RebalancePlanner] Planning rebalance actions');
    try {
        // Determine if rebalancing should occur
        const trigger = await evaluateRebalanceTrigger(state);
        if (!trigger.shouldRebalance) {
            logger_1.default.info('[RebalancePlanner] No rebalance triggered');
            return {
                currentStep: 'REBALANCE_PLANNER_SKIP',
                rebalanceTrigger: trigger,
                thoughts: [
                    ...state.thoughts,
                    `Rebalance not triggered: ${trigger.reason}`,
                ],
            };
        }
        // Generate rebalance actions
        const actions = await generateRebalanceActions(state);
        // Select the best action
        const selectedAction = selectBestAction(actions, state);
        logger_1.default.info(`[RebalancePlanner] Generated ${actions.length} actions. ` +
            `Selected: ${selectedAction?.type || 'none'} (${selectedAction?.reason || 'N/A'})`);
        return {
            currentStep: 'REBALANCE_PLANNER_COMPLETE',
            rebalanceTrigger: trigger,
            rebalanceActions: actions,
            selectedRebalance: selectedAction,
            executionPlan: selectedAction ? buildExecutionPlan(selectedAction, state) : null,
            thoughts: [
                ...state.thoughts,
                `Rebalance triggered: ${trigger.reason}`,
                `Generated ${actions.length} potential actions`,
                selectedAction ? `Selected: ${selectedAction.type} for ${selectedAction.percentage * 100}% of portfolio` : 'No action selected',
            ],
        };
    }
    catch (error) {
        logger_1.default.error(`[RebalancePlanner] Failed: ${error}`);
        return {
            currentStep: 'REBALANCE_PLANNER_ERROR',
            errors: [...state.errors, `Rebalance planner failed: ${error}`],
        };
    }
}
/**
 * Evaluate if rebalancing should be triggered
 */
async function evaluateRebalanceTrigger(state) {
    const currentAPR = state.totalEffectiveAPR;
    const bestAPR = state.bestOpportunity?.effectiveAPR || 0;
    const aprDelta = bestAPR - currentAPR;
    // Check 1: Significant APR improvement available
    if (aprDelta > constants_1.DEFAULT_SAFETY_LIMITS.minAPRImprovement) {
        return {
            shouldRebalance: true,
            reason: `APR improvement available: ${aprDelta.toFixed(2)}% (${currentAPR.toFixed(2)}% -> ${bestAPR.toFixed(2)}%)`,
            urgency: aprDelta > 5 ? 'HIGH' : 'MEDIUM',
            estimatedImprovement: aprDelta,
            timestamp: new Date(),
        };
    }
    // Check 2: Critical anomalies detected
    const criticalAnomalies = state.detectedAnomalies.filter(a => a.severity === 'CRITICAL');
    if (criticalAnomalies.length > 0) {
        return {
            shouldRebalance: true,
            reason: `Critical anomalies detected: ${criticalAnomalies.map(a => a.type).join(', ')}`,
            urgency: 'CRITICAL',
            timestamp: new Date(),
        };
    }
    // Check 3: Portfolio is empty (first deployment)
    if (state.positions.length === 0 && state.poolOpportunities.length > 0) {
        return {
            shouldRebalance: true,
            reason: 'Initial deployment - portfolio is empty',
            urgency: 'MEDIUM',
            estimatedImprovement: bestAPR,
            timestamp: new Date(),
        };
    }
    // Check 4: Scheduled rebalance time (if configured)
    const now = new Date();
    const hour = now.getUTCHours();
    if (hour === 2 && state.positions.length > 0) {
        // 2 AM UTC - low activity period
        if (aprDelta > 0.2) {
            return {
                shouldRebalance: true,
                reason: 'Scheduled daily rebalance (2 AM UTC)',
                urgency: 'LOW',
                estimatedImprovement: aprDelta,
                timestamp: new Date(),
            };
        }
    }
    return {
        shouldRebalance: false,
        reason: `No rebalance trigger conditions met (APR delta: ${aprDelta.toFixed(2)}%)`,
        urgency: 'LOW',
        timestamp: new Date(),
    };
}
/**
 * Generate rebalance actions
 */
async function generateRebalanceActions(state) {
    const actions = [];
    // Action 1: Initial deployment if no positions
    if (state.positions.length === 0 && state.bestOpportunity) {
        actions.push({
            id: crypto.randomUUID(),
            type: 'MINT',
            toPool: state.bestOpportunity,
            percentage: 1.0, // Deploy 100%
            amount: state.totalValue || 10000, // Default or configured amount
            estimatedGas: state.bestOpportunity.estimatedGasCost,
            expectedImprovement: state.bestOpportunity.effectiveAPR,
            priority: 'MEDIUM',
            reason: 'Initial deployment to best pool',
            timestamp: new Date(),
        });
        return actions;
    }
    // Action 2: Reallocate to better pool
    if (state.bestOpportunity && state.positions.length > 0) {
        const currentAPR = state.totalEffectiveAPR;
        const bestAPR = state.bestOpportunity.effectiveAPR;
        const improvement = bestAPR - currentAPR;
        if (improvement > constants_1.DEFAULT_SAFETY_LIMITS.minAPRImprovement) {
            // Find the worst position to exit
            const worstPosition = findWorstPosition(state.positions);
            if (worstPosition) {
                actions.push({
                    id: crypto.randomUUID(),
                    type: 'REALLOCATE',
                    fromPool: {
                        chain: worstPosition.chain,
                        dex: worstPosition.dex,
                        address: worstPosition.poolAddress,
                        token0: worstPosition.token0,
                        token1: worstPosition.token1,
                        feeTier: worstPosition.feeTier,
                        tvl: worstPosition.totalValue,
                        volume24h: 0,
                        feeAPR: worstPosition.effectiveAPR,
                        effectiveAPR: worstPosition.effectiveAPR,
                        compositeScore: 0,
                        riskScore: 0.5,
                        liquidity: worstPosition.totalValue,
                        estimatedGasCost: 10,
                        impermanentLossRisk: 0.05,
                        lastUpdated: worstPosition.lastUpdated,
                    },
                    toPool: state.bestOpportunity,
                    percentage: Math.min(0.5, worstPosition.totalValue / state.totalValue),
                    amount: worstPosition.totalValue,
                    estimatedGas: worstPosition.totalValue * 0.01 + state.bestOpportunity.estimatedGasCost,
                    expectedImprovement: improvement,
                    priority: improvement > 5 ? 'HIGH' : 'MEDIUM',
                    reason: `Reallocate from ${worstPosition.effectiveAPR.toFixed(2)}% to ${bestAPR.toFixed(2)}% APR`,
                    timestamp: new Date(),
                });
            }
        }
    }
    // Action 3: Collect fees from profitable positions
    for (const position of state.positions) {
        if (position.totalValue > 100) {
            actions.push({
                id: crypto.randomUUID(),
                type: 'COLLECT',
                percentage: 0,
                amount: position.totalValue * 0.1, // Collect 10% of position
                estimatedGas: 5,
                expectedImprovement: 0,
                priority: 'LOW',
                reason: `Collect fees from ${position.poolAddress}`,
                timestamp: new Date(),
            });
        }
    }
    return actions;
}
/**
 * Find the worst performing position
 */
function findWorstPosition(positions) {
    if (positions.length === 0) {
        throw new Error('No positions available');
    }
    return positions.reduce((worst, current) => current.effectiveAPR < worst.effectiveAPR ? current : worst);
}
/**
 * Select the best action from candidates
 */
function selectBestAction(actions, state) {
    if (actions.length === 0) {
        return null;
    }
    // Filter out actions that don't pass basic checks
    const validActions = actions.filter(action => {
        // Check size limits
        if (action.amount > constants_1.DEFAULT_SAFETY_LIMITS.maxTradeSize) {
            logger_1.default.warn(`[RebalancePlanner] Action ${action.id} exceeds max trade size`);
            return false;
        }
        // Check if we have enough value
        if (action.amount > state.totalValue) {
            logger_1.default.warn(`[RebalancePlanner] Action ${action.id} exceeds total value`);
            return false;
        }
        return true;
    });
    if (validActions.length === 0) {
        return null;
    }
    // Sort by priority and expected improvement
    validActions.sort((a, b) => {
        const priorityScore = { URGENT: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
        const priorityDiff = priorityScore[b.priority] - priorityScore[a.priority];
        if (priorityDiff !== 0) {
            return priorityDiff;
        }
        return b.expectedImprovement - a.expectedImprovement;
    });
    return validActions[0];
}
/**
 * Build execution plan for a selected action
 */
function buildExecutionPlan(action, state) {
    return {
        actions: [action],
        totalAmount: action.amount,
        totalGasBudget: action.estimatedGas * 1.5, // 50% buffer
        expectedDuration: 120000, // 2 minutes
        dependencies: new Map(),
    };
}
/**
 * Calculate optimal allocation across top pools
 */
function calculateOptimalAllocation(opportunities, totalValue, maxPositions = 3) {
    const allocations = new Map();
    const topPools = opportunities.slice(0, maxPositions);
    if (topPools.length === 0) {
        return allocations;
    }
    // Weight by composite score
    const totalScore = topPools.reduce((sum, p) => sum + p.compositeScore, 0);
    for (const pool of topPools) {
        const percentage = pool.compositeScore / totalScore;
        const amount = totalValue * percentage;
        allocations.set(pool.address, amount);
    }
    return allocations;
}
//# sourceMappingURL=rebalance-planner.js.map