"use strict";
// Security Node - Analyze contract security for tokens
// Checks mint authority, freeze authority, and other security parameters
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
exports.securityNode = securityNode;
const logger_1 = __importDefault(require("../../shared/logger"));
const state_1 = require("../state");
/**
 * Analyze contract security for all queued tokens
 */
async function securityNode(state) {
    if (state.queuedTokens.length === 0) {
        logger_1.default.warn('[SecurityNode] No tokens to analyze');
        return {
            ...(0, state_1.addThought)(state, 'No tokens to analyze'),
            ...(0, state_1.updateStep)(state, 'NO_TOKENS'),
        };
    }
    logger_1.default.info(`[SecurityNode] Analyzing security for ${state.queuedTokens.length} tokens`);
    // Import Solana RPC service
    let solanaRPC;
    try {
        solanaRPC = (await Promise.resolve().then(() => __importStar(require('../services/solana-rpc')))).default;
    }
    catch (error) {
        logger_1.default.error('[SecurityNode] Failed to import Solana RPC service');
        return {
            ...(0, state_1.addThought)(state, 'Failed to import Solana RPC service'),
            ...(0, state_1.updateStep)(state, 'ERROR'),
        };
    }
    const securityAnalyses = new Map();
    // Analyze security with concurrency limit
    const concurrency = 10;
    for (let i = 0; i < state.queuedTokens.length; i += concurrency) {
        const batch = state.queuedTokens.slice(i, i + concurrency);
        await Promise.allSettled(batch.map(async (item) => {
            const token = item.token || item;
            try {
                const security = await solanaRPC.getMintInfo(token.mintAddress);
                securityAnalyses.set(token.mintAddress, security);
            }
            catch (error) {
                logger_1.default.debug(`[SecurityNode] Failed to analyze ${token.symbol}: ${error}`);
                // Return high-risk default on error
                securityAnalyses.set(token.mintAddress, {
                    mintAuthority: null,
                    freezeAuthority: null,
                    decimals: 0,
                    supply: 0n,
                    isMintable: false,
                    isFreezable: false,
                    metadataHash: '',
                    riskLevel: 'HIGH',
                });
            }
        }));
    }
    // Calculate security statistics
    let highRisk = 0;
    let mediumRisk = 0;
    let lowRisk = 0;
    for (const security of securityAnalyses.values()) {
        if (security.riskLevel === 'HIGH')
            highRisk++;
        else if (security.riskLevel === 'MEDIUM')
            mediumRisk++;
        else
            lowRisk++;
    }
    logger_1.default.info(`[SecurityNode] Analyzed ${securityAnalyses.size} tokens (H:${highRisk} M:${mediumRisk} L:${lowRisk})`);
    return {
        ...(0, state_1.addThought)(state, `Security analysis: ${lowRisk} low, ${mediumRisk} medium, ${highRisk} high risk`),
        ...(0, state_1.updateStep)(state, 'SECURITY_ANALYZED'),
        thoughts: [
            ...state.thoughts,
            `Security: ${lowRisk} low risk, ${mediumRisk} medium, ${highRisk} high risk`,
        ],
    };
}
var state_2 = require("../state");
Object.defineProperty(exports, "addThought", { enumerable: true, get: function () { return state_2.addThought; } });
Object.defineProperty(exports, "updateStep", { enumerable: true, get: function () { return state_2.updateStep; } });
//# sourceMappingURL=security-node.js.map