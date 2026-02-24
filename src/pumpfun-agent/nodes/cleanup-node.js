"use strict";
// Cleanup Node - Finalize cycle and publish events
// Publishes results to Redis message bus and finalizes state
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
exports.cleanupNode = cleanupNode;
var logger_1 = require("../../shared/logger");
var state_1 = require("../state");
/**
 * Cleanup and publish results
 */
function cleanupNode(state) {
    return __awaiter(this, void 0, void 0, function () {
        var updatedState, summary;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    logger_1.default.info('[CleanupNode] Finalizing cycle');
                    updatedState = (0, state_1.updateStats)(state);
                    // Publish high confidence tokens to message bus
                    return [4 /*yield*/, publishHighConfidenceTokens(updatedState.highConfidenceTokens)];
                case 1:
                    // Publish high confidence tokens to message bus
                    _a.sent();
                    // Publish cycle complete event
                    return [4 /*yield*/, publishCycleComplete(updatedState)];
                case 2:
                    // Publish cycle complete event
                    _a.sent();
                    summary = buildCycleSummary(updatedState);
                    return [2 /*return*/, __assign(__assign({}, (0, state_1.addThought)(updatedState, "Cycle complete: ".concat(summary))), (0, state_1.updateStep)(updatedState, 'CYCLE_COMPLETE'))];
            }
        });
    });
}
/**
 * Publish high confidence tokens to message bus
 */
function publishHighConfidenceTokens(tokens) {
    return __awaiter(this, void 0, void 0, function () {
        var messageBus, _i, tokens_1, token, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (tokens.length === 0) {
                        return [2 /*return*/];
                    }
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 9, , 10]);
                    return [4 /*yield*/, Promise.resolve().then(function () { return require('../../shared/message-bus'); })];
                case 2:
                    messageBus = (_a.sent()).default;
                    if (!!messageBus.isConnected) return [3 /*break*/, 4];
                    return [4 /*yield*/, messageBus.connect()];
                case 3:
                    _a.sent();
                    _a.label = 4;
                case 4:
                    _i = 0, tokens_1 = tokens;
                    _a.label = 5;
                case 5:
                    if (!(_i < tokens_1.length)) return [3 /*break*/, 8];
                    token = tokens_1[_i];
                    return [4 /*yield*/, messageBus.publish('pumpfun:high:confidence', {
                            mintAddress: token.token.mintAddress,
                            symbol: token.token.symbol,
                            name: token.token.name,
                            overallScore: token.overallScore,
                            recommendation: token.recommendation,
                            rationale: token.rationale,
                        })];
                case 6:
                    _a.sent();
                    _a.label = 7;
                case 7:
                    _i++;
                    return [3 /*break*/, 5];
                case 8:
                    logger_1.default.info("[CleanupNode] Published ".concat(tokens.length, " high confidence tokens"));
                    return [3 /*break*/, 10];
                case 9:
                    error_1 = _a.sent();
                    logger_1.default.warn('[CleanupNode] Failed to publish high confidence tokens:', error_1);
                    return [3 /*break*/, 10];
                case 10: return [2 /*return*/];
            }
        });
    });
}
/**
 * Publish cycle complete event
 */
function publishCycleComplete(state) {
    return __awaiter(this, void 0, void 0, function () {
        var messageBus, error_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 5, , 6]);
                    return [4 /*yield*/, Promise.resolve().then(function () { return require('../../shared/message-bus'); })];
                case 1:
                    messageBus = (_a.sent()).default;
                    if (!!messageBus.isConnected) return [3 /*break*/, 3];
                    return [4 /*yield*/, messageBus.connect()];
                case 2:
                    _a.sent();
                    _a.label = 3;
                case 3: return [4 /*yield*/, messageBus.publish('pumpfun:cycle:complete', {
                        cycleId: state.cycleId,
                        stats: state.stats,
                        highConfidenceCount: state.highConfidenceTokens.length,
                    })];
                case 4:
                    _a.sent();
                    logger_1.default.info('[CleanupNode] Published cycle complete event');
                    return [3 /*break*/, 6];
                case 5:
                    error_2 = _a.sent();
                    logger_1.default.warn('[CleanupNode] Failed to publish cycle complete:', error_2);
                    return [3 /*break*/, 6];
                case 6: return [2 /*return*/];
            }
        });
    });
}
/**
 * Build cycle summary string
 */
function buildCycleSummary(state) {
    var tokens = state.analyzedTokens.length;
    var highConf = state.highConfidenceTokens.length;
    var avgScore = state.stats.averageScore.toFixed(2);
    var byRec = state.stats.byRecommendation;
    var breakdown = "STRONG_BUY:".concat(byRec.STRONG_BUY, " BUY:").concat(byRec.BUY, " HOLD:").concat(byRec.HOLD, " AVOID:").concat(byRec.AVOID, " STRONG_AVOID:").concat(byRec.STRONG_AVOID);
    return "".concat(tokens, " analyzed, ").concat(highConf, " high confidence, avg ").concat(avgScore, " (").concat(breakdown, ")");
}
var state_2 = require("../state");
Object.defineProperty(exports, "addThought", { enumerable: true, get: function () { return state_2.addThought; } });
Object.defineProperty(exports, "updateStep", { enumerable: true, get: function () { return state_2.updateStep; } });
