"use strict";
// Safekeeping Fund System - Learning Node
// Learns from execution results and updates strategy
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.learningNode = learningNode;
exports.calculateCycleScore = calculateCycleScore;
exports.getLearningSummary = getLearningSummary;
const logger_1 = __importDefault(require("../../shared/logger"));
/**
 * Learning Node
 * Analyzes execution results and updates learning metrics
 */
async function learningNode(state) {
    logger_1.default.info('[Learning] Analyzing execution results');
    try {
        if (state.executionResults.length === 0) {
            return {
                currentStep: 'LEARNING_SKIP',
                thoughts: [...state.thoughts, 'No execution results to learn from'],
            };
        }
        // Analyze results
        const analysis = analyzeExecutionResults(state.executionResults);
        // Update metrics
        const updatedMetrics = updateMetrics(state, analysis);
        // Generate insights
        const insights = generateInsights(state, analysis);
        logger_1.default.info(`[Learning] Cycle complete. Success: ${analysis.successRate.toFixed(0)}%, ` +
            `Total Gas: $${analysis.totalGasCost.toFixed(2)}, Duration: ${analysis.avgDuration}ms`);
        return {
            currentStep: 'LEARNING_COMPLETE',
            ...updatedMetrics,
            thoughts: [
                ...state.thoughts,
                `Learning: ${insights.successful.length} successful, ${insights.failed.length} failed`,
                ...insights.recommendations,
            ],
        };
    }
    catch (error) {
        logger_1.default.error(`[Learning] Failed: ${error}`);
        return {
            currentStep: 'LEARNING_ERROR',
            errors: [...state.errors, `Learning failed: ${error}`],
        };
    }
}
/**
 * Analyze execution results
 */
function analyzeExecutionResults(results) {
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;
    const successRate = results.length > 0 ? successCount / results.length : 0;
    const totalGasCost = results.reduce((sum, r) => sum + (r.gasCost || 0), 0);
    const avgDuration = results.length > 0
        ? results.reduce((sum, r) => sum + r.duration, 0) / results.length
        : 0;
    const totalAmount = results.reduce((sum, r) => sum + (r.actualAmount || 0), 0);
    const errors = results
        .filter(r => r.error)
        .map(r => r.error || 'Unknown error');
    return {
        successCount,
        failureCount,
        successRate,
        totalGasCost,
        avgDuration,
        totalAmount,
        errors,
    };
}
/**
 * Update learning metrics
 */
function updateMetrics(state, analysis) {
    const updates = {
        totalRebalances: state.totalRebalances + state.executionResults.length,
        totalGasSpent: state.totalGasSpent + analysis.totalGasCost,
        averageRebalanceDuration: state.averageRebalanceDuration > 0
            ? (state.averageRebalanceDuration + analysis.avgDuration) / 2
            : analysis.avgDuration,
    };
    // Update success count based on execution results
    if (analysis.successRate === 1) {
        updates.successfulRebalances = state.successfulRebalances + 1;
    }
    // Estimate profit (simplified - would calculate actual PnL)
    const estimatedProfit = analysis.totalAmount * 0.01; // Assume 1% profit
    updates.totalProfitGenerated = state.totalProfitGenerated + estimatedProfit;
    return updates;
}
/**
 * Generate insights from execution
 */
function generateInsights(state, analysis) {
    const successful = [];
    const failed = [];
    const recommendations = [];
    // Analyze successes
    if (analysis.successCount > 0) {
        successful.push(`${analysis.successCount} action(s) executed successfully`);
    }
    // Analyze failures
    for (const error of analysis.errors) {
        failed.push(`Execution failed: ${error}`);
    }
    // Generate recommendations
    if (analysis.totalGasCost > 50) {
        recommendations.push('Consider reducing rebalance frequency due to high gas costs');
    }
    if (analysis.avgDuration > 60000) {
        recommendations.push('Execution time is high - consider optimizing transaction batching');
    }
    if (analysis.successRate < 0.5) {
        recommendations.push('Low success rate detected - review safety checks and error handling');
    }
    if (state.totalEffectiveAPR < 5 && state.bestOpportunity?.effectiveAPR && state.bestOpportunity.effectiveAPR > 10) {
        recommendations.push(`Current APR (${state.totalEffectiveAPR.toFixed(2)}%) significantly below best available (${state.bestOpportunity.effectiveAPR.toFixed(2)}%)`);
    }
    if (recommendations.length === 0) {
        recommendations.push('System operating within normal parameters');
    }
    return { successful, failed, recommendations };
}
/**
 * Calculate performance score for the cycle
 */
function calculateCycleScore(state) {
    let score = 0.5; // Base score
    // APR improvement bonus
    if (state.bestOpportunity && state.totalEffectiveAPR > 0) {
        const aprRatio = state.totalEffectiveAPR / state.bestOpportunity.effectiveAPR;
        score += Math.max(0, 1 - aprRatio) * 0.2;
    }
    // Execution success bonus
    const successRate = state.executionResults.length > 0
        ? state.executionResults.filter(r => r.success).length / state.executionResults.length
        : 1;
    score += successRate * 0.2;
    // Low gas cost bonus
    const avgGas = state.executionResults.length > 0
        ? state.executionResults.reduce((sum, r) => sum + (r.gasCost || 0), 0) / state.executionResults.length
        : 0;
    score += Math.max(0, (20 - avgGas) / 20) * 0.1;
    return Math.min(1, score);
}
/**
 * Get learning summary for logging
 */
function getLearningSummary(state) {
    return `
Learning Summary
================
Total Rebalances: ${state.totalRebalances}
Success Rate: ${state.totalRebalances > 0 ? ((state.successfulRebalances / state.totalRebalances) * 100).toFixed(1) : 0}%
Total Gas Spent: $${state.totalGasSpent.toFixed(2)}
Total Profit: $${state.totalProfitGenerated.toFixed(2)}
Avg Duration: ${state.averageRebalanceDuration.toFixed(0)}ms
Current APR: ${state.totalEffectiveAPR.toFixed(2)}%
`.trim();
}
//# sourceMappingURL=learning.js.map