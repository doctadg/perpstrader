"use strict";
// pump.fun Agent Graph Orchestrator
// Coordinates all nodes in the pump.fun token analysis pipeline
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
exports.PumpFunOrchestrator = exports.createInitialPumpFunState = void 0;
exports.buildPumpFunGraph = buildPumpFunGraph;
exports.runPumpFunCycle = runPumpFunCycle;
var state_1 = require("./state");
Object.defineProperty(exports, "createInitialPumpFunState", { enumerable: true, get: function () { return state_1.createInitialPumpFunState; } });
var nodes_1 = require("./nodes");
var logger_1 = require("../shared/logger");
/**
 * pump.fun Agent Orchestrator
 * Runs the complete analysis pipeline for pump.fun tokens
 */
var PumpFunOrchestrator = /** @class */ (function () {
    function PumpFunOrchestrator() {
    }
    PumpFunOrchestrator.prototype.invoke = function (initialState) {
        return __awaiter(this, void 0, void 0, function () {
            var state, _a, _b, _c, _d, _e, _f, error_1;
            return __generator(this, function (_g) {
                switch (_g.label) {
                    case 0:
                        state = __assign({}, initialState);
                        _g.label = 1;
                    case 1:
                        _g.trys.push([1, 8, , 9]);
                        logger_1.default.info("[PumpFunOrchestrator] Starting pump.fun cycle ".concat(state.cycleId));
                        _a = [__assign({}, state)];
                        return [4 /*yield*/, (0, nodes_1.subscribeNode)(state)];
                    case 2:
                        // Step 1: Subscribe to pump.fun token launches
                        state = __assign.apply(void 0, _a.concat([_g.sent()]));
                        if (state.discoveredTokens.length === 0) {
                            logger_1.default.warn('[PumpFunOrchestrator] No tokens discovered, ending cycle');
                            return [2 /*return*/, __assign(__assign({}, state), { currentStep: 'NO_TOKENS_FOUND' })];
                        }
                        _b = [__assign({}, state)];
                        return [4 /*yield*/, (0, nodes_1.fetchMetadataNode)(state)];
                    case 3:
                        // Step 2: Fetch metadata for discovered tokens
                        state = __assign.apply(void 0, _b.concat([_g.sent()]));
                        if (state.queuedTokens.length === 0) {
                            logger_1.default.warn('[PumpFunOrchestrator] No tokens with metadata, ending cycle');
                            return [2 /*return*/, __assign(__assign({}, state), { currentStep: 'NO_METADATA' })];
                        }
                        _c = [__assign({}, state)];
                        return [4 /*yield*/, (0, nodes_1.analyzeNode)(state)];
                    case 4:
                        // Step 3: Run OpenRouter website-first analysis
                        state = __assign.apply(void 0, _c.concat([_g.sent()]));
                        if (state.analyzedTokens.length === 0) {
                            logger_1.default.warn('[PumpFunOrchestrator] No tokens analyzed, ending cycle');
                            return [2 /*return*/, __assign(__assign({}, state), { currentStep: 'NO_ANALYSIS' })];
                        }
                        _d = [__assign({}, state)];
                        return [4 /*yield*/, (0, nodes_1.scoreNode)(state)];
                    case 5:
                        // Step 4: Calculate confidence scores
                        state = __assign.apply(void 0, _d.concat([_g.sent()]));
                        _e = [__assign({}, state)];
                        return [4 /*yield*/, (0, nodes_1.storeNode)(state)];
                    case 6:
                        // Step 5: Store results to database
                        state = __assign.apply(void 0, _e.concat([_g.sent()]));
                        _f = [__assign({}, state)];
                        return [4 /*yield*/, (0, nodes_1.cleanupNode)(state)];
                    case 7:
                        // Step 6: Cleanup and publish events
                        state = __assign.apply(void 0, _f.concat([_g.sent()]));
                        return [2 /*return*/, state];
                    case 8:
                        error_1 = _g.sent();
                        logger_1.default.error('[PumpFunOrchestrator] Cycle failed:', error_1);
                        return [2 /*return*/, __assign(__assign({}, state), { errors: __spreadArray(__spreadArray([], state.errors, true), ["Orchestrator error: ".concat(error_1)], false), currentStep: 'ERROR' })];
                    case 9: return [2 /*return*/];
                }
            });
        });
    };
    return PumpFunOrchestrator;
}());
exports.PumpFunOrchestrator = PumpFunOrchestrator;
// Singleton instance
var orchestrator = new PumpFunOrchestrator();
function buildPumpFunGraph() {
    return orchestrator;
}
/**
 * Run a single pump.fun analysis cycle
 */
function runPumpFunCycle() {
    return __awaiter(this, void 0, void 0, function () {
        var initialState, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    logger_1.default.info('[PumpFunOrchestrator] Starting pump.fun cycle');
                    initialState = (0, state_1.createInitialPumpFunState)();
                    return [4 /*yield*/, orchestrator.invoke(initialState)];
                case 1:
                    result = _a.sent();
                    logger_1.default.info("[PumpFunOrchestrator] Cycle completed. " +
                        "Discovered: ".concat(result.stats.totalDiscovered, ", ") +
                        "Analyzed: ".concat(result.stats.totalAnalyzed, ", ") +
                        "Stored: ".concat(result.stats.totalStored, ", ") +
                        "High Confidence: ".concat(result.highConfidenceTokens.length));
                    return [2 /*return*/, result];
            }
        });
    });
}
exports.default = buildPumpFunGraph;
