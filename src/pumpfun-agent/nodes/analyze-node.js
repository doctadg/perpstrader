"use strict";
// Analyze Node - OpenRouter-powered website-first analysis
// Uses OpenRouter to analyze token website quality and generate recommendations
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
exports.analyzeNode = analyzeNode;
var logger_1 = require("../../shared/logger");
var config_1 = require("../../shared/config");
var openrouter_service_1 = require("../../shared/openrouter-service");
var state_1 = require("../state");
var uuid_1 = require("uuid");
var axios_1 = require("axios");
/**
 * Run OpenRouter analysis on all tokens and generate final recommendations
 */
function analyzeNode(state) {
    return __awaiter(this, void 0, void 0, function () {
        var webScraper, webModule, error_1, analyzedTokens, concurrency, i, batch, results, _i, results_1, result;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (state.queuedTokens.length === 0) {
                        logger_1.default.warn('[AnalyzeNode] No tokens to analyze');
                        return [2 /*return*/, __assign(__assign(__assign({}, (0, state_1.addThought)(state, 'No tokens to analyze')), (0, state_1.updateStep)(state, 'NO_TOKENS')), { analyzedTokens: [] })];
                    }
                    logger_1.default.info("[AnalyzeNode] Running OpenRouter analysis on ".concat(state.queuedTokens.length, " tokens"));
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, Promise.resolve().then(function () { return require('../services/web-scraper'); })];
                case 2:
                    webModule = _a.sent();
                    webScraper = webModule.default;
                    return [3 /*break*/, 4];
                case 3:
                    error_1 = _a.sent();
                    logger_1.default.error('[AnalyzeNode] Failed to import web scraper service');
                    return [2 /*return*/, __assign(__assign({}, (0, state_1.addThought)(state, 'Failed to import web scraper service')), (0, state_1.updateStep)(state, 'ERROR'))];
                case 4:
                    analyzedTokens = [];
                    concurrency = 3;
                    i = 0;
                    _a.label = 5;
                case 5:
                    if (!(i < state.queuedTokens.length)) return [3 /*break*/, 8];
                    batch = state.queuedTokens.slice(i, i + concurrency);
                    return [4 /*yield*/, Promise.allSettled(batch.map(function (item) { return __awaiter(_this, void 0, void 0, function () {
                            var token, metadata, website, _a, aiAnalysis, error_2;
                            return __generator(this, function (_b) {
                                switch (_b.label) {
                                    case 0:
                                        token = item.token || item;
                                        metadata = item.metadata || token;
                                        _b.label = 1;
                                    case 1:
                                        _b.trys.push([1, 6, , 7]);
                                        if (!metadata.website) return [3 /*break*/, 3];
                                        return [4 /*yield*/, webScraper.analyzeWebsite(metadata.website, metadata)];
                                    case 2:
                                        _a = _b.sent();
                                        return [3 /*break*/, 4];
                                    case 3:
                                        _a = {
                                            url: '',
                                            exists: false,
                                            hasContent: false,
                                            contentQuality: 0,
                                            hasWhitepaper: false,
                                            hasTeamInfo: false,
                                            hasRoadmap: false,
                                            hasTokenomics: false,
                                            sslValid: false,
                                            glmAnalysis: 'No website provided',
                                        };
                                        _b.label = 4;
                                    case 4:
                                        website = _a;
                                        return [4 /*yield*/, runOpenRouterAnalysis({
                                                token: token,
                                                metadata: metadata,
                                                website: website,
                                            })];
                                    case 5:
                                        aiAnalysis = _b.sent();
                                        // Create token analysis
                                        return [2 /*return*/, {
                                                id: (0, uuid_1.v4)(),
                                                token: token,
                                                metadata: metadata,
                                                // Security checks intentionally disabled for this flow.
                                                security: {
                                                    mintAuthority: null,
                                                    freezeAuthority: null,
                                                    decimals: 0,
                                                    supply: 0n,
                                                    isMintable: false,
                                                    isFreezable: false,
                                                    metadataHash: '',
                                                    riskLevel: 'LOW',
                                                },
                                                website: website,
                                                social: {
                                                    twitter: {
                                                        exists: false,
                                                        followerCount: 0,
                                                        tweetCount: 0,
                                                        bio: '',
                                                        verified: false,
                                                        sentimentScore: 0,
                                                    },
                                                    telegram: {
                                                        exists: false,
                                                        memberCount: 0,
                                                        isChannel: false,
                                                        description: '',
                                                    },
                                                    discord: {
                                                        exists: false,
                                                        memberCount: 0,
                                                        inviteActive: false,
                                                    },
                                                    overallPresenceScore: 0,
                                                    glmAnalysis: '',
                                                },
                                                websiteScore: website.contentQuality || 0,
                                                socialScore: 0,
                                                securityScore: 0,
                                                overallScore: 0, // Will be calculated in score node
                                                rationale: aiAnalysis.rationale,
                                                redFlags: aiAnalysis.redFlags,
                                                greenFlags: aiAnalysis.greenFlags,
                                                recommendation: aiAnalysis.recommendation,
                                                analyzedAt: new Date(),
                                                cycleId: state.cycleId,
                                                errors: [],
                                            }];
                                    case 6:
                                        error_2 = _b.sent();
                                        logger_1.default.debug("[AnalyzeNode] Failed to analyze ".concat(token.symbol, ": ").concat(error_2));
                                        return [2 /*return*/, null];
                                    case 7: return [2 /*return*/];
                                }
                            });
                        }); }))];
                case 6:
                    results = _a.sent();
                    for (_i = 0, results_1 = results; _i < results_1.length; _i++) {
                        result = results_1[_i];
                        if (result.status === 'fulfilled' && result.value) {
                            analyzedTokens.push(result.value);
                        }
                    }
                    _a.label = 7;
                case 7:
                    i += concurrency;
                    return [3 /*break*/, 5];
                case 8:
                    logger_1.default.info("[AnalyzeNode] Completed analysis for ".concat(analyzedTokens.length, " tokens"));
                    return [2 /*return*/, __assign(__assign(__assign({}, (0, state_1.addThought)(state, "OpenRouter analysis complete for ".concat(analyzedTokens.length, " tokens"))), (0, state_1.updateStep)(state, 'ANALYSIS_COMPLETE')), { analyzedTokens: analyzedTokens })];
            }
        });
    });
}
/**
 * Run OpenRouter analysis for a token
 */
