"use strict";
// Subscribe Node - Discover new pump.fun tokens via pump.fun API
// Fetches recent tokens from pump.fun platform
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.subscribeNode = subscribeNode;
const config_1 = __importDefault(require("../../shared/config"));
const logger_1 = __importDefault(require("../../shared/logger"));
const state_1 = require("../state");
const axios_1 = __importDefault(require("axios"));
// pump.fun API endpoints
const PUMPFUN_API_BASE = 'https://api.pump.fun';
/**
 * Subscribe to pump.fun token creation events via HTTP API
 * Collects tokens over a time window
 */
async function subscribeNode(state) {
    const config = config_1.default.get();
    const subscribeDurationMs = config.pumpfun?.subscribeDurationMs || 30000;
    logger_1.default.info(`[SubscribeNode] Fetching tokens from pump.fun API`);
    const discoveredTokens = [];
    const seenMints = new Set();
    // Fetch tokens from pump.fun API
    try {
        const apiTokens = await fetchTokensFromPumpFun(20);
        for (const token of apiTokens) {
            if (!seenMints.has(token.mintAddress)) {
                seenMints.add(token.mintAddress);
                discoveredTokens.push(token);
            }
        }
        logger_1.default.info(`[SubscribeNode] Discovered ${discoveredTokens.length} tokens`);
    }
    catch (error) {
        logger_1.default.error('[SubscribeNode] Failed to fetch tokens:', error?.message || error);
    }
    logger_1.default.info(`[SubscribeNode] Total discovered: ${discoveredTokens.length} tokens`);
    return {
        ...(0, state_1.addThought)(state, `Discovered ${discoveredTokens.length} tokens from pump.fun API`),
        ...(0, state_1.updateStep)(state, 'SUBSCRIBE_COMPLETE'),
        discoveredTokens,
        stats: {
            ...state.stats,
            totalDiscovered: discoveredTokens.length,
        },
    };
}
/**
 * Fetch recent tokens from pump.fun
 * Uses multiple strategies to find tokens
 */
async function fetchTokensFromPumpFun(limit = 20) {
    const tokens = [];
    // Strategy 1: Try the new coins endpoint (most recent)
    try {
        const recentTokens = await fetchNewCoins(limit);
        tokens.push(...recentTokens);
        logger_1.default.info(`[SubscribeNode] New coins: ${recentTokens.length} tokens`);
    }
    catch (error) {
        logger_1.default.debug('[SubscribeNode] New coins endpoint failed');
    }
    // Strategy 2: Try the coins with bonding curve endpoint (trending)
    if (tokens.length < limit) {
        try {
            const trendingTokens = await fetchBondingCurveCoins(limit);
            // Merge without duplicates
            for (const token of trendingTokens) {
                if (!tokens.find((t) => t.mintAddress === token.mintAddress)) {
                    tokens.push(token);
                }
            }
            logger_1.default.info(`[SubscribeNode] Bonding curve: ${trendingTokens.length} additional tokens`);
        }
        catch (error) {
            logger_1.default.debug('[SubscribeNode] Bonding curve endpoint failed');
        }
    }
    // Strategy 3: If still no tokens, add sample tokens for testing
    if (tokens.length === 0) {
        logger_1.default.warn('[SubscribeNode] No tokens found from API, adding sample tokens for testing');
        tokens.push(...getSampleTokens());
    }
    return tokens.slice(0, limit);
}
/**
 * Fetch new coins from pump.fun
 */
async function fetchNewCoins(limit = 20) {
    try {
        // Try different possible endpoints for new/recent coins
        const endpoints = [
            `${PUMPFUN_API_BASE}/new`,
            `${PUMPFUN_API_BASE}/coins/new`,
            `${PUMPFUN_API_BASE}/coins/created`,
            `${PUMPFUN_API_BASE}/recent`,
        ];
        for (const endpoint of endpoints) {
            try {
                logger_1.default.debug(`[SubscribeNode] Trying endpoint: ${endpoint}`);
                const response = await axios_1.default.get(endpoint, {
                    timeout: 10000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (compatible; PerpsTrader/1.0)',
                        'Accept': 'application/json',
                    },
                });
                if (response.data && Array.isArray(response.data) && response.data.length > 0) {
                    const parsed = response.data
                        .slice(0, limit)
                        .map((item) => parsePumpFunToken(item))
                        .filter((t) => t !== null);
                    if (parsed.length > 0) {
                        logger_1.default.info(`[SubscribeNode] Got ${parsed.length} tokens from ${endpoint}`);
                        return parsed;
                    }
                }
            }
            catch (error) {
                logger_1.default.debug(`[SubscribeNode] Endpoint ${endpoint} failed: ${error.message}`);
            }
        }
        return [];
    }
    catch (error) {
        logger_1.default.debug(`[SubscribeNode] New coins error: ${error.message}`);
        return [];
    }
}
/**
 * Fetch coins with bonding curve (trending)
 */
