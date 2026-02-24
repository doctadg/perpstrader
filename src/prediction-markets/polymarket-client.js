"use strict";
// Polymarket client for public market data
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
Object.defineProperty(exports, "__esModule", { value: true });
var axios_1 = require("axios");
var logger_1 = require("../shared/logger");
var DEFAULT_BASE_URL = process.env.POLYMARKET_API_BASE || 'https://gamma-api.polymarket.com';
var DEFAULT_MARKETS_URL = process.env.POLYMARKET_MARKETS_URL || "".concat(DEFAULT_BASE_URL, "/markets");
var LATEST_WINDOW_DAYS = Number.parseInt(process.env.PREDICTION_MARKET_MAX_AGE_DAYS || '30', 10) || 30;
var DEFAULT_ORDER = process.env.POLYMARKET_MARKETS_ORDER || 'volume24hr';
var DEFAULT_ASCENDING = process.env.POLYMARKET_MARKETS_ASCENDING || 'false';
var DEFAULT_ACTIVE = process.env.POLYMARKET_MARKETS_ACTIVE || 'true';
var DEFAULT_CLOSED = process.env.POLYMARKET_MARKETS_CLOSED || 'false';
var DEFAULT_ARCHIVED = process.env.POLYMARKET_MARKETS_ARCHIVED || 'false';
function uniqueUrls(urls) {
    var seen = new Set();
    var result = [];
    for (var _i = 0, urls_1 = urls; _i < urls_1.length; _i++) {
        var url = urls_1[_i];
        if (seen.has(url))
            continue;
        seen.add(url);
        result.push(url);
    }
    return result;
}
function parseOutcomes(raw) {
    // Parse JSON strings if needed (Polymarket API returns stringified arrays)
    var outcomes = raw === null || raw === void 0 ? void 0 : raw.outcomes;
    var outcomePrices = raw === null || raw === void 0 ? void 0 : raw.outcomePrices;
    var clobTokenIds = raw === null || raw === void 0 ? void 0 : raw.clobTokenIds;
    if (typeof outcomes === 'string') {
        try {
            outcomes = JSON.parse(outcomes);
        }
        catch (_a) {
            outcomes = null;
        }
    }
    if (typeof outcomePrices === 'string') {
        try {
            outcomePrices = JSON.parse(outcomePrices);
        }
        catch (_b) {
            outcomePrices = null;
        }
    }
    if (typeof clobTokenIds === 'string') {
        try {
            clobTokenIds = JSON.parse(clobTokenIds);
        }
        catch (_c) {
            clobTokenIds = null;
        }
    }
    if (Array.isArray(outcomes) && Array.isArray(outcomePrices)) {
        return outcomes.map(function (name, idx) {
            var _a;
            return ({
                id: Array.isArray(clobTokenIds) ? clobTokenIds[idx] : undefined,
                name: name,
                price: Number((_a = outcomePrices[idx]) !== null && _a !== void 0 ? _a : 0),
            });
        });
    }
    if (Array.isArray(outcomes) && outcomes.length && typeof outcomes[0] === 'object') {
        return outcomes.map(function (item) {
            var _a, _b;
            return ({
                id: (item === null || item === void 0 ? void 0 : item.id) || (item === null || item === void 0 ? void 0 : item.token_id),
                name: (item === null || item === void 0 ? void 0 : item.name) || (item === null || item === void 0 ? void 0 : item.outcome) || 'UNKNOWN',
                price: Number((_b = (_a = item === null || item === void 0 ? void 0 : item.price) !== null && _a !== void 0 ? _a : item === null || item === void 0 ? void 0 : item.last_price) !== null && _b !== void 0 ? _b : 0),
            });
        });
    }
    if (Array.isArray(raw === null || raw === void 0 ? void 0 : raw.tokens)) {
        return raw.tokens.map(function (item) {
            var _a, _b;
            return ({
                id: (item === null || item === void 0 ? void 0 : item.token_id) || (item === null || item === void 0 ? void 0 : item.id),
                name: (item === null || item === void 0 ? void 0 : item.outcome) || (item === null || item === void 0 ? void 0 : item.name) || 'UNKNOWN',
                price: Number((_b = (_a = item === null || item === void 0 ? void 0 : item.price) !== null && _a !== void 0 ? _a : item === null || item === void 0 ? void 0 : item.last_price) !== null && _b !== void 0 ? _b : 0),
            });
        });
    }
    return [];
}
function inferYesNo(outcomes) {
    if (!outcomes.length)
        return {};
    var yes = outcomes.find(function (o) { return o.name.toLowerCase() === 'yes'; });
    var no = outcomes.find(function (o) { return o.name.toLowerCase() === 'no'; });
    if (yes && no) {
        return { yesPrice: yes.price, noPrice: no.price };
    }
    if (outcomes.length >= 2) {
        return { yesPrice: outcomes[0].price, noPrice: outcomes[1].price };
    }
    if (outcomes.length === 1) {
        var yesPrice = outcomes[0].price;
        if (Number.isFinite(yesPrice)) {
            return { yesPrice: yesPrice, noPrice: Math.max(0, Math.min(1, 1 - yesPrice)) };
        }
    }
    return {};
}
function normalizeStatus(raw) {
    if ((raw === null || raw === void 0 ? void 0 : raw.closed) === true || (raw === null || raw === void 0 ? void 0 : raw.archived) === true)
        return 'CLOSED';
    // Check boolean flags first (most reliable for Gamma API where status is null)
    // Note: resolvedBy is the oracle address, not an indication the market is resolved
    if ((raw === null || raw === void 0 ? void 0 : raw.closed) === false && (raw === null || raw === void 0 ? void 0 : raw.active) === true)
        return 'OPEN';
    if ((raw === null || raw === void 0 ? void 0 : raw.resolved) === true)
        return 'RESOLVED';
    if (raw === null || raw === void 0 ? void 0 : raw.status) {
        var status_1 = String(raw.status).toUpperCase();
        if (status_1.includes('OPEN'))
            return 'OPEN';
        if (status_1.includes('CLOSED'))
            return 'CLOSED';
        if (status_1.includes('RESOLVED'))
            return 'RESOLVED';
    }
    if ((raw === null || raw === void 0 ? void 0 : raw.active) === true)
        return 'OPEN';
    if ((raw === null || raw === void 0 ? void 0 : raw.active) === false)
        return 'CLOSED';
    return 'UNKNOWN';
}
function parseNumber(value) {
    var num = Number(value);
    return Number.isFinite(num) ? num : undefined;
}
function normalizeMarket(raw) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
    var id = (raw === null || raw === void 0 ? void 0 : raw.id) || (raw === null || raw === void 0 ? void 0 : raw.condition_id) || (raw === null || raw === void 0 ? void 0 : raw.marketId) || (raw === null || raw === void 0 ? void 0 : raw.market_id) || (raw === null || raw === void 0 ? void 0 : raw.slug);
    var title = (raw === null || raw === void 0 ? void 0 : raw.title) || (raw === null || raw === void 0 ? void 0 : raw.question) || (raw === null || raw === void 0 ? void 0 : raw.name) || (raw === null || raw === void 0 ? void 0 : raw.description);
    if (!id || !title)
        return null;
    var outcomes = parseOutcomes(raw);
    var _m = inferYesNo(outcomes), yesPrice = _m.yesPrice, noPrice = _m.noPrice;
    var closeTime = (raw === null || raw === void 0 ? void 0 : raw.closeTime)
        ? new Date(raw.closeTime)
        : (raw === null || raw === void 0 ? void 0 : raw.end_date)
            ? new Date(raw.end_date)
            : (raw === null || raw === void 0 ? void 0 : raw.resolutionTime)
                ? new Date(raw.resolutionTime)
                : null;
    var createdTimestamp = extractTimestamp(raw);
    var fallbackTimestamp = createdTimestamp !== null && createdTimestamp !== void 0 ? createdTimestamp : (closeTime ? closeTime.getTime() : 0);
    var updatedAt = fallbackTimestamp ? new Date(fallbackTimestamp) : new Date(0);
    var volume24hr = parseNumber((_b = (_a = raw === null || raw === void 0 ? void 0 : raw.volume24hr) !== null && _a !== void 0 ? _a : raw === null || raw === void 0 ? void 0 : raw.volume24h) !== null && _b !== void 0 ? _b : raw === null || raw === void 0 ? void 0 : raw.volume24hrClob);
    var volume1wk = parseNumber((_c = raw === null || raw === void 0 ? void 0 : raw.volume1wk) !== null && _c !== void 0 ? _c : raw === null || raw === void 0 ? void 0 : raw.volume1wkClob);
    var volume1mo = parseNumber((_d = raw === null || raw === void 0 ? void 0 : raw.volume1mo) !== null && _d !== void 0 ? _d : raw === null || raw === void 0 ? void 0 : raw.volume1moClob);
    var volume1yr = parseNumber((_e = raw === null || raw === void 0 ? void 0 : raw.volume1yr) !== null && _e !== void 0 ? _e : raw === null || raw === void 0 ? void 0 : raw.volume1yrClob);
    var totalVolume = parseNumber((_h = (_g = (_f = raw === null || raw === void 0 ? void 0 : raw.volume) !== null && _f !== void 0 ? _f : raw === null || raw === void 0 ? void 0 : raw.volumeNum) !== null && _g !== void 0 ? _g : raw === null || raw === void 0 ? void 0 : raw.totalVolume) !== null && _h !== void 0 ? _h : raw === null || raw === void 0 ? void 0 : raw.volumeClob);
    var volume = (_k = (_j = volume24hr !== null && volume24hr !== void 0 ? volume24hr : volume1wk) !== null && _j !== void 0 ? _j : volume1mo) !== null && _k !== void 0 ? _k : totalVolume;
    return {
        id: String(id),
        slug: (raw === null || raw === void 0 ? void 0 : raw.slug) || (raw === null || raw === void 0 ? void 0 : raw.market_slug) || (raw === null || raw === void 0 ? void 0 : raw.question_slug) || undefined,
        title: String(title),
        category: (raw === null || raw === void 0 ? void 0 : raw.category) || (raw === null || raw === void 0 ? void 0 : raw.group) || (raw === null || raw === void 0 ? void 0 : raw.group_title) || undefined,
        status: normalizeStatus(raw),
        outcomes: outcomes,
        yesPrice: yesPrice,
        noPrice: noPrice,
        volume: volume,
        volume24hr: volume24hr,
        volume1wk: volume1wk,
        volume1mo: volume1mo,
        volume1yr: volume1yr,
        liquidity: Number((_l = raw === null || raw === void 0 ? void 0 : raw.liquidity) !== null && _l !== void 0 ? _l : raw === null || raw === void 0 ? void 0 : raw.liquidity24h) || undefined,
        closeTime: closeTime,
        source: 'POLYMARKET',
        updatedAt: updatedAt,
        metadata: __assign(__assign({}, raw), { marketTimestamp: createdTimestamp !== null && createdTimestamp !== void 0 ? createdTimestamp : (closeTime ? closeTime.getTime() : null) }),
    };
}
function parseTimestamp(value) {
    if (value === null || value === undefined)
        return null;
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value > 1e12 ? value : value * 1000;
    }
    if (typeof value === 'string') {
        var parsed = Date.parse(value);
        if (!Number.isNaN(parsed))
            return parsed;
    }
    return null;
}
function extractTimestamp(raw) {
    var keys = [
        'updatedAt',
        'updated_at',
        'lastUpdated',
        'last_updated',
        'lastTradeAt',
        'last_trade_at',
        'lastTradeTime',
        'last_trade_time',
        'openTime',
        'start_time',
        'start_date',
        'createdAt',
        'created_at',
        'created',
        'creationTime',
    ];
    for (var _i = 0, keys_1 = keys; _i < keys_1.length; _i++) {
        var key = keys_1[_i];
        var value = parseTimestamp(raw === null || raw === void 0 ? void 0 : raw[key]);
        if (value)
            return value;
    }
    return null;
}
function marketRecency(market) {
    var _a, _b;
    var meta = market.metadata;
    var metaTs = (meta === null || meta === void 0 ? void 0 : meta.marketTimestamp) ? parseTimestamp(meta.marketTimestamp) : null;
    if (metaTs)
        return metaTs;
    if (market.closeTime)
        return market.closeTime.getTime();
    return ((_b = (_a = market.updatedAt) === null || _a === void 0 ? void 0 : _a.getTime) === null || _b === void 0 ? void 0 : _b.call(_a)) || 0;
}
function marketVolumeScore(market) {
    return Number.isFinite(market.volume) ? market.volume : 0;
}
function fetchMarkets() {
    return __awaiter(this, arguments, void 0, function (limit) {
        var urls, _loop_1, _i, urls_2, url, state_1;
        if (limit === void 0) { limit = 100; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    urls = uniqueUrls([DEFAULT_MARKETS_URL]);
                    _loop_1 = function (url) {
                        var response, payload, rawMarkets, markets, sorted, windowMs, cutoff_1, recent, limited, error_1;
                        return __generator(this, function (_b) {
                            switch (_b.label) {
                                case 0:
                                    _b.trys.push([0, 2, , 3]);
                                    return [4 /*yield*/, axios_1.default.get(url, {
                                            params: {
                                                limit: limit,
                                                active: DEFAULT_ACTIVE,
                                                closed: DEFAULT_CLOSED,
                                                archived: DEFAULT_ARCHIVED,
                                                order: DEFAULT_ORDER,
                                                ascending: DEFAULT_ASCENDING,
                                            },
                                            timeout: 30000,
                                        })];
                                case 1:
                                    response = _b.sent();
                                    if (typeof response.data === 'string' && response.data.includes('<html')) {
                                        logger_1.default.warn("[Polymarket] HTML response from ".concat(url, ", skipping"));
                                        return [2 /*return*/, "continue"];
                                    }
                                    payload = response.data;
                                    rawMarkets = Array.isArray(payload)
                                        ? payload
                                        : Array.isArray(payload === null || payload === void 0 ? void 0 : payload.data)
                                            ? payload.data
                                            : Array.isArray(payload === null || payload === void 0 ? void 0 : payload.markets)
                                                ? payload.markets
                                                : [];
                                    markets = rawMarkets
                                        .map(function (raw) { return normalizeMarket(raw); })
                                        .filter(function (market) { return !!market; });
                                    sorted = markets
                                        .slice()
                                        .sort(function (a, b) {
                                        var volumeDelta = marketVolumeScore(b) - marketVolumeScore(a);
                                        if (volumeDelta !== 0)
                                            return volumeDelta;
                                        return marketRecency(b) - marketRecency(a);
                                    });
                                    windowMs = LATEST_WINDOW_DAYS > 0 ? LATEST_WINDOW_DAYS * 24 * 60 * 60 * 1000 : 0;
                                    cutoff_1 = windowMs ? Date.now() - windowMs : 0;
                                    recent = windowMs
                                        ? sorted.filter(function (market) {
                                            var recency = marketRecency(market);
                                            return recency > 0 && recency >= cutoff_1;
                                        })
                                        : sorted.filter(function (market) { return marketRecency(market) > 0; });
                                    limited = recent.slice(0, limit);
                                    logger_1.default.info("[Polymarket] Loaded ".concat(limited.length, " latest markets from ").concat(url));
                                    if (limited.length) {
                                        return [2 /*return*/, { value: limited }];
                                    }
                                    return [3 /*break*/, 3];
                                case 2:
                                    error_1 = _b.sent();
                                    logger_1.default.warn("[Polymarket] Failed to fetch markets from ".concat(url, ":"), error_1);
                                    return [3 /*break*/, 3];
                                case 3: return [2 /*return*/];
                            }
                        });
                    };
                    _i = 0, urls_2 = urls;
                    _a.label = 1;
                case 1:
                    if (!(_i < urls_2.length)) return [3 /*break*/, 4];
                    url = urls_2[_i];
                    return [5 /*yield**/, _loop_1(url)];
                case 2:
                    state_1 = _a.sent();
                    if (typeof state_1 === "object")
                        return [2 /*return*/, state_1.value];
                    _a.label = 3;
                case 3:
                    _i++;
                    return [3 /*break*/, 1];
                case 4:
                    logger_1.default.error('[Polymarket] Failed to fetch markets from all endpoints');
                    return [2 /*return*/, []];
            }
        });
    });
}
function fetchCandles(tokenId) {
    return __awaiter(this, void 0, void 0, function () {
        var url, response, history_1, error_2;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    if (!tokenId)
                        return [2 /*return*/, []];
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 3, , 4]);
                    url = "https://clob.polymarket.com/prices-history?interval=1d&market=".concat(tokenId, "&fidelity=1");
                    return [4 /*yield*/, axios_1.default.get(url, { timeout: 10000 })];
                case 2:
                    response = _b.sent();
                    history_1 = ((_a = response.data) === null || _a === void 0 ? void 0 : _a.history) || [];
                    return [2 /*return*/, history_1.map(function (h) { return ({
                            timestamp: h.t * 1000,
                            price: Number(h.p)
                        }); })];
                case 3:
                    error_2 = _b.sent();
                    logger_1.default.warn("[Polymarket] History fetch failed for ".concat(tokenId, ":"), error_2.message);
                    return [2 /*return*/, []];
                case 4: return [2 /*return*/];
            }
        });
    });
}
exports.default = {
    fetchMarkets: fetchMarkets,
    fetchCandles: fetchCandles,
};
