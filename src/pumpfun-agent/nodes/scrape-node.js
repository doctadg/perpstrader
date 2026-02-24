"use strict";
// Scrape Node - Scrape and analyze websites for tokens
// Uses web scraper to analyze website content quality
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
exports.scrapeNode = scrapeNode;
var logger_1 = require("../../shared/logger");
var state_1 = require("../state");
/**
 * Scrape websites for all queued tokens
 */
function scrapeNode(state) {
    return __awaiter(this, void 0, void 0, function () {
        var webScraper, error_1, websiteAnalyses, concurrency, i, batch;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (state.queuedTokens.length === 0) {
                        logger_1.default.warn('[ScrapeNode] No tokens to scrape');
                        return [2 /*return*/, __assign(__assign({}, (0, state_1.addThought)(state, 'No tokens to scrape')), (0, state_1.updateStep)(state, 'NO_TOKENS'))];
                    }
                    logger_1.default.info("[ScrapeNode] Scraping websites for ".concat(state.queuedTokens.length, " tokens"));
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, Promise.resolve().then(function () { return require('../services/web-scraper'); })];
                case 2:
                    webScraper = (_a.sent()).default;
                    return [3 /*break*/, 4];
                case 3:
                    error_1 = _a.sent();
                    logger_1.default.error('[ScrapeNode] Failed to import web scraper service');
                    return [2 /*return*/, __assign(__assign({}, (0, state_1.addThought)(state, 'Failed to import web scraper service')), (0, state_1.updateStep)(state, 'ERROR'))];
                case 4:
                    websiteAnalyses = new Map();
                    concurrency = 3;
                    i = 0;
                    _a.label = 5;
                case 5:
                    if (!(i < state.queuedTokens.length)) return [3 /*break*/, 8];
                    batch = state.queuedTokens.slice(i, i + concurrency);
                    return [4 /*yield*/, Promise.allSettled(batch.map(function (item) { return __awaiter(_this, void 0, void 0, function () {
                            var token, metadata, analysis, error_2;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0:
                                        token = item.token || item;
                                        metadata = item.metadata || token;
                                        if (!metadata.website) {
                                            // No website to scrape
                                            websiteAnalyses.set(token.mintAddress, {
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
                                            });
                                            return [2 /*return*/];
                                        }
                                        _a.label = 1;
                                    case 1:
                                        _a.trys.push([1, 3, , 4]);
                                        return [4 /*yield*/, webScraper.analyzeWebsite(metadata.website, {
                                                name: metadata.name,
                                                symbol: metadata.symbol,
                                            })];
                                    case 2:
                                        analysis = _a.sent();
                                        websiteAnalyses.set(token.mintAddress, analysis);
                                        return [3 /*break*/, 4];
                                    case 3:
                                        error_2 = _a.sent();
                                        logger_1.default.debug("[ScrapeNode] Failed to scrape ".concat(metadata.website, ": ").concat(error_2));
                                        websiteAnalyses.set(token.mintAddress, {
                                            url: metadata.website,
                                            exists: false,
                                            hasContent: false,
                                            contentQuality: 0,
                                            hasWhitepaper: false,
                                            hasTeamInfo: false,
                                            hasRoadmap: false,
                                            hasTokenomics: false,
                                            sslValid: false,
                                            glmAnalysis: 'Scraping failed',
                                        });
                                        return [3 /*break*/, 4];
                                    case 4: return [2 /*return*/];
                                }
                            });
                        }); }))];
                case 6:
                    _a.sent();
                    _a.label = 7;
                case 7:
                    i += concurrency;
                    return [3 /*break*/, 5];
                case 8:
                    logger_1.default.info("[ScrapeNode] Analyzed ".concat(websiteAnalyses.size, " websites"));
                    return [2 /*return*/, __assign(__assign(__assign({}, (0, state_1.addThought)(state, "Analyzed ".concat(websiteAnalyses.size, " websites"))), (0, state_1.updateStep)(state, 'WEBSITES_SCRAPED')), { thoughts: __spreadArray(__spreadArray([], state.thoughts, true), ["Website analyses: ".concat(websiteAnalyses.size, " completed")], false) })];
            }
        });
    });
}
var state_2 = require("../state");
Object.defineProperty(exports, "addThought", { enumerable: true, get: function () { return state_2.addThought; } });
Object.defineProperty(exports, "updateStep", { enumerable: true, get: function () { return state_2.updateStep; } });
