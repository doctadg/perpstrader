"use strict";
// Security Node - Analyze contract security for tokens
// Checks mint authority, freeze authority, and other security parameters
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
exports.updateStep = exports.addThought = void 0;
exports.securityNode = securityNode;
var logger_1 = require("../../shared/logger");
var state_1 = require("../state");
/**
 * Analyze contract security for all queued tokens
 */
function securityNode(state) {
    return __awaiter(this, void 0, void 0, function () {
        var solanaRPC, error_1, securityAnalyses, concurrency, i, batch, highRisk, mediumRisk, lowRisk, _i, _a, security;
        var _this = this;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    if (state.queuedTokens.length === 0) {
                        logger_1.default.warn('[SecurityNode] No tokens to analyze');
                        return [2 /*return*/, __assign(__assign({}, (0, state_1.addThought)(state, 'No tokens to analyze')), (0, state_1.updateStep)(state, 'NO_TOKENS'))];
                    }
                    logger_1.default.info("[SecurityNode] Analyzing security for ".concat(state.queuedTokens.length, " tokens"));
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, Promise.resolve().then(function () { return require('../services/solana-rpc'); })];
                case 2:
                    solanaRPC = (_b.sent()).default;
                    return [3 /*break*/, 4];
                case 3:
                    error_1 = _b.sent();
                    logger_1.default.error('[SecurityNode] Failed to import Solana RPC service');
                    return [2 /*return*/, __assign(__assign({}, (0, state_1.addThought)(state, 'Failed to import Solana RPC service')), (0, state_1.updateStep)(state, 'ERROR'))];
                case 4:
                    securityAnalyses = new Map();
                    concurrency = 10;
                    i = 0;
                    _b.label = 5;
                case 5:
                    if (!(i < state.queuedTokens.length)) return [3 /*break*/, 8];
                    batch = state.queuedTokens.slice(i, i + concurrency);
                    return [4 /*yield*/, Promise.allSettled(batch.map(function (item) { return __awaiter(_this, void 0, void 0, function () {
                            var token, security, error_2;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0:
                                        token = item.token || item;
                                        _a.label = 1;
                                    case 1:
                                        _a.trys.push([1, 3, , 4]);
                                        return [4 /*yield*/, solanaRPC.getMintInfo(token.mintAddress)];
                                    case 2:
                                        security = _a.sent();
                                        securityAnalyses.set(token.mintAddress, security);
                                        return [3 /*break*/, 4];
                                    case 3:
                                        error_2 = _a.sent();
                                        logger_1.default.debug("[SecurityNode] Failed to analyze ".concat(token.symbol, ": ").concat(error_2));
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
                                        return [3 /*break*/, 4];
                                    case 4: return [2 /*return*/];
                                }
                            });
                        }); }))];
                case 6:
                    _b.sent();
                    _b.label = 7;
                case 7:
                    i += concurrency;
                    return [3 /*break*/, 5];
                case 8:
                    highRisk = 0;
                    mediumRisk = 0;
                    lowRisk = 0;
                    for (_i = 0, _a = securityAnalyses.values(); _i < _a.length; _i++) {
                        security = _a[_i];
                        if (security.riskLevel === 'HIGH')
                            highRisk++;
                        else if (security.riskLevel === 'MEDIUM')
                            mediumRisk++;
                        else
                            lowRisk++;
                    }
                    logger_1.default.info("[SecurityNode] Analyzed ".concat(securityAnalyses.size, " tokens (H:").concat(highRisk, " M:").concat(mediumRisk, " L:").concat(lowRisk, ")"));
                    return [2 /*return*/, __assign(__assign(__assign({}, (0, state_1.addThought)(state, "Security analysis: ".concat(lowRisk, " low, ").concat(mediumRisk, " medium, ").concat(highRisk, " high risk"))), (0, state_1.updateStep)(state, 'SECURITY_ANALYZED')), { thoughts: __spreadArray(__spreadArray([], state.thoughts, true), [
                                "Security: ".concat(lowRisk, " low risk, ").concat(mediumRisk, " medium, ").concat(highRisk, " high risk"),
                            ], false) })];
            }
        });
    });
}
var state_2 = require("../state");
Object.defineProperty(exports, "addThought", { enumerable: true, get: function () { return state_2.addThought; } });
Object.defineProperty(exports, "updateStep", { enumerable: true, get: function () { return state_2.updateStep; } });
