"use strict";
// Store Node - Persist analyzed tokens to database
// Stores token analysis results in SQLite database
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateStep = exports.addThought = void 0;
exports.storeNode = storeNode;
const logger_1 = __importDefault(require("../../shared/logger"));
const pumpfun_store_1 = __importDefault(require("../../data/pumpfun-store"));
const state_1 = require("../state");
/**
 * Store analyzed tokens to database
 */
async function storeNode(state) {
    if (state.analyzedTokens.length === 0) {
        logger_1.default.warn('[StoreNode] No tokens to store');
        return {
            ...(0, state_1.addThought)(state, 'No tokens to store'),
            ...(0, state_1.updateStep)(state, 'NO_TOKENS'),
            storedCount: 0,
            duplicateCount: 0,
        };
    }
    logger_1.default.info(`[StoreNode] Storing ${state.analyzedTokens.length} tokens to database`);
    try {
        // Ensure database is initialized
        await pumpfun_store_1.default.initialize();
        // Store all tokens
        const result = pumpfun_store_1.default.storeTokens(state.analyzedTokens);
        logger_1.default.info(`[StoreNode] Stored ${result.stored} tokens, ${result.duplicates} duplicates`);
        return {
            ...(0, state_1.addThought)(state, `Stored ${result.stored} tokens, ${result.duplicates} were duplicates`),
            ...(0, state_1.updateStep)(state, 'STORE_COMPLETE'),
            storedCount: result.stored,
            duplicateCount: result.duplicates,
            stats: {
                ...state.stats,
                totalStored: (state.stats.totalStored || 0) + result.stored,
                totalDuplicates: (state.stats.totalDuplicates || 0) + result.duplicates,
            },
        };
    }
    catch (error) {
        logger_1.default.error('[StoreNode] Failed to store tokens:', error);
        return {
            ...(0, state_1.addThought)(state, `Failed to store tokens: ${error}`),
            ...addError(state, `Storage failed: ${error}`),
            ...(0, state_1.updateStep)(state, 'ERROR'),
            storedCount: 0,
            duplicateCount: 0,
        };
    }
}
function addError(state, error) {
    return {
        ...state,
        errors: [...state.errors, error],
    };
}
var state_2 = require("../state");
Object.defineProperty(exports, "addThought", { enumerable: true, get: function () { return state_2.addThought; } });
Object.defineProperty(exports, "updateStep", { enumerable: true, get: function () { return state_2.updateStep; } });
//# sourceMappingURL=store-node.js.map