function runOpenRouterAnalysis(data) {
    return __awaiter(this, void 0, void 0, function () {
        var prompt, config, model, maxTokens, requestBody, requestConfig, response, content, parsed, error_3, affordMatch, affordableBudget, retryBudget, retryResponse, retryContent, retryParsed, retryError_1;
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
        return __generator(this, function (_o) {
            switch (_o.label) {
                case 0:
                    prompt = buildAnalysisPrompt(data);
                    if (!openrouter_service_1.default.canUseService()) {
                        logger_1.default.warn('[AnalyzeNode] OpenRouter API key missing, using fallback website-only analysis');
                        return [2 /*return*/, getWebsiteFallback(data.website)];
                    }
                    config = config_1.default.get();
                    model = process.env.PUMPFUN_OPENROUTER_MODEL || 'arcee-ai/trinity-large-preview:free';
                    maxTokens = Number.parseInt(process.env.PUMPFUN_OPENROUTER_MAX_TOKENS || '120', 10);
                    if (!Number.isFinite(maxTokens) || maxTokens <= 0) {
                        maxTokens = 120;
                    }
                    requestBody = function (tokenBudget) { return ({
                        model: model,
                        messages: [
                            {
                                role: 'system',
                                content: 'You are a conservative crypto launch analyst. Return only valid JSON.',
                            },
                            {
                                role: 'user',
                                content: prompt,
                            },
                        ],
                        temperature: 0.2,
                        max_tokens: tokenBudget,
                    }); };
                    requestConfig = {
                        headers: {
                            Authorization: "Bearer ".concat(config.openrouter.apiKey),
                            'Content-Type': 'application/json',
                            'HTTP-Referer': 'https://perps-trader.ai',
                            'X-Title': 'PerpsTrader PumpFun Analyzer',
                        },
                        timeout: config.openrouter.timeout,
                    };
                    _o.label = 1;
                case 1:
                    _o.trys.push([1, 3, , 8]);
                    return [4 /*yield*/, axios_1.default.post("".concat(config.openrouter.baseUrl, "/chat/completions"), requestBody(maxTokens), requestConfig)];
                case 2:
                    response = _o.sent();
                    content = ((_d = (_c = (_b = (_a = response.data) === null || _a === void 0 ? void 0 : _a.choices) === null || _b === void 0 ? void 0 : _b[0]) === null || _c === void 0 ? void 0 : _c.message) === null || _d === void 0 ? void 0 : _d.content) || '';
                    parsed = parseAIResponse(content);
                    if (!parsed) {
                        logger_1.default.warn('[AnalyzeNode] OpenRouter response was not parseable JSON, using fallback');
                        return [2 /*return*/, getWebsiteFallback(data.website)];
                    }
                    return [2 /*return*/, parsed];
                case 3:
                    error_3 = _o.sent();
                    affordMatch = String(((_g = (_f = (_e = error_3 === null || error_3 === void 0 ? void 0 : error_3.response) === null || _e === void 0 ? void 0 : _e.data) === null || _f === void 0 ? void 0 : _f.error) === null || _g === void 0 ? void 0 : _g.message) || '').match(/afford\s+(\d+)/i);
                    affordableBudget = affordMatch ? Number.parseInt(affordMatch[1], 10) : NaN;
                    if (!(((_h = error_3 === null || error_3 === void 0 ? void 0 : error_3.response) === null || _h === void 0 ? void 0 : _h.status) === 402 && Number.isFinite(affordableBudget) && affordableBudget > 12)) return [3 /*break*/, 7];
                    _o.label = 4;
                case 4:
                    _o.trys.push([4, 6, , 7]);
                    retryBudget = Math.max(12, affordableBudget - 2);
                    logger_1.default.warn("[AnalyzeNode] Retrying OpenRouter analysis with lower token budget: ".concat(retryBudget));
                    return [4 /*yield*/, axios_1.default.post("".concat(config.openrouter.baseUrl, "/chat/completions"), requestBody(retryBudget), requestConfig)];
                case 5:
                    retryResponse = _o.sent();
                    retryContent = ((_m = (_l = (_k = (_j = retryResponse.data) === null || _j === void 0 ? void 0 : _j.choices) === null || _k === void 0 ? void 0 : _k[0]) === null || _l === void 0 ? void 0 : _l.message) === null || _m === void 0 ? void 0 : _m.content) || '';
                    retryParsed = parseAIResponse(retryContent);
                    if (retryParsed) {
                        return [2 /*return*/, retryParsed];
                    }
                    return [3 /*break*/, 7];
                case 6:
                    retryError_1 = _o.sent();
                    logger_1.default.warn("[AnalyzeNode] OpenRouter retry failed: ".concat(retryError_1));
                    return [3 /*break*/, 7];
                case 7:
                    logger_1.default.warn("[AnalyzeNode] OpenRouter analysis failed: ".concat(error_3));
                    return [2 /*return*/, getWebsiteFallback(data.website)];
                case 8: return [2 /*return*/];
            }
        });
    });
}
/**
 * Build the OpenRouter analysis prompt
 */
