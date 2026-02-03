"use strict";
// Fetch Metadata Node - Fetch token metadata for discovered tokens
// Gets detailed metadata from pump.fun API or Metaplex
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
exports.fetchMetadataNode = fetchMetadataNode;
const logger_1 = __importDefault(require("../../shared/logger"));
const state_1 = require("../state");
/**
 * Fetch metadata for all discovered tokens
 */
async function fetchMetadataNode(state) {
    if (state.discoveredTokens.length === 0) {
        logger_1.default.warn('[FetchMetadataNode] No tokens to fetch metadata for');
        return {
            ...(0, state_1.addThought)(state, 'No tokens to fetch metadata for'),
            ...(0, state_1.updateStep)(state, 'NO_TOKENS'),
        };
    }
    logger_1.default.info(`[FetchMetadataNode] Fetching metadata for ${state.discoveredTokens.length} tokens`);
    // Import services
    let solanaRPC;
    try {
        solanaRPC = (await Promise.resolve().then(() => __importStar(require('../services/solana-rpc')))).default;
    }
    catch (error) {
        logger_1.default.error('[FetchMetadataNode] Failed to import Solana RPC service');
        return {
            ...(0, state_1.addThought)(state, 'Failed to import Solana RPC service'),
            ...(0, state_1.updateStep)(state, 'ERROR'),
        };
    }
    const tokensWithMetadata = [];
    // Fetch metadata for each token (with concurrency limit)
    const concurrency = 5;
    for (let i = 0; i < state.discoveredTokens.length; i += concurrency) {
        const batch = state.discoveredTokens.slice(i, i + concurrency);
        const results = await Promise.allSettled(batch.map(async (token) => {
            try {
                const metadata = await solanaRPC.getTokenMetadata(token.mintAddress);
                return {
                    token,
                    metadata: metadata || {
                        name: token.name,
                        symbol: token.symbol,
                        description: '',
                        image: '',
                    },
                };
            }
            catch (error) {
                logger_1.default.debug(`[FetchMetadataNode] Failed to fetch metadata for ${token.symbol}: ${error}`);
                return {
                    token,
                    metadata: {
                        name: token.name,
                        symbol: token.symbol,
                        description: '',
                        image: '',
                    },
                };
            }
        }));
        for (const result of results) {
            if (result.status === 'fulfilled' && result.value.metadata) {
                tokensWithMetadata.push(result.value);
            }
        }
    }
    logger_1.default.info(`[FetchMetadataNode] Fetched metadata for ${tokensWithMetadata.length} tokens`);
    return {
        ...(0, state_1.addThought)(state, `Fetched metadata for ${tokensWithMetadata.length}/${state.discoveredTokens.length} tokens`),
        ...(0, state_1.updateStep)(state, 'METADATA_FETCHED'),
        queuedTokens: tokensWithMetadata.map((t) => ({ ...t.token, metadata: t.metadata })),
    };
}
// Re-export addThought and updateStep for other nodes
var state_2 = require("../state");
Object.defineProperty(exports, "addThought", { enumerable: true, get: function () { return state_2.addThought; } });
Object.defineProperty(exports, "updateStep", { enumerable: true, get: function () { return state_2.updateStep; } });
//# sourceMappingURL=fetch-metadata-node.js.map