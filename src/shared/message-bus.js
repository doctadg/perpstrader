"use strict";
// Message Bus Service - Redis Pub/Sub for PerpsTrader
// Provides real-time event communication between all services
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
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
exports.messageBus = exports.Channel = void 0;
var ioredis_1 = require("ioredis");
var events_1 = require("events");
var logger_1 = require("./logger");
// Message Bus Channels
var Channel;
(function (Channel) {
    // Trading cycle events
    Channel["CYCLE_START"] = "trading:cycle:start";
    Channel["CYCLE_COMPLETE"] = "trading:cycle:complete";
    Channel["CYCLE_ERROR"] = "trading:cycle:error";
    Channel["CYCLE_STEP"] = "trading:cycle:step";
    // Market data
    Channel["MARKET_DATA"] = "market:data";
    Channel["MARKET_SNAPSHOT"] = "market:snapshot";
    Channel["ORDER_BOOK_UPDATE"] = "market:orderbook";
    // News events
    Channel["NEWS_SCRAPE_START"] = "news:scrape:start";
    Channel["NEWS_SCRAPE_COMPLETE"] = "news:scrape:complete";
    Channel["NEWS_CATEGORIZED"] = "news:categorized";
    Channel["NEWS_CLUSTERED"] = "news:clustered";
    Channel["NEWS_HOT_CLUSTERS"] = "news:hot";
    // NEW ENHANCEMENT CHANNELS:
    Channel["NEWS_ANOMALY"] = "news:anomaly";
    Channel["NEWS_PREDICTION"] = "news:prediction";
    Channel["NEWS_CROSS_CATEGORY"] = "news:cross_category";
    Channel["ENTITY_TRENDING"] = "entity:trending";
    Channel["USER_ENGAGEMENT"] = "user:engagement";
    Channel["QUALITY_METRIC"] = "quality:metric";
    // Trading events
    Channel["SIGNAL_GENERATED"] = "trading:signal";
    Channel["STRATEGY_SELECTED"] = "trading:strategy:selected";
    Channel["BACKTEST_COMPLETE"] = "trading:backtest:complete";
    // Execution events
    Channel["EXECUTION_SUBMIT"] = "execution:submit";
    Channel["EXECUTION_FILLED"] = "execution:filled";
    Channel["EXECUTION_FAILED"] = "execution:failed";
    Channel["EXECUTION_CANCELLED"] = "execution:cancelled";
    // Position events
    Channel["POSITION_OPENED"] = "position:opened";
    Channel["POSITION_CLOSED"] = "position:closed";
    Channel["POSITION_UPDATED"] = "position:updated";
    // Risk events
    Channel["RISK_LIMIT_BREACH"] = "risk:limit:breach";
    Channel["CIRCUIT_BREAKER_OPEN"] = "circuit:breaker:open";
    Channel["CIRCUIT_BREAKER_CLOSED"] = "circuit:breaker:closed";
    // System events
    Channel["HEALTH_CHECK"] = "system:health";
    Channel["HEARTBEAT"] = "system:heartbeat";
    Channel["ERROR"] = "system:error";
    // Safekeeping fund events
    Channel["SAFEKEEPING_CYCLE_START"] = "safekeeping:cycle:start";
    Channel["SAFEKEEPING_CYCLE_COMPLETE"] = "safekeeping:cycle:complete";
    Channel["SAFEKEEPING_CYCLE_STOP"] = "safekeeping:cycle:stop";
    Channel["SAFEKEEPING_CYCLE_ERROR"] = "safekeeping:cycle:error";
    Channel["SAFEKEEPING_EXECUTION_SUBMIT"] = "safekeeping:execution:submit";
    Channel["SAFEKEEPING_EXECUTION_COMPLETE"] = "safekeeping:execution:complete";
    Channel["SAFEKEEPING_EXECUTION_FAILED"] = "safekeeping:execution:failed";
    Channel["SAFEKEEPING_POSITION_OPENED"] = "safekeeping:position:opened";
    Channel["SAFEKEEPING_POSITION_CLOSED"] = "safekeeping:position:closed";
    Channel["SAFEKEEPING_EMERGENCY_HALT"] = "safekeeping:emergency:halt";
    Channel["SAFEKEEPING_ANOMALY_DETECTED"] = "safekeeping:anomaly:detected";
})(Channel || (exports.Channel = Channel = {}));
var MessageBus = /** @class */ (function (_super) {
    __extends(MessageBus, _super);
    function MessageBus() {
        var _this = _super.call(this) || this;
        _this.publisher = null;
        _this.subscriber = null;
        _this.subscriptions = new Map();
        _this.isConnected = false; // Made public for external access
        _this.reconnectTimer = null;
        _this.serviceId = "".concat(process.env.SERVICE_NAME || 'unknown', "-").concat(process.pid);
        _this.serviceName = process.env.SERVICE_NAME || 'unknown';
        // Load config from environment with defaults
        _this.host = process.env.REDIS_HOST || '127.0.0.1';
        _this.port = Number.parseInt(process.env.REDIS_PORT || '6380', 10);
        _this.password = process.env.REDIS_PASSWORD;
        _this.db = Number.parseInt(process.env.REDIS_DB || '0', 10);
        return _this;
    }
    /**
     * Initialize Redis connections
     */
    MessageBus.prototype.connect = function () {
        return __awaiter(this, void 0, void 0, function () {
            var error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (this.isConnected) {
                            logger_1.default.warn('[MessageBus] Already connected');
                            return [2 /*return*/];
                        }
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 6, , 7]);
                        // Publisher connection (optimised for sending)
                        this.publisher = new ioredis_1.default({
                            host: this.host,
                            port: this.port,
                            password: this.password,
                            db: this.db,
                            retryStrategy: function (times) {
                                var delay = Math.min(times * 50, 2000);
                                logger_1.default.warn("[MessageBus] Publisher reconnect attempt ".concat(times, ", delay ").concat(delay, "ms"));
                                return delay;
                            },
                            maxRetriesPerRequest: 3,
                            lazyConnect: true,
                        });
                        // Subscriber connection (optimised for receiving)
                        this.subscriber = new ioredis_1.default({
                            host: this.host,
                            port: this.port,
                            password: this.password,
                            db: this.db,
                            retryStrategy: function (times) {
                                var delay = Math.min(times * 50, 2000);
                                logger_1.default.warn("[MessageBus] Subscriber reconnect attempt ".concat(times, ", delay ").concat(delay, "ms"));
                                return delay;
                            },
                            maxRetriesPerRequest: null, // Infinite retry for subscriber
                            lazyConnect: true,
                        });
                        // Set up event handlers
                        this.setupEventHandlers();
                        // Connect
                        return [4 /*yield*/, Promise.all([
                                this.publisher.connect(),
                                this.subscriber.connect(),
                            ])];
                    case 2:
                        // Connect
                        _a.sent();
                        // Test connection
                        return [4 /*yield*/, this.publisher.ping()];
                    case 3:
                        // Test connection
                        _a.sent();
                        return [4 /*yield*/, this.subscriber.ping()];
                    case 4:
                        _a.sent();
                        this.isConnected = true;
                        logger_1.default.info("[MessageBus] Connected to redis://".concat(this.host, ":").concat(this.port, "/").concat(this.db));
                        // Subscribe to all registered channels
                        return [4 /*yield*/, this.resubscribeAll()];
                    case 5:
                        // Subscribe to all registered channels
                        _a.sent();
                        // Emit connection event
                        this.emit('connected');
                        return [3 /*break*/, 7];
                    case 6:
                        error_1 = _a.sent();
                        logger_1.default.error('[MessageBus] Failed to connect:', error_1);
                        throw error_1;
                    case 7: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Set up Redis event handlers
     */
    MessageBus.prototype.setupEventHandlers = function () {
        var _this = this;
        if (!this.publisher || !this.subscriber)
            return;
        // Publisher events
        this.publisher.on('connect', function () {
            logger_1.default.debug('[MessageBus] Publisher connected');
        });
        this.publisher.on('error', function (error) {
            logger_1.default.error('[MessageBus] Publisher error:', error);
        });
        // Subscriber events
        this.subscriber.on('connect', function () {
            logger_1.default.debug('[MessageBus] Subscriber connected');
        });
        this.subscriber.on('error', function (error) {
            logger_1.default.error('[MessageBus] Subscriber error:', error);
        });
        // Message handler
        this.subscriber.on('message', function (channel, data) {
            try {
                var message = JSON.parse(data.toString());
                _this.handleMessage(channel, message);
            }
            catch (error) {
                logger_1.default.error("[MessageBus] Failed to parse message from ".concat(channel, ":"), error);
            }
        });
    };
    /**
     * Handle incoming message
     */
    MessageBus.prototype.handleMessage = function (channel, message) {
        // Ignore own messages (prevents loops)
        if (message.source === this.serviceId) {
            return;
        }
        // Emit to local subscribers
        var callbacks = this.subscriptions.get(channel);
        if (callbacks) {
            for (var _i = 0, callbacks_1 = callbacks; _i < callbacks_1.length; _i++) {
                var callback = callbacks_1[_i];
                // Execute asynchronously, don't block
                var result = callback(message);
                if (result instanceof Promise) {
                    result.catch(function (error) {
                        logger_1.default.error("[MessageBus] Callback error for ".concat(channel, ":"), error);
                    });
                }
            }
        }
        // Also emit as event for legacy compatibility
        this.emit(channel, message);
    };
    /**
     * Resubscribe to all channels after reconnection
     */
    MessageBus.prototype.resubscribeAll = function () {
        return __awaiter(this, void 0, void 0, function () {
            var channels;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        if (!this.subscriber || this.subscriptions.size === 0)
                            return [2 /*return*/];
                        channels = Array.from(this.subscriptions.keys());
                        if (!(channels.length > 0)) return [3 /*break*/, 2];
                        return [4 /*yield*/, (_a = this.subscriber).subscribe.apply(_a, channels)];
                    case 1:
                        _b.sent();
                        logger_1.default.info("[MessageBus] Resubscribed to ".concat(channels.length, " channels"));
                        _b.label = 2;
                    case 2: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Publish a message to a channel
     */
    MessageBus.prototype.publish = function (channel, data, correlationId) {
        return __awaiter(this, void 0, void 0, function () {
            var message, error_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.publisher) {
                            logger_1.default.warn('[MessageBus] Cannot publish: not connected');
                            return [2 /*return*/, false];
                        }
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        message = {
                            type: channel,
                            timestamp: new Date(),
                            source: this.serviceId,
                            data: data,
                            id: "".concat(Date.now(), "-").concat(Math.random().toString(36).slice(2, 11)),
                            correlationId: correlationId,
                        };
                        return [4 /*yield*/, this.publisher.publish(channel, JSON.stringify(message))];
                    case 2:
                        _a.sent();
                        return [2 /*return*/, true];
                    case 3:
                        error_2 = _a.sent();
                        logger_1.default.error("[MessageBus] Failed to publish to ".concat(channel, ":"), error_2);
                        return [2 /*return*/, false];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Subscribe to a channel
     */
    MessageBus.prototype.subscribe = function (channel, callback) {
        return __awaiter(this, void 0, void 0, function () {
            var channelStr;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        channelStr = channel;
                        // Add to local subscriptions
                        if (!this.subscriptions.has(channelStr)) {
                            this.subscriptions.set(channelStr, new Set());
                        }
                        this.subscriptions.get(channelStr).add(callback);
                        if (!(this.subscriber && this.isConnected)) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.subscriber.subscribe(channelStr)];
                    case 1:
                        _a.sent();
                        logger_1.default.debug("[MessageBus] Subscribed to ".concat(channelStr));
                        _a.label = 2;
                    case 2: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Unsubscribe from a channel
     */
    MessageBus.prototype.unsubscribe = function (channel, callback) {
        return __awaiter(this, void 0, void 0, function () {
            var channelStr, callbacks;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        channelStr = channel;
                        callbacks = this.subscriptions.get(channelStr);
                        if (!callbacks)
                            return [2 /*return*/];
                        if (callback) {
                            callbacks.delete(callback);
                        }
                        else {
                            callbacks.clear();
                        }
                        if (!(callbacks.size === 0)) return [3 /*break*/, 2];
                        this.subscriptions.delete(channelStr);
                        if (!(this.subscriber && this.isConnected)) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.subscriber.unsubscribe(channelStr)];
                    case 1:
                        _a.sent();
                        logger_1.default.debug("[MessageBus] Unsubscribed from ".concat(channelStr));
                        _a.label = 2;
                    case 2: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Disconnect from Redis
     */
    MessageBus.prototype.disconnect = function () {
        return __awaiter(this, void 0, void 0, function () {
            var disconnectPromises;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (this.reconnectTimer) {
                            clearTimeout(this.reconnectTimer);
                            this.reconnectTimer = null;
                        }
                        disconnectPromises = [];
                        if (this.publisher) {
                            disconnectPromises.push(this.publisher.quit().catch(function () { return _this.publisher.disconnect(); }).then(function () {
                                _this.publisher = null;
                            }));
                        }
                        if (this.subscriber) {
                            disconnectPromises.push(this.subscriber.quit().catch(function () { return _this.subscriber.disconnect(); }).then(function () {
                                _this.subscriber = null;
                            }));
                        }
                        return [4 /*yield*/, Promise.all(disconnectPromises)];
                    case 1:
                        _a.sent();
                        this.isConnected = false;
                        logger_1.default.info('[MessageBus] Disconnected');
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get connection status
     */
    MessageBus.prototype.getStatus = function () {
        return {
            connected: this.isConnected,
            host: this.host,
            port: this.port,
            subscriptions: this.subscriptions.size,
        };
    };
    /**
     * Publish and wait for response (RPC pattern)
     */
    MessageBus.prototype.request = function (channel_1, data_1) {
        return __awaiter(this, arguments, void 0, function (channel, data, timeout) {
            var channelStr, correlationId, responseChannel;
            var _this = this;
            if (timeout === void 0) { timeout = 5000; }
            return __generator(this, function (_a) {
                channelStr = channel;
                correlationId = "".concat(this.serviceId, "-").concat(Date.now());
                responseChannel = "".concat(channelStr, ":response");
                return [2 /*return*/, new Promise(function (resolve) {
                        var timer = setTimeout(function () {
                            void _this.unsubscribe(responseChannel, responseHandler);
                            resolve(null);
                        }, timeout);
                        var responseHandler = function (message) {
                            if (message.correlationId === correlationId) {
                                clearTimeout(timer);
                                void _this.unsubscribe(responseChannel, responseHandler);
                                resolve(message.data);
                            }
                        };
                        void _this.subscribe(responseChannel, responseHandler);
                        void _this.publish(channel, data, correlationId);
                    })];
            });
        });
    };
    return MessageBus;
}(events_1.EventEmitter));
// Singleton instance
exports.messageBus = new MessageBus();
// Auto-connect on import in production
if (process.env.NODE_ENV === 'production') {
    exports.messageBus.connect().catch(function (error) {
        logger_1.default.error('[MessageBus] Auto-connect failed:', error);
    });
}
exports.default = exports.messageBus;
