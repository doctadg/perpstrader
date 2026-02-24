"use strict";
// pump.fun Agent - Main Entry Point
// Autonomous AI agent for vetting pump.fun token launches
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
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
var config_1 = require("../shared/config");
var logger_1 = require("../shared/logger");
var graph_1 = require("./graph");
var pumpfun_store_1 = require("../data/pumpfun-store");
var config = config_1.default.get();
var cycleIntervalMs = ((_a = config.pumpfun) === null || _a === void 0 ? void 0 : _a.cycleIntervalMs) || 60000;
/**
 * Main function - runs continuous pump.fun analysis cycles
 */
function main() {
    return __awaiter(this, void 0, void 0, function () {
        var error_1, messageBus, error_2, cycleCount, result, rec, _i, _a, token, error_3;
        var _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    logger_1.default.info('═════════════════════════════════════════════════════════');
                    logger_1.default.info('  pump.fun Token Analysis Agent - Starting');
                    logger_1.default.info('═════════════════════════════════════════════════════════');
                    _d.label = 1;
                case 1:
                    _d.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, pumpfun_store_1.default.initialize()];
                case 2:
                    _d.sent();
                    logger_1.default.info('[Main] Storage initialized');
                    return [3 /*break*/, 4];
                case 3:
                    error_1 = _d.sent();
                    logger_1.default.error('[Main] Failed to initialize storage:', error_1);
                    process.exit(1);
                    return [3 /*break*/, 4];
                case 4:
                    _d.trys.push([4, 9, , 10]);
                    return [4 /*yield*/, Promise.resolve().then(function () { return require('../shared/message-bus'); })];
                case 5:
                    messageBus = (_d.sent()).default;
                    if (!!messageBus.isConnected) return [3 /*break*/, 7];
                    return [4 /*yield*/, messageBus.connect()];
                case 6:
                    _d.sent();
                    _d.label = 7;
                case 7: return [4 /*yield*/, messageBus.publish('pumpfun:cycle:start', {
                        timestamp: new Date(),
                        config: {
                            subscribeDurationMs: (_b = config.pumpfun) === null || _b === void 0 ? void 0 : _b.subscribeDurationMs,
                            minScoreThreshold: (_c = config.pumpfun) === null || _c === void 0 ? void 0 : _c.minScoreThreshold,
                        },
                    })];
                case 8:
                    _d.sent();
                    return [3 /*break*/, 10];
                case 9:
                    error_2 = _d.sent();
                    logger_1.default.warn('[Main] Failed to publish start event:', error_2);
                    return [3 /*break*/, 10];
                case 10:
                    cycleCount = 0;
                    _d.label = 11;
                case 11:
                    if (!true) return [3 /*break*/, 17];
                    cycleCount++;
                    logger_1.default.info("");
                    logger_1.default.info("\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557");
                    logger_1.default.info("\u2551  PUMPFUN CYCLE ".concat(cycleCount, " - ").concat(new Date().toISOString(), "  \u2551"));
                    logger_1.default.info("\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D");
                    _d.label = 12;
                case 12:
                    _d.trys.push([12, 14, , 15]);
                    return [4 /*yield*/, (0, graph_1.runPumpFunCycle)()];
                case 13:
                    result = _d.sent();
                    logger_1.default.info("");
                    logger_1.default.info("[Main] Cycle ".concat(cycleCount, " Summary:"));
                    logger_1.default.info("  \u251C\u2500 Discovered:   ".concat(result.stats.totalDiscovered));
                    logger_1.default.info("  \u251C\u2500 Analyzed:     ".concat(result.stats.totalAnalyzed));
                    logger_1.default.info("  \u251C\u2500 Stored:       ".concat(result.stats.totalStored));
                    logger_1.default.info("  \u251C\u2500 Duplicates:   ".concat(result.stats.totalDuplicates));
                    logger_1.default.info("  \u251C\u2500 High Conf:    ".concat(result.highConfidenceTokens.length));
                    logger_1.default.info("  \u251C\u2500 Avg Score:    ".concat(result.stats.averageScore.toFixed(2)));
                    logger_1.default.info("  \u2514\u2500 Step:         ".concat(result.currentStep));
                    rec = result.stats.byRecommendation;
                    logger_1.default.info("[Main] Recommendations: STRONG_BUY:".concat(rec.STRONG_BUY, " BUY:").concat(rec.BUY, " HOLD:").concat(rec.HOLD, " AVOID:").concat(rec.AVOID, " STRONG_AVOID:").concat(rec.STRONG_AVOID));
                    // Log high confidence tokens
                    if (result.highConfidenceTokens.length > 0) {
                        logger_1.default.info("[Main] High Confidence Tokens:");
                        for (_i = 0, _a = result.highConfidenceTokens; _i < _a.length; _i++) {
                            token = _a[_i];
                            logger_1.default.info("  - $".concat(token.token.symbol, " (").concat(token.overallScore.toFixed(2), ") ").concat(token.recommendation));
                        }
                    }
                    return [3 /*break*/, 15];
                case 14:
                    error_3 = _d.sent();
                    logger_1.default.error("[Main] Cycle ".concat(cycleCount, " failed:"), error_3);
                    return [3 /*break*/, 15];
                case 15:
                    // Wait before next cycle
                    logger_1.default.info("");
                    logger_1.default.info("[Main] Waiting ".concat(cycleIntervalMs / 1000, "s before next cycle..."));
                    return [4 /*yield*/, sleep(cycleIntervalMs)];
                case 16:
                    _d.sent();
                    return [3 /*break*/, 11];
                case 17: return [2 /*return*/];
            }
        });
    });
}
/**
 * Sleep for specified milliseconds
 */
function sleep(ms) {
    return new Promise(function (resolve) { return setTimeout(resolve, ms); });
}
/**
 * Graceful shutdown handler
 */
function shutdown(signal) {
    return __awaiter(this, void 0, void 0, function () {
        var messageBus, error_4;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    logger_1.default.info("");
                    logger_1.default.info("[Main] Received ".concat(signal, ", shutting down..."));
                    // Close storage
                    pumpfun_store_1.default.close();
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 5, , 6]);
                    return [4 /*yield*/, Promise.resolve().then(function () { return require('../shared/message-bus'); })];
                case 2:
                    messageBus = (_a.sent()).default;
                    return [4 /*yield*/, messageBus.publish('pumpfun:cycle:complete', {
                            timestamp: new Date(),
                            shutdown: true,
                        })];
                case 3:
                    _a.sent();
                    return [4 /*yield*/, messageBus.disconnect()];
                case 4:
                    _a.sent();
                    return [3 /*break*/, 6];
                case 5:
                    error_4 = _a.sent();
                    return [3 /*break*/, 6];
                case 6:
                    logger_1.default.info('[Main] Shutdown complete');
                    process.exit(0);
                    return [2 /*return*/];
            }
        });
    });
}
// Register signal handlers
process.on('SIGINT', function () { return shutdown('SIGINT'); });
process.on('SIGTERM', function () { return shutdown('SIGTERM'); });
// Handle uncaught errors
process.on('uncaughtException', function (error) {
    logger_1.default.error('[Main] Uncaught exception:', error);
    shutdown('UNCAUGHT_EXCEPTION');
});
process.on('unhandledRejection', function (reason, promise) {
    logger_1.default.error('[Main] Unhandled rejection at:', promise, 'reason:', reason);
});
// Start the agent
main().catch(function (error) {
    logger_1.default.error('[Main] Fatal error:', error);
    process.exit(1);
});