function buildAnalysisPrompt(data) {
    var token = data.token, metadata = data.metadata, website = data.website;
    return "You are an expert crypto analyst evaluating a new pump.fun token launch.\n\nTOKEN: ".concat(metadata.name, " ($").concat(metadata.symbol, ")\nMint Address: ").concat(token.mintAddress, "\nDescription: ").concat(metadata.description || 'None provided', "\n\nWEBSITE ANALYSIS:\n- URL: ").concat(website.url || 'None', "\n- Content Quality: ").concat((website.contentQuality * 100).toFixed(0), "%\n- Has Whitepaper: ").concat(website.hasWhitepaper ? 'Yes' : 'No', "\n- Has Team Info: ").concat(website.hasTeamInfo ? 'Yes' : 'No', "\n- Has Roadmap: ").concat(website.hasRoadmap ? 'Yes' : 'No', "\n- Has Tokenomics: ").concat(website.hasTokenomics ? 'Yes' : 'No', "\n\nProvide a comprehensive investment assessment. Return JSON ONLY (no markdown, no explanation):\n{\n  \"rationale\": \"1 short sentence (max 14 words)\",\n  \"redFlags\": [\"flag1\"],\n  \"greenFlags\": [\"flag1\"],\n  \"recommendation\": \"STRONG_BUY\" | \"BUY\" | \"HOLD\" | \"AVOID\" | \"STRONG_AVOID\"\n}\n\nImportant:\n- Be critical and conservative. pump.fun tokens are high-risk by default.\n- Prioritize website legitimacy and completeness.\n- Security checks are disabled in this system, so do not infer smart contract safety.");
}
/**
 * Parse AI response
 */
