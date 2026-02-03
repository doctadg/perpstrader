"use strict";
// Prediction Market Learner Node
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.learnerNode = learnerNode;
const logger_1 = __importDefault(require("../../shared/logger"));
async function learnerNode(state) {
    logger_1.default.info('[PredictionLearner] Updating learning state');
    if (!state.executionResult) {
        return {
            currentStep: 'LEARN_SKIPPED',
            shouldLearn: false,
            thoughts: [...state.thoughts, 'No execution result to learn from'],
        };
    }
    return {
        currentStep: 'LEARN_COMPLETE',
        shouldLearn: false,
        thoughts: [
            ...state.thoughts,
            `Logged trade outcome for ${state.executionResult.marketTitle}`,
        ],
    };
}
exports.default = learnerNode;
//# sourceMappingURL=learner.js.map