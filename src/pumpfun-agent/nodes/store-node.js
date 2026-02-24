"use strict";
// Store Node - Persist analyzed tokens to database
// Stores token analysis results in SQLite database
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
exports.storeNode = storeNode;
var logger_1 = require("../../shared/logger");
var pumpfun_store_1 = require("../../data/pumpfun-store");
var state_1 = require("../state");
/**
 * Store analyzed tokens to database
 */
function storeNode(state) {
    return __awaiter(this, void 0, void 0, function () {
        var result, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (state.analyzedTokens.length === 0) {
                        logger_1.default.warn('[StoreNode] No tokens to store');
                        return [2 /*return*/, __assign(__assign(__assign({}, (0, state_1.addThought)(state, 'No tokens to store')), (0, state_1.updateStep)(state, 'NO_TOKENS')), { storedCount: 0, duplicateCount: 0 })];
                    }
                    logger_1.default.info("[StoreNode] Storing ".concat(state.analyzedTokens.length, " tokens to database"));
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    // Ensure database is initialized
                    return [4 /*yield*/, pumpfun_store_1.default.initialize()];
                case 2:
                    // Ensure database is initialized
                    _a.sent();
                    result = pumpfun_store_1.default.storeTokens(state.analyzedTokens);
                    logger_1.default.info("[StoreNode] Stored ".concat(result.stored, " tokens, ").concat(result.duplicates, " duplicates"));
                    return [2 /*return*/, __assign(__assign(__assign({}, (0, state_1.addThought)(state, "Stored ".concat(result.stored, " tokens, ").concat(result.duplicates, " were duplicates"))), (0, state_1.updateStep)(state, 'STORE_COMPLETE')), { storedCount: result.stored, duplicateCount: result.duplicates, stats: __assign(__assign({}, state.stats), { totalStored: (state.stats.totalStored || 0) + result.stored, totalDuplicates: (state.stats.totalDuplicates || 0) + result.duplicates }) })];
                case 3:
                    error_1 = _a.sent();
                    logger_1.default.error('[StoreNode] Failed to store tokens:', error_1);
                    return [2 /*return*/, __assign(__assign(__assign(__assign({}, (0, state_1.addThought)(state, "Failed to store tokens: ".concat(error_1))), addError(state, "Storage failed: ".concat(error_1))), (0, state_1.updateStep)(state, 'ERROR')), { storedCount: 0, duplicateCount: 0 })];
                case 4: return [2 /*return*/];
            }
        });
    });
}
function addError(state, error) {
    return __assign(__assign({}, state), { errors: __spreadArray(__spreadArray([], state.errors, true), [error], false) });
}
var state_2 = require("../state");
Object.defineProperty(exports, "addThought", { enumerable: true, get: function () { return state_2.addThought; } });
Object.defineProperty(exports, "updateStep", { enumerable: true, get: function () { return state_2.updateStep; } });
