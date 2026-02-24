"use strict";
// GLM AI Service - Wrapper for Z.AI LLM API
// Used for strategy generation and market analysis
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
exports.GLMAIService = void 0;
var axios_1 = require("axios");
var crypto_1 = require("crypto");
var config_1 = require("../shared/config");
var logger_1 = require("../shared/logger");
var config = config_1.default.get();
/**
 * GLM AI Service for strategy generation
 */
var GLMAIService = /** @class */ (function () {
    function GLMAIService() {
        this.baseUrl = config.glm.baseUrl;
        this.apiKey = config.glm.apiKey;
        this.model = config.glm.model || 'glm-4.7';
        this.labelingModel = process.env.GLM_LABELING_MODEL || 'glm-4.5-air';
        this.timeout = config.glm.timeout;
    }
    /**
     * Check if the service is configured
     */
    GLMAIService.prototype.canUseService = function () {
        return !!this.apiKey && this.apiKey.length > 0 && this.apiKey !== 'your-api-key-here';
    };
    GLMAIService.prototype.safeErrorMessage = function (error) {
        var _a, _b, _c, _d, _e, _f;
        var status = (_a = error === null || error === void 0 ? void 0 : error.response) === null || _a === void 0 ? void 0 : _a.status;
        var apiMessage = ((_d = (_c = (_b = error === null || error === void 0 ? void 0 : error.response) === null || _b === void 0 ? void 0 : _b.data) === null || _c === void 0 ? void 0 : _c.error) === null || _d === void 0 ? void 0 : _d.message) || ((_f = (_e = error === null || error === void 0 ? void 0 : error.response) === null || _e === void 0 ? void 0 : _e.data) === null || _f === void 0 ? void 0 : _f.message);
        var code = error === null || error === void 0 ? void 0 : error.code;
        var message = error === null || error === void 0 ? void 0 : error.message;
        return [
            status ? "HTTP ".concat(status) : null,
            code ? "code=".concat(code) : null,
            apiMessage ? "api=".concat(String(apiMessage)) : null,
            message ? "msg=".concat(String(message)) : null,
        ].filter(Boolean).join(' ');
    };
    /**
     * Generate trading strategies based on research data
     */
    GLMAIService.prototype.generateTradingStrategies = function (researchData) {
        return __awaiter(this, void 0, void 0, function () {
            var prompt_1, response, strategies, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.canUseService()) {
                            logger_1.default.warn('[GLM] API key not configured, using fallback strategies');
                            return [2 /*return*/, this.generateFallbackStrategies(researchData)];
                        }
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        prompt_1 = this.buildStrategyPrompt(researchData);
                        return [4 /*yield*/, this.callAPI(prompt_1)];
                    case 2:
                        response = _a.sent();
                        strategies = this.parseStrategies(response);
                        logger_1.default.info("[GLM] Generated ".concat(strategies.length, " strategies"));
                        return [2 /*return*/, strategies];
                    case 3:
                        error_1 = _a.sent();
                        logger_1.default.error("[GLM] Strategy generation failed: ".concat(this.safeErrorMessage(error_1)));
                        return [2 /*return*/, this.generateFallbackStrategies(researchData)];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Generate prediction market ideas based on linked news and market prices
     */
    GLMAIService.prototype.generatePredictionIdeas = function (context) {
        return __awaiter(this, void 0, void 0, function () {
            var prompt_2, response, error_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.canUseService()) {
                            logger_1.default.warn('[GLM] API key not configured, skipping prediction ideas');
                            return [2 /*return*/, []];
                        }
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        prompt_2 = this.buildPredictionPrompt(context);
                        return [4 /*yield*/, this.callAPI(prompt_2)];
                    case 2:
                        response = _a.sent();
                        return [2 /*return*/, this.parsePredictionIdeas(response)];
                    case 3:
                        error_2 = _a.sent();
                        logger_1.default.error("[GLM] Prediction idea generation failed: ".concat(this.safeErrorMessage(error_2)));
                        return [2 /*return*/, []];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Call the GLM API
     * @param prompt - The prompt to send
     * @param retries - Number of retry attempts
     * @param modelOverride - Optional model override (defaults to this.model)
     * @param temperature - Temperature for generation (default 0.7)
     */
    GLMAIService.prototype.callAPI = function (prompt_3) {
        return __awaiter(this, arguments, void 0, function (prompt, retries, modelOverride, temperature) {
            var modelToUse, _loop_1, this_1, attempt, state_1;
            var _a, _b;
            if (retries === void 0) { retries = 3; }
            if (temperature === void 0) { temperature = 0.7; }
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        modelToUse = modelOverride || this.model;
                        _loop_1 = function (attempt) {
                            var response, error_3;
                            return __generator(this, function (_d) {
                                switch (_d.label) {
                                    case 0:
                                        _d.trys.push([0, 2, , 4]);
                                        return [4 /*yield*/, axios_1.default.post("".concat(this_1.baseUrl, "/chat/completions"), {
                                                model: modelToUse,
                                                messages: [
                                                    { role: 'system', content: 'You are an expert cryptocurrency trading strategist focused on MAXIMUM PROFITABILITY.' },
                                                    { role: 'user', content: prompt }
                                                ],
                                                temperature: temperature,
                                                max_tokens: 4000,
                                            }, {
                                                headers: {
                                                    'Authorization': "Bearer ".concat(this_1.apiKey),
                                                    'Content-Type': 'application/json',
                                                },
                                                timeout: this_1.timeout,
                                            })];
                                    case 1:
                                        response = _d.sent();
                                        return [2 /*return*/, { value: ((_b = (_a = response.data.choices[0]) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.content) || '' }];
                                    case 2:
                                        error_3 = _d.sent();
                                        if (attempt === retries)
                                            throw error_3;
                                        logger_1.default.warn("[GLM] Attempt ".concat(attempt, " failed, retrying..."));
                                        return [4 /*yield*/, new Promise(function (r) { return setTimeout(r, 1000 * attempt); })];
                                    case 3:
                                        _d.sent();
                                        return [3 /*break*/, 4];
                                    case 4: return [2 /*return*/];
                                }
                            });
                        };
                        this_1 = this;
                        attempt = 1;
                        _c.label = 1;
                    case 1:
                        if (!(attempt <= retries)) return [3 /*break*/, 4];
                        return [5 /*yield**/, _loop_1(attempt)];
                    case 2:
                        state_1 = _c.sent();
                        if (typeof state_1 === "object")
                            return [2 /*return*/, state_1.value];
                        _c.label = 3;
                    case 3:
                        attempt++;
                        return [3 /*break*/, 1];
                    case 4: throw new Error('GLM API call failed after retries');
                }
            });
        });
    };
    /**
     * Build the strategy generation prompt
     */
    GLMAIService.prototype.buildStrategyPrompt = function (data) {
        return "Based on the following market research data, generate 10 highly profitable trading strategies for Hyperliquid DEX.\n\nResearch Data:\n- Topic: ".concat(data.topic, "\n- Insights: ").concat(data.insights.join('\n'), "\n- Confidence: ").concat(data.confidence, "\n\nReturn strategies in this JSON format:\n{\n  \"strategies\": [\n    {\n      \"name\": \"Strategy Name\",\n      \"description\": \"Description\",\n      \"type\": \"TREND_FOLLOWING\" | \"MEAN_REVERSION\" | \"MARKET_MAKING\" | \"ARBITRAGE\" | \"AI_PREDICTION\",\n      \"symbols\": [\"BTC\", \"ETH\"],\n      \"timeframe\": \"1h\",\n      \"entryConditions\": [\"condition1\", \"condition2\"],\n      \"exitConditions\": [\"condition1\", \"condition2\"],\n      \"parameters\": { \"key\": \"value\" },\n      \"riskParameters\": {\n        \"maxPositionSize\": 0.1,\n        \"stopLoss\": 0.03,\n        \"takeProfit\": 0.06,\n        \"maxLeverage\": 5\n      }\n    }\n  ]\n}\n\nFocus on AGGRESSIVE, HIGH-EDGE strategies with clear entry/exit conditions.");
    };
    GLMAIService.prototype.buildPredictionPrompt = function (context) {
        var markets = context.markets.slice(0, 12).map(function (market) {
            var _a, _b;
            var news = (context.marketNews[market.id] || []).slice(0, 3);
            var newsLines = news.map(function (item) { return "- ".concat(item.title, " (").concat(item.sentiment, ", ").concat(item.importance, ")"); }).join('\n');
            var yesPrice = Number.isFinite(market.yesPrice) ? (_a = market.yesPrice) === null || _a === void 0 ? void 0 : _a.toFixed(3) : 'n/a';
            var noPrice = Number.isFinite(market.noPrice) ? (_b = market.noPrice) === null || _b === void 0 ? void 0 : _b.toFixed(3) : 'n/a';
            return "Market: ".concat(market.title, "\nID: ").concat(market.id, "\nYes: ").concat(yesPrice, " | No: ").concat(noPrice, "\nNews:\n").concat(newsLines || '- none', "\n");
        }).join('\n');
        return "You are a prediction market analyst. Given markets and linked news, propose up to 6 actionable ideas.\nEach idea must include a predicted probability vs implied probability and choose YES or NO.\n\nReturn JSON only in this format:\n{\n  \"ideas\": [\n    {\n      \"marketId\": \"string\",\n      \"marketTitle\": \"string\",\n      \"outcome\": \"YES\" | \"NO\",\n      \"impliedProbability\": 0.55,\n      \"predictedProbability\": 0.62,\n      \"edge\": 0.07,\n      \"confidence\": 0.7,\n      \"timeHorizon\": \"7d\",\n      \"catalysts\": [\"headline 1\", \"headline 2\"],\n      \"rationale\": \"short explanation\"\n    }\n  ]\n}\n\nMarkets:\n".concat(markets);
    };
    GLMAIService.prototype.parsePredictionIdeas = function (response) {
        try {
            var parsed = JSON.parse(response);
            var ideas = Array.isArray(parsed === null || parsed === void 0 ? void 0 : parsed.ideas) ? parsed.ideas : [];
            return ideas
                .map(function (idea) { return ({
                id: crypto_1.default.randomUUID(),
                marketId: String(idea.marketId || ''),
                marketTitle: String(idea.marketTitle || ''),
                outcome: idea.outcome === 'NO' ? 'NO' : 'YES',
                impliedProbability: Number(idea.impliedProbability) || 0,
                predictedProbability: Number(idea.predictedProbability) || 0,
                edge: Number(idea.edge) || 0,
                confidence: Number(idea.confidence) || 0.5,
                timeHorizon: idea.timeHorizon || '7d',
                catalysts: Array.isArray(idea.catalysts) ? idea.catalysts.map(String) : [],
                rationale: String(idea.rationale || ''),
            }); })
                .filter(function (idea) { return !!idea.marketId && !!idea.marketTitle; });
        }
        catch (error) {
            logger_1.default.warn('[GLM] Failed to parse prediction ideas JSON');
            return [];
        }
    };
    /**
     * Parse strategies from LLM response
     */
    GLMAIService.prototype.parseStrategies = function (response) {
        var _a, _b, _c, _d;
        try {
            // Extract JSON from response
            var jsonMatch = response.match(/\{[\s\S]*"strategies"[\s\S]*\}/);
            if (!jsonMatch) {
                logger_1.default.warn('[GLM] Could not find JSON in response');
                return [];
            }
            var parsed = JSON.parse(jsonMatch[0]);
            var strategies = [];
            for (var _i = 0, _e = parsed.strategies || []; _i < _e.length; _i++) {
                var s = _e[_i];
                strategies.push({
                    id: crypto_1.default.randomUUID(),
                    name: s.name,
                    description: s.description,
                    type: s.type || 'TREND_FOLLOWING',
                    symbols: s.symbols || ['BTC'],
                    timeframe: s.timeframe || '1h',
                    parameters: s.parameters || {},
                    entryConditions: s.entryConditions || [],
                    exitConditions: s.exitConditions || [],
                    riskParameters: {
                        maxPositionSize: ((_a = s.riskParameters) === null || _a === void 0 ? void 0 : _a.maxPositionSize) || 0.1,
                        stopLoss: ((_b = s.riskParameters) === null || _b === void 0 ? void 0 : _b.stopLoss) || 0.03,
                        takeProfit: ((_c = s.riskParameters) === null || _c === void 0 ? void 0 : _c.takeProfit) || 0.06,
                        maxLeverage: ((_d = s.riskParameters) === null || _d === void 0 ? void 0 : _d.maxLeverage) || 5,
                    },
                    isActive: true,
                    performance: {
                        totalTrades: 0,
                        winningTrades: 0,
                        losingTrades: 0,
                        winRate: 0,
                        totalPnL: 0,
                        sharpeRatio: 0,
                        maxDrawdown: 0,
                        averageWin: 0,
                        averageLoss: 0,
                        profitFactor: 0,
                    },
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });
            }
            return strategies;
        }
        catch (error) {
            logger_1.default.error("[GLM] Failed to parse strategies: ".concat(this.safeErrorMessage(error)));
            return [];
        }
    };
    /**
     * Fallback strategies when API is unavailable
     */
    GLMAIService.prototype.generateFallbackStrategies = function (data) {
        var baseStrategy = {
            isActive: true,
            performance: {
                totalTrades: 0,
                winningTrades: 0,
                losingTrades: 0,
                winRate: 0,
                totalPnL: 0,
                sharpeRatio: 0,
                maxDrawdown: 0,
                averageWin: 0,
                averageLoss: 0,
                profitFactor: 0,
            },
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        return [
            __assign(__assign({}, baseStrategy), { id: crypto_1.default.randomUUID(), name: 'RSI Mean Reversion', description: 'Mean reversion based on RSI extremes', type: 'MEAN_REVERSION', symbols: ['BTC', 'ETH', 'SOL'], timeframe: '1h', parameters: { rsiPeriod: 14, oversold: 30, overbought: 70, bbPeriod: 20, bbStdDev: 2 }, entryConditions: ['RSI < 30 for long', 'RSI > 70 for short'], exitConditions: ['RSI crosses 50', 'Stop loss hit'], riskParameters: { maxPositionSize: 0.05, stopLoss: 0.02, takeProfit: 0.04, maxLeverage: 3 } }),
            __assign(__assign({}, baseStrategy), { id: crypto_1.default.randomUUID(), name: 'RSI Tight Reversion', description: 'Aggressive mean reversion on deeper RSI extremes', type: 'MEAN_REVERSION', symbols: ['BTC', 'ETH', 'SOL'], timeframe: '1h', parameters: { rsiPeriod: 10, oversold: 25, overbought: 75, bbPeriod: 20, bbStdDev: 2.2 }, entryConditions: ['RSI < 25 for long', 'RSI > 75 for short'], exitConditions: ['RSI crosses 50', 'Stop loss hit'], riskParameters: { maxPositionSize: 0.04, stopLoss: 0.025, takeProfit: 0.045, maxLeverage: 3 } }),
            __assign(__assign({}, baseStrategy), { id: crypto_1.default.randomUUID(), name: 'RSI Loose Reversion', description: 'Mean reversion with wider RSI bands', type: 'MEAN_REVERSION', symbols: ['BTC', 'ETH', 'SOL'], timeframe: '1h', parameters: { rsiPeriod: 14, oversold: 35, overbought: 65, bbPeriod: 18, bbStdDev: 1.8 }, entryConditions: ['RSI < 35 for long', 'RSI > 65 for short'], exitConditions: ['RSI crosses 50', 'Stop loss hit'], riskParameters: { maxPositionSize: 0.05, stopLoss: 0.03, takeProfit: 0.05, maxLeverage: 3 } }),
            __assign(__assign({}, baseStrategy), { id: crypto_1.default.randomUUID(), name: 'Fast SMA Trend', description: 'Trend following on fast SMA crossover', type: 'TREND_FOLLOWING', symbols: ['BTC', 'ETH', 'SOL'], timeframe: '1h', parameters: { fastPeriod: 9, slowPeriod: 21 }, entryConditions: ['Fast SMA crosses above slow SMA for long', 'Fast SMA crosses below slow SMA for short'], exitConditions: ['Opposite crossover', 'Stop loss hit'], riskParameters: { maxPositionSize: 0.07, stopLoss: 0.03, takeProfit: 0.06, maxLeverage: 4 } }),
            __assign(__assign({}, baseStrategy), { id: crypto_1.default.randomUUID(), name: 'Standard SMA Trend', description: 'Trend following on standard SMA crossover', type: 'TREND_FOLLOWING', symbols: ['BTC', 'ETH', 'SOL'], timeframe: '1h', parameters: { fastPeriod: 12, slowPeriod: 26 }, entryConditions: ['Fast SMA crosses above slow SMA for long', 'Fast SMA crosses below slow SMA for short'], exitConditions: ['Opposite crossover', 'Stop loss hit'], riskParameters: { maxPositionSize: 0.08, stopLoss: 0.03, takeProfit: 0.06, maxLeverage: 4 } }),
            __assign(__assign({}, baseStrategy), { id: crypto_1.default.randomUUID(), name: 'Slow SMA Trend', description: 'Trend following with longer SMA windows', type: 'TREND_FOLLOWING', symbols: ['BTC', 'ETH', 'SOL'], timeframe: '1h', parameters: { fastPeriod: 20, slowPeriod: 50 }, entryConditions: ['Fast SMA crosses above slow SMA for long', 'Fast SMA crosses below slow SMA for short'], exitConditions: ['Opposite crossover', 'Stop loss hit'], riskParameters: { maxPositionSize: 0.06, stopLoss: 0.035, takeProfit: 0.07, maxLeverage: 4 } }),
        ];
    };
    /**
     * Optimize a strategy based on its performance (stub for compatibility)
     */
    GLMAIService.prototype.optimizeStrategy = function (strategy, performance) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                logger_1.default.info("[GLM] Optimizing strategy: ".concat(strategy.name));
                // Return the same strategy with slightly adjusted parameters
                return [2 /*return*/, __assign(__assign({}, strategy), { riskParameters: __assign(__assign({}, strategy.riskParameters), { stopLoss: performance.winRate > 50 ? strategy.riskParameters.stopLoss * 0.95 : strategy.riskParameters.stopLoss * 1.05, takeProfit: performance.profitFactor > 1 ? strategy.riskParameters.takeProfit * 1.05 : strategy.riskParameters.takeProfit * 0.95 }), updatedAt: new Date() })];
            });
        });
    };
    /**
     * Generate a trading signal (stub for compatibility)
     */
    GLMAIService.prototype.generateTradingSignal = function (indicators, patterns) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                logger_1.default.info('[GLM] generateTradingSignal called (stub)');
                return [2 /*return*/, null];
            });
        });
    };
    /**
     * Summarize an article content into 1-3 paragraphs.
     */
    GLMAIService.prototype.summarizeArticle = function (content) {
        return __awaiter(this, void 0, void 0, function () {
            var prompt_3, summary, error_4;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.canUseService()) {
                            logger_1.default.warn('[GLM] API key not configured, returning fallback summary');
                            return [2 /*return*/, this.generateFallbackSummary(content)];
                        }
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        prompt_3 = this.buildSummarizationPrompt(content);
                        return [4 /*yield*/, this.callAPI(prompt_3)];
                    case 2:
                        summary = _a.sent();
                        return [2 /*return*/, summary.trim()];
                    case 3:
                        error_4 = _a.sent();
                        logger_1.default.error("[GLM] Summarization failed: ".concat(this.safeErrorMessage(error_4)));
                        return [2 /*return*/, this.generateFallbackSummary(content)];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    GLMAIService.prototype.buildSummarizationPrompt = function (content) {
        return "Summarize the following news article content into exactly 1-3 paragraphs. \nFocus on the technical and economic implications, providing a clear and concise overview for a high-frequency trader.\n\nArticle Content:\n".concat(content.substring(0, 10000), "\n\nSummary:");
    };
    GLMAIService.prototype.generateFallbackSummary = function (content) {
        if (!content)
            return 'No content available for summarization.';
        var sentences = content.split(/[.!?]+/).map(function (s) { return s.trim(); }).filter(Boolean);
        return sentences.slice(0, 3).join('. ') + (sentences.length > 3 ? '...' : '');
    };
    /**
     * Generate vector embedding for text using GLM API
     */
    GLMAIService.prototype.generateEmbedding = function (text) {
        return __awaiter(this, void 0, void 0, function () {
            var safeText, embeddingModel, response, error_5;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.canUseService()) {
                            return [2 /*return*/, null]; // Fallback to keyword clustering
                        }
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        safeText = text.substring(0, 8000);
                        embeddingModel = process.env.ZAI_EMBEDDING_MODEL || this.model;
                        return [4 /*yield*/, axios_1.default.post("".concat(this.baseUrl, "/embeddings"), {
                                model: embeddingModel,
                                input: [safeText],
                            }, {
                                headers: {
                                    'Authorization': "Bearer ".concat(this.apiKey),
                                    'Content-Type': 'application/json',
                                },
                                timeout: this.timeout,
                            })];
                    case 2:
                        response = _a.sent();
                        // Extract embedding vector
                        if (response.data && response.data.data && response.data.data[0] && response.data.data[0].embedding) {
                            return [2 /*return*/, response.data.data[0].embedding];
                        }
                        return [2 /*return*/, null];
                    case 3:
                        error_5 = _a.sent();
                        logger_1.default.warn("[GLM] Embedding generation failed: ".concat(this.safeErrorMessage(error_5)));
                        return [2 /*return*/, null];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Generate a specific event label for a single news event.
     * Used for individual article clustering with trend direction.
     */
    GLMAIService.prototype.generateEventLabel = function (input) {
        return __awaiter(this, void 0, void 0, function () {
            var title, prompt, raw, match, parsed, topic, subEventType, trendDirection, urgency, error_6;
            var _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        if (!this.canUseService()) {
                            return [2 /*return*/, null];
                        }
                        title = (input.title || '').trim();
                        if (!title)
                            return [2 /*return*/, null];
                        prompt = "You are a financial news analyst for a crypto/perps trading dashboard.\n\nAnalyze this headline and extract specific event details.\n\nHEADLINE: ".concat(title, "\nCATEGORY: ").concat(input.category || 'UNKNOWN', "\nTAGS: ").concat((input.tags || []).slice(0, 5).join(', ') || 'none', "\n\nREQUIREMENTS:\n1. topic: 3-8 words, MUST be human-readable with proper spacing (NO underscores)\n   - Include PRIMARY ENTITY (specific company, person, country, crypto token)\n   - Include SPECIFIC ACTION (what is happening)\n   - Use Title Case for readability\n   - Good examples:\n     * \"Spot Bitcoin ETF Approval\"\n     * \"Federal Reserve Rate Hike to 5.25%\"\n     * \"Binance $400M Security Breach\"\n     * \"Milei Argentina Election Victory\"\n   - Bad examples (avoid):\n     * \"price action\", \"latest news\", \"market update\"\n     * \"bitcoin_etf\" (underscores, not human-readable)\n     * \"btc breaks 100k\" (abbreviations, unclear)\n\n2. subEventType: specific action category\n   Options: seizure|approval|launch|hack|announcement|sanction|regulation|\n            earnings|price_surge|price_drop|breakout|partnership|listing|\n            delisting|merger|acquisition|proposal|ruling|protest|conflict|other\n\n3. trendDirection: is this bullish or bearish for markets?\n   UP: price surges, approvals, launches, partnerships, listings, breakthroughs\n   DOWN: hacks, sanctions, delistings, crashes, bans, conflicts\n   NEUTRAL: announcements, general news, scheduled events\n\n4. urgency: how time-sensitive is this?\n   CRITICAL: breaking major developments, immediate market impact\n   HIGH: significant news, scheduled events, data releases\n   MEDIUM: analysis, secondary coverage\n   LOW: retrospective, evergreen content\n\n5. keywords: 4-7 specific entities and terms (short, searchable, space-separated)\n   - Good: [\"spot ETF\", \"Bitcoin\", \"SEC approval\", \"institutional flows\"]\n   - Bad: [\"spot_etf\", \"btc\", \"sec\", \"flows\"] (abbreviated, unclear)\n\nReturn JSON ONLY:\n{\n  \"topic\": \"...\",\n  \"subEventType\": \"...\",\n  \"trendDirection\": \"UP|DOWN|NEUTRAL\",\n  \"urgency\": \"CRITICAL|HIGH|MEDIUM|LOW\",\n  \"keywords\": [\"...\", \"...\"]\n}");
                        _c.label = 1;
                    case 1:
                        _c.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.callAPI(prompt, 1, this.labelingModel, 0.3)];
                    case 2:
                        raw = _c.sent();
                        match = raw.match(/\{[\s\S]*\}/);
                        if (!match)
                            return [2 /*return*/, null];
                        parsed = JSON.parse(match[0]);
                        topic = String(parsed.topic || '').trim();
                        subEventType = String(parsed.subEventType || 'other').toLowerCase();
                        trendDirection = (_a = parsed.trendDirection) === null || _a === void 0 ? void 0 : _a.toUpperCase();
                        urgency = (_b = parsed.urgency) === null || _b === void 0 ? void 0 : _b.toUpperCase();
                        if (!topic || !['UP', 'DOWN', 'NEUTRAL'].includes(trendDirection || '')) {
                            return [2 /*return*/, null];
                        }
                        return [2 /*return*/, {
                                topic: topic,
                                subEventType: validateSubEventType(subEventType),
                                trendDirection: trendDirection,
                                urgency: validateUrgency(urgency),
                                keywords: Array.isArray(parsed.keywords)
                                    ? parsed.keywords.map(function (k) { return String(k).trim(); }).filter(Boolean).slice(0, 7)
                                    : [],
                            }];
                    case 3:
                        error_6 = _c.sent();
                        logger_1.default.warn("[GLM] Event label generation failed: ".concat(this.safeErrorMessage(error_6)));
                        return [2 /*return*/, null];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Generate a broad-but-specific trend label for a cluster of related news.
     * Returns null if GLM is not configured.
     */
    GLMAIService.prototype.generateNewsTrendLabel = function (input) {
        return __awaiter(this, void 0, void 0, function () {
            var titles, prompt, raw, match, parsed, error_7;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.canUseService()) {
                            return [2 /*return*/, null];
                        }
                        titles = (input.titles || []).map(function (t) { return t.trim(); }).filter(Boolean).slice(0, 12);
                        if (titles.length === 0)
                            return [2 /*return*/, null];
                        prompt = "You label real-time market/news trends for a crypto trader.\n\nGiven these related headlines, produce ONE broad-but-specific trend label that would make sense on a market heatmap.\n\nRules:\n- Topic: 3-8 words, plain text, Title Case, proper spacing, no underscores\n- Must include the key entity/entities AND what is happening\n- Good examples:\n  * \"Spot Bitcoin ETF Approval\"\n  * \"Federal Reserve Rate Decision\"\n  * \"US China Trade Tensions\"\n- Bad examples (avoid):\n  * \"btc_etf\" (underscores, abbreviations)\n  * \"market news\" (too vague)\n  * \"price action\" (not specific)\n- Summary: 1 sentence, trader-focused\n- Keywords: 4-8 short tokens (entities + key terms), space-separated\n\nCategory hint: ".concat(input.category || 'UNKNOWN', "\nTag hint: ").concat((input.tags || []).slice(0, 10).join(', ') || 'none', "\n\nHeadlines:\n").concat(titles.map(function (t, i) { return "".concat(i + 1, ". ").concat(t); }).join('\n'), "\n\nReturn JSON ONLY:\n{\n  \"topic\": \"...\",\n  \"summary\": \"...\",\n  \"keywords\": [\"...\", \"...\"]\n}");
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.callAPI(prompt, 2, this.labelingModel, 0.3)];
                    case 2:
                        raw = _a.sent();
                        match = raw.match(/\{[\s\S]*\}/);
                        if (!match)
                            return [2 /*return*/, null];
                        parsed = JSON.parse(match[0]);
                        if (!(parsed === null || parsed === void 0 ? void 0 : parsed.topic) || !(parsed === null || parsed === void 0 ? void 0 : parsed.summary))
                            return [2 /*return*/, null];
                        return [2 /*return*/, {
                                topic: String(parsed.topic).trim(),
                                summary: String(parsed.summary).trim(),
                                keywords: Array.isArray(parsed.keywords) ? parsed.keywords.map(function (k) { return String(k).trim(); }).filter(Boolean) : [],
                            }];
                    case 3:
                        error_7 = _a.sent();
                        logger_1.default.warn("[GLM] Trend label generation failed: ".concat(this.safeErrorMessage(error_7)));
                        return [2 /*return*/, null];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Generate text using GLM (public method for agent tools)
     * @param prompt - The prompt to send
     * @param temperature - Temperature for generation (default 0.7)
     */
    GLMAIService.prototype.generateText = function (prompt_4) {
        return __awaiter(this, arguments, void 0, function (prompt, temperature) {
            if (temperature === void 0) { temperature = 0.7; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.canUseService()) {
                            throw new Error('GLM service not configured');
                        }
                        return [4 /*yield*/, this.callAPI(prompt, 2, undefined, temperature)];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    return GLMAIService;
}());
exports.GLMAIService = GLMAIService;
// Singleton instance
var glmService = new GLMAIService();
exports.default = glmService;
function validateSubEventType(value) {
    var validTypes = [
        'seizure', 'approval', 'launch', 'hack', 'announcement', 'sanction',
        'regulation', 'earnings', 'price_surge', 'price_drop', 'breakout',
        'partnership', 'listing', 'delisting', 'merger', 'acquisition',
        'proposal', 'ruling', 'protest', 'conflict', 'other'
    ];
    return validTypes.includes(value) ? value : 'other';
}
function validateUrgency(value) {
    if (['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(value)) {
        return value;
    }
    return 'MEDIUM';
}
