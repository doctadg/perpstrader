"use strict";
// Prediction Idea Selector Node
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ideaSelectorNode = ideaSelectorNode;
const logger_1 = __importDefault(require("../../shared/logger"));
const MIN_WIN_RATE = Number.parseFloat(process.env.PREDICTION_MIN_WIN_RATE || '55');
const MIN_AVG_RETURN = Number.parseFloat(process.env.PREDICTION_MIN_AVG_RETURN || '0.1');
async function ideaSelectorNode(state) {
    logger_1.default.info(`[PredictionSelector] Selecting from ${state.ideas.length} ideas`);
    if (!state.ideas.length) {
        return {
            currentStep: 'IDEA_SELECTION_NONE',
            selectedIdea: null,
            shouldExecute: false,
            thoughts: [...state.thoughts, 'No prediction ideas to select'],
        };
    }
    const backtestMap = new Map(state.backtestResults.map(result => [result.ideaId, result]));
    const scored = state.ideas.map(idea => {
        const backtest = backtestMap.get(idea.id);
        const winRate = backtest?.winRate ?? 50;
        const avgReturn = backtest?.averageReturn ?? 0;
        const sharpe = backtest?.sharpeRatio ?? 0;
        const score = (winRate * 0.6) + (avgReturn * 0.3) + (sharpe * 4 * 0.1);
        return { idea, backtest, score };
    });
    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];
    if (!best) {
        return {
            currentStep: 'IDEA_SELECTION_ERROR',
            selectedIdea: null,
            shouldExecute: false,
            thoughts: [...state.thoughts, 'Unable to score prediction ideas'],
        };
    }
    const winRate = best.backtest?.winRate ?? 50;
    const avgReturn = best.backtest?.averageReturn ?? 0;
    const eligible = winRate >= MIN_WIN_RATE && avgReturn >= MIN_AVG_RETURN;
    return {
        currentStep: eligible ? 'IDEA_SELECTED' : 'IDEA_SELECTION_HELD',
        selectedIdea: eligible ? best.idea : null,
        shouldExecute: eligible,
        thoughts: [
            ...state.thoughts,
            `Top idea: ${best.idea.marketTitle} (${best.idea.outcome})`,
            `Score ${best.score.toFixed(2)} | WinRate ${winRate.toFixed(1)}% | AvgRet ${avgReturn.toFixed(2)}%`,
            eligible ? 'Idea approved for risk check' : 'Idea held due to backtest thresholds',
        ],
    };
}
exports.default = ideaSelectorNode;
//# sourceMappingURL=idea-selector.js.map