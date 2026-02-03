"use strict";
// Cleanup Node - Finalize cycle and publish events
// Publishes results to Redis message bus and finalizes state
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateStep = exports.addThought = void 0;
exports.cleanupNode = cleanupNode;
const logger_1 = __importDefault(require("../../shared/logger"));
const state_1 = require("../state");
/**
 * Cleanup and publish results
 */
async function cleanupNode(state) {
    logger_1.default.info('[CleanupNode] Finalizing cycle');
    // Update stats
    const updatedState = (0, state_1.updateStats)(state);
    // Publish high confidence tokens to message bus
    await publishHighConfidenceTokens(updatedState.highConfidenceTokens);
    // Publish cycle complete event
    await publishCycleComplete(updatedState);
    const summary = buildCycleSummary(updatedState);
    return {
        ...(0, state_1.addThought)(updatedState, `Cycle complete: ${summary}`),
        ...(0, state_1.updateStep)(updatedState, 'CYCLE_COMPLETE'),
    };
}
/**
 * Publish high confidence tokens to message bus
 */
async function publishHighConfidenceTokens(tokens) {
    if (tokens.length === 0) {
        return;
    }
    try {
        // Import message bus (TypeScript module)
        const messageBus = (await Promise.resolve().then(() => __importStar(require('../../shared/message-bus')))).default;
        // Ensure connected
        if (!messageBus.isConnected) {
            await messageBus.connect();
        }
        // Publish each high confidence token
        for (const token of tokens) {
            await messageBus.publish('pumpfun:high:confidence', {
                mintAddress: token.token.mintAddress,
                symbol: token.token.symbol,
                name: token.token.name,
                overallScore: token.overallScore,
                recommendation: token.recommendation,
                rationale: token.rationale,
            });
        }
        logger_1.default.info(`[CleanupNode] Published ${tokens.length} high confidence tokens`);
    }
    catch (error) {
        logger_1.default.warn('[CleanupNode] Failed to publish high confidence tokens:', error);
    }
}
/**
 * Publish cycle complete event
 */
async function publishCycleComplete(state) {
    try {
        const messageBus = (await Promise.resolve().then(() => __importStar(require('../../shared/message-bus')))).default;
        if (!messageBus.isConnected) {
            await messageBus.connect();
        }
        await messageBus.publish('pumpfun:cycle:complete', {
            cycleId: state.cycleId,
            stats: state.stats,
            highConfidenceCount: state.highConfidenceTokens.length,
        });
        logger_1.default.info('[CleanupNode] Published cycle complete event');
    }
    catch (error) {
        logger_1.default.warn('[CleanupNode] Failed to publish cycle complete:', error);
    }
}
/**
 * Build cycle summary string
 */
function buildCycleSummary(state) {
    const tokens = state.analyzedTokens.length;
    const highConf = state.highConfidenceTokens.length;
    const avgScore = state.stats.averageScore.toFixed(2);
    const byRec = state.stats.byRecommendation;
    const breakdown = `STRONG_BUY:${byRec.STRONG_BUY} BUY:${byRec.BUY} HOLD:${byRec.HOLD} AVOID:${byRec.AVOID} STRONG_AVOID:${byRec.STRONG_AVOID}`;
    return `${tokens} analyzed, ${highConf} high confidence, avg ${avgScore} (${breakdown})`;
}
var state_2 = require("../state");
Object.defineProperty(exports, "addThought", { enumerable: true, get: function () { return state_2.addThought; } });
Object.defineProperty(exports, "updateStep", { enumerable: true, get: function () { return state_2.updateStep; } });
//# sourceMappingURL=cleanup-node.js.map