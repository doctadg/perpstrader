"use strict";
// Cleanup Node
// Performs cleanup tasks and final statistics
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanupNode = cleanupNode;
const logger_1 = __importDefault(require("../../shared/logger"));
async function cleanupNode(state) {
    logger_1.default.info('[CleanupNode] Performing cleanup and final statistics');
    const categories = state.categories.length > 0 ? state.categories : Object.keys(state.stats.byCategory);
    const categoryLines = categories
        .map((category) => {
        const count = state.stats.byCategory[category] || 0;
        return `║  ${category.toString().padEnd(12)} ${count.toString().padEnd(38)}║`;
    })
        .join('\n');
    const summary = `
╔══════════════════════════════════════════════════════════╗
║  NEWS AGENT CYCLE SUMMARY                                  ║
╠══════════════════════════════════════════════════════════╣
║  Cycle ID:       ${state.cycleId.padEnd(38)}║
║  Duration:       ${(Date.now() - state.cycleStartTime.getTime()).toString().padEnd(38)}ms║
╠══════════════════════════════════════════════════════════╣
║  Articles Found:    ${state.stats.totalFound.toString().padEnd(38)}║
║  Articles Scraped: ${state.stats.totalScraped.toString().padEnd(38)}║
║  Articles Categorized: ${state.stats.totalCategorized.toString().padEnd(33)}║
║  Articles Stored:   ${state.stats.totalStored.toString().padEnd(38)}║
║  Duplicates:       ${state.stats.totalDuplicates.toString().padEnd(38)}║
╠══════════════════════════════════════════════════════════╣
║  By Category:                                               ║
${categoryLines}
╠══════════════════════════════════════════════════════════╣
║  Errors:         ${state.errors.length.toString().padEnd(38)}║
╚══════════════════════════════════════════════════════════╝`;
    logger_1.default.info(summary);
    return {
        currentStep: 'CYCLE_COMPLETE',
        thoughts: [
            ...state.thoughts,
            `Cycle completed: Found ${state.stats.totalFound}, Scraped ${state.stats.totalScraped}, Stored ${state.stats.totalStored}`,
        ],
    };
}
//# sourceMappingURL=cleanup-node.js.map