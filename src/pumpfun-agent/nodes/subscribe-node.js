"use strict";
// Subscribe Node - Discover new pump.fun tokens via pump.fun API
// Fetches recent tokens from pump.fun platform
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.subscribeNode = subscribeNode;
var logger_1 = require("../../shared/logger");
var state_1 = require("../state");
var axios_1 = require("axios");
// pump.fun API endpoints
var PUMPFUN_API_BASE = 'https://api.pump.fun';
var PUMPFUN_FRONTEND_API_BASE = 'https://frontend-api-v3.pump.fun';
var PUMPFUN_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (compatible; PerpsTrader/1.0)',
    'Accept': 'application/json',
    'Origin': 'https://pump.fun',
    'Referer': 'https://pump.fun/',
};
/**
 * Subscribe to pump.fun token creation events via HTTP API
 * Collects tokens over a time window
 */
function subscribeNode(state) {
    return __awaiter(this, void 0, void 0, function () {
        var discoveredTokens, seenMints, apiTokens, _i, apiTokens_1, token, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    logger_1.default.info("[SubscribeNode] Fetching tokens from pump.fun API");
                    discoveredTokens = [];
                    seenMints = new Set();
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, fetchTokensFromPumpFun(20)];
                case 2:
                    apiTokens = _a.sent();
                    for (_i = 0, apiTokens_1 = apiTokens; _i < apiTokens_1.length; _i++) {
                        token = apiTokens_1[_i];
                        if (!seenMints.has(token.mintAddress)) {
                            seenMints.add(token.mintAddress);
                            discoveredTokens.push(token);
                        }
                    }
                    logger_1.default.info("[SubscribeNode] Discovered ".concat(discoveredTokens.length, " tokens"));
                    return [3 /*break*/, 4];
                case 3:
                    error_1 = _a.sent();
                    logger_1.default.error('[SubscribeNode] Failed to fetch tokens:', (error_1 === null || error_1 === void 0 ? void 0 : error_1.message) || error_1);
                    return [3 /*break*/, 4];
                case 4:
                    logger_1.default.info("[SubscribeNode] Total discovered: ".concat(discoveredTokens.length, " tokens"));
                    return [2 /*return*/, __assign(__assign(__assign({}, (0, state_1.addThought)(state, "Discovered ".concat(discoveredTokens.length, " tokens from pump.fun API"))), (0, state_1.updateStep)(state, 'SUBSCRIBE_COMPLETE')), { discoveredTokens: discoveredTokens, stats: __assign(__assign({}, state.stats), { totalDiscovered: discoveredTokens.length }) })];
            }
        });
    });
}
/**
 * Fetch recent tokens from pump.fun
 * Uses multiple strategies to find tokens
 */
function fetchTokensFromPumpFun() {
    return __awaiter(this, arguments, void 0, function (limit) {
        var tokens, frontendTokens, error_2, recentTokens, _loop_1, _i, recentTokens_1, token, error_3, trendingTokens, _loop_2, _a, trendingTokens_1, token, error_4, allowSampleTokens;
        if (limit === void 0) { limit = 20; }
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    tokens = [];
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, fetchFrontendCoins(limit)];
                case 2:
                    frontendTokens = _b.sent();
                    tokens.push.apply(tokens, frontendTokens);
                    logger_1.default.info("[SubscribeNode] Frontend API: ".concat(frontendTokens.length, " tokens"));
                    return [3 /*break*/, 4];
                case 3:
                    error_2 = _b.sent();
                    logger_1.default.debug('[SubscribeNode] Frontend API endpoints failed');
                    return [3 /*break*/, 4];
                case 4:
                    _b.trys.push([4, 6, , 7]);
                    return [4 /*yield*/, fetchNewCoins(limit)];
                case 5:
                    recentTokens = _b.sent();
                    _loop_1 = function (token) {
                        if (!tokens.find(function (t) { return t.mintAddress === token.mintAddress; })) {
                            tokens.push(token);
                        }
                    };
                    for (_i = 0, recentTokens_1 = recentTokens; _i < recentTokens_1.length; _i++) {
                        token = recentTokens_1[_i];
                        _loop_1(token);
                    }
                    logger_1.default.info("[SubscribeNode] Legacy new coins: ".concat(recentTokens.length, " tokens"));
                    return [3 /*break*/, 7];
                case 6:
                    error_3 = _b.sent();
                    logger_1.default.debug('[SubscribeNode] New coins endpoint failed');
                    return [3 /*break*/, 7];
                case 7:
                    if (!(tokens.length < limit)) return [3 /*break*/, 11];
                    _b.label = 8;
                case 8:
                    _b.trys.push([8, 10, , 11]);
                    return [4 /*yield*/, fetchBondingCurveCoins(limit)];
                case 9:
                    trendingTokens = _b.sent();
                    _loop_2 = function (token) {
                        if (!tokens.find(function (t) { return t.mintAddress === token.mintAddress; })) {
                            tokens.push(token);
                        }
                    };
                    // Merge without duplicates
                    for (_a = 0, trendingTokens_1 = trendingTokens; _a < trendingTokens_1.length; _a++) {
                        token = trendingTokens_1[_a];
                        _loop_2(token);
                    }
                    logger_1.default.info("[SubscribeNode] Bonding curve: ".concat(trendingTokens.length, " additional tokens"));
                    return [3 /*break*/, 11];
                case 10:
                    error_4 = _b.sent();
                    logger_1.default.debug('[SubscribeNode] Bonding curve endpoint failed');
                    return [3 /*break*/, 11];
                case 11:
                    // Strategy 4: Optional sample fallback for development.
                    if (tokens.length === 0) {
                        allowSampleTokens = process.env.PUMPFUN_ALLOW_SAMPLE_TOKENS === 'true';
                        if (allowSampleTokens) {
                            logger_1.default.warn('[SubscribeNode] No tokens from API, adding sample tokens (PUMPFUN_ALLOW_SAMPLE_TOKENS=true)');
                            tokens.push.apply(tokens, getSampleTokens());
                        }
                        else {
                            logger_1.default.warn('[SubscribeNode] No tokens from API and sample fallback disabled');
                        }
                    }
                    return [2 /*return*/, tokens.slice(0, limit)];
            }
        });
    });
}
/**
 * Fetch coins from current pump.fun frontend API (v3).
 */
