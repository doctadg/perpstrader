"use strict";
// Fetch Metadata Node - Fetch token metadata for discovered tokens
// Gets detailed metadata from pump.fun API or Metaplex
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
exports.updateStep = exports.addThought = void 0;
exports.fetchMetadataNode = fetchMetadataNode;
var logger_1 = require("../../shared/logger");
var state_1 = require("../state");
/**
 * Fetch metadata for all discovered tokens
 */
function fetchMetadataNode(state) {
    return __awaiter(this, void 0, void 0, function () {
        var solanaRPC, error_1, tokensWithMetadata, concurrency, i, batch, results, _i, results_1, result;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (state.discoveredTokens.length === 0) {
                        logger_1.default.warn('[FetchMetadataNode] No tokens to fetch metadata for');
                        return [2 /*return*/, __assign(__assign({}, (0, state_1.addThought)(state, 'No tokens to fetch metadata for')), (0, state_1.updateStep)(state, 'NO_TOKENS'))];
                    }
                    logger_1.default.info("[FetchMetadataNode] Fetching metadata for ".concat(state.discoveredTokens.length, " tokens"));
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, Promise.resolve().then(function () { return require('../services/solana-rpc'); })];
                case 2:
                    solanaRPC = (_a.sent()).default;
                    return [3 /*break*/, 4];
                case 3:
                    error_1 = _a.sent();
                    logger_1.default.error('[FetchMetadataNode] Failed to import Solana RPC service');
                    return [2 /*return*/, __assign(__assign({}, (0, state_1.addThought)(state, 'Failed to import Solana RPC service')), (0, state_1.updateStep)(state, 'ERROR'))];
                case 4:
                    tokensWithMetadata = [];
                    concurrency = 5;
                    i = 0;
                    _a.label = 5;
                case 5:
                    if (!(i < state.discoveredTokens.length)) return [3 /*break*/, 8];
                    batch = state.discoveredTokens.slice(i, i + concurrency);
                    return [4 /*yield*/, Promise.allSettled(batch.map(function (token) { return __awaiter(_this, void 0, void 0, function () {
                            var metadata, tokenExtras, error_2, tokenExtras;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0:
                                        _a.trys.push([0, 2, , 3]);
                                        return [4 /*yield*/, solanaRPC.getTokenMetadata(token.mintAddress)];
                                    case 1:
                                        metadata = _a.sent();
                                        tokenExtras = token;
                                        return [2 /*return*/, {
                                                token: token,
                                                metadata: metadata || {
                                                    name: token.name,
                                                    symbol: token.symbol,
                                                    description: tokenExtras.description || '',
                                                    image: tokenExtras.image || '',
                                                    website: tokenExtras.website || undefined,
                                                    twitter: tokenExtras.twitter || undefined,
                                                    telegram: tokenExtras.telegram || undefined,
                                                    discord: tokenExtras.discord || undefined,
                                                },
                                            }];
                                    case 2:
                                        error_2 = _a.sent();
                                        logger_1.default.debug("[FetchMetadataNode] Failed to fetch metadata for ".concat(token.symbol, ": ").concat(error_2));
                                        tokenExtras = token;
                                        return [2 /*return*/, {
                                                token: token,
                                                metadata: {
                                                    name: token.name,
                                                    symbol: token.symbol,
                                                    description: tokenExtras.description || '',
                                                    image: tokenExtras.image || '',
                                                    website: tokenExtras.website || undefined,
                                                    twitter: tokenExtras.twitter || undefined,
                                                    telegram: tokenExtras.telegram || undefined,
                                                    discord: tokenExtras.discord || undefined,
                                                },
                                            }];
                                    case 3: return [2 /*return*/];
                                }
                            });
                        }); }))];
                case 6:
                    results = _a.sent();
                    for (_i = 0, results_1 = results; _i < results_1.length; _i++) {
                        result = results_1[_i];
                        if (result.status === 'fulfilled' && result.value.metadata) {
                            tokensWithMetadata.push(result.value);
                        }
                    }
                    _a.label = 7;
                case 7:
                    i += concurrency;
                    return [3 /*break*/, 5];
                case 8:
                    logger_1.default.info("[FetchMetadataNode] Fetched metadata for ".concat(tokensWithMetadata.length, " tokens"));
                    return [2 /*return*/, __assign(__assign(__assign({}, (0, state_1.addThought)(state, "Fetched metadata for ".concat(tokensWithMetadata.length, "/").concat(state.discoveredTokens.length, " tokens"))), (0, state_1.updateStep)(state, 'METADATA_FETCHED')), { queuedTokens: tokensWithMetadata.map(function (t) { return (__assign(__assign({}, t.token), { metadata: t.metadata })); }) })];
            }
        });
    });
}
// Re-export addThought and updateStep for other nodes
var state_2 = require("../state");
Object.defineProperty(exports, "addThought", { enumerable: true, get: function () { return state_2.addThought; } });
Object.defineProperty(exports, "updateStep", { enumerable: true, get: function () { return state_2.updateStep; } });
