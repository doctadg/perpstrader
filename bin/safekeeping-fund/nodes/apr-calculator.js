"use strict";
// Safekeeping Fund System - APR Calculator Node
// Calculates effective APRs considering fees, impermanent loss, and gas costs
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.aprCalculatorNode = aprCalculatorNode;
exports.createAPRBreakdown = createAPRBreakdown;
const logger_1 = __importDefault(require("../../shared/logger"));
/**
 * APR Calculator Node
 * Processes raw pool data and calculates effective APRs
 */
async function aprCalculatorNode(state) {
    logger_1.default.info('[APRCalculator] Calculating effective APRs for opportunities');
    try {
        const opportunities = state.poolOpportunities;
        const processedOpportunities = [];
        for (const opportunity of opportunities) {
            // Enhance the opportunity with calculated metrics
            const enhanced = await enhanceOpportunityAPR(opportunity);
            processedOpportunities.push(enhanced);
        }
        // Sort by effective APR descending
        processedOpportunities.sort((a, b) => b.effectiveAPR - a.effectiveAPR);
        // Calculate APR trend
        const aprTrend = calculateAPRTrend(state.historicalAPR, state.totalEffectiveAPR);
        // Calculate weighted average APR of current portfolio
        const weightedAvgAPR = calculateWeightedAverageAPR(state.positions);
        logger_1.default.info(`[APRCalculator] Processed ${processedOpportunities.length} opportunities. ` +
            `Best APR: ${processedOpportunities[0]?.effectiveAPR.toFixed(2) || 0}%`);
        return {
            currentStep: 'APR_CALCULATOR_COMPLETE',
            poolOpportunities: processedOpportunities,
            topOpportunities: processedOpportunities.slice(0, 5),
            bestOpportunity: processedOpportunities[0] || null,
            weightedAverageAPR: weightedAvgAPR,
            aprTrend,
            thoughts: [
                ...state.thoughts,
                `Calculated effective APRs for ${processedOpportunities.length} pools`,
                `Current portfolio APR: ${weightedAvgAPR.toFixed(2)}% (${aprTrend})`,
                `Top opportunity APR: ${processedOpportunities[0]?.effectiveAPR.toFixed(2) || 0}%`,
            ],
        };
    }
    catch (error) {
        logger_1.default.error(`[APRCalculator] Failed: ${error}`);
        return {
            currentStep: 'APR_CALCULATOR_ERROR',
            errors: [...state.errors, `APR calculator failed: ${error}`],
        };
    }
}
/**
 * Enhance opportunity with detailed APR calculations
 */
async function enhanceOpportunityAPR(opportunity) {
    // Recalculate composite score with normalized values
    const compositeScore = calculateCompositeScore(opportunity);
    // Adjust risk score based on multiple factors
    const riskScore = adjustRiskScore(opportunity);
    return {
        ...opportunity,
        compositeScore,
        riskScore,
    };
}
/**
 * Calculate composite score for ranking opportunities
 */
function calculateCompositeScore(opportunity) {
    // Weight factors
    const APR_WEIGHT = 0.4;
    const RISK_WEIGHT = 0.3;
    const GAS_WEIGHT = 0.2;
    const LIQUIDITY_WEIGHT = 0.1;
    // Normalize APR (0-1 scale, assuming 50% max)
    const aprScore = Math.min(opportunity.effectiveAPR / 50, 1);
    // Risk score is already 0-1, invert it (lower risk = higher score)
    const riskScore = 1 - opportunity.riskScore;
    // Gas cost - lower is better (max $10 for normalization)
    const gasScore = Math.max(0, 1 - (opportunity.estimatedGasCost / 10));
    // Liquidity depth (max $10M for normalization)
    const liquidityScore = Math.min(opportunity.liquidity / 10000000, 1);
    return ((aprScore * APR_WEIGHT) +
        (riskScore * RISK_WEIGHT) +
        (gasScore * GAS_WEIGHT) +
        (liquidityScore * LIQUIDITY_WEIGHT));
}
/**
 * Adjust risk score based on multiple factors
 */
function adjustRiskScore(opportunity) {
    let risk = opportunity.riskScore;
    // Increase risk for low liquidity
    if (opportunity.tvl < 50000)
        risk += 0.15;
    else if (opportunity.tvl < 200000)
        risk += 0.05;
    // Increase risk for very high APR (likely volatile or risky)
    if (opportunity.effectiveAPR > 100)
        risk += 0.1;
    else if (opportunity.effectiveAPR > 50)
        risk += 0.05;
    // Decrease risk for stablecoin pairs
    const stablecoins = ['USDC', 'USDT', 'DAI', 'FDUSD'];
    const isStablePair = stablecoins.includes(opportunity.token0.symbol) &&
        stablecoins.includes(opportunity.token1.symbol);
    if (isStablePair)
        risk -= 0.1;
    return Math.max(0, Math.min(1, risk));
}
/**
 * Calculate APR trend based on historical data
 */
function calculateAPRTrend(historicalAPR, currentAPR) {
    if (historicalAPR.length < 3) {
        return 'STABLE';
    }
    // Calculate simple linear regression slope
    const n = historicalAPR.length;
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;
    for (let i = 0; i < n; i++) {
        sumX += i;
        sumY += historicalAPR[i];
        sumXY += i * historicalAPR[i];
        sumX2 += i * i;
    }
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    // Classify trend
    if (slope > 0.5)
        return 'IMPROVING';
    if (slope < -0.5)
        return 'DECLINING';
    return 'STABLE';
}
/**
 * Calculate weighted average APR of current positions
 */
function calculateWeightedAverageAPR(positions) {
    if (positions.length === 0)
        return 0;
    let totalValue = 0;
    let weightedAPRSum = 0;
    for (const position of positions) {
        weightedAPRSum += position.totalValue * position.effectiveAPR;
        totalValue += position.totalValue;
    }
    return totalValue > 0 ? weightedAPRSum / totalValue : 0;
}
/**
 * Create APR breakdown for a pool
 */
function createAPRBreakdown(pool) {
    // Estimate gas impact
    const gasCostAPR = pool.tvl > 0 ? (pool.estimatedGasCost / pool.tvl) * 365 : 0;
    // Estimate IL impact
    const impermanentLoss = pool.impermanentLossRisk || 0.05;
    return {
        tradingFeeAPR: pool.feeAPR,
        rewardAPR: 0,
        impermanentLoss,
        gasCostAPR,
        effectiveAPR: Math.max(0, pool.feeAPR - impermanentLoss - gasCostAPR),
    };
}
//# sourceMappingURL=apr-calculator.js.map