function fetchFrontendCoins() {
    return __awaiter(this, arguments, void 0, function (limit) {
        var endpoints, merged, seenMints, _i, endpoints_1, endpoint, response, payload, parsed, _a, parsed_1, token, error_5;
        if (limit === void 0) { limit = 20; }
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    endpoints = [
                        "".concat(PUMPFUN_FRONTEND_API_BASE, "/coins?offset=0&limit=").concat(limit),
                        "".concat(PUMPFUN_FRONTEND_API_BASE, "/coins/recommended?limit=").concat(limit),
                        "".concat(PUMPFUN_FRONTEND_API_BASE, "/coins/top-runners"),
                        "".concat(PUMPFUN_FRONTEND_API_BASE, "/coins/trending-search-v2?limit=").concat(limit),
                    ];
                    merged = [];
                    seenMints = new Set();
                    _i = 0, endpoints_1 = endpoints;
                    _b.label = 1;
                case 1:
                    if (!(_i < endpoints_1.length)) return [3 /*break*/, 6];
                    endpoint = endpoints_1[_i];
                    _b.label = 2;
                case 2:
                    _b.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, axios_1.default.get(endpoint, {
                            timeout: 10000,
                            headers: PUMPFUN_HEADERS,
                        })];
                case 3:
                    response = _b.sent();
                    payload = normalizeFrontendPayload(response.data);
                    if (payload.length > 0) {
                        parsed = payload
                            .map(function (item) { return unwrapFrontendToken(item); })
                            .slice(0, limit)
                            .map(function (item) { return parsePumpFunToken(item); })
                            .filter(function (t) { return t !== null; });
                        for (_a = 0, parsed_1 = parsed; _a < parsed_1.length; _a++) {
                            token = parsed_1[_a];
                            if (!seenMints.has(token.mintAddress)) {
                                seenMints.add(token.mintAddress);
                                merged.push(token);
                            }
                        }
                    }
                    return [3 /*break*/, 5];
                case 4:
                    error_5 = _b.sent();
                    logger_1.default.debug("[SubscribeNode] Frontend endpoint ".concat(endpoint, " failed: ").concat(error_5.message));
                    return [3 /*break*/, 5];
                case 5:
                    _i++;
                    return [3 /*break*/, 1];
                case 6: return [2 /*return*/, merged.slice(0, limit)];
            }
        });
    });
}
/**
 * Normalize frontend API payload shape to a flat array.
 */
function normalizeFrontendPayload(data) {
    if (Array.isArray(data))
        return data;
    if (Array.isArray(data === null || data === void 0 ? void 0 : data.coins))
        return data.coins;
    if (Array.isArray(data === null || data === void 0 ? void 0 : data.data))
        return data.data;
    if (Array.isArray(data === null || data === void 0 ? void 0 : data.results))
        return data.results;
    return [];
}
/**
 * Unwrap alternate frontend endpoint item shapes (e.g. { coin: {...} }).
 */
function unwrapFrontendToken(item) {
    if ((item === null || item === void 0 ? void 0 : item.coin) && typeof item.coin === 'object') {
        return __assign(__assign({}, item.coin), { description: item.description || item.coin.description || '' });
    }
    return item;
}
/**
 * Fetch new coins from pump.fun
 */
