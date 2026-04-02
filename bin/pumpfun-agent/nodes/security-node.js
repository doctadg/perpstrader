"use strict";
// Security Node - Enhanced contract security analysis for tokens
// Now integrates RugCheck.xyz + DexScreener for comprehensive rug detection
// Checks: mint/freeze authority, RugCheck score, top holders, LP lock, insider networks,
// sell pressure, liquidity, honeypot detection, transfer fees
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
const rugcheck_service_1 = require("../services/rugcheck-service");
const dexscreener_service_1 = require("../services/dexscreener-service");
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
    const rugCheckReports = new Map();
    const rugCheckFlags = new Map();
    const rugCheckScores = new Map();
    let filteredByRugCheck = 0;
    let filteredByDexScreener = 0;
    // Analyze security with concurrency limit
    const concurrency = 5; // Reduced from 10 to respect RugCheck rate limits
    for (let i = 0; i < state.queuedTokens.length; i += concurrency) {
        const batch = state.queuedTokens.slice(i, i + concurrency);
        await Promise.allSettled(batch.map(async (item) => {
            const token = item.token || item;
            const mint = token.mintAddress;
            try {
                // ── Step 1: On-chain mint info (fast, RPC) ──────────────────
                const security = await solanaRPC.getMintInfo(mint);
                securityAnalyses.set(mint, security);
                // ── Step 2: RugCheck gate (external API, rate-limited) ───────
                const rcGate = await (0, rugcheck_service_1.rugCheckGate)(mint, token.symbol || 'UNKNOWN');
                if (!rcGate.pass) {
                    filteredByRugCheck++;
                    logger_1.default.warn(`[SecurityNode] RUGCHECK BLOCKED ${token.symbol || mint.slice(0, 8)}: ${rcGate.reason}`);
                    // Escalate risk level
                    securityAnalyses.set(mint, {
                        ...security,
                        riskLevel: 'HIGH',
                    });
                    if (rcGate.report) {
                        rugCheckReports.set(mint, rcGate.report);
                    }
                    return;
                }
                // ── Step 3: DexScreener gate (market data) ──────────────────
                const dsGate = await (0, dexscreener_service_1.dexScreenerGate)(mint, token.symbol || 'UNKNOWN');
                if (!dsGate.pass) {
                    filteredByDexScreener++;
                    logger_1.default.warn(`[SecurityNode] DEXSCREENER BLOCKED ${token.symbol || mint.slice(0, 8)}: ${dsGate.reason}`);
                    securityAnalyses.set(mint, {
                        ...security,
                        riskLevel: 'HIGH',
                    });
                    return;
                }
                // ── Step 4: If RugCheck had data, store it for scoring ──────
                if (rcGate.report) {
                    rugCheckReports.set(mint, rcGate.report);
                    rugCheckScores.set(mint, (0, rugcheck_service_1.rugCheckToScoreFactor)(rcGate.report));
                    rugCheckFlags.set(mint, (0, rugcheck_service_1.extractRugCheckRedFlags)(rcGate.report));
                }
            }
            catch (error) {
                logger_1.default.debug(`[SecurityNode] Failed to analyze ${token.symbol}: ${error}`);
                securityAnalyses.set(mint, {
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
    logger_1.default.info(`[SecurityNode] Analyzed ${securityAnalyses.size} tokens ` +
        `(H:${highRisk} M:${mediumRisk} L:${lowRisk}) | ` +
        `RugCheck blocked: ${filteredByRugCheck} | ` +
        `DexScreener blocked: ${filteredByDexScreener} | ` +
        `RugCheck enriched: ${rugCheckReports.size}`);
    return {
        ...(0, state_1.addThought)(state, `Security: ${lowRisk} low, ${mediumRisk} medium, ${highRisk} high risk | ` +
            `RugCheck blocked ${filteredByRugCheck}, DexScreener blocked ${filteredByDexScreener}`),
        ...(0, state_1.updateStep)(state, 'SECURITY_ANALYZED'),
        thoughts: [
            ...state.thoughts,
            `Security: ${lowRisk} low risk, ${mediumRisk} medium, ${highRisk} high risk`,
            `RugCheck filtered: ${filteredByRugCheck} tokens | DexScreener filtered: ${filteredByDexScreener} tokens`,
        ],
    };
}
var state_2 = require("../state");
Object.defineProperty(exports, "addThought", { enumerable: true, get: function () { return state_2.addThought; } });
Object.defineProperty(exports, "updateStep", { enumerable: true, get: function () { return state_2.updateStep; } });
//# sourceMappingURL=security-node.js.map