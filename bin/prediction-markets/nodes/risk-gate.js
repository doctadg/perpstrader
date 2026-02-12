"use strict";
// Prediction Market Risk Gate Node (Hardened)
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.riskGateNode = riskGateNode;
const execution_engine_1 = __importDefault(require("../execution-engine"));
const risk_manager_1 = __importDefault(require("../risk-manager"));
const logger_1 = __importDefault(require("../../shared/logger"));
async function riskGateNode(state) {
    logger_1.default.info('[PredictionRiskGate] Evaluating risk with comprehensive checks');
    const portfolio = state.portfolio || execution_engine_1.default.getPortfolio();
    // Check emergency stop first
    if (risk_manager_1.default.isEmergencyStop()) {
        logger_1.default.error('[PredictionRiskGate] 🚨 EMERGENCY STOP IS ACTIVE - rejecting all trades');
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
    const opposing = portfolio.positions.find(position => position.marketId === state.selectedIdea?.marketId && position.outcome !== state.selectedIdea?.outcome);
    let action = 'BUY';
    let outcome = state.selectedIdea.outcome;
    let reason = state.selectedIdea.rationale;
    if (opposing) {
        action = 'SELL';
        outcome = opposing.outcome;
        reason = 'Reduce opposing position before new entry';
    }
    // Use comprehensive risk manager for assessment
    const riskAssessment = risk_manager_1.default.assessTrade(state.selectedIdea, portfolio.totalValue, portfolio.availableBalance, portfolio.positions);
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
    logger_1.default.info({
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
exports.default = riskGateNode;
//# sourceMappingURL=risk-gate.js.map