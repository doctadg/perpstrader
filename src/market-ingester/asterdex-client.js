"use strict";
/**
 * Asterdex Client
 * WebSocket and REST API client for Asterdex perpetual exchange
 * Uses Binance-compatible Aster Futures endpoints.
 */
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
exports.asterdexClient = void 0;
var ws_1 = require("ws");
var axios_1 = require("axios");
var logger_1 = require("../shared/logger");
var config_1 = require("../shared/config");
var AsterdexClient = /** @class */ (function () {
    function AsterdexClient() {
        this.ws = null;
        this.connectionState = 'disconnected';
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectTimer = null;
        this.heartbeatTimer = null;
        this.messageHandlers = new Map();
        this.fundingCache = new Map();
        this.marketsCache = [];
        this.lastMarketsUpdate = 0;
        this.marketsCacheTtlMs = 60000; // 1 minute
        this.quoteSuffixes = ['USDT', 'USD', 'USDC', 'FDUSD', 'BUSD'];
        // Load config from environment or use defaults
        var asterdexConfig = config_1.default.getSection('asterdex') || {};
        this.config = {
            wsEndpoint: process.env.ASTERDEX_WS_ENDPOINT || asterdexConfig.wsEndpoint || 'wss://fstream.asterdex.com/ws',
            restEndpoint: process.env.ASTERDEX_REST_ENDPOINT || asterdexConfig.restEndpoint || 'https://fapi.asterdex.com/fapi/v1',
            apiKey: process.env.ASTERDEX_API_KEY || asterdexConfig.apiKey,
            reconnectIntervalMs: 5000,
            heartbeatIntervalMs: 30000,
            requestTimeoutMs: 30000,
        };
    }
    /**
     * Initialize and connect WebSocket
     */
    AsterdexClient.prototype.initialize = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (this.connectionState === 'connected' || this.connectionState === 'connecting') {
                            return [2 /*return*/];
                        }
                        return [4 /*yield*/, this.connectWebSocket()];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Connect to Asterdex WebSocket
     */
    AsterdexClient.prototype.connectWebSocket = function () {
        return __awaiter(this, void 0, void 0, function () {
            var headers;
            var _this = this;
            var _a;
            return __generator(this, function (_b) {
                if (((_a = this.ws) === null || _a === void 0 ? void 0 : _a.readyState) === ws_1.default.OPEN) {
                    logger_1.default.info('[AsterdexClient] WebSocket already connected');
                    return [2 /*return*/];
                }
                this.connectionState = 'connecting';
                logger_1.default.info("[AsterdexClient] Connecting to WebSocket: ".concat(this.config.wsEndpoint));
                try {
                    headers = {};
                    if (this.config.apiKey) {
                        headers['X-API-Key'] = this.config.apiKey;
                    }
                    this.ws = new ws_1.default(this.config.wsEndpoint, { headers: headers });
                    this.ws.on('open', function () {
                        logger_1.default.info('[AsterdexClient] WebSocket connected');
                        _this.connectionState = 'connected';
                        _this.reconnectAttempts = 0;
                        _this.startHeartbeat();
                        _this.subscribeToFundingRates();
                    });
                    this.ws.on('message', function (data) {
                        _this.handleMessage(data);
                    });
                    this.ws.on('close', function (code, reason) {
                        logger_1.default.warn("[AsterdexClient] WebSocket closed: ".concat(code, " - ").concat(reason.toString()));
                        _this.connectionState = 'disconnected';
                        _this.stopHeartbeat();
                        _this.scheduleReconnect();
                    });
                    this.ws.on('error', function (error) {
                        logger_1.default.error('[AsterdexClient] WebSocket error:', error);
                        _this.connectionState = 'disconnected';
                        _this.scheduleReconnect();
                    });
                }
                catch (error) {
                    logger_1.default.error('[AsterdexClient] Failed to connect WebSocket:', error);
                    this.connectionState = 'disconnected';
                    this.scheduleReconnect();
                }
                return [2 /*return*/];
            });
        });
    };
    /**
     * Handle incoming WebSocket messages
     */
    AsterdexClient.prototype.handleMessage = function (data) {
        try {
            var message_1 = JSON.parse(data.toString());
            // Handle different message types
            switch (message_1.type) {
                case 'funding_rate':
                    this.handleFundingRateUpdate(message_1.data);
                    break;
                case 'funding_rates':
                    this.handleFundingRatesBatch(message_1.data);
                    break;
                case 'market_data':
                    this.handleMarketDataUpdate(message_1.data);
                    break;
                case 'heartbeat':
                    // Heartbeat received, connection is alive
                    break;
                case 'error':
                    logger_1.default.error('[AsterdexClient] WebSocket error message:', message_1.data);
                    break;
                default:
                    // Handle other message types or log unknown
                    logger_1.default.debug('[AsterdexClient] Unknown message type:', message_1.type);
            }
            // Notify registered handlers
            var handlers = this.messageHandlers.get(message_1.type) || [];
            handlers.forEach(function (handler) {
                try {
                    handler(message_1.data);
                }
                catch (err) {
                    logger_1.default.error('[AsterdexClient] Handler error:', err);
                }
            });
        }
        catch (error) {
            logger_1.default.error('[AsterdexClient] Failed to parse message:', error);
        }
    };
    /**
     * Handle single funding rate update
     */
    AsterdexClient.prototype.handleFundingRateUpdate = function (data) {
        if (!data || !data.symbol)
            return;
        var symbol = this.normalizeSymbol(data.symbol);
        if (!symbol)
            return;
        var fundingRate = {
            symbol: symbol,
            fundingRate: parseFloat(data.fundingRate) || 0,
            annualizedRate: this.calculateAnnualizedRate(parseFloat(data.fundingRate) || 0),
            nextFundingTime: data.nextFundingTime || Date.now() + (8 * 60 * 60 * 1000),
            markPrice: parseFloat(data.markPrice) || 0,
            indexPrice: parseFloat(data.indexPrice) || 0,
            predictedFundingRate: data.predictedFundingRate ? parseFloat(data.predictedFundingRate) : undefined,
            timestamp: data.timestamp || Date.now(),
        };
        this.fundingCache.set(fundingRate.symbol, fundingRate);
        logger_1.default.debug("[AsterdexClient] Funding rate update: ".concat(fundingRate.symbol, " = ").concat(fundingRate.fundingRate));
    };
    /**
     * Handle batch funding rates update
     */
    AsterdexClient.prototype.handleFundingRatesBatch = function (data) {
        if (!Array.isArray(data))
            return;
        for (var _i = 0, data_1 = data; _i < data_1.length; _i++) {
            var item = data_1[_i];
            this.handleFundingRateUpdate(item);
        }
        logger_1.default.debug("[AsterdexClient] Batch funding rates update: ".concat(data.length, " symbols"));
    };
    /**
     * Handle market data update
     */
    AsterdexClient.prototype.handleMarketDataUpdate = function (data) {
        if (!data)
            return;
        // Update markets cache if needed
        logger_1.default.debug('[AsterdexClient] Market data update received');
    };
    /**
     * Subscribe to funding rate updates
     */
    AsterdexClient.prototype.subscribeToFundingRates = function () {
        if (!this.ws || this.ws.readyState !== ws_1.default.OPEN)
            return;
        var subscribeMsg = {
            type: 'subscribe',
            channel: 'funding_rates',
        };
        this.ws.send(JSON.stringify(subscribeMsg));
        logger_1.default.info('[AsterdexClient] Subscribed to funding rate updates');
    };
    /**
     * Subscribe to specific symbol
     */
    AsterdexClient.prototype.subscribeToSymbol = function (symbol) {
        if (!this.ws || this.ws.readyState !== ws_1.default.OPEN) {
            logger_1.default.warn('[AsterdexClient] Cannot subscribe, WebSocket not connected');
            return;
        }
        var subscribeMsg = {
            type: 'subscribe',
            channel: 'ticker',
            symbol: this.toPerpSymbol(symbol),
        };
        this.ws.send(JSON.stringify(subscribeMsg));
        logger_1.default.info("[AsterdexClient] Subscribed to ".concat(symbol));
    };
    /**
     * Unsubscribe from specific symbol
     */
    AsterdexClient.prototype.unsubscribeFromSymbol = function (symbol) {
        if (!this.ws || this.ws.readyState !== ws_1.default.OPEN)
            return;
        var unsubscribeMsg = {
            type: 'unsubscribe',
            channel: 'ticker',
            symbol: this.toPerpSymbol(symbol),
        };
        this.ws.send(JSON.stringify(unsubscribeMsg));
    };
    /**
     * Register message handler
     */
    AsterdexClient.prototype.onMessage = function (type, handler) {
        if (!this.messageHandlers.has(type)) {
            this.messageHandlers.set(type, []);
        }
        this.messageHandlers.get(type).push(handler);
    };
    /**
     * Remove message handler
     */
    AsterdexClient.prototype.offMessage = function (type, handler) {
        var handlers = this.messageHandlers.get(type);
        if (handlers) {
            var index = handlers.indexOf(handler);
            if (index > -1) {
                handlers.splice(index, 1);
            }
        }
    };
    /**
     * Start heartbeat to keep connection alive
     */
    AsterdexClient.prototype.startHeartbeat = function () {
        var _this = this;
        this.stopHeartbeat();
        this.heartbeatTimer = setInterval(function () {
            var _a;
            if (((_a = _this.ws) === null || _a === void 0 ? void 0 : _a.readyState) === ws_1.default.OPEN) {
                _this.ws.send(JSON.stringify({ type: 'ping' }));
            }
        }, this.config.heartbeatIntervalMs);
    };
    /**
     * Stop heartbeat
     */
    AsterdexClient.prototype.stopHeartbeat = function () {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    };
    /**
     * Schedule reconnection attempt
     */
    AsterdexClient.prototype.scheduleReconnect = function () {
        var _this = this;
        if (this.reconnectTimer || this.reconnectAttempts >= this.maxReconnectAttempts) {
            return;
        }
        this.reconnectAttempts++;
        var delay = Math.min(this.config.reconnectIntervalMs * Math.pow(2, this.reconnectAttempts - 1), 60000 // Max 1 minute delay
        );
        logger_1.default.info("[AsterdexClient] Scheduling reconnect attempt ".concat(this.reconnectAttempts, "/").concat(this.maxReconnectAttempts, " in ").concat(delay, "ms"));
        this.reconnectTimer = setTimeout(function () {
            _this.reconnectTimer = null;
            _this.connectWebSocket();
        }, delay);
    };
    /**
     * Disconnect WebSocket
     */
    AsterdexClient.prototype.disconnect = function () {
        this.stopHeartbeat();
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.connectionState = 'disconnected';
        logger_1.default.info('[AsterdexClient] Disconnected');
    };
    /**
     * Get connection state
     */
    AsterdexClient.prototype.getConnectionState = function () {
        return this.connectionState;
    };
    /**
     * Check if connected
     */
    AsterdexClient.prototype.isConnected = function () {
        var _a;
        return this.connectionState === 'connected' && ((_a = this.ws) === null || _a === void 0 ? void 0 : _a.readyState) === ws_1.default.OPEN;
    };
    /**
     * REST API: Get all funding rates
     */
    AsterdexClient.prototype.getFundingRates = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _a, premiumIndexResponse, tickerResponse, rates, _i, rates_1, rate, error_1, fallbackResponse, fallbackRates, fallbackError_1;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 2, , 7]);
                        // If we have fresh WebSocket data, use that
                        if (this.fundingCache.size > 0 && this.isConnected()) {
                            return [2 /*return*/, Array.from(this.fundingCache.values())];
                        }
                        return [4 /*yield*/, Promise.all([
                                axios_1.default.get("".concat(this.config.restEndpoint, "/premiumIndex"), {
                                    headers: this.config.apiKey ? { 'X-API-Key': this.config.apiKey } : {},
                                    timeout: this.config.requestTimeoutMs,
                                }),
                                axios_1.default.get("".concat(this.config.restEndpoint, "/ticker/24hr"), {
                                    headers: this.config.apiKey ? { 'X-API-Key': this.config.apiKey } : {},
                                    timeout: this.config.requestTimeoutMs,
                                }),
                            ])];
                    case 1:
                        _a = _b.sent(), premiumIndexResponse = _a[0], tickerResponse = _a[1];
                        rates = this.parseFundingRatesResponse(premiumIndexResponse.data, tickerResponse.data);
                        // Update cache
                        for (_i = 0, rates_1 = rates; _i < rates_1.length; _i++) {
                            rate = rates_1[_i];
                            this.fundingCache.set(rate.symbol, rate);
                        }
                        return [2 /*return*/, rates];
                    case 2:
                        error_1 = _b.sent();
                        logger_1.default.error('[AsterdexClient] Failed to get funding rates:', error_1);
                        _b.label = 3;
                    case 3:
                        _b.trys.push([3, 5, , 6]);
                        return [4 /*yield*/, axios_1.default.get("".concat(this.config.restEndpoint, "/funding/rates"), {
                                headers: this.config.apiKey ? { 'X-API-Key': this.config.apiKey } : {},
                                timeout: this.config.requestTimeoutMs,
                            })];
                    case 4:
                        fallbackResponse = _b.sent();
                        fallbackRates = this.parseFundingRatesResponse(fallbackResponse.data);
                        if (fallbackRates.length > 0) {
                            return [2 /*return*/, fallbackRates];
                        }
                        return [3 /*break*/, 6];
                    case 5:
                        fallbackError_1 = _b.sent();
                        logger_1.default.debug('[AsterdexClient] Legacy funding endpoint fallback failed:', fallbackError_1);
                        return [3 /*break*/, 6];
                    case 6:
                        // Return cached data if available
                        if (this.fundingCache.size > 0) {
                            logger_1.default.warn('[AsterdexClient] Returning cached funding rates');
                            return [2 /*return*/, Array.from(this.fundingCache.values())];
                        }
                        // Return mock data for development (remove in production)
                        return [2 /*return*/, this.getMockFundingRates()];
                    case 7: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * REST API: Get funding rate for specific symbol
     */
    AsterdexClient.prototype.getFundingRate = function (symbol) {
        return __awaiter(this, void 0, void 0, function () {
            var normalizedSymbol, exchangeSymbol, cached, _a, premiumIndexResponse, tickerResponse, rate, error_2;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        normalizedSymbol = this.normalizeSymbol(symbol);
                        exchangeSymbol = this.toPerpSymbol(symbol);
                        cached = this.fundingCache.get(normalizedSymbol);
                        if (cached && Date.now() - cached.timestamp < 60000) {
                            return [2 /*return*/, cached];
                        }
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, Promise.all([
                                axios_1.default.get("".concat(this.config.restEndpoint, "/premiumIndex"), {
                                    params: { symbol: exchangeSymbol },
                                    headers: this.config.apiKey ? { 'X-API-Key': this.config.apiKey } : {},
                                    timeout: this.config.requestTimeoutMs,
                                }),
                                axios_1.default.get("".concat(this.config.restEndpoint, "/ticker/24hr"), {
                                    params: { symbol: exchangeSymbol },
                                    headers: this.config.apiKey ? { 'X-API-Key': this.config.apiKey } : {},
                                    timeout: this.config.requestTimeoutMs,
                                }),
                            ])];
                    case 2:
                        _a = _b.sent(), premiumIndexResponse = _a[0], tickerResponse = _a[1];
                        rate = this.parseFundingRateResponse(premiumIndexResponse.data, tickerResponse.data);
                        if (rate) {
                            this.fundingCache.set(rate.symbol, rate);
                        }
                        return [2 /*return*/, rate];
                    case 3:
                        error_2 = _b.sent();
                        logger_1.default.error("[AsterdexClient] Failed to get funding rate for ".concat(symbol, ":"), error_2);
                        return [2 /*return*/, cached || null];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * REST API: Get all available markets
     */
    AsterdexClient.prototype.getMarkets = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _a, exchangeInfoResponse, tickerResponse, premiumIndexResponse, markets, error_3;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        // Return cached if fresh
                        if (this.marketsCache.length > 0 && Date.now() - this.lastMarketsUpdate < this.marketsCacheTtlMs) {
                            return [2 /*return*/, this.marketsCache];
                        }
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, Promise.all([
                                axios_1.default.get("".concat(this.config.restEndpoint, "/exchangeInfo"), {
                                    headers: this.config.apiKey ? { 'X-API-Key': this.config.apiKey } : {},
                                    timeout: this.config.requestTimeoutMs,
                                }),
                                axios_1.default.get("".concat(this.config.restEndpoint, "/ticker/24hr"), {
                                    headers: this.config.apiKey ? { 'X-API-Key': this.config.apiKey } : {},
                                    timeout: this.config.requestTimeoutMs,
                                }),
                                axios_1.default.get("".concat(this.config.restEndpoint, "/premiumIndex"), {
                                    headers: this.config.apiKey ? { 'X-API-Key': this.config.apiKey } : {},
                                    timeout: this.config.requestTimeoutMs,
                                }),
                            ])];
                    case 2:
                        _a = _b.sent(), exchangeInfoResponse = _a[0], tickerResponse = _a[1], premiumIndexResponse = _a[2];
                        markets = this.parseMarketsResponse(exchangeInfoResponse.data, tickerResponse.data, premiumIndexResponse.data);
                        this.marketsCache = markets;
                        this.lastMarketsUpdate = Date.now();
                        return [2 /*return*/, markets];
                    case 3:
                        error_3 = _b.sent();
                        logger_1.default.error('[AsterdexClient] Failed to get markets:', error_3);
                        if (this.marketsCache.length > 0) {
                            return [2 /*return*/, this.marketsCache];
                        }
                        // Return mock markets for development
                        return [2 /*return*/, this.getMockMarkets()];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * REST API: Get specific market info
     */
    AsterdexClient.prototype.getMarketInfo = function (symbol) {
        return __awaiter(this, void 0, void 0, function () {
            var normalizedSymbol, exchangeSymbol, cached, _a, tickerResponse, premiumIndexResponse, error_4;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        normalizedSymbol = this.normalizeSymbol(symbol);
                        exchangeSymbol = this.toPerpSymbol(symbol);
                        cached = this.marketsCache.find(function (m) { return m.symbol === normalizedSymbol; });
                        if (cached && Date.now() - this.lastMarketsUpdate < this.marketsCacheTtlMs) {
                            return [2 /*return*/, cached];
                        }
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, Promise.all([
                                axios_1.default.get("".concat(this.config.restEndpoint, "/ticker/24hr"), {
                                    params: { symbol: exchangeSymbol },
                                    headers: this.config.apiKey ? { 'X-API-Key': this.config.apiKey } : {},
                                    timeout: this.config.requestTimeoutMs,
                                }),
                                axios_1.default.get("".concat(this.config.restEndpoint, "/premiumIndex"), {
                                    params: { symbol: exchangeSymbol },
                                    headers: this.config.apiKey ? { 'X-API-Key': this.config.apiKey } : {},
                                    timeout: this.config.requestTimeoutMs,
                                }),
                            ])];
                    case 2:
                        _a = _b.sent(), tickerResponse = _a[0], premiumIndexResponse = _a[1];
                        return [2 /*return*/, this.parseMarketResponse(tickerResponse.data, premiumIndexResponse.data)];
                    case 3:
                        error_4 = _b.sent();
                        logger_1.default.error("[AsterdexClient] Failed to get market info for ".concat(symbol, ":"), error_4);
                        return [2 /*return*/, cached || null];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get funding rate history for a symbol
     */
    AsterdexClient.prototype.getFundingHistory = function (symbol_1) {
        return __awaiter(this, arguments, void 0, function (symbol, limit) {
            var response, error_5;
            if (limit === void 0) { limit = 100; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, axios_1.default.get("".concat(this.config.restEndpoint, "/fundingRate"), {
                                params: { symbol: this.toPerpSymbol(symbol), limit: limit },
                                headers: this.config.apiKey ? { 'X-API-Key': this.config.apiKey } : {},
                                timeout: this.config.requestTimeoutMs,
                            })];
                    case 1:
                        response = _a.sent();
                        return [2 /*return*/, this.parseFundingHistoryResponse(response.data)];
                    case 2:
                        error_5 = _a.sent();
                        logger_1.default.error("[AsterdexClient] Failed to get funding history for ".concat(symbol, ":"), error_5);
                        return [2 /*return*/, []];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Calculate annualized funding rate
     * Assumes funding paid every 8 hours (3x per day)
     */
    AsterdexClient.prototype.calculateAnnualizedRate = function (fundingRate) {
        return fundingRate * 3 * 365;
    };
    /**
     * Convert exchange symbol format (e.g. BTCUSDT) to internal base symbol (BTC)
     */
    AsterdexClient.prototype.normalizeSymbol = function (symbol) {
        var cleaned = String(symbol || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (!cleaned)
            return '';
        for (var _i = 0, _a = this.quoteSuffixes; _i < _a.length; _i++) {
            var suffix = _a[_i];
            if (cleaned.endsWith(suffix) && cleaned.length > suffix.length) {
                return cleaned.slice(0, -suffix.length);
            }
        }
        return cleaned;
    };
    /**
     * Convert internal/base symbol (BTC) to exchange perp symbol (BTCUSDT)
     */
    AsterdexClient.prototype.toPerpSymbol = function (symbol) {
        var cleaned = String(symbol || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (!cleaned)
            return '';
        for (var _i = 0, _a = this.quoteSuffixes; _i < _a.length; _i++) {
            var suffix = _a[_i];
            if (cleaned.endsWith(suffix)) {
                return cleaned;
            }
        }
        return "".concat(cleaned, "USDT");
    };
    /**
     * Parse funding rates response
     */
    AsterdexClient.prototype.parseFundingRatesResponse = function (data, ticker24hData) {
        if (!data)
            return [];
        // Handle different response formats
        var rates = (Array.isArray(data) ? data : data.rates || data.data || []);
        var ticker24h = Array.isArray(ticker24hData)
            ? ticker24hData
            : Array.isArray(ticker24hData === null || ticker24hData === void 0 ? void 0 : ticker24hData.data)
                ? ticker24hData.data
                : [];
        var volumeBySymbol = new Map();
        for (var _i = 0, ticker24h_1 = ticker24h; _i < ticker24h_1.length; _i++) {
            var ticker = ticker24h_1[_i];
            var normalizedSymbol = this.normalizeSymbol(String(ticker.symbol || ticker.coin || ticker.asset || ''));
            if (!normalizedSymbol)
                continue;
            var volume = parseFloat(ticker.quoteVolume || ticker.volume || ticker.vol24h || 0);
            if (Number.isFinite(volume) && volume > 0) {
                volumeBySymbol.set(normalizedSymbol, volume);
            }
        }
        var parsed = [];
        for (var _a = 0, rates_2 = rates; _a < rates_2.length; _a++) {
            var item = rates_2[_a];
            var symbol = this.normalizeSymbol(item.symbol || item.coin || item.asset || '');
            if (!symbol)
                continue;
            parsed.push({
                symbol: symbol,
                fundingRate: parseFloat(item.fundingRate || item.lastFundingRate || item.funding || item.rate || 0),
                annualizedRate: parseFloat(item.annualizedRate || item.apr || 0) ||
                    this.calculateAnnualizedRate(parseFloat(item.fundingRate || item.lastFundingRate || item.funding || 0)),
                nextFundingTime: item.nextFundingTime || item.nextFunding || Date.now() + (8 * 60 * 60 * 1000),
                markPrice: parseFloat(item.markPrice || item.markPx || item.price || 0),
                indexPrice: parseFloat(item.indexPrice || item.indexPx || 0),
                predictedFundingRate: item.predictedFundingRate ? parseFloat(item.predictedFundingRate) : undefined,
                timestamp: item.timestamp || item.time || Date.now(),
                volume24h: volumeBySymbol.get(symbol) || 0,
            });
        }
        return parsed;
    };
    /**
     * Parse single funding rate response
     */
    AsterdexClient.prototype.parseFundingRateResponse = function (data, ticker24hData) {
        if (!data)
            return null;
        var item = data.data || data;
        var tickerItem = (ticker24hData === null || ticker24hData === void 0 ? void 0 : ticker24hData.data) || ticker24hData || {};
        var symbol = this.normalizeSymbol(item.symbol || item.coin || '');
        if (!symbol)
            return null;
        return {
            symbol: symbol,
            fundingRate: parseFloat(item.fundingRate || item.lastFundingRate || item.funding || 0),
            annualizedRate: parseFloat(item.annualizedRate || 0) ||
                this.calculateAnnualizedRate(parseFloat(item.fundingRate || item.lastFundingRate || 0)),
            nextFundingTime: item.nextFundingTime || Date.now() + (8 * 60 * 60 * 1000),
            markPrice: parseFloat(item.markPrice || tickerItem.lastPrice || tickerItem.markPrice || 0),
            indexPrice: parseFloat(item.indexPrice || 0),
            volume24h: parseFloat(tickerItem.quoteVolume || tickerItem.volume || 0),
            predictedFundingRate: item.predictedFundingRate ? parseFloat(item.predictedFundingRate) : undefined,
            timestamp: item.timestamp || Date.now(),
        };
    };
    /**
     * Parse markets response
     */
    AsterdexClient.prototype.parseMarketsResponse = function (exchangeInfoData, ticker24hData, premiumIndexData) {
        var _this = this;
        var symbols = Array.isArray(exchangeInfoData === null || exchangeInfoData === void 0 ? void 0 : exchangeInfoData.symbols) ? exchangeInfoData.symbols : [];
        var ticker24h = Array.isArray(ticker24hData) ? ticker24hData : [];
        var premiumIndex = Array.isArray(premiumIndexData) ? premiumIndexData : [];
        var tickerBySymbol = new Map();
        for (var _i = 0, ticker24h_2 = ticker24h; _i < ticker24h_2.length; _i++) {
            var ticker = ticker24h_2[_i];
            tickerBySymbol.set(String(ticker.symbol || '').toUpperCase(), ticker);
        }
        var premiumBySymbol = new Map();
        for (var _a = 0, premiumIndex_1 = premiumIndex; _a < premiumIndex_1.length; _a++) {
            var premium = premiumIndex_1[_a];
            premiumBySymbol.set(String(premium.symbol || '').toUpperCase(), premium);
        }
        return symbols.map(function (item) {
            var exchangeSymbol = String(item.symbol || '').toUpperCase();
            var ticker = tickerBySymbol.get(exchangeSymbol) || {};
            var premium = premiumBySymbol.get(exchangeSymbol) || {};
            return {
                symbol: _this.normalizeSymbol(exchangeSymbol || item.coin || item.name || 'UNKNOWN'),
                baseAsset: item.baseAsset || item.base || _this.normalizeSymbol(exchangeSymbol) || 'UNKNOWN',
                quoteAsset: item.quoteAsset || item.quote || 'USD',
                markPrice: parseFloat(premium.markPrice || ticker.lastPrice || 0),
                indexPrice: parseFloat(premium.indexPrice || 0),
                fundingRate: parseFloat(premium.lastFundingRate || item.fundingRate || 0),
                nextFundingTime: premium.nextFundingTime || Date.now() + (8 * 60 * 60 * 1000),
                openInterest: parseFloat(item.openInterest || item.oi || 0),
                volume24h: parseFloat(ticker.quoteVolume || ticker.volume || 0),
                high24h: parseFloat(ticker.highPrice || item.high24h || item.high || 0),
                low24h: parseFloat(ticker.lowPrice || item.low24h || item.low || 0),
                priceChange24h: parseFloat(ticker.priceChange || item.priceChange24h || item.change24h || 0),
                priceChangePercent24h: parseFloat(ticker.priceChangePercent || item.priceChangePercent24h || item.changePercent24h || 0),
                maxLeverage: parseFloat(item.maxLeverage || item.maxLvg || 20),
                minOrderSize: parseFloat(item.minOrderSize || item.minSz || 0),
                tickSize: parseFloat(item.tickSize || 0.01),
                isActive: item.status === 'TRADING' || (item.isActive !== false && item.status !== 'inactive'),
            };
        });
    };
    /**
     * Parse single market response
     */
    AsterdexClient.prototype.parseMarketResponse = function (ticker24hData, premiumIndexData) {
        if (!ticker24hData && !premiumIndexData)
            return null;
        var ticker = (ticker24hData === null || ticker24hData === void 0 ? void 0 : ticker24hData.data) || ticker24hData || {};
        var premium = (premiumIndexData === null || premiumIndexData === void 0 ? void 0 : premiumIndexData.data) || premiumIndexData || {};
        var exchangeSymbol = String(ticker.symbol || premium.symbol || '');
        var symbol = this.normalizeSymbol(exchangeSymbol || ticker.coin || premium.coin || 'UNKNOWN');
        return {
            symbol: symbol,
            baseAsset: symbol,
            quoteAsset: 'USD',
            markPrice: parseFloat(premium.markPrice || ticker.lastPrice || 0),
            indexPrice: parseFloat(premium.indexPrice || 0),
            fundingRate: parseFloat(premium.lastFundingRate || 0),
            nextFundingTime: premium.nextFundingTime || Date.now() + (8 * 60 * 60 * 1000),
            openInterest: parseFloat(ticker.openInterest || 0),
            volume24h: parseFloat(ticker.quoteVolume || ticker.volume || 0),
            high24h: parseFloat(ticker.highPrice || 0),
            low24h: parseFloat(ticker.lowPrice || 0),
            priceChange24h: parseFloat(ticker.priceChange || 0),
            priceChangePercent24h: parseFloat(ticker.priceChangePercent || 0),
            maxLeverage: 20,
            minOrderSize: 0,
            tickSize: 0.01,
            isActive: true,
        };
    };
    /**
     * Parse funding history response
     */
    AsterdexClient.prototype.parseFundingHistoryResponse = function (data) {
        var _this = this;
        if (!data)
            return [];
        var history = Array.isArray(data) ? data : data.history || data.data || [];
        return history.map(function (item) { return ({
            symbol: _this.normalizeSymbol(item.symbol || 'UNKNOWN'),
            fundingRate: parseFloat(item.fundingRate || item.funding || 0),
            annualizedRate: parseFloat(item.annualizedRate || 0),
            nextFundingTime: item.nextFundingTime || item.fundingTime || 0,
            markPrice: parseFloat(item.markPrice || 0),
            indexPrice: parseFloat(item.indexPrice || 0),
            timestamp: item.timestamp || item.time || Date.now(),
        }); });
    };
    /**
     * Get mock funding rates for development
     * Remove when API is available
     */
    AsterdexClient.prototype.getMockFundingRates = function () {
        var _this = this;
        var symbols = ['BTC', 'ETH', 'SOL', 'AVAX', 'ARB', 'OP', 'LINK', 'DOGE', 'PEPE', 'WIF'];
        var now = Date.now();
        return symbols.map(function (symbol) {
            // Generate realistic funding rates (-0.01% to +0.01%)
            var fundingRate = (Math.random() - 0.5) * 0.0002;
            return {
                symbol: symbol,
                fundingRate: fundingRate,
                annualizedRate: _this.calculateAnnualizedRate(fundingRate),
                nextFundingTime: now + (8 * 60 * 60 * 1000),
                markPrice: 10000 + Math.random() * 90000,
                indexPrice: 10000 + Math.random() * 90000,
                timestamp: now,
            };
        });
    };
    /**
     * Get mock markets for development
     * Remove when API is available
     */
    AsterdexClient.prototype.getMockMarkets = function () {
        var symbols = ['BTC', 'ETH', 'SOL', 'AVAX', 'ARB', 'OP', 'LINK', 'DOGE', 'PEPE', 'WIF'];
        return symbols.map(function (symbol) { return ({
            symbol: symbol,
            baseAsset: symbol,
            quoteAsset: 'USD',
            markPrice: 10000 + Math.random() * 90000,
            indexPrice: 10000 + Math.random() * 90000,
            fundingRate: (Math.random() - 0.5) * 0.0002,
            nextFundingTime: Date.now() + (8 * 60 * 60 * 1000),
            openInterest: 1000000 + Math.random() * 10000000,
            volume24h: 10000000 + Math.random() * 100000000,
            high24h: 50000 + Math.random() * 50000,
            low24h: 40000 + Math.random() * 40000,
            priceChange24h: (Math.random() - 0.5) * 1000,
            priceChangePercent24h: (Math.random() - 0.5) * 10,
            maxLeverage: 20,
            minOrderSize: 0.001,
            tickSize: 0.01,
            isActive: true,
        }); });
    };
    /**
     * Update configuration
     */
    AsterdexClient.prototype.updateConfig = function (newConfig) {
        this.config = __assign(__assign({}, this.config), newConfig);
        logger_1.default.info('[AsterdexClient] Configuration updated');
    };
    /**
     * Get current configuration
     */
    AsterdexClient.prototype.getConfig = function () {
        return __assign({}, this.config);
    };
    return AsterdexClient;
}());
// Export singleton instance
exports.asterdexClient = new AsterdexClient();
exports.default = exports.asterdexClient;