function parseAIResponse(response) {
    try {
        // Extract JSON from response
        var jsonMatch = response.match(/\{[\s\S]*"recommendation"[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('No JSON found in response');
        }
        var parsed = JSON.parse(jsonMatch[0]);
        return {
            rationale: parsed.rationale || parsed.r || 'No rationale provided',
            redFlags: Array.isArray(parsed.redFlags) ? parsed.redFlags : (Array.isArray(parsed.rf) ? parsed.rf : []),
            greenFlags: Array.isArray(parsed.greenFlags) ? parsed.greenFlags : (Array.isArray(parsed.gf) ? parsed.gf : []),
            recommendation: validateRecommendation(parsed.recommendation || parsed.rec),
        };
    }
    catch (error) {
        logger_1.default.debug('[AnalyzeNode] Failed to parse OpenRouter response');
        return null;
    }
}
/**
 * Validate recommendation
 */
function validateRecommendation(rec) {
    var valid = ['STRONG_BUY', 'BUY', 'HOLD', 'AVOID', 'STRONG_AVOID'];
    if (valid.includes(rec)) {
        return rec;
    }
    return 'HOLD';
}
/**
 * Deterministic fallback when OpenRouter is unavailable.
 */
function getWebsiteFallback(website) {
    if (!(website === null || website === void 0 ? void 0 : website.url) || !(website === null || website === void 0 ? void 0 : website.exists)) {
        return {
            rationale: 'No reachable project website was found. Without a verifiable web presence, this token is not investable.',
            redFlags: ['No reachable website', 'Low transparency'],
            greenFlags: [],
            recommendation: 'STRONG_AVOID',
        };
    }
    var redFlags = [];
    var greenFlags = [];
    if (!website.sslValid)
        redFlags.push('Website is not HTTPS');
    if (!website.hasWhitepaper)
        redFlags.push('No whitepaper');
    if (!website.hasTokenomics)
        redFlags.push('No tokenomics details');
    if (!website.hasTeamInfo)
        redFlags.push('No team information');
    if (website.hasWhitepaper)
        greenFlags.push('Whitepaper available');
    if (website.hasTokenomics)
        greenFlags.push('Tokenomics section present');
    if (website.hasRoadmap)
        greenFlags.push('Roadmap available');
    if (website.hasTeamInfo)
        greenFlags.push('Team information provided');
    if (website.contentQuality >= 0.75 && redFlags.length <= 1) {
        return {
            rationale: 'Website quality is strong with multiple credibility signals. Still speculative, but documentation is better than typical launch tokens.',
            redFlags: redFlags,
            greenFlags: greenFlags,
            recommendation: 'BUY',
        };
    }
    if (website.contentQuality >= 0.45) {
        return {
            rationale: 'Website exists with partial documentation, but several credibility gaps remain. Risk is high and conviction is limited.',
            redFlags: redFlags,
            greenFlags: greenFlags,
            recommendation: 'HOLD',
        };
    }
    return {
        rationale: 'Website exists but is low quality or incomplete, which is a significant trust risk for early-stage tokens.',
        redFlags: redFlags,
        greenFlags: greenFlags,
        recommendation: 'AVOID',
    };
}
var state_2 = require("../state");
Object.defineProperty(exports, "addThought", { enumerable: true, get: function () { return state_2.addThought; } });
Object.defineProperty(exports, "updateStep", { enumerable: true, get: function () { return state_2.updateStep; } });