function fetchNewCoins() {
    return __awaiter(this, arguments, void 0, function (limit) {
        var endpoints, _i, endpoints_2, endpoint, response, parsed, error_6, error_7;
        if (limit === void 0) { limit = 20; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 7, , 8]);
                    endpoints = [
                        "".concat(PUMPFUN_API_BASE, "/new"),
                        "".concat(PUMPFUN_API_BASE, "/coins/new"),
                        "".concat(PUMPFUN_API_BASE, "/coins/created"),
                        "".concat(PUMPFUN_API_BASE, "/recent"),
                    ];
                    _i = 0, endpoints_2 = endpoints;
                    _a.label = 1;
                case 1:
                    if (!(_i < endpoints_2.length)) return [3 /*break*/, 6];
                    endpoint = endpoints_2[_i];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    logger_1.default.debug("[SubscribeNode] Trying endpoint: ".concat(endpoint));
                    return [4 /*yield*/, axios_1.default.get(endpoint, {
                            timeout: 10000,
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (compatible; PerpsTrader/1.0)',
                                'Accept': 'application/json',
                            },
                        })];
                case 3:
                    response = _a.sent();
                    if (response.data && Array.isArray(response.data) && response.data.length > 0) {
                        parsed = response.data
                            .slice(0, limit)
                            .map(function (item) { return parsePumpFunToken(item); })
                            .filter(function (t) { return t !== null; });
                        if (parsed.length > 0) {
                            logger_1.default.info("[SubscribeNode] Got ".concat(parsed.length, " tokens from ").concat(endpoint));
                            return [2 /*return*/, parsed];
                        }
                    }
                    return [3 /*break*/, 5];
                case 4:
                    error_6 = _a.sent();
                    logger_1.default.debug("[SubscribeNode] Endpoint ".concat(endpoint, " failed: ").concat(error_6.message));
                    return [3 /*break*/, 5];
                case 5:
                    _i++;
                    return [3 /*break*/, 1];
                case 6: return [2 /*return*/, []];
                case 7:
                    error_7 = _a.sent();
                    logger_1.default.debug("[SubscribeNode] New coins error: ".concat(error_7.message));
                    return [2 /*return*/, []];
                case 8: return [2 /*return*/];
            }
        });
    });
}
/**
 * Fetch coins with bonding curve (trending)
 */
function fetchBondingCurveCoins() {
    return __awaiter(this, arguments, void 0, function (limit) {
        var endpoints, _i, endpoints_3, endpoint, response, parsed, error_8, error_9;
        if (limit === void 0) { limit = 15; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 7, , 8]);
                    endpoints = [
                        "".concat(PUMPFUN_API_BASE, "/coins/with-bonding-curve"),
                        "".concat(PUMPFUN_API_BASE, "/coins/bonding-curve"),
                        "".concat(PUMPFUN_API_BASE, "/coins/active"),
                    ];
                    _i = 0, endpoints_3 = endpoints;
                    _a.label = 1;
                case 1:
                    if (!(_i < endpoints_3.length)) return [3 /*break*/, 6];
                    endpoint = endpoints_3[_i];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, axios_1.default.get(endpoint, {
                            timeout: 10000,
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (compatible; PerpsTrader/1.0)',
                                'Accept': 'application/json',
                            },
                        })];
                case 3:
                    response = _a.sent();
                    if (response.data && Array.isArray(response.data) && response.data.length > 0) {
                        parsed = response.data
                            .slice(0, limit)
                            .map(function (item) { return parsePumpFunToken(item); })
                            .filter(function (t) { return t !== null; });
                        if (parsed.length > 0) {
                            return [2 /*return*/, parsed];
                        }
                    }
                    return [3 /*break*/, 5];
                case 4:
                    error_8 = _a.sent();
                    logger_1.default.debug("[SubscribeNode] Endpoint ".concat(endpoint, " failed: ").concat(error_8.message));
                    return [3 /*break*/, 5];
                case 5:
                    _i++;
                    return [3 /*break*/, 1];
                case 6: return [2 /*return*/, []];
                case 7:
                    error_9 = _a.sent();
                    logger_1.default.debug("[SubscribeNode] Bonding curve error: ".concat(error_9.message));
                    return [2 /*return*/, []];
                case 8: return [2 /*return*/];
            }
        });
    });
}
/**
 * Parse pump.fun API response to our token format
 */
function parsePumpFunToken(data) {
    if (!data)
        return null;
    // Extract mint address - could be in different fields
    var mint = data.mint || data.address || data.mint_address || data.token_address || '';
    if (!mint)
        return null;
    var createdRaw = data.created_at || data.created_timestamp || data.createdAt;
    var createdAt = typeof createdRaw === 'number'
        ? new Date(createdRaw < 1e12 ? createdRaw * 1000 : createdRaw)
        : (createdRaw ? new Date(createdRaw) : new Date());
    return {
        mintAddress: mint,
        name: data.name || data.token_name || 'Unknown',
        symbol: data.symbol || data.ticker || data.token_symbol || 'UNKNOWN',
        metadataUri: data.metadata_uri || data.uri || data.metadata || '',
        bondingCurveKey: data.bonding_curve_key || data.bonding_curve || data.bondingCurve || '',
        createdAt: createdAt,
        txSignature: data.signature || data.tx_signature || '',
        // Include extra data for analysis
        image: data.image || data.image_uri || data.img || '',
        twitter: data.twitter || data.twitter_handle || data.twitter_username || data.twitter_url || '',
        telegram: data.telegram || data.telegram_url || data.tg || '',
        discord: data.discord || '',
        website: data.website || data.website_url || '',
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
    return __assign(__assign({}, state), { errors: __spreadArray(__spreadArray([], state.errors, true), [error], false) });
}
