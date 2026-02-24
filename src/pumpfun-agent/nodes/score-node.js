"use strict";
// Score Node - Calculate final confidence scores
// Combines website quality and AI recommendation into confidence scores
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
exports.scoreNode = scoreNode;
var config_1 = require("../../shared/config");
var logger_1 = require("../../shared/logger");
var state_1 = require("../state");
/**
 * Calculate final confidence scores for all analyzed tokens
 */
function scoreNode(state) {
    return __awaiter(this, void 0, void 0, function () {
        var config, minScoreThreshold, configuredWeights, websiteWeight, aiWeight, totalWeight, scoredTokens, highConfidenceTokens;
        var _a, _b, _c, _d, _e;
        return __generator(this, function (_f) {
            if (state.analyzedTokens.length === 0) {
                logger_1.default.warn('[ScoreNode] No tokens to score');
                return [2 /*return*/, __assign(__assign({}, (0, state_1.addThought)(state, 'No tokens to score')), (0, state_1.updateStep)(state, 'NO_TOKENS'))];
            }
            logger_1.default.info("[ScoreNode] Calculating scores for ".concat(state.analyzedTokens.length, " tokens"));
            config = config_1.default.get();
            minScoreThreshold = (_b = (_a = config.pumpfun) === null || _a === void 0 ? void 0 : _a.minScoreThreshold) !== null && _b !== void 0 ? _b : 0.7;
            configuredWeights = ((_c = config.pumpfun) === null || _c === void 0 ? void 0 : _c.weights) || {};
            websiteWeight = Math.max(0, (_d = configuredWeights.website) !== null && _d !== void 0 ? _d : 0.7);
            aiWeight = Math.max(0, (_e = configuredWeights.glm) !== null && _e !== void 0 ? _e : 0.3);
            totalWeight = websiteWeight + aiWeight || 1;
            scoredTokens = state.analyzedTokens.map(function (token) {
                // Convert AI recommendation to numeric score.
                var aiScore = recommendationToScore(token.recommendation);
                // Security and social checks are intentionally not used in score calculation.
                var overallScore = (token.websiteScore * websiteWeight +
                    aiScore * aiWeight) / totalWeight;
                return __assign(__assign({}, token), { overallScore: Math.min(1, Math.max(0, overallScore)) });
            });
            highConfidenceTokens = scoredTokens.filter(function (t) { return t.overallScore >= minScoreThreshold; });
            logger_1.default.info("[ScoreNode] Scored ".concat(scoredTokens.length, " tokens, ").concat(highConfidenceTokens.length, " high confidence"));
            return [2 /*return*/, __assign(__assign(__assign({}, (0, state_1.addThought)(state, "Scored ".concat(scoredTokens.length, " tokens, ").concat(highConfidenceTokens.length, " with >=").concat(minScoreThreshold.toFixed(2), " confidence"))), (0, state_1.updateStep)(state, 'SCORING_COMPLETE')), { analyzedTokens: scoredTokens, highConfidenceTokens: highConfidenceTokens })];
        });
    });
}
/**
 * Convert recommendation to numeric score
 */
function recommendationToScore(recommendation) {
    var scores = {
        STRONG_BUY: 0.95,
        BUY: 0.75,
        HOLD: 0.50,
        AVOID: 0.25,
        STRONG_AVOID: 0.05,
    };
    return scores[recommendation] || 0.5;
}
var state_2 = require("../state");
Object.defineProperty(exports, "addThought", { enumerable: true, get: function () { return state_2.addThought; } });
Object.defineProperty(exports, "updateStep", { enumerable: true, get: function () { return state_2.updateStep; } });