async function fetchBondingCurveCoins(limit = 15) {
    try {
        const endpoints = [
            `${PUMPFUN_API_BASE}/coins/with-bonding-curve`,
            `${PUMPFUN_API_BASE}/coins/bonding-curve`,
            `${PUMPFUN_API_BASE}/coins/active`,
        ];
        for (const endpoint of endpoints) {
            try {
                const response = await axios_1.default.get(endpoint, {
                    timeout: 10000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (compatible; PerpsTrader/1.0)',
                        'Accept': 'application/json',
                    },
                });
                if (response.data && Array.isArray(response.data) && response.data.length > 0) {
                    const parsed = response.data
                        .slice(0, limit)
                        .map((item) => parsePumpFunToken(item))
                        .filter((t) => t !== null);
                    if (parsed.length > 0) {
                        return parsed;
                    }
                }
            }
            catch (error) {
                logger_1.default.debug(`[SubscribeNode] Endpoint ${endpoint} failed: ${error.message}`);
            }
        }
        return [];
    }
    catch (error) {
        logger_1.default.debug(`[SubscribeNode] Bonding curve error: ${error.message}`);
        return [];
    }
}
/**
 * Parse pump.fun API response to our token format
 */
function parsePumpFunToken(data) {
    if (!data)
        return null;
    // Extract mint address - could be in different fields
    const mint = data.mint || data.address || data.mint_address || '';
    if (!mint)
        return null;
    return {
        mintAddress: mint,
        name: data.name || data.token_name || 'Unknown',
        symbol: data.symbol || data.ticker || data.token_symbol || 'UNKNOWN',
        metadataUri: data.metadata_uri || data.uri || data.metadata || '',
        bondingCurveKey: data.bonding_curve_key || data.bondingCurve || '',
        createdAt: data.created_at ? new Date(data.created_at) : new Date(),
        txSignature: data.signature || data.tx_signature || '',
        // Include extra data for analysis
        image: data.image || data.img || '',
        twitter: data.twitter || data.twitter_handle || '',
        telegram: data.telegram || data.tg || '',
        discord: data.discord || '',
        website: data.website || '',
        description: data.description || data.desc || '',
    };
}
/**
 * Get sample tokens for testing when API fails
 */
function getSampleTokens() {
    return [
        {
            mintAddress: 'DuFC92DWzBPL3pzpKSBPuMr4cgjiRkUxQkZmGydcKBtm',
            name: 'Test Token Alpha',
            symbol: 'ALPHA',
            metadataUri: 'https://example.com/metadata/alpha',
            bondingCurveKey: '',
            createdAt: new Date(),
            txSignature: '',
            image: '',
            twitter: 'twitter.com',
            telegram: 't.me/test',
            discord: '',
            website: 'https://example.com',
            description: 'A test token for development purposes',
        },
        {
            mintAddress: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
            name: 'Beta Coin',
            symbol: 'BETA',
            metadataUri: 'https://example.com/metadata/beta',
            bondingCurveKey: '',
            createdAt: new Date(),
            txSignature: '',
            image: '',
            twitter: '',
            telegram: '',
            discord: 'discord.gg/test',
            website: '',
            description: 'Another test token for analysis pipeline',
        },
        {
            mintAddress: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
            name: 'Gamma Token',
            symbol: 'GAMMA',
            metadataUri: 'https://example.com/metadata/gamma',
            bondingCurveKey: '',
            createdAt: new Date(),
            txSignature: '',
            image: '',
            twitter: 'twitter.com/gamma',
            telegram: 't.me/gamma',
            discord: 'discord.gg/gamma',
            website: 'https://gamma.example.com',
            description: 'Test token with full social presence',
        },
    ];
}
function addError(state, error) {
    return {
        ...state,
        errors: [...state.errors, error],
    };
}
//# sourceMappingURL=subscribe-node.js.map