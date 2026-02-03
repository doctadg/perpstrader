"use strict";
// Prediction Market Risk Gate Node
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.riskGateNode = riskGateNode;
const execution_engine_1 = __importDefault(require("../execution-engine"));
const logger_1 = __importDefault(require("../../shared/logger"));
const MAX_POSITION_PCT = Number.parseFloat(process.env.PREDICTION_MAX_POSITION_PCT || '0.05');
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
async function riskGateNode(state) {
    logger_1.default.info('[PredictionRiskGate] Evaluating risk');
    const portfolio = state.portfolio || execution_engine_1.default.getPortfolio();
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
    const suggestedSizeUsd = clamp(maxPositionUsd * state.selectedIdea.confidence, minSizeUsd, portfolio.availableBalance);
    const opposing = portfolio.positions.find(position => position.marketId === state.selectedIdea?.marketId && position.outcome !== state.selectedIdea?.outcome);
    let action = 'BUY';
    let outcome = state.selectedIdea.outcome;
    let sizeUsd = suggestedSizeUsd;
    let reason = state.selectedIdea.rationale;
    if (opposing) {
        action = 'SELL';
        outcome = opposing.outcome;
        sizeUsd = Math.min(opposing.shares * opposing.lastPrice, suggestedSizeUsd);
        reason = 'Reduce opposing position before new entry';
    }
    const riskAssessment = {
        approved: sizeUsd > 0 && sizeUsd <= portfolio.availableBalance,
        suggestedSizeUsd: sizeUsd,
        riskScore: clamp(1 - state.selectedIdea.confidence, 0, 1),
        warnings: sizeUsd <= 0 ? ['No available balance for prediction trade'] : [],
        maxLossUsd: sizeUsd,
    };
    const signal = {
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
exports.default = riskGateNode;
//# sourceMappingURL=risk-gate.js.map