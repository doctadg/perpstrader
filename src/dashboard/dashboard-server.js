"use strict";
// Dashboard Server for LangGraph Trading Agent
// Provides real-time monitoring of the autonomous trading system
// Enhanced with Redis message bus for event-driven updates
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
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
var express_1 = require("express");
var path_1 = require("path");
var better_sqlite3_1 = require("better-sqlite3");
var socket_io_1 = require("socket.io");
var http_1 = require("http");
var config_1 = require("../shared/config");
var logger_1 = require("../shared/logger");
var trace_store_1 = require("../data/trace-store");
var news_store_1 = require("../data/news-store");
var prediction_store_1 = require("../data/prediction-store");
var polymarket_client_1 = require("../prediction-markets/polymarket-client");
var glm_service_1 = require("../shared/glm-service");
var message_bus_1 = require("../shared/message-bus");
var redis_cache_1 = require("../shared/redis-cache");
var pumpfun_store_1 = require("../data/pumpfun-store");
var enhanced_api_routes_1 = require("./enhanced-api-routes");
var market_heatmap_routes_1 = require("./market-heatmap-routes");
var funding_arbitrage_routes_1 = require("./funding-arbitrage-routes");
var news_heatmap_service_1 = require("./news-heatmap-service");
// Get database path from config
var fullConfig = config_1.default.get();
var dbPath = ((_a = fullConfig.database) === null || _a === void 0 ? void 0 : _a.connection) || './data/trading.db';
var DashboardServer = /** @class */ (function () {
    function DashboardServer() {
        this.newsPollTimer = null;
        this.lastNewsId = null;
        this.messageBusConnected = false;
        this.hotClustersCache = [];
        this.lastHotClustersFetch = 0;
        this.HOT_CLUSTERS_CACHE_TTL = 5000; // 5 seconds
        this.cycleMetrics = {
            totalCycles: 0,
            successfulCycles: 0,
            failedCycles: 0,
            tradesExecuted: 0,
            lastCycleTime: null,
            currentStep: 'IDLE',
            activeCycles: {},
            recentTraces: [],
        };
        this.app = (0, express_1.default)();
        this.server = (0, http_1.createServer)(this.app);
        this.io = new socket_io_1.Server(this.server, {
            cors: { origin: '*' }
        });
        this.port = Number.parseInt(process.env.DASHBOARD_PORT || '3001', 10);
        this.newsPollIntervalMs = Number.parseInt(process.env.NEWS_DASHBOARD_POLL_MS || '10000', 10);
        this.newsPollLimit = Number.parseInt(process.env.NEWS_DASHBOARD_POLL_LIMIT || '25', 10);
        try {
            this.db = new better_sqlite3_1.default(dbPath, { readonly: true, fileMustExist: true });
        }
        catch (error) {
            logger_1.default.warn('Database not found, dashboard will run with limited data:', error);
            this.db = null;
        }
        this.setupMiddleware();
        this.setupRoutes();
        this.setupWebSocket();
        void news_heatmap_service_1.default.initialize();
        this.startNewsPolling(); // Keep as fallback
        this.connectMessageBus(); // NEW: Connect to Redis message bus
    }
    /**
     * Connect to Redis message bus for event-driven updates
     */
    DashboardServer.prototype.connectMessageBus = function () {
        return __awaiter(this, void 0, void 0, function () {
            var error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 3, , 4]);
                        // Connect both message bus and cache
                        return [4 /*yield*/, Promise.all([
                                message_bus_1.default.connect(),
                                redis_cache_1.default.connect(),
                            ])];
                    case 1:
                        // Connect both message bus and cache
                        _a.sent();
                        this.messageBusConnected = true;
                        logger_1.default.info('[Dashboard] Connected to Redis message bus');
                        // Subscribe to news events
                        return [4 /*yield*/, this.subscribeToNewsEvents()];
                    case 2:
                        // Subscribe to news events
                        _a.sent();
                        return [3 /*break*/, 4];
                    case 3:
                        error_1 = _a.sent();
                        logger_1.default.warn('[Dashboard] Failed to connect to message bus, using polling fallback:', error_1);
                        this.messageBusConnected = false;
                        return [3 /*break*/, 4];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Subscribe to news events from message bus
     */
    DashboardServer.prototype.subscribeToNewsEvents = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.messageBusConnected)
                            return [2 /*return*/];
                        // Subscribe to clustering completion events
                        return [4 /*yield*/, message_bus_1.default.subscribe(message_bus_1.Channel.NEWS_CLUSTERED, function (message) { return __awaiter(_this, void 0, void 0, function () {
                                var clusters;
                                var _a;
                                return __generator(this, function (_b) {
                                    switch (_b.label) {
                                        case 0:
                                            logger_1.default.debug('[Dashboard] Received NEWS_CLUSTERED event:', message.data);
                                            // Invalidate hot clusters cache
                                            this.hotClustersCache = [];
                                            this.lastHotClustersFetch = 0;
                                            return [4 /*yield*/, this.getHotClustersCached(25, 24)];
                                        case 1:
                                            clusters = _b.sent();
                                            // Broadcast to WebSocket clients
                                            this.io.emit('news_clustered', {
                                                timestamp: (_a = message.data) === null || _a === void 0 ? void 0 : _a.timestamp,
                                                clusters: clusters,
                                                stats: message.data,
                                            });
                                            return [2 /*return*/];
                                    }
                                });
                            }); })];
                    case 1:
                        // Subscribe to clustering completion events
                        _a.sent();
                        // Subscribe to hot clusters updates
                        return [4 /*yield*/, message_bus_1.default.subscribe(message_bus_1.Channel.NEWS_HOT_CLUSTERS, function (message) { return __awaiter(_this, void 0, void 0, function () {
                                return __generator(this, function (_a) {
                                    logger_1.default.debug('[Dashboard] Received NEWS_HOT_CLUSTERS event:', message.data);
                                    // Invalidate cache
                                    this.hotClustersCache = [];
                                    this.lastHotClustersFetch = 0;
                                    // Broadcast to clients
                                    this.io.emit('news_hot_clusters', __assign({ timestamp: new Date() }, (message.data || {})));
                                    return [2 /*return*/];
                                });
                            }); })];
                    case 2:
                        // Subscribe to hot clusters updates
                        _a.sent();
                        // Subscribe to categorization events
                        return [4 /*yield*/, message_bus_1.default.subscribe(message_bus_1.Channel.NEWS_CATEGORIZED, function (message) { return __awaiter(_this, void 0, void 0, function () {
                                return __generator(this, function (_a) {
                                    logger_1.default.debug('[Dashboard] Received NEWS_CATEGORIZED event');
                                    // Broadcast new articles to clients
                                    this.io.emit('news_categorized', __assign({ timestamp: new Date() }, (message.data || {})));
                                    return [2 /*return*/];
                                });
                            }); })];
                    case 3:
                        // Subscribe to categorization events
                        _a.sent();
                        // =========================================================================
                        // ENHANCED CLUSTERING EVENT SUBSCRIPTIONS
                        // =========================================================================
                        // Subscribe to anomaly detection events
                        return [4 /*yield*/, message_bus_1.default.subscribe(message_bus_1.Channel.NEWS_ANOMALY, function (message) { return __awaiter(_this, void 0, void 0, function () {
                                return __generator(this, function (_a) {
                                    logger_1.default.info('[Dashboard] Received NEWS_ANOMALY event:', message.data);
                                    // Broadcast anomaly alerts to clients
                                    this.io.emit('anomaly_detected', __assign({ timestamp: new Date() }, (message.data || {})));
                                    return [2 /*return*/];
                                });
                            }); })];
                    case 4:
                        // =========================================================================
                        // ENHANCED CLUSTERING EVENT SUBSCRIPTIONS
                        // =========================================================================
                        // Subscribe to anomaly detection events
                        _a.sent();
                        // Subscribe to heat prediction events
                        return [4 /*yield*/, message_bus_1.default.subscribe(message_bus_1.Channel.NEWS_PREDICTION, function (message) { return __awaiter(_this, void 0, void 0, function () {
                                return __generator(this, function (_a) {
                                    logger_1.default.info('[Dashboard] Received NEWS_PREDICTION event:', message.data);
                                    // Broadcast predictions to clients
                                    this.io.emit('prediction_generated', __assign({ timestamp: new Date() }, (message.data || {})));
                                    return [2 /*return*/];
                                });
                            }); })];
                    case 5:
                        // Subscribe to heat prediction events
                        _a.sent();
                        // Subscribe to cross-category linking events
                        return [4 /*yield*/, message_bus_1.default.subscribe(message_bus_1.Channel.NEWS_CROSS_CATEGORY, function (message) { return __awaiter(_this, void 0, void 0, function () {
                                return __generator(this, function (_a) {
                                    logger_1.default.debug('[Dashboard] Received NEWS_CROSS_CATEGORY event:', message.data);
                                    // Broadcast cross-category links to clients
                                    this.io.emit('cross_category_linked', __assign({ timestamp: new Date() }, (message.data || {})));
                                    return [2 /*return*/];
                                });
                            }); })];
                    case 6:
                        // Subscribe to cross-category linking events
                        _a.sent();
                        // Subscribe to entity trending events
                        return [4 /*yield*/, message_bus_1.default.subscribe(message_bus_1.Channel.ENTITY_TRENDING, function (message) { return __awaiter(_this, void 0, void 0, function () {
                                return __generator(this, function (_a) {
                                    logger_1.default.info('[Dashboard] Received ENTITY_TRENDING event:', message.data);
                                    // Broadcast trending entities to clients
                                    this.io.emit('entity_trending', __assign({ timestamp: new Date() }, (message.data || {})));
                                    return [2 /*return*/];
                                });
                            }); })];
                    case 7:
                        // Subscribe to entity trending events
                        _a.sent();
                        // Subscribe to user engagement events
                        return [4 /*yield*/, message_bus_1.default.subscribe(message_bus_1.Channel.USER_ENGAGEMENT, function (message) { return __awaiter(_this, void 0, void 0, function () {
                                return __generator(this, function (_a) {
                                    logger_1.default.debug('[Dashboard] Received USER_ENGAGEMENT event:', message.data);
                                    // Broadcast engagement updates to clients
                                    this.io.emit('user_engagement', __assign({ timestamp: new Date() }, (message.data || {})));
                                    return [2 /*return*/];
                                });
                            }); })];
                    case 8:
                        // Subscribe to user engagement events
                        _a.sent();
                        // Subscribe to quality metric events
                        return [4 /*yield*/, message_bus_1.default.subscribe(message_bus_1.Channel.QUALITY_METRIC, function (message) { return __awaiter(_this, void 0, void 0, function () {
                                return __generator(this, function (_a) {
                                    logger_1.default.debug('[Dashboard] Received QUALITY_METRIC event:', message.data);
                                    // Broadcast quality metrics to clients
                                    this.io.emit('quality_metric', __assign({ timestamp: new Date() }, (message.data || {})));
                                    return [2 /*return*/];
                                });
                            }); })];
                    case 9:
                        // Subscribe to quality metric events
                        _a.sent();
                        // Subscribe to trading cycle events
                        return [4 /*yield*/, message_bus_1.default.subscribe(message_bus_1.Channel.CYCLE_START, function (message) {
                                logger_1.default.debug('[Dashboard] Trading cycle started:', message.data);
                                _this.io.emit('cycle_start', __assign({ timestamp: new Date() }, (message.data || {})));
                            })];
                    case 10:
                        // Subscribe to trading cycle events
                        _a.sent();
                        return [4 /*yield*/, message_bus_1.default.subscribe(message_bus_1.Channel.CYCLE_COMPLETE, function (message) {
                                logger_1.default.debug('[Dashboard] Trading cycle completed:', message.data);
                                _this.io.emit('cycle_complete', __assign({ timestamp: new Date() }, (message.data || {})));
                            })];
                    case 11:
                        _a.sent();
                        return [4 /*yield*/, message_bus_1.default.subscribe(message_bus_1.Channel.CYCLE_ERROR, function (message) {
                                logger_1.default.warn('[Dashboard] Trading cycle error:', message.data);
                                _this.io.emit('cycle_error', __assign({ timestamp: new Date() }, (message.data || {})));
                            })];
                    case 12:
                        _a.sent();
                        // Subscribe to execution events
                        return [4 /*yield*/, message_bus_1.default.subscribe(message_bus_1.Channel.EXECUTION_FILLED, function (message) {
                                logger_1.default.info('[Dashboard] Execution filled:', message.data);
                                _this.io.emit('execution_filled', __assign({ timestamp: new Date() }, (message.data || {})));
                            })];
                    case 13:
                        // Subscribe to execution events
                        _a.sent();
                        return [4 /*yield*/, message_bus_1.default.subscribe(message_bus_1.Channel.EXECUTION_FAILED, function (message) {
                                logger_1.default.warn('[Dashboard] Execution failed:', message.data);
                                _this.io.emit('execution_failed', __assign({ timestamp: new Date() }, (message.data || {})));
                            })];
                    case 14:
                        _a.sent();
                        // Subscribe to position events
                        return [4 /*yield*/, message_bus_1.default.subscribe(message_bus_1.Channel.POSITION_OPENED, function (message) {
                                logger_1.default.info('[Dashboard] Position opened:', message.data);
                                _this.io.emit('position_opened', __assign({ timestamp: new Date() }, (message.data || {})));
                            })];
                    case 15:
                        // Subscribe to position events
                        _a.sent();
                        return [4 /*yield*/, message_bus_1.default.subscribe(message_bus_1.Channel.POSITION_CLOSED, function (message) {
                                logger_1.default.info('[Dashboard] Position closed:', message.data);
                                _this.io.emit('position_closed', __assign({ timestamp: new Date() }, (message.data || {})));
                            })];
                    case 16:
                        _a.sent();
                        // Subscribe to risk events
                        return [4 /*yield*/, message_bus_1.default.subscribe(message_bus_1.Channel.CIRCUIT_BREAKER_OPEN, function (message) {
                                logger_1.default.warn('[Dashboard] Circuit breaker opened:', message.data);
                                _this.io.emit('circuit_breaker_open', __assign({ timestamp: new Date() }, (message.data || {})));
                            })];
                    case 17:
                        // Subscribe to risk events
                        _a.sent();
                        return [4 /*yield*/, message_bus_1.default.subscribe(message_bus_1.Channel.CIRCUIT_BREAKER_CLOSED, function (message) {
                                logger_1.default.info('[Dashboard] Circuit breaker closed:', message.data);
                                _this.io.emit('circuit_breaker_closed', __assign({ timestamp: new Date() }, (message.data || {})));
                            })];
                    case 18:
                        _a.sent();
                        // Subscribe to pump.fun events
                        message_bus_1.default.subscribe('pumpfun:cycle:start', function (message) {
                            logger_1.default.info('[Dashboard] pump.fun cycle started:', message.data);
                            _this.io.emit('pumpfun_cycle_start', __assign({ timestamp: new Date() }, (message.data || {})));
                        });
                        message_bus_1.default.subscribe('pumpfun:cycle:complete', function (message) {
                            logger_1.default.info('[Dashboard] pump.fun cycle completed:', message.data);
                            _this.io.emit('pumpfun_cycle_complete', __assign({ timestamp: new Date() }, (message.data || {})));
                        });
                        message_bus_1.default.subscribe('pumpfun:high:confidence', function (message) {
                            logger_1.default.info('[Dashboard] pump.fun high confidence token discovered:', message.data);
                            _this.io.emit('pumpfun_high_confidence', __assign({ timestamp: new Date() }, (message.data || {})));
                        });
                        // =========================================================================
                        // SAFEKEEPING FUND EVENT SUBSCRIPTIONS
                        // =========================================================================
                        message_bus_1.default.subscribe('safekeeping:cycle:start', function (message) {
                            logger_1.default.info('[Dashboard] Safekeeping cycle started:', message.data);
                            _this.io.emit('safekeeping:cycle:start', __assign({ timestamp: new Date() }, (message.data || {})));
                        });
                        message_bus_1.default.subscribe('safekeeping:cycle:complete', function (message) {
                            logger_1.default.info('[Dashboard] Safekeeping cycle completed:', message.data);
                            _this.io.emit('safekeeping:cycle:complete', __assign({ timestamp: new Date() }, (message.data || {})));
                        });
                        message_bus_1.default.subscribe('safekeeping:cycle:stop', function (message) {
                            logger_1.default.info('[Dashboard] Safekeeping cycle stopped:', message.data);
                            _this.io.emit('safekeeping:cycle:stop', __assign({ timestamp: new Date() }, (message.data || {})));
                        });
                        message_bus_1.default.subscribe('safekeeping:cycle:error', function (message) {
                            logger_1.default.warn('[Dashboard] Safekeeping cycle error:', message.data);
                            _this.io.emit('safekeeping:cycle:error', __assign({ timestamp: new Date() }, (message.data || {})));
                        });
                        message_bus_1.default.subscribe('safekeeping:execution:submit', function (message) {
                            logger_1.default.info('[Dashboard] Safekeeping execution submitted:', message.data);
                            _this.io.emit('safekeeping:execution:submit', __assign({ timestamp: new Date() }, (message.data || {})));
                        });
                        message_bus_1.default.subscribe('safekeeping:execution:complete', function (message) {
                            logger_1.default.info('[Dashboard] Safekeeping execution completed:', message.data);
                            _this.io.emit('safekeeping:execution:complete', __assign({ timestamp: new Date() }, (message.data || {})));
                        });
                        message_bus_1.default.subscribe('safekeeping:position:opened', function (message) {
                            logger_1.default.info('[Dashboard] Safekeeping position opened:', message.data);
                            _this.io.emit('safekeeping:position:opened', __assign({ timestamp: new Date() }, (message.data || {})));
                        });
                        message_bus_1.default.subscribe('safekeeping:position:closed', function (message) {
                            logger_1.default.info('[Dashboard] Safekeeping position closed:', message.data);
                            _this.io.emit('safekeeping:position:closed', __assign({ timestamp: new Date() }, (message.data || {})));
                        });
                        message_bus_1.default.subscribe('safekeeping:emergency:halt', function (message) {
                            logger_1.default.warn('[Dashboard] Safekeeping emergency halt:', message.data);
                            _this.io.emit('safekeeping:emergency:halt', __assign({ timestamp: new Date() }, (message.data || {})));
                        });
                        logger_1.default.info('[Dashboard] Subscribed to all message bus channels');
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get hot clusters with caching
     */
    DashboardServer.prototype.getHotClustersCached = function (limit, hours, category) {
        return __awaiter(this, void 0, void 0, function () {
            var categoryFilter, now, cached, heatmap, filtered;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        categoryFilter = category && category !== 'ALL'
                            ? String(category).toUpperCase()
                            : null;
                        now = Date.now();
                        if (this.hotClustersCache.length > 0 && (now - this.lastHotClustersFetch) < this.HOT_CLUSTERS_CACHE_TTL) {
                            cached = categoryFilter
                                ? this.hotClustersCache.filter(function (c) { return String(c.category).toUpperCase() === categoryFilter; })
                                : this.hotClustersCache;
                            return [2 /*return*/, cached.slice(0, limit)];
                        }
                        return [4 /*yield*/, news_heatmap_service_1.default.getHeatmap({
                                hours: hours,
                                limit: Math.max(limit, 150),
                                category: 'ALL',
                            })];
                    case 1:
                        heatmap = _a.sent();
                        this.hotClustersCache = heatmap.clusters;
                        this.lastHotClustersFetch = now;
                        filtered = categoryFilter
                            ? this.hotClustersCache.filter(function (c) { return String(c.category).toUpperCase() === categoryFilter; })
                            : this.hotClustersCache;
                        return [2 /*return*/, filtered.slice(0, limit)];
                }
            });
        });
    };
    DashboardServer.prototype.setupMiddleware = function () {
        this.app.use(express_1.default.json());
        // Security headers for production
        this.app.use(function (req, res, next) {
            // HTTPS enforcement in production (redirect HTTP to HTTPS)
            var isProduction = config_1.default.isProduction();
            var proto = req.headers['x-forwarded-proto'] || 'http';
            if (isProduction && proto !== 'https' && process.env.NODE_ENV !== 'development') {
                // Allow localhost and 127.0.0.1 for development
                var host = req.headers.host || '';
                if (!host.startsWith('localhost') && !host.startsWith('127.0.0.1')) {
                    // In production with reverse proxy, this would redirect to HTTPS
                    logger_1.default.warn("[Security] Insecure request on ".concat(proto, "://").concat(host));
                }
            }
            // Set security headers
            res.setHeader('X-Content-Type-Options', 'nosniff');
            res.setHeader('X-Frame-Options', 'DENY');
            res.setHeader('X-XSS-Protection', '1; mode=block');
            res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
            // CORS configuration
            var allowedOrigins = process.env.DASHBOARD_ALLOWED_ORIGINS
                ? process.env.DASHBOARD_ALLOWED_ORIGINS.split(',')
                : ['http://localhost:3001', 'https://localhost:3001', 'http://127.0.0.1:3001'];
            var origin = req.headers.origin;
            if (origin && allowedOrigins.includes(origin)) {
                res.setHeader('Access-Control-Allow-Origin', origin);
            }
            else if (!origin || origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
                res.setHeader('Access-Control-Allow-Origin', '*');
            }
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
            res.setHeader('Access-Control-Allow-Credentials', 'true');
            // Rate limiting headers
            res.setHeader('X-RateLimit-Limit', '100');
            res.setHeader('X-RateLimit-Remaining', '99');
            res.setHeader('X-RateLimit-Reset', Date.now().toString());
            next();
        });
        this.app.use(express_1.default.static(path_1.default.join(__dirname, '../../dashboard/public')));
    };
    DashboardServer.prototype.setupRoutes = function () {
        var _this = this;
        // Mount enhanced API routes
        this.app.use('/api/enhanced', enhanced_api_routes_1.default);
        // Mount market heatmap API routes
        this.app.use('/api/heatmap', market_heatmap_routes_1.default);
        // Mount funding arbitrage API routes
        this.app.use('/api/funding', funding_arbitrage_routes_1.default);
        // Health check
        // Health check
        this.app.get('/api/health', function (req, res) { return __awaiter(_this, void 0, void 0, function () {
            var circuitBreaker, healthSummary, messageBusStatus, cacheStatus, useEnhancedClustering, enhancementsEnabled, error_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 3, , 4]);
                        return [4 /*yield*/, Promise.resolve().then(function () { return require('../shared/circuit-breaker'); })];
                    case 1:
                        circuitBreaker = _a.sent();
                        return [4 /*yield*/, circuitBreaker.default.getHealthSummary()];
                    case 2:
                        healthSummary = _a.sent();
                        messageBusStatus = message_bus_1.default.getStatus();
                        cacheStatus = redis_cache_1.default.getStatus();
                        useEnhancedClustering = process.env.USE_ENHANCED_CLUSTERING === 'true';
                        enhancementsEnabled = {
                            enhancedClustering: useEnhancedClustering,
                            entityExtraction: process.env.ENABLE_ENTITY_EXTRACTION === 'true',
                            anomalyDetection: process.env.ENABLE_ANOMALY_DETECTION === 'true',
                            heatPrediction: process.env.ENABLE_HEAT_PREDICTION === 'true',
                            crossCategoryLinking: process.env.ENABLE_CROSS_CATEGORY_LINKING === 'true',
                            userPersonalization: process.env.ENABLE_USER_PERSONALIZATION === 'true',
                        };
                        res.json({
                            status: healthSummary.overall,
                            timestamp: new Date().toISOString(),
                            summary: healthSummary,
                            messageBus: {
                                connected: messageBusStatus.connected,
                                subscriptions: messageBusStatus.subscriptions,
                            },
                            cache: {
                                connected: cacheStatus.connected,
                            },
                            enhancements: {
                                enabled: enhancementsEnabled,
                                clusteringMode: useEnhancedClustering ? 'ENHANCED' : 'STANDARD',
                            },
                        });
                        return [3 /*break*/, 4];
                    case 3:
                        error_2 = _a.sent();
                        logger_1.default.error('Health check error:', error_2);
                        res.json({
                            status: 'ERROR',
                            timestamp: new Date().toISOString(),
                            error: error_2 instanceof Error ? error_2.message : String(error_2),
                        });
                        return [3 /*break*/, 4];
                    case 4: return [2 /*return*/];
                }
            });
        }); });
        // Circuit breaker status
        this.app.get('/api/circuit-breakers', function (req, res) {
            try {
                var circuitBreaker = require('../shared/circuit-breaker').default;
                var breakers = circuitBreaker.getAllBreakerStatuses();
                res.json(breakers);
            }
            catch (error) {
                logger_1.default.error('Circuit breakers endpoint error:', error);
                res.json([]);
            }
        });
        // Reset circuit breaker
        this.app.post('/api/circuit-breakers/:name/reset', function (req, res) {
            try {
                var circuitBreaker = require('../shared/circuit-breaker').default;
                var success = circuitBreaker.resetBreaker(req.params.name);
                res.json({ success: success, message: success ? "Reset ".concat(req.params.name) : "Failed to reset ".concat(req.params.name) });
            }
            catch (error) {
                logger_1.default.error('Circuit breaker reset error:', error);
                res.status(500).json({ success: false, error: error instanceof Error ? error.message : String(error) });
            }
        });
        // Position recovery status
        this.app.get('/api/position-recovery', function (req, res) {
            try {
                var positionRecovery = require('../execution-engine/position-recovery').default;
                var stats = positionRecovery.getStats();
                res.json(stats);
            }
            catch (error) {
                logger_1.default.error('Position recovery endpoint error:', error);
                res.json({
                    lastCheckTime: null,
                    recoveryAttempts: 0,
                    issueHistory: [],
                    activeIssues: [],
                });
            }
        });
        // Trigger position recovery for specific position
        this.app.post('/api/position-recovery/recover', function (req, res) { return __awaiter(_this, void 0, void 0, function () {
            var _a, symbol, side, action, positionRecovery, success, error_3;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 2, , 3]);
                        _a = req.body, symbol = _a.symbol, side = _a.side, action = _a.action;
                        if (!symbol || !side) {
                            return [2 /*return*/, res.status(400).json({ success: false, error: 'symbol and side required' })];
                        }
                        positionRecovery = require('../execution-engine/position-recovery').default;
                        return [4 /*yield*/, positionRecovery.recoverPosition(symbol, side, action || 'CLOSE')];
                    case 1:
                        success = _b.sent();
                        return [2 /*return*/, res.json({ success: success, message: success ? "Recovery triggered for ".concat(symbol, " ").concat(side) : 'Recovery failed' })];
                    case 2:
                        error_3 = _b.sent();
                        logger_1.default.error('Position recovery trigger error:', error_3);
                        return [2 /*return*/, res.status(500).json({ success: false, error: error_3 instanceof Error ? error_3.message : String(error_3) })];
                    case 3: return [2 /*return*/];
                }
            });
        }); });
        // Emergency stop - close all positions
        this.app.post('/api/emergency-stop', function (req, res) { return __awaiter(_this, void 0, void 0, function () {
            var positionRecovery, executionEngine, error_4;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 4, , 5]);
                        positionRecovery = require('../execution-engine/position-recovery').default;
                        return [4 /*yield*/, positionRecovery.emergencyCloseAll()];
                    case 1:
                        _a.sent();
                        executionEngine = require('../execution-engine/execution-engine').default;
                        return [4 /*yield*/, executionEngine.emergencyStop()];
                    case 2:
                        _a.sent();
                        // Publish emergency stop event
                        return [4 /*yield*/, message_bus_1.default.publish(message_bus_1.Channel.ERROR, {
                                type: 'EMERGENCY_STOP',
                                message: 'Emergency stop executed - all positions closed',
                                timestamp: new Date(),
                            })];
                    case 3:
                        // Publish emergency stop event
                        _a.sent();
                        res.json({ success: true, message: 'Emergency stop executed - all positions closed, orders cancelled' });
                        return [3 /*break*/, 5];
                    case 4:
                        error_4 = _a.sent();
                        logger_1.default.error('Emergency stop error:', error_4);
                        res.status(500).json({ success: false, error: error_4 instanceof Error ? error_4.message : String(error_4) });
                        return [3 /*break*/, 5];
                    case 5: return [2 /*return*/];
                }
            });
        }); });
        // Vector store stats (now enabled)
        this.app.get('/api/vector-stats', function (req, res) { return __awaiter(_this, void 0, void 0, function () {
            var vectorStore, stats, error_5;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 3, , 4]);
                        vectorStore = require('../data/vector-store').default;
                        return [4 /*yield*/, vectorStore.initialize()];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, vectorStore.getStats()];
                    case 2:
                        stats = _a.sent();
                        res.json(__assign(__assign({}, stats), { enabled: true }));
                        return [3 /*break*/, 4];
                    case 3:
                        error_5 = _a.sent();
                        logger_1.default.error('Vector stats endpoint error:', error_5);
                        res.json({ patterns: 0, trades: 0, enabled: false, error: error_5 instanceof Error ? error_5.message : String(error_5) });
                        return [3 /*break*/, 4];
                    case 4: return [2 /*return*/];
                }
            });
        }); });
        // System status
        this.app.get('/api/status', function (req, res) { return __awaiter(_this, void 0, void 0, function () {
            var status_1;
            return __generator(this, function (_a) {
                try {
                    status_1 = {
                        agent: 'RUNNING',
                        execution: 'RUNNING',
                        research: 'RUNNING',
                        data: this.db ? 'RUNNING' : 'ERROR',
                        dashboard: 'RUNNING',
                        messageBus: this.messageBusConnected ? 'CONNECTED' : 'DISCONNECTED',
                        uptime: process.uptime() * 1000,
                        lastUpdate: new Date(),
                        errors: [],
                        predictions: prediction_store_1.default.getAgentStatus(),
                        cycles: this.cycleMetrics,
                    };
                    res.json(status_1);
                }
                catch (error) {
                    logger_1.default.error('Status endpoint error:', error);
                    res.status(500).json({ error: 'Failed to get system status' });
                }
                return [2 /*return*/];
            });
        }); });
        // Cycle metrics
        this.app.get('/api/cycles', function (req, res) {
            res.json(_this.cycleMetrics);
        });
        // Vector store stats
        this.app.get('/api/vector-stats', function (req, res) {
            res.json({ patterns: 0, trades: 0, enabled: false });
        });
        // Recent cycle traces
        // Recent cycle traces - Fetch from DB for full history
        this.app.get('/api/traces', function (req, res) {
            try {
                var limit = parseInt(req.query.limit) || 200;
                var agent = req.query.agent || undefined;
                trace_store_1.default.initialize();
                var summaries = trace_store_1.default.getRecentTraceSummaries(limit, agent);
                res.json(summaries.map(function (summary) { return ({
                    id: summary.id,
                    startTime: summary.startTime || summary.createdAt,
                    endTime: summary.endTime,
                    symbol: summary.symbol,
                    agentType: summary.agentType,
                    success: summary.success,
                    tradeExecuted: summary.tradeExecuted,
                    regime: summary.regime,
                    strategyCount: summary.strategyCount,
                    riskScore: summary.riskScore,
                }); }));
            }
            catch (error) {
                logger_1.default.error('Traces endpoint error:', error);
                // Fallback to in-memory if DB fails
                res.json(_this.cycleMetrics.recentTraces.map(function (t) {
                    var _a, _b;
                    return ({
                        id: t.cycleId,
                        startTime: t.startTime,
                        endTime: t.endTime,
                        symbol: t.symbol,
                        success: t.success,
                        tradeExecuted: t.tradeExecuted,
                        regime: t.regime,
                        strategyCount: ((_a = t.strategyIdeas) === null || _a === void 0 ? void 0 : _a.length) || 0,
                        riskScore: ((_b = t.riskAssessment) === null || _b === void 0 ? void 0 : _b.riskScore) || 0,
                    });
                }));
            }
        });
        // Detailed trace for a specific cycle
        this.app.get('/api/traces/:id', function (req, res) {
            try {
                // Try DB first
                trace_store_1.default.initialize();
                var storedTrace = trace_store_1.default.getTraceById(req.params.id);
                if (storedTrace) {
                    try {
                        var traceData = JSON.parse(storedTrace.traceData);
                        res.json(traceData);
                        return;
                    }
                    catch (e) {
                        logger_1.default.error("Failed to parse trace data for ".concat(req.params.id), e);
                    }
                }
                // Fallback to memory
                var trace = _this.cycleMetrics.recentTraces.find(function (t) { return t.cycleId === req.params.id; });
                if (!trace) {
                    res.status(404).json({ error: 'Trace not found' });
                    return;
                }
                res.json(trace);
            }
            catch (error) {
                logger_1.default.error("Error fetching trace ".concat(req.params.id, ":"), error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
        // Live portfolio status
        this.app.get('/api/portfolio', function (req, res) { return __awaiter(_this, void 0, void 0, function () {
            var executionEngine, _a, portfolio, positions, realizedPnL, trades, error_6;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 2, , 3]);
                        executionEngine = require('../execution-engine/execution-engine').default;
                        return [4 /*yield*/, Promise.all([
                                executionEngine.getPortfolio().catch(function (e) { return null; }),
                                executionEngine.getPositions().catch(function (e) { return []; }),
                                executionEngine.getRealizedPnL().catch(function (e) { return 0; }),
                                executionEngine.getRecentTrades().catch(function (e) { return []; })
                            ])];
                    case 1:
                        _a = _b.sent(), portfolio = _a[0], positions = _a[1], realizedPnL = _a[2], trades = _a[3];
                        res.json({
                            portfolio: portfolio || { totalValue: 0, availableBalance: 0, positions: [] },
                            positions: positions || [],
                            realizedPnL: realizedPnL || 0,
                            recentTrades: (trades || []).slice(0, 50),
                            environment: executionEngine.getEnvironment ? executionEngine.getEnvironment() : 'LIVE',
                        });
                        return [3 /*break*/, 3];
                    case 2:
                        error_6 = _b.sent();
                        logger_1.default.error('Portfolio endpoint error:', error_6);
                        res.json({
                            portfolio: { totalValue: 0, availableBalance: 0, positions: [] },
                            positions: [],
                            realizedPnL: 0,
                            recentTrades: [],
                            environment: 'LIVE',
                        });
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        }); });
        // Active strategies
        this.app.get('/api/strategies', function (req, res) { return __awaiter(_this, void 0, void 0, function () {
            var strategies;
            return __generator(this, function (_a) {
                try {
                    if (!this.db) {
                        res.json([]);
                        return [2 /*return*/];
                    }
                    strategies = this.db.prepare("\n          SELECT * FROM strategies\n          WHERE isActive = 1\n          ORDER BY updatedAt DESC\n        ").all();
                    res.json(strategies.map(function (s) { return (__assign(__assign({}, s), { symbols: JSON.parse(s.symbols || '[]'), parameters: JSON.parse(s.parameters || '{}'), entryConditions: JSON.parse(s.entryConditions || '[]'), exitConditions: JSON.parse(s.exitConditions || '[]'), riskParameters: JSON.parse(s.riskParameters || '{}'), performance: JSON.parse(s.performance || '{}') })); }));
                }
                catch (error) {
                    logger_1.default.error('Strategies endpoint error:', error);
                    res.json([]);
                }
                return [2 /*return*/];
            });
        }); });
        // Recent trades
        this.app.get('/api/trades', function (req, res) { return __awaiter(_this, void 0, void 0, function () {
            var limit, trades;
            return __generator(this, function (_a) {
                try {
                    if (!this.db) {
                        res.json([]);
                        return [2 /*return*/];
                    }
                    limit = parseInt(req.query.limit) || 50;
                    trades = this.db.prepare("\n          SELECT * FROM trades\n          ORDER BY timestamp DESC\n          LIMIT ?\n        ").all(limit);
                    res.json(trades);
                }
                catch (error) {
                    logger_1.default.error('Trades endpoint error:', error);
                    res.json([]);
                }
                return [2 /*return*/];
            });
        }); });
        // Market data
        this.app.get('/api/market-data', function (req, res) { return __awaiter(_this, void 0, void 0, function () {
            var limit, symbol, query, data;
            return __generator(this, function (_a) {
                try {
                    if (!this.db) {
                        res.json([]);
                        return [2 /*return*/];
                    }
                    limit = parseInt(req.query.limit) || 100;
                    symbol = req.query.symbol;
                    query = symbol
                        ? 'SELECT * FROM market_data WHERE symbol = ? ORDER BY timestamp DESC LIMIT ?'
                        : 'SELECT * FROM market_data ORDER BY timestamp DESC LIMIT ?';
                    data = symbol
                        ? this.db.prepare(query).all(symbol, limit)
                        : this.db.prepare(query).all(limit);
                    res.json(data);
                }
                catch (error) {
                    logger_1.default.error('Market data endpoint error:', error);
                    res.json([]);
                }
                return [2 /*return*/];
            });
        }); });
        // AI insights
        this.app.get('/api/insights', function (req, res) { return __awaiter(_this, void 0, void 0, function () {
            var limit, insights;
            return __generator(this, function (_a) {
                try {
                    if (!this.db) {
                        res.json([]);
                        return [2 /*return*/];
                    }
                    limit = parseInt(req.query.limit) || 20;
                    insights = this.db.prepare("\n          SELECT * FROM ai_insights\n          ORDER BY timestamp DESC\n          LIMIT ?\n        ").all(limit);
                    res.json(insights.map(function (i) { return (__assign(__assign({}, i), { data: JSON.parse(i.data || '{}') })); }));
                }
                catch (error) {
                    logger_1.default.error('Insights endpoint error:', error);
                    res.json([]);
                }
                return [2 /*return*/];
            });
        }); });
        // Configuration (safe subset)
        this.app.get('/api/config', function (req, res) {
            try {
                var cfg = config_1.default.get();
                var safeConfig = {
                    app: cfg.app,
                    risk: cfg.risk,
                    trading: cfg.trading,
                };
                res.json(safeConfig);
            }
            catch (error) {
                logger_1.default.error('Config endpoint error:', error);
                res.status(500).json({ error: 'Failed to get configuration' });
            }
        });
        // Cache statistics
        this.app.get('/api/cache/stats', function (req, res) { return __awaiter(_this, void 0, void 0, function () {
            var cacheStats, llmStats, error_7;
            var _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        _c.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, redis_cache_1.default.getStats()];
                    case 1:
                        cacheStats = _c.sent();
                        llmStats = ((_b = (_a = require('../shared/openrouter-service').default) === null || _a === void 0 ? void 0 : _a.getCacheStats) === null || _b === void 0 ? void 0 : _b.call(_a)) || {
                            hits: 0,
                            misses: 0,
                            hitRate: 0,
                        };
                        res.json({
                            redis: cacheStats,
                            llm: llmStats,
                        });
                        return [3 /*break*/, 3];
                    case 2:
                        error_7 = _c.sent();
                        logger_1.default.error('Cache stats endpoint error:', error_7);
                        res.json({
                            redis: { totalKeys: 0, memoryBytes: 0 },
                            llm: { hits: 0, misses: 0, hitRate: 0 },
                        });
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        }); });
        // News API routes
        this.app.get('/api/news/clusters', function (req, res) { return __awaiter(_this, void 0, void 0, function () {
            var limit, hours, category, force, heatmap, error_8;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        limit = parseInt(req.query.limit) || 20;
                        hours = parseInt(req.query.hours) || 24;
                        category = req.query.category;
                        force = req.query.force === 'true';
                        return [4 /*yield*/, news_heatmap_service_1.default.getHeatmap({
                                limit: limit,
                                hours: hours,
                                category: category || 'ALL',
                                force: force,
                            })];
                    case 1:
                        heatmap = _a.sent();
                        res.json(heatmap.clusters);
                        return [3 /*break*/, 3];
                    case 2:
                        error_8 = _a.sent();
                        logger_1.default.error('Clusters endpoint error:', error_8);
                        res.json([]);
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        }); });
        this.app.get('/api/news/heatmap', function (req, res) { return __awaiter(_this, void 0, void 0, function () {
            var limit, hours, category, force, heatmap, error_9;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        limit = parseInt(req.query.limit) || 80;
                        hours = parseInt(req.query.hours) || 24;
                        category = req.query.category;
                        force = req.query.force === 'true';
                        return [4 /*yield*/, news_heatmap_service_1.default.getHeatmap({
                                limit: limit,
                                hours: hours,
                                category: category || 'ALL',
                                force: force,
                            })];
                    case 1:
                        heatmap = _a.sent();
                        res.json({
                            generatedAt: heatmap.generatedAt,
                            hours: heatmap.hours,
                            category: heatmap.category,
                            totalArticles: heatmap.totalArticles,
                            totalClusters: heatmap.totalClusters,
                            total: heatmap.clusters.length,
                            clusters: heatmap.clusters,
                            byCategory: heatmap.byCategory,
                            llm: heatmap.llm,
                        });
                        return [3 /*break*/, 3];
                    case 2:
                        error_9 = _a.sent();
                        logger_1.default.error('Heatmap endpoint error:', error_9);
                        res.json({
                            generatedAt: new Date().toISOString(),
                            hours: 24,
                            category: 'ALL',
                            totalArticles: 0,
                            totalClusters: 0,
                            total: 0,
                            clusters: [],
                            byCategory: {},
                            llm: {
                                enabled: false,
                                model: config_1.default.get().openrouter.labelingModel,
                                labeledArticles: 0,
                                coverage: 0,
                            },
                        });
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        }); });
        this.app.get('/api/news/heatmap/timeline', function (req, res) { return __awaiter(_this, void 0, void 0, function () {
            var hours, bucketHours, category, timeline, error_10;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        hours = parseInt(req.query.hours) || 24;
                        bucketHours = parseInt(req.query.bucketHours) || 2;
                        category = req.query.category || 'ALL';
                        return [4 /*yield*/, news_heatmap_service_1.default.getTimeline(hours, bucketHours, category)];
                    case 1:
                        timeline = _a.sent();
                        res.json(timeline);
                        return [3 /*break*/, 3];
                    case 2:
                        error_10 = _a.sent();
                        logger_1.default.error('Heatmap timeline endpoint error:', error_10);
                        res.json({
                            generatedAt: new Date().toISOString(),
                            hours: 24,
                            bucketHours: 2,
                            points: [],
                        });
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        }); });
        this.app.post('/api/news/heatmap/rebuild', function (req, res) { return __awaiter(_this, void 0, void 0, function () {
            var limit, hours, category, rebuilt, error_11;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        limit = parseInt(req.query.limit) || 80;
                        hours = parseInt(req.query.hours) || 24;
                        category = req.query.category;
                        return [4 /*yield*/, news_heatmap_service_1.default.rebuild({
                                limit: limit,
                                hours: hours,
                                category: category || 'ALL',
                                force: true,
                            })];
                    case 1:
                        rebuilt = _a.sent();
                        this.hotClustersCache = rebuilt.clusters;
                        this.lastHotClustersFetch = Date.now();
                        res.json({
                            success: true,
                            generatedAt: rebuilt.generatedAt,
                            totalArticles: rebuilt.totalArticles,
                            totalClusters: rebuilt.totalClusters,
                            llm: rebuilt.llm,
                        });
                        return [3 /*break*/, 3];
                    case 2:
                        error_11 = _a.sent();
                        logger_1.default.error('Heatmap rebuild endpoint error:', error_11);
                        res.status(500).json({
                            success: false,
                            error: error_11 instanceof Error ? error_11.message : String(error_11),
                        });
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        }); });
        this.app.get('/api/news/clusters/:id', function (req, res) { return __awaiter(_this, void 0, void 0, function () {
            var hours, cluster, error_12;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        hours = parseInt(req.query.hours) || 48;
                        return [4 /*yield*/, news_heatmap_service_1.default.getClusterDetails(req.params.id, hours)];
                    case 1:
                        cluster = _a.sent();
                        if (!cluster) {
                            res.status(404).json({ error: 'Cluster not found' });
                            return [2 /*return*/];
                        }
                        res.json(cluster);
                        return [3 /*break*/, 3];
                    case 2:
                        error_12 = _a.sent();
                        logger_1.default.error("Error fetching cluster ".concat(req.params.id, ":"), error_12);
                        res.status(500).json({ error: 'Internal server error' });
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        }); });
        this.app.get('/api/news', function (req, res) { return __awaiter(_this, void 0, void 0, function () {
            var limit, category, news, _a, error_13;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 5, , 6]);
                        limit = parseInt(req.query.limit) || 50;
                        category = req.query.category;
                        if (!category) return [3 /*break*/, 2];
                        return [4 /*yield*/, news_store_1.default.getNewsByCategory(category, limit)];
                    case 1:
                        _a = _b.sent();
                        return [3 /*break*/, 4];
                    case 2: return [4 /*yield*/, news_store_1.default.getRecentNews(limit)];
                    case 3:
                        _a = _b.sent();
                        _b.label = 4;
                    case 4:
                        news = _a;
                        res.json(news);
                        return [3 /*break*/, 6];
                    case 5:
                        error_13 = _b.sent();
                        logger_1.default.error('News endpoint error:', error_13);
                        res.json([]);
                        return [3 /*break*/, 6];
                    case 6: return [2 /*return*/];
                }
            });
        }); });
        this.app.get('/api/news/stats', function (req, res) { return __awaiter(_this, void 0, void 0, function () {
            var stats, error_14;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, news_store_1.default.getStats()];
                    case 1:
                        stats = _a.sent();
                        res.json(stats);
                        return [3 /*break*/, 3];
                    case 2:
                        error_14 = _a.sent();
                        logger_1.default.error('News stats endpoint error:', error_14);
                        res.json({
                            total: 0,
                            byCategory: {},
                            byImportance: {},
                            bySentiment: {},
                            latestArticle: null,
                            totalTags: 0,
                        });
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        }); });
        this.app.get('/api/news/tags', function (req, res) { return __awaiter(_this, void 0, void 0, function () {
            var tags, error_15;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, news_store_1.default.getTags()];
                    case 1:
                        tags = _a.sent();
                        res.json(tags);
                        return [3 /*break*/, 3];
                    case 2:
                        error_15 = _a.sent();
                        logger_1.default.error('News tags endpoint error:', error_15);
                        res.json([]);
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        }); });
        this.app.get('/api/news/search', function (req, res) { return __awaiter(_this, void 0, void 0, function () {
            var q, limit, news, error_16;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        q = req.query.q;
                        limit = parseInt(req.query.limit) || 20;
                        if (!q) {
                            res.status(400).json({ error: 'Query parameter required' });
                            return [2 /*return*/];
                        }
                        return [4 /*yield*/, news_store_1.default.searchNews(q, limit)];
                    case 1:
                        news = _a.sent();
                        res.json(news);
                        return [3 /*break*/, 3];
                    case 2:
                        error_16 = _a.sent();
                        logger_1.default.error('News search endpoint error:', error_16);
                        res.json([]);
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        }); });
        this.app.get('/api/news/:id', function (req, res) { return __awaiter(_this, void 0, void 0, function () {
            var article, error_17;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, news_store_1.default.getArticleById(req.params.id)];
                    case 1:
                        article = _a.sent();
                        if (!article) {
                            res.status(404).json({ error: 'Article not found' });
                            return [2 /*return*/];
                        }
                        res.json(article);
                        return [3 /*break*/, 3];
                    case 2:
                        error_17 = _a.sent();
                        logger_1.default.error("Error fetching article ".concat(req.params.id, ":"), error_17);
                        res.status(500).json({ error: 'Internal server error' });
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        }); });
        this.app.post('/api/news/:id/summarize', function (req, res) { return __awaiter(_this, void 0, void 0, function () {
            var article, content, summary, error_18;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 4, , 5]);
                        return [4 /*yield*/, news_store_1.default.getArticleById(req.params.id)];
                    case 1:
                        article = _a.sent();
                        if (!article) {
                            res.status(404).json({ error: 'Article not found' });
                            return [2 /*return*/];
                        }
                        if (article.summary && article.summary.length > 50) {
                            res.json({ id: article.id, summary: article.summary, cached: true });
                            return [2 /*return*/];
                        }
                        content = article.content || article.snippet;
                        if (!content) {
                            res.status(400).json({ error: 'Article has no content for summarization' });
                            return [2 /*return*/];
                        }
                        return [4 /*yield*/, glm_service_1.default.summarizeArticle(content)];
                    case 2:
                        summary = _a.sent();
                        return [4 /*yield*/, news_store_1.default.updateArticleSummary(article.id, summary)];
                    case 3:
                        _a.sent();
                        res.json({ id: article.id, summary: summary, cached: false });
                        return [3 /*break*/, 5];
                    case 4:
                        error_18 = _a.sent();
                        logger_1.default.error("Error summarizing article ".concat(req.params.id, ":"), error_18);
                        res.status(500).json({ error: 'Internal server error' });
                        return [3 /*break*/, 5];
                    case 5: return [2 /*return*/];
                }
            });
        }); });
        // Prediction markets API routes
        this.app.get('/api/predictions/status', function (req, res) {
            try {
                var status_2 = prediction_store_1.default.getAgentStatus();
                res.json(status_2);
            }
            catch (error) {
                logger_1.default.error('Predictions status endpoint error:', error);
                res.json({
                    status: 'ERROR',
                    currentCycleId: null,
                    currentStep: null,
                    lastUpdate: null,
                    lastCycleStart: null,
                    lastCycleEnd: null,
                    lastTradeId: null,
                    lastTradeAt: null,
                    activeMarkets: 0,
                    openPositions: 0,
                });
            }
        });
        this.app.get('/api/predictions/markets', function (req, res) { return __awaiter(_this, void 0, void 0, function () {
            var limit, minVolume_1, markets, filtered, error_19;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        limit = parseInt(req.query.limit) || 50;
                        minVolume_1 = Number.parseFloat(process.env.PREDICTION_MIN_VOLUME || '');
                        return [4 /*yield*/, polymarket_client_1.default.fetchMarkets(limit * 2)];
                    case 1:
                        markets = _a.sent();
                        filtered = markets
                            .filter(function (market) { return market.status === 'OPEN' || market.status === 'UNKNOWN'; })
                            .filter(function (market) { var _a; return ((_a = market.volume) !== null && _a !== void 0 ? _a : 0) >= (Number.isFinite(minVolume_1) ? minVolume_1 : 0); })
                            .slice(0, limit);
                        res.json(filtered);
                        return [3 /*break*/, 3];
                    case 2:
                        error_19 = _a.sent();
                        logger_1.default.error('Predictions markets endpoint error:', error_19);
                        res.json([]);
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        }); });
        this.app.get('/api/predictions/positions', function (req, res) {
            try {
                res.json(prediction_store_1.default.getPositions());
            }
            catch (error) {
                logger_1.default.error('Predictions positions endpoint error:', error);
                res.json([]);
            }
        });
        this.app.get('/api/predictions/trades', function (req, res) {
            try {
                var limit = parseInt(req.query.limit) || 50;
                res.json(prediction_store_1.default.getTrades(limit));
            }
            catch (error) {
                logger_1.default.error('Predictions trades endpoint error:', error);
                res.json([]);
            }
        });
        this.app.get('/api/predictions/backtests', function (req, res) {
            try {
                var limit = parseInt(req.query.limit) || 50;
                res.json(prediction_store_1.default.getBacktests(limit));
            }
            catch (error) {
                logger_1.default.error('Predictions backtests endpoint error:', error);
                res.json([]);
            }
        });
        this.app.get('/api/predictions/traces', function (req, res) {
            try {
                var limit = parseInt(req.query.limit) || 200;
                trace_store_1.default.initialize();
                var summaries = trace_store_1.default.getRecentTraceSummaries(limit, 'PREDICTION');
                res.json(summaries);
            }
            catch (error) {
                logger_1.default.error('Predictions traces endpoint error:', error);
                res.json([]);
            }
        });
        this.app.get('/api/predictions/news', function (req, res) { return __awaiter(_this, void 0, void 0, function () {
            var marketId, marketSlug, news, error_20;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        marketId = req.query.marketId;
                        marketSlug = req.query.marketSlug;
                        if (!marketId && !marketSlug) {
                            res.status(400).json({ error: 'marketId or marketSlug required' });
                            return [2 /*return*/];
                        }
                        return [4 /*yield*/, news_store_1.default.getNewsByMarket(marketId || marketSlug, marketSlug)];
                    case 1:
                        news = _a.sent();
                        res.json(news);
                        return [3 /*break*/, 3];
                    case 2:
                        error_20 = _a.sent();
                        logger_1.default.error('Predictions news endpoint error:', error_20);
                        res.json([]);
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        }); });
        // ============================================================================
        // pump.fun API ENDPOINTS
        // ============================================================================
        // Get recent analyzed tokens
        this.app.get('/api/pumpfun/tokens', function (req, res) { return __awaiter(_this, void 0, void 0, function () {
            var limit, minScore, tokens, error_21;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 3, , 4]);
                        limit = parseInt(req.query.limit) || 50;
                        minScore = parseFloat(req.query.minScore) || 0;
                        return [4 /*yield*/, pumpfun_store_1.default.initialize()];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, pumpfun_store_1.default.getRecentTokens(limit, minScore)];
                    case 2:
                        tokens = _a.sent();
                        res.json({ tokens: tokens });
                        return [3 /*break*/, 4];
                    case 3:
                        error_21 = _a.sent();
                        logger_1.default.error('[PumpFun] Tokens endpoint error:', error_21);
                        res.json({ tokens: [] });
                        return [3 /*break*/, 4];
                    case 4: return [2 /*return*/];
                }
            });
        }); });
        // Get token by mint address
        this.app.get('/api/pumpfun/token/:mint', function (req, res) { return __awaiter(_this, void 0, void 0, function () {
            var token, error_22;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, pumpfun_store_1.default.initialize()];
                    case 1:
                        _a.sent();
                        token = pumpfun_store_1.default.getTokenByMint(req.params.mint);
                        if (!token) {
                            res.status(404).json({ error: 'Token not found' });
                            return [2 /*return*/];
                        }
                        res.json({ token: token });
                        return [3 /*break*/, 3];
                    case 2:
                        error_22 = _a.sent();
                        logger_1.default.error("[PumpFun] Error fetching token ".concat(req.params.mint, ":"), error_22);
                        res.status(500).json({ error: 'Internal server error' });
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        }); });
        // Get pump.fun statistics
        this.app.get('/api/pumpfun/stats', function (req, res) { return __awaiter(_this, void 0, void 0, function () {
            var stats, error_23;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, pumpfun_store_1.default.initialize()];
                    case 1:
                        _a.sent();
                        stats = pumpfun_store_1.default.getStats();
                        res.json({ stats: stats });
                        return [3 /*break*/, 3];
                    case 2:
                        error_23 = _a.sent();
                        logger_1.default.error('[PumpFun] Stats endpoint error:', error_23);
                        res.json({
                            stats: {
                                totalTokens: 0,
                                averageScore: 0,
                                byRecommendation: {
                                    STRONG_BUY: 0,
                                    BUY: 0,
                                    HOLD: 0,
                                    AVOID: 0,
                                    STRONG_AVOID: 0,
                                },
                                highConfidenceCount: 0,
                                lastAnalyzedAt: null,
                            },
                        });
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        }); });
        // Get high confidence tokens
        this.app.get('/api/pumpfun/high-confidence', function (req, res) { return __awaiter(_this, void 0, void 0, function () {
            var configuredThreshold, requestedMinScore, minScore, limit, tokens, error_24;
            var _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        _c.trys.push([0, 3, , 4]);
                        configuredThreshold = (_b = (_a = config_1.default.get().pumpfun) === null || _a === void 0 ? void 0 : _a.minScoreThreshold) !== null && _b !== void 0 ? _b : 0.7;
                        requestedMinScore = parseFloat(req.query.minScore);
                        minScore = Number.isFinite(requestedMinScore) ? requestedMinScore : configuredThreshold;
                        limit = parseInt(req.query.limit) || 100;
                        return [4 /*yield*/, pumpfun_store_1.default.initialize()];
                    case 1:
                        _c.sent();
                        return [4 /*yield*/, pumpfun_store_1.default.getHighConfidenceTokens(minScore, limit)];
                    case 2:
                        tokens = _c.sent();
                        res.json({ tokens: tokens });
                        return [3 /*break*/, 4];
                    case 3:
                        error_24 = _c.sent();
                        logger_1.default.error('[PumpFun] High confidence endpoint error:', error_24);
                        res.json({ tokens: [] });
                        return [3 /*break*/, 4];
                    case 4: return [2 /*return*/];
                }
            });
        }); });
        // Get tokens by recommendation
        this.app.get('/api/pumpfun/recommendation/:rec', function (req, res) { return __awaiter(_this, void 0, void 0, function () {
            var validRecs, rec, limit, tokens, error_25;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 3, , 4]);
                        validRecs = ['STRONG_BUY', 'BUY', 'HOLD', 'AVOID', 'STRONG_AVOID'];
                        rec = req.params.rec.toUpperCase();
                        if (!validRecs.includes(rec)) {
                            res.status(400).json({ error: 'Invalid recommendation' });
                            return [2 /*return*/];
                        }
                        limit = parseInt(req.query.limit) || 50;
                        return [4 /*yield*/, pumpfun_store_1.default.initialize()];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, pumpfun_store_1.default.getByRecommendation(rec, limit)];
                    case 2:
                        tokens = _a.sent();
                        res.json({ tokens: tokens });
                        return [3 /*break*/, 4];
                    case 3:
                        error_25 = _a.sent();
                        logger_1.default.error("[PumpFun] Recommendation endpoint error:", error_25);
                        res.json({ tokens: [] });
                        return [3 /*break*/, 4];
                    case 4: return [2 /*return*/];
                }
            });
        }); });
        // Subscribe to pump.fun events (for WebSocket clients)
        this.app.get('/pumpfun', function (req, res) {
            res.sendFile(path_1.default.join(__dirname, '../../dashboard/public/pumpfun.html'));
        });
        this.app.get('/pumpfun.html', function (req, res) {
            res.sendFile(path_1.default.join(__dirname, '../../dashboard/public/pumpfun.html'));
        });
        // Serve dashboard
        this.app.get('/', function (req, res) {
            res.sendFile(path_1.default.join(__dirname, '../../dashboard/public/index.html'));
        });
        this.app.get('/trace', function (req, res) {
            res.sendFile(path_1.default.join(__dirname, '../../dashboard/public/trace.html'));
        });
        this.app.get('/news', function (req, res) {
            res.sendFile(path_1.default.join(__dirname, '../../dashboard/public/news.html'));
        });
        this.app.get('/heatmap', function (req, res) {
            res.sendFile(path_1.default.join(__dirname, '../../dashboard/public/news-heatmap.html'));
        });
        this.app.get('/heatmap-bubbles', function (req, res) {
            res.redirect('/heatmap');
        });
        this.app.get('/heatmap-grid', function (req, res) {
            res.redirect('/heatmap');
        });
        this.app.get('/predictions', function (req, res) {
            res.sendFile(path_1.default.join(__dirname, '../../dashboard/public/predictions.html'));
        });
        this.app.get('/pools.html', function (req, res) {
            res.sendFile(path_1.default.join(__dirname, '../../dashboard/public/pools.html'));
        });
        this.app.get('/pools', function (req, res) {
            res.sendFile(path_1.default.join(__dirname, '../../dashboard/public/pools.html'));
        });
        this.app.get('/enhanced-heatmap', function (req, res) {
            res.redirect('/heatmap');
        });
        this.app.get('/funding-arbitrage', function (req, res) {
            res.sendFile(path_1.default.join(__dirname, '../../dashboard/public/funding-arbitrage.html'));
        });
        this.app.get('/funding-arbitrage.html', function (req, res) {
            res.sendFile(path_1.default.join(__dirname, '../../dashboard/public/funding-arbitrage.html'));
        });
        // =========================================================================
        // SAFEKEEPING FUND API
        // =========================================================================
        // Safekeeping fund state
        this.app.get('/api/safekeeping', function (req, res) { return __awaiter(_this, void 0, void 0, function () {
            var cached, error_26;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, redis_cache_1.default.get('safekeeping', 'state')];
                    case 1:
                        cached = _a.sent();
                        if (cached) {
                            res.json(cached);
                            return [2 /*return*/];
                        }
                        // Return default state if not yet initialized
                        res.json({
                            tvl: 0,
                            weightedAPR: 0,
                            activePositions: 0,
                            totalRebalances: 0,
                            successRate: 100,
                            gasSpent: 0,
                            aiRiskLevel: 'MEDIUM',
                            marketRegime: 'SIDEWAYS',
                            positions: [],
                            opportunities: [],
                            chainStatus: {
                                ethereum: { connected: false, positions: 0, apr: 0, value: 0 },
                                bsc: { connected: false, positions: 0, apr: 0, value: 0 },
                                solana: { connected: false, positions: 0, apr: 0, value: 0 },
                            },
                            rebalances: [],
                            aiAnalysis: {
                                summary: 'Safekeeping fund initializing...',
                                recommendations: [],
                                anomalies: []
                            },
                            cycleNumber: 0
                        });
                        return [3 /*break*/, 3];
                    case 2:
                        error_26 = _a.sent();
                        logger_1.default.error('[Dashboard] Safekeeping state error:', error_26);
                        res.status(500).json({ error: 'Failed to get safekeeping state' });
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        }); });
        // Trigger manual rebalance
        this.app.post('/api/safekeeping/rebalance', function (req, res) { return __awaiter(_this, void 0, void 0, function () {
            var error_27;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        logger_1.default.info('[Dashboard] Manual rebalance triggered');
                        // Publish to message bus
                        return [4 /*yield*/, message_bus_1.default.publish('safekeeping:rebalance:trigger', {
                                manual: true,
                                source: 'dashboard'
                            })];
                    case 1:
                        // Publish to message bus
                        _a.sent();
                        res.json({ success: true, message: 'Rebalance triggered' });
                        return [3 /*break*/, 3];
                    case 2:
                        error_27 = _a.sent();
                        logger_1.default.error('[Dashboard] Rebalance trigger error:', error_27);
                        res.status(500).json({ error: 'Failed to trigger rebalance' });
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        }); });
        // Emergency halt
        this.app.post('/api/safekeeping/halt', function (req, res) { return __awaiter(_this, void 0, void 0, function () {
            var error_28;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 2, , 3]);
                        logger_1.default.warn('[Dashboard] Emergency halt triggered');
                        // Publish to message bus
                        return [4 /*yield*/, message_bus_1.default.publish('safekeeping:emergency:halt', {
                                reason: ((_a = req.body) === null || _a === void 0 ? void 0 : _a.reason) || 'Manual halt from dashboard',
                                source: 'dashboard'
                            })];
                    case 1:
                        // Publish to message bus
                        _b.sent();
                        res.json({ success: true, message: 'Emergency halt triggered' });
                        return [3 /*break*/, 3];
                    case 2:
                        error_28 = _b.sent();
                        logger_1.default.error('[Dashboard] Emergency halt error:', error_28);
                        res.status(500).json({ error: 'Failed to trigger emergency halt' });
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        }); });
        // 404 handler
        this.app.use(function (req, res) {
            res.status(404).json({ error: 'Endpoint not found' });
        });
    };
    DashboardServer.prototype.setupWebSocket = function () {
        var _this = this;
        // Main dashboard namespace
        this.io.on('connection', function (socket) {
            logger_1.default.info("Dashboard client connected: ".concat(socket.id));
            // Send initial state
            socket.emit('cycle_metrics', _this.cycleMetrics);
            // Send message bus connection status
            socket.emit('message_bus_status', {
                connected: _this.messageBusConnected,
            });
            socket.on('disconnect', function () {
                logger_1.default.info("Dashboard client disconnected: ".concat(socket.id));
            });
        });
        logger_1.default.info('[Dashboard] WebSocket namespaces set up');
    };
    DashboardServer.prototype.startNewsPolling = function () {
        var _this = this;
        if (!Number.isFinite(this.newsPollIntervalMs) || this.newsPollIntervalMs <= 0) {
            return;
        }
        if (this.newsPollTimer) {
            clearInterval(this.newsPollTimer);
        }
        this.newsPollTimer = setInterval(function () {
            void _this.pollNewsUpdates();
        }, this.newsPollIntervalMs);
        void this.pollNewsUpdates();
    };
    DashboardServer.prototype.pollNewsUpdates = function () {
        return __awaiter(this, void 0, void 0, function () {
            var limit, latest, newItems, _i, latest_1, item, error_29;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        limit = Number.isFinite(this.newsPollLimit) ? this.newsPollLimit : 25;
                        return [4 /*yield*/, news_store_1.default.getRecentNews(limit)];
                    case 1:
                        latest = _a.sent();
                        if (!latest.length)
                            return [2 /*return*/];
                        if (!this.lastNewsId) {
                            this.lastNewsId = latest[0].id;
                            return [2 /*return*/];
                        }
                        if (latest[0].id === this.lastNewsId) {
                            return [2 /*return*/];
                        }
                        newItems = [];
                        for (_i = 0, latest_1 = latest; _i < latest_1.length; _i++) {
                            item = latest_1[_i];
                            if (item.id === this.lastNewsId)
                                break;
                            newItems.push(item);
                        }
                        this.lastNewsId = latest[0].id;
                        if (newItems.length > 0) {
                            this.io.emit('news_update', { items: newItems });
                        }
                        return [3 /*break*/, 3];
                    case 2:
                        error_29 = _a.sent();
                        logger_1.default.error('[Dashboard] News poll failed:', error_29);
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    // Called by the agent to update cycle status
    DashboardServer.prototype.updateCycleStatus = function (cycleId, step, data) {
        var _a;
        if (data === void 0) { data = {}; }
        this.cycleMetrics.currentStep = step;
        this.cycleMetrics.activeCycles[cycleId] = __assign({ step: step, startTime: ((_a = this.cycleMetrics.activeCycles[cycleId]) === null || _a === void 0 ? void 0 : _a.startTime) || new Date(), lastUpdate: new Date() }, data);
        // Broadcast to all clients
        this.io.emit('cycle_update', { cycleId: cycleId, step: step, data: data, timestamp: new Date() });
    };
    // Called when a cycle completes
    DashboardServer.prototype.completeCycle = function (cycleId, success, state) {
        var _a, _b, _c, _d, _e;
        this.cycleMetrics.totalCycles++;
        if (success) {
            this.cycleMetrics.successfulCycles++;
        }
        else {
            this.cycleMetrics.failedCycles++;
        }
        var tradeExecuted = !!state.executionResult && state.executionResult.status === 'FILLED';
        if (tradeExecuted) {
            this.cycleMetrics.tradesExecuted++;
        }
        this.cycleMetrics.lastCycleTime = new Date();
        delete this.cycleMetrics.activeCycles[cycleId];
        // Store pruned trace
        var trace = {
            cycleId: cycleId,
            startTime: state.cycleStartTime || new Date(),
            endTime: new Date(),
            symbol: state.symbol,
            success: success,
            tradeExecuted: tradeExecuted,
            regime: state.regime,
            indicators: state.indicators, // Full indicators object
            candles: (_a = state.candles) === null || _a === void 0 ? void 0 : _a.slice(-5), // Last 5 candles for context
            similarPatternsCount: ((_b = state.similarPatterns) === null || _b === void 0 ? void 0 : _b.length) || 0,
            strategyIdeas: state.ideas,
            backtestResults: state.backtestResults, // Add backtest results
            selectedStrategy: state.selectedStrategy,
            signal: state.signal,
            riskAssessment: state.riskAssessment,
            executionResult: state.executionResult,
            thoughts: state.thoughts,
            errors: state.errors,
        };
        this.cycleMetrics.recentTraces.unshift(trace);
        if (this.cycleMetrics.recentTraces.length > 50) {
            this.cycleMetrics.recentTraces.pop();
        }
        // Persist trace to database for LLM analysis
        try {
            trace_store_1.default.initialize();
            trace_store_1.default.storeTrace({
                cycleId: cycleId,
                startTime: state.cycleStartTime || new Date(),
                endTime: new Date(),
                symbol: state.symbol,
                timeframe: state.timeframe || '1h',
                success: success,
                tradeExecuted: tradeExecuted,
                regime: state.regime,
                indicators: state.indicators,
                candles: (_c = state.candles) === null || _c === void 0 ? void 0 : _c.slice(-20), // Keep more candles for analysis
                similarPatternsCount: ((_d = state.similarPatterns) === null || _d === void 0 ? void 0 : _d.length) || 0,
                strategyIdeas: state.strategyIdeas,
                backtestResults: state.backtestResults,
                selectedStrategy: state.selectedStrategy,
                signal: state.signal,
                riskAssessment: state.riskAssessment,
                executionResult: state.executionResult,
                thoughts: state.thoughts,
                errors: state.errors,
            });
            logger_1.default.debug("[Dashboard] Trace ".concat(cycleId, " persisted for LLM analysis"));
        }
        catch (error) {
            logger_1.default.error('[Dashboard] Failed to persist trace:', error);
        }
        // Broadcast completion
        this.io.emit('cycle_complete', {
            cycleId: cycleId,
            success: success,
            tradeExecuted: tradeExecuted,
            metrics: this.cycleMetrics,
            traceSummary: {
                id: trace.cycleId,
                symbol: trace.symbol,
                regime: trace.regime,
                thoughts: (_e = trace.thoughts) === null || _e === void 0 ? void 0 : _e.slice(-1)[0],
            }
        });
        // Publish to message bus (if connected)
        if (this.messageBusConnected) {
            void message_bus_1.default.publish(message_bus_1.Channel.CYCLE_COMPLETE, {
                cycleId: cycleId,
                symbol: state.symbol,
                success: success,
                tradeExecuted: tradeExecuted,
                timestamp: new Date(),
            });
        }
    };
    DashboardServer.prototype.start = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                return [2 /*return*/, new Promise(function (resolve, reject) {
                        try {
                            _this.server.listen(_this.port, '0.0.0.0', function () {
                                logger_1.default.info("Dashboard server started on port ".concat(_this.port));
                                logger_1.default.info("Access dashboard at: http://0.0.0.0:".concat(_this.port));
                                logger_1.default.info("Message bus: ".concat(_this.messageBusConnected ? 'CONNECTED' : 'DISCONNECTED (polling fallback)'));
                                resolve();
                            });
                            _this.server.on('error', function (error) {
                                logger_1.default.error('Dashboard server error:', error);
                                reject(error);
                            });
                        }
                        catch (error) {
                            logger_1.default.error('Failed to start dashboard server:', error);
                            reject(error);
                        }
                    })];
            });
        });
    };
    DashboardServer.prototype.stop = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                return [2 /*return*/, new Promise(function (resolve) {
                        if (_this.newsPollTimer) {
                            clearInterval(_this.newsPollTimer);
                            _this.newsPollTimer = null;
                        }
                        // Disconnect from message bus
                        if (_this.messageBusConnected) {
                            void message_bus_1.default.disconnect();
                            void redis_cache_1.default.disconnect();
                        }
                        _this.io.close(function () {
                            _this.server.close(function () {
                                logger_1.default.info('Dashboard server stopped');
                                resolve();
                            });
                        });
                    })];
            });
        });
    };
    return DashboardServer;
}());
// Singleton instance
var dashboardServer = new DashboardServer();
// Start if run directly
if (require.main === module) {
    dashboardServer.start().catch(function (error) {
        logger_1.default.error('Failed to start dashboard server:', error);
        process.exit(1);
    });
    process.on('SIGINT', function () { return __awaiter(void 0, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    logger_1.default.info('Shutting down dashboard server...');
                    return [4 /*yield*/, dashboardServer.stop()];
                case 1:
                    _a.sent();
                    process.exit(0);
                    return [2 /*return*/];
            }
        });
    }); });
    process.on('SIGTERM', function () { return __awaiter(void 0, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    logger_1.default.info('Shutting down dashboard server...');
                    return [4 /*yield*/, dashboardServer.stop()];
                case 1:
                    _a.sent();
                    process.exit(0);
                    return [2 /*return*/];
            }
        });
    }); });
}
exports.default = dashboardServer;
