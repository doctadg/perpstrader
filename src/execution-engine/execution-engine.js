"use strict";
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
exports.ExecutionEngine = void 0;
var uuid_1 = require("uuid");
var config_1 = require("../shared/config");
var logger_1 = require("../shared/logger");
var hyperliquid_client_1 = require("./hyperliquid-client");
var data_manager_1 = require("../data-manager/data-manager");
// Track current prices for portfolio valuation
var currentPrices = new Map();
var ExecutionEngine = /** @class */ (function () {
    // REMOVED: isPaperTrading flag
    function ExecutionEngine() {
        var hyperliquidConfig = config_1.default.getSection('hyperliquid');
        this.isTestnet = hyperliquidConfig.testnet;
        logger_1.default.info("Execution Engine initialized - Mode: ".concat(this.getEnvironment()));
        // Initialize the Hyperliquid client asynchronously
        this.initializeClient();
    }
    ExecutionEngine.prototype.initializeClient = function () {
        return __awaiter(this, void 0, void 0, function () {
            var state, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 5, , 6]);
                        return [4 /*yield*/, hyperliquid_client_1.default.initialize()];
                    case 1:
                        _a.sent();
                        if (!hyperliquid_client_1.default.isConfigured()) return [3 /*break*/, 3];
                        return [4 /*yield*/, hyperliquid_client_1.default.getAccountState()];
                    case 2:
                        state = _a.sent();
                        logger_1.default.info("Hyperliquid account connected - Equity: $".concat(state.equity.toFixed(2), ", Withdrawable: $").concat(state.withdrawable.toFixed(2)));
                        return [3 /*break*/, 4];
                    case 3:
                        logger_1.default.warn('Hyperliquid client NOT configured. Please check your .env file.');
                        _a.label = 4;
                    case 4: return [3 /*break*/, 6];
                    case 5:
                        error_1 = _a.sent();
                        logger_1.default.error('Failed to initialize Hyperliquid client:', error_1);
                        return [3 /*break*/, 6];
                    case 6: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Update current price for a symbol (for portfolio valuation)
     */
    ExecutionEngine.prototype.updatePrice = function (symbol, price) {
        currentPrices.set(symbol, price);
    };
    ExecutionEngine.prototype.executeSignal = function (signal, riskAssessment) {
        return __awaiter(this, void 0, void 0, function () {
            var result, trade, error_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 5, , 6]);
                        if (signal.action === 'HOLD') {
                            throw new Error('Cannot execute HOLD signal');
                        }
                        // Update price
                        if (signal.price) {
                            currentPrices.set(signal.symbol, signal.price);
                        }
                        // Check configuration before trading
                        if (!hyperliquid_client_1.default.isConfigured()) {
                            throw new Error('Hyperliquid Client is not configured. Cannot execute live trade.');
                        }
                        // LIVE TRADING with Hyperliquid SDK
                        logger_1.default.info("[LIVE ".concat(this.isTestnet ? 'TESTNET' : 'MAINNET', "] Executing ").concat(signal.action, " ").concat(riskAssessment.suggestedSize, " ").concat(signal.symbol, " at ").concat(signal.price));
                        return [4 /*yield*/, hyperliquid_client_1.default.placeOrder({
                                symbol: signal.symbol,
                                side: signal.action,
                                size: riskAssessment.suggestedSize,
                                price: signal.price,
                                orderType: signal.type.toLowerCase()
                            })];
                    case 1:
                        result = _a.sent();
                        trade = {
                            id: (0, uuid_1.v4)(),
                            strategyId: signal.strategyId,
                            symbol: signal.symbol,
                            side: signal.action,
                            size: result.filledSize || riskAssessment.suggestedSize,
                            price: result.filledPrice || signal.price || 0,
                            fee: 0,
                            pnl: 0,
                            timestamp: new Date(),
                            type: signal.type,
                            status: result.success ? 'FILLED' : 'CANCELLED',
                            entryExit: 'ENTRY'
                        };
                        if (!result.success) return [3 /*break*/, 3];
                        logger_1.default.info("Trade executed: ".concat(JSON.stringify(trade)));
                        // Persist trade to database for Dashboard
                        return [4 /*yield*/, data_manager_1.default.saveTrade(trade)];
                    case 2:
                        // Persist trade to database for Dashboard
                        _a.sent();
                        return [3 /*break*/, 4];
                    case 3:
                        logger_1.default.warn("Trade failed: ".concat(result.error || result.status));
                        _a.label = 4;
                    case 4: return [2 /*return*/, trade];
                    case 5:
                        error_2 = _a.sent();
                        logger_1.default.error('Signal execution failed:', error_2);
                        throw error_2;
                    case 6: return [2 /*return*/];
                }
            });
        });
    };
    ExecutionEngine.prototype.getPortfolio = function () {
        return __awaiter(this, void 0, void 0, function () {
            var state, positions, error_3;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        // Get live portfolio from Hyperliquid
                        if (!hyperliquid_client_1.default.isConfigured()) {
                            // Return empty portfolio if not configured, rather than throwing hard error?
                            // Or maybe throw to alert user? usage seems to expect a Portfolio object.
                            return [2 /*return*/, {
                                    totalValue: 0,
                                    availableBalance: 0,
                                    usedBalance: 0,
                                    positions: [],
                                    dailyPnL: 0,
                                    unrealizedPnL: 0
                                }];
                        }
                        return [4 /*yield*/, hyperliquid_client_1.default.getAccountState()];
                    case 1:
                        state = _a.sent();
                        positions = state.positions.map(function (pos) { return ({
                            symbol: pos.symbol,
                            side: pos.side,
                            size: pos.size,
                            entryPrice: pos.entryPrice,
                            markPrice: pos.markPrice,
                            unrealizedPnL: pos.unrealizedPnL,
                            leverage: pos.leverage,
                            marginUsed: pos.marginUsed
                        }); });
                        return [2 /*return*/, {
                                totalValue: state.equity,
                                availableBalance: state.withdrawable,
                                usedBalance: state.marginUsed,
                                positions: positions,
                                dailyPnL: 0, // Hyperliquid API might provide this in summary, but for now 0 or calculate
                                unrealizedPnL: positions.reduce(function (sum, pos) { return sum + pos.unrealizedPnL; }, 0)
                            }];
                    case 2:
                        error_3 = _a.sent();
                        logger_1.default.error('Failed to get portfolio:', error_3);
                        throw error_3;
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    ExecutionEngine.prototype.cancelOrder = function (orderId, symbol) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!symbol) {
                            logger_1.default.error('Symbol required to cancel order');
                            return [2 /*return*/, false];
                        }
                        return [4 /*yield*/, hyperliquid_client_1.default.cancelOrder(symbol, orderId)];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    ExecutionEngine.prototype.getOpenOrders = function (symbol) {
        return __awaiter(this, void 0, void 0, function () {
            var orders, error_4;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, hyperliquid_client_1.default.getOpenOrders()];
                    case 1:
                        orders = _a.sent();
                        if (symbol) {
                            orders = orders.filter(function (order) { return order.coin === symbol; });
                        }
                        return [2 /*return*/, orders];
                    case 2:
                        error_4 = _a.sent();
                        logger_1.default.error('Failed to get open orders:', error_4);
                        return [2 /*return*/, []];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    ExecutionEngine.prototype.getHistoricalTrades = function (symbol_1) {
        return __awaiter(this, arguments, void 0, function (symbol, limit) {
            var error_5;
            if (limit === void 0) { limit = 100; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, hyperliquid_client_1.default.getRecentTrades(symbol)];
                    case 1: return [2 /*return*/, _a.sent()];
                    case 2:
                        error_5 = _a.sent();
                        logger_1.default.error('Failed to get historical trades:', error_5);
                        return [2 /*return*/, []];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    ExecutionEngine.prototype.getMarketData = function (symbol) {
        return __awaiter(this, void 0, void 0, function () {
            var error_6;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, hyperliquid_client_1.default.getL2Book(symbol)];
                    case 1: return [2 /*return*/, _a.sent()];
                    case 2:
                        error_6 = _a.sent();
                        logger_1.default.error('Failed to get market data:', error_6);
                        throw error_6;
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    ExecutionEngine.prototype.subscribeToWebSocket = function (callback) {
        return __awaiter(this, void 0, void 0, function () {
            var pollInterval;
            var _this = this;
            return __generator(this, function (_a) {
                logger_1.default.info('WebSocket subscription requested, using polling fallback');
                pollInterval = setInterval(function () { return __awaiter(_this, void 0, void 0, function () {
                    var portfolio, error_7;
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0:
                                _a.trys.push([0, 2, , 3]);
                                return [4 /*yield*/, this.getPortfolio()];
                            case 1:
                                portfolio = _a.sent();
                                callback({ type: 'portfolio', data: portfolio });
                                return [3 /*break*/, 3];
                            case 2:
                                error_7 = _a.sent();
                                logger_1.default.error('Portfolio polling failed:', error_7);
                                return [3 /*break*/, 3];
                            case 3: return [2 /*return*/];
                        }
                    });
                }); }, 5000);
                this.pollInterval = pollInterval;
                return [2 /*return*/];
            });
        });
    };
    ExecutionEngine.prototype.unsubscribeFromWebSocket = function () {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
    };
    ExecutionEngine.prototype.emergencyStop = function () {
        return __awaiter(this, void 0, void 0, function () {
            var error_8;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        logger_1.default.info('Executing emergency stop - cancelling all orders');
                        return [4 /*yield*/, hyperliquid_client_1.default.cancelAllOrders()];
                    case 1:
                        _a.sent();
                        logger_1.default.info('Emergency stop completed - all orders canceled');
                        return [3 /*break*/, 3];
                    case 2:
                        error_8 = _a.sent();
                        logger_1.default.error('Emergency stop failed:', error_8);
                        throw error_8;
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    ExecutionEngine.prototype.validateCredentials = function () {
        return __awaiter(this, void 0, void 0, function () {
            var state, error_9;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        if (!hyperliquid_client_1.default.isConfigured())
                            return [2 /*return*/, false];
                        return [4 /*yield*/, hyperliquid_client_1.default.getAccountState()];
                    case 1:
                        state = _a.sent();
                        logger_1.default.info("Credentials validated - Account equity: $".concat(state.equity.toFixed(2)));
                        return [2 /*return*/, true];
                    case 2:
                        error_9 = _a.sent();
                        logger_1.default.error('Credential validation failed:', error_9);
                        return [2 /*return*/, false];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    ExecutionEngine.prototype.isConfigured = function () {
        return hyperliquid_client_1.default.isConfigured();
    };
    ExecutionEngine.prototype.getEnvironment = function () {
        return this.isTestnet ? 'TESTNET' : 'LIVE';
    };
    /**
     * Get recently executed trades from DB
     * Replaces getPaperTrades
     */
    ExecutionEngine.prototype.getRecentTrades = function () {
        return __awaiter(this, arguments, void 0, function (limit) {
            if (limit === void 0) { limit = 20; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, data_manager_1.default.getTrades(undefined, undefined, limit)];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    /**
     * Get current positions from Hyperliquid
     * Replaces getPaperPositions
     */
    ExecutionEngine.prototype.getPositions = function () {
        return __awaiter(this, void 0, void 0, function () {
            var portfolio;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.getPortfolio()];
                    case 1:
                        portfolio = _a.sent();
                        return [2 /*return*/, portfolio.positions];
                }
            });
        });
    };
    /**
     * Get realized P&L from DB
     * Replaces getPaperRealizedPnL (Approximation)
     */
    ExecutionEngine.prototype.getRealizedPnL = function () {
        return __awaiter(this, void 0, void 0, function () {
            var performance;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, data_manager_1.default.getPortfolioPerformance('30d')];
                    case 1:
                        performance = _a.sent();
                        return [2 /*return*/, performance.totalPnL];
                }
            });
        });
    };
    /**
     * Get the wallet address being used
     */
    ExecutionEngine.prototype.getWalletAddress = function () {
        return hyperliquid_client_1.default.getWalletAddress();
    };
    return ExecutionEngine;
}());
exports.ExecutionEngine = ExecutionEngine;
var executionEngine = new ExecutionEngine();
exports.default = executionEngine;
