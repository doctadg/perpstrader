"use strict";
// Dashboard Server for LangGraph Trading Agent
// Provides real-time monitoring of the autonomous trading system
// Enhanced with Redis message bus for event-driven updates
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const socket_io_1 = require("socket.io");
const http_1 = require("http");
const config_1 = __importDefault(require("../shared/config"));
const logger_1 = __importDefault(require("../shared/logger"));
const trace_store_1 = __importDefault(require("../data/trace-store"));
const news_store_1 = __importDefault(require("../data/news-store"));
const prediction_store_1 = __importDefault(require("../data/prediction-store"));
const polymarket_client_1 = __importDefault(require("../prediction-markets/polymarket-client"));
const glm_service_1 = __importDefault(require("../shared/glm-service"));
const message_bus_1 = __importStar(require("../shared/message-bus"));
const redis_cache_1 = __importDefault(require("../shared/redis-cache"));
const pumpfun_store_1 = __importDefault(require("../data/pumpfun-store"));
const enhanced_api_routes_1 = __importDefault(require("./enhanced-api-routes"));
const market_heatmap_routes_1 = __importDefault(require("./market-heatmap-routes"));
const funding_arbitrage_routes_1 = __importDefault(require("./funding-arbitrage-routes"));
const news_heatmap_service_1 = __importDefault(require("./news-heatmap-service"));
// Get database path from config
const fullConfig = config_1.default.get();
const dbPath = fullConfig.database?.connection || './data/trading.db';
class DashboardServer {
    app;
    server;
    io;
    db;
    port;
    newsPollTimer = null;
    lastNewsId = null;
    newsPollIntervalMs;
    newsPollLimit;
    messageBusConnected = false;
    hotClustersCache = [];
    lastHotClustersFetch = 0;
    HOT_CLUSTERS_CACHE_TTL = 5000; // 5 seconds
    cycleMetrics = {
        totalCycles: 0,
        successfulCycles: 0,
        failedCycles: 0,
        tradesExecuted: 0,
        lastCycleTime: null,
        currentStep: 'IDLE',
        activeCycles: {},
        recentTraces: [],
    };
    constructor() {
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
    async connectMessageBus() {
        try {
            // Connect both message bus and cache
            await Promise.all([
                message_bus_1.default.connect(),
                redis_cache_1.default.connect(),
            ]);
            this.messageBusConnected = true;
            logger_1.default.info('[Dashboard] Connected to Redis message bus');
            // Subscribe to news events
            await this.subscribeToNewsEvents();
        }
        catch (error) {
            logger_1.default.warn('[Dashboard] Failed to connect to message bus, using polling fallback:', error);
            this.messageBusConnected = false;
        }
    }
    /**
     * Subscribe to news events from message bus
     */
    async subscribeToNewsEvents() {
        if (!this.messageBusConnected)
            return;
        // Subscribe to clustering completion events
        await message_bus_1.default.subscribe(message_bus_1.Channel.NEWS_CLUSTERED, async (message) => {
            logger_1.default.debug('[Dashboard] Received NEWS_CLUSTERED event:', message.data);
            // Invalidate hot clusters cache
            this.hotClustersCache = [];
            this.lastHotClustersFetch = 0;
            // Fetch updated hot clusters
            const clusters = await this.getHotClustersCached(25, 24);
            // Broadcast to WebSocket clients
            this.io.emit('news_clustered', {
                timestamp: message.data?.timestamp,
                clusters,
                stats: message.data,
            });
        });
        // Subscribe to hot clusters updates
        await message_bus_1.default.subscribe(message_bus_1.Channel.NEWS_HOT_CLUSTERS, async (message) => {
            logger_1.default.debug('[Dashboard] Received NEWS_HOT_CLUSTERS event:', message.data);
            // Invalidate cache
            this.hotClustersCache = [];
            this.lastHotClustersFetch = 0;
            // Broadcast to clients
            this.io.emit('news_hot_clusters', {
                timestamp: new Date(),
                ...(message.data || {}),
            });
        });
        // Subscribe to categorization events
        await message_bus_1.default.subscribe(message_bus_1.Channel.NEWS_CATEGORIZED, async (message) => {
            logger_1.default.debug('[Dashboard] Received NEWS_CATEGORIZED event');
            // Broadcast new articles to clients
            this.io.emit('news_categorized', {
                timestamp: new Date(),
                ...(message.data || {}),
            });
        });
        // =========================================================================
        // ENHANCED CLUSTERING EVENT SUBSCRIPTIONS
        // =========================================================================
        // Subscribe to anomaly detection events
        await message_bus_1.default.subscribe(message_bus_1.Channel.NEWS_ANOMALY, async (message) => {
            logger_1.default.info('[Dashboard] Received NEWS_ANOMALY event:', message.data);
            // Broadcast anomaly alerts to clients
            this.io.emit('anomaly_detected', {
                timestamp: new Date(),
                ...(message.data || {}),
            });
        });
        // Subscribe to heat prediction events
        await message_bus_1.default.subscribe(message_bus_1.Channel.NEWS_PREDICTION, async (message) => {
            logger_1.default.info('[Dashboard] Received NEWS_PREDICTION event:', message.data);
            // Broadcast predictions to clients
            this.io.emit('prediction_generated', {
                timestamp: new Date(),
                ...(message.data || {}),
            });
        });
        // Subscribe to cross-category linking events
        await message_bus_1.default.subscribe(message_bus_1.Channel.NEWS_CROSS_CATEGORY, async (message) => {
            logger_1.default.debug('[Dashboard] Received NEWS_CROSS_CATEGORY event:', message.data);
            // Broadcast cross-category links to clients
            this.io.emit('cross_category_linked', {
                timestamp: new Date(),
                ...(message.data || {}),
            });
        });
        // Subscribe to entity trending events
        await message_bus_1.default.subscribe(message_bus_1.Channel.ENTITY_TRENDING, async (message) => {
            logger_1.default.info('[Dashboard] Received ENTITY_TRENDING event:', message.data);
            // Broadcast trending entities to clients
            this.io.emit('entity_trending', {
                timestamp: new Date(),
                ...(message.data || {}),
            });
        });
        // Subscribe to user engagement events
        await message_bus_1.default.subscribe(message_bus_1.Channel.USER_ENGAGEMENT, async (message) => {
            logger_1.default.debug('[Dashboard] Received USER_ENGAGEMENT event:', message.data);
            // Broadcast engagement updates to clients
            this.io.emit('user_engagement', {
                timestamp: new Date(),
                ...(message.data || {}),
            });
        });
        // Subscribe to quality metric events
        await message_bus_1.default.subscribe(message_bus_1.Channel.QUALITY_METRIC, async (message) => {
            logger_1.default.debug('[Dashboard] Received QUALITY_METRIC event:', message.data);
            // Broadcast quality metrics to clients
            this.io.emit('quality_metric', {
                timestamp: new Date(),
                ...(message.data || {}),
            });
        });
        // Subscribe to trading cycle events
        await message_bus_1.default.subscribe(message_bus_1.Channel.CYCLE_START, (message) => {
            logger_1.default.debug('[Dashboard] Trading cycle started:', message.data);
            this.io.emit('cycle_start', { timestamp: new Date(), ...(message.data || {}) });
        });
        await message_bus_1.default.subscribe(message_bus_1.Channel.CYCLE_COMPLETE, (message) => {
            logger_1.default.debug('[Dashboard] Trading cycle completed:', message.data);
            this.io.emit('cycle_complete', { timestamp: new Date(), ...(message.data || {}) });
        });
        await message_bus_1.default.subscribe(message_bus_1.Channel.CYCLE_ERROR, (message) => {
            logger_1.default.warn('[Dashboard] Trading cycle error:', message.data);
            this.io.emit('cycle_error', { timestamp: new Date(), ...(message.data || {}) });
        });
        // Subscribe to execution events
        await message_bus_1.default.subscribe(message_bus_1.Channel.EXECUTION_FILLED, (message) => {
            logger_1.default.info('[Dashboard] Execution filled:', message.data);
            this.io.emit('execution_filled', { timestamp: new Date(), ...(message.data || {}) });
        });
        await message_bus_1.default.subscribe(message_bus_1.Channel.EXECUTION_FAILED, (message) => {
            logger_1.default.warn('[Dashboard] Execution failed:', message.data);
            this.io.emit('execution_failed', { timestamp: new Date(), ...(message.data || {}) });
        });
        // Subscribe to position events
        await message_bus_1.default.subscribe(message_bus_1.Channel.POSITION_OPENED, (message) => {
            logger_1.default.info('[Dashboard] Position opened:', message.data);
            this.io.emit('position_opened', { timestamp: new Date(), ...(message.data || {}) });
        });
        await message_bus_1.default.subscribe(message_bus_1.Channel.POSITION_CLOSED, (message) => {
            logger_1.default.info('[Dashboard] Position closed:', message.data);
            this.io.emit('position_closed', { timestamp: new Date(), ...(message.data || {}) });
        });
        // Subscribe to risk events
        await message_bus_1.default.subscribe(message_bus_1.Channel.CIRCUIT_BREAKER_OPEN, (message) => {
            logger_1.default.warn('[Dashboard] Circuit breaker opened:', message.data);
            this.io.emit('circuit_breaker_open', { timestamp: new Date(), ...(message.data || {}) });
        });
        await message_bus_1.default.subscribe(message_bus_1.Channel.CIRCUIT_BREAKER_CLOSED, (message) => {
            logger_1.default.info('[Dashboard] Circuit breaker closed:', message.data);
            this.io.emit('circuit_breaker_closed', { timestamp: new Date(), ...(message.data || {}) });
        });
        // Subscribe to pump.fun events
        message_bus_1.default.subscribe('pumpfun:cycle:start', (message) => {
            logger_1.default.info('[Dashboard] pump.fun cycle started:', message.data);
            this.io.emit('pumpfun_cycle_start', { timestamp: new Date(), ...(message.data || {}) });
        });
        message_bus_1.default.subscribe('pumpfun:cycle:complete', (message) => {
            logger_1.default.info('[Dashboard] pump.fun cycle completed:', message.data);
            this.io.emit('pumpfun_cycle_complete', { timestamp: new Date(), ...(message.data || {}) });
        });
        message_bus_1.default.subscribe('pumpfun:high:confidence', (message) => {
            logger_1.default.info('[Dashboard] pump.fun high confidence token discovered:', message.data);
            this.io.emit('pumpfun_high_confidence', { timestamp: new Date(), ...(message.data || {}) });
        });
        // =========================================================================
        // RESEARCH EVENT SUBSCRIPTIONS
        // =========================================================================
        message_bus_1.default.subscribe('research:idea', (message) => {
            logger_1.default.debug('[Dashboard] Research idea generated:', message.data);
            this.io.emit('research:idea', { timestamp: new Date(), ...(message.data || {}) });
        });
        message_bus_1.default.subscribe('research:backtest:start', (message) => {
            logger_1.default.debug('[Dashboard] Backtest started:', message.data);
            this.io.emit('research:backtest:start', { timestamp: new Date(), ...(message.data || {}) });
        });
        message_bus_1.default.subscribe('research:backtest:progress', (message) => {
            this.io.emit('research:backtest:progress', { timestamp: new Date(), ...(message.data || {}) });
        });
        message_bus_1.default.subscribe('research:backtest:complete', (message) => {
            logger_1.default.debug('[Dashboard] Backtest completed:', message.data);
            this.io.emit('research:backtest:complete', { timestamp: new Date(), ...(message.data || {}) });
        });
        message_bus_1.default.subscribe('research:generation', (message) => {
            logger_1.default.debug('[Dashboard] New generation:', message.data);
            this.io.emit('research:generation', { timestamp: new Date(), ...(message.data || {}) });
        });
        message_bus_1.default.subscribe('research:regime', (message) => {
            logger_1.default.debug('[Dashboard] Market regime update:', message.data);
            this.io.emit('research:regime', { timestamp: new Date(), ...(message.data || {}) });
        });
        message_bus_1.default.subscribe('research:leaderboard:update', (message) => {
            logger_1.default.debug('[Dashboard] Leaderboard update:', message.data);
            this.io.emit('research:leaderboard:update', { timestamp: new Date(), ...(message.data || {}) });
        });
        // =========================================================================
        // SAFEKEEPING FUND EVENT SUBSCRIPTIONS
        // =========================================================================
        message_bus_1.default.subscribe('safekeeping:cycle:start', (message) => {
            logger_1.default.info('[Dashboard] Safekeeping cycle started:', message.data);
            this.io.emit('safekeeping:cycle:start', { timestamp: new Date(), ...(message.data || {}) });
        });
        message_bus_1.default.subscribe('safekeeping:cycle:complete', (message) => {
            logger_1.default.info('[Dashboard] Safekeeping cycle completed:', message.data);
            this.io.emit('safekeeping:cycle:complete', { timestamp: new Date(), ...(message.data || {}) });
        });
        message_bus_1.default.subscribe('safekeeping:cycle:stop', (message) => {
            logger_1.default.info('[Dashboard] Safekeeping cycle stopped:', message.data);
            this.io.emit('safekeeping:cycle:stop', { timestamp: new Date(), ...(message.data || {}) });
        });
        message_bus_1.default.subscribe('safekeeping:cycle:error', (message) => {
            logger_1.default.warn('[Dashboard] Safekeeping cycle error:', message.data);
            this.io.emit('safekeeping:cycle:error', { timestamp: new Date(), ...(message.data || {}) });
        });
        message_bus_1.default.subscribe('safekeeping:execution:submit', (message) => {
            logger_1.default.info('[Dashboard] Safekeeping execution submitted:', message.data);
            this.io.emit('safekeeping:execution:submit', { timestamp: new Date(), ...(message.data || {}) });
        });
        message_bus_1.default.subscribe('safekeeping:execution:complete', (message) => {
            logger_1.default.info('[Dashboard] Safekeeping execution completed:', message.data);
            this.io.emit('safekeeping:execution:complete', { timestamp: new Date(), ...(message.data || {}) });
        });
        message_bus_1.default.subscribe('safekeeping:position:opened', (message) => {
            logger_1.default.info('[Dashboard] Safekeeping position opened:', message.data);
            this.io.emit('safekeeping:position:opened', { timestamp: new Date(), ...(message.data || {}) });
        });
        message_bus_1.default.subscribe('safekeeping:position:closed', (message) => {
            logger_1.default.info('[Dashboard] Safekeeping position closed:', message.data);
            this.io.emit('safekeeping:position:closed', { timestamp: new Date(), ...(message.data || {}) });
        });
        message_bus_1.default.subscribe('safekeeping:emergency:halt', (message) => {
            logger_1.default.warn('[Dashboard] Safekeeping emergency halt:', message.data);
            this.io.emit('safekeeping:emergency:halt', { timestamp: new Date(), ...(message.data || {}) });
        });
        logger_1.default.info('[Dashboard] Subscribed to all message bus channels');
    }
    /**
     * Get hot clusters with caching
     */
    async getHotClustersCached(limit, hours, category) {
        const categoryFilter = category && category !== 'ALL'
            ? String(category).toUpperCase()
            : null;
        const now = Date.now();
        if (this.hotClustersCache.length > 0 && (now - this.lastHotClustersFetch) < this.HOT_CLUSTERS_CACHE_TTL) {
            const cached = categoryFilter
                ? this.hotClustersCache.filter(c => String(c.category).toUpperCase() === categoryFilter)
                : this.hotClustersCache;
            return cached.slice(0, limit);
        }
        const heatmap = await news_heatmap_service_1.default.getHeatmap({
            hours,
            limit: Math.max(limit, 150),
            category: 'ALL',
        });
        this.hotClustersCache = heatmap.clusters;
        this.lastHotClustersFetch = now;
        const filtered = categoryFilter
            ? this.hotClustersCache.filter(c => String(c.category).toUpperCase() === categoryFilter)
            : this.hotClustersCache;
        return filtered.slice(0, limit);
    }
    setupMiddleware() {
        this.app.use(express_1.default.json());
        // Security headers for production
        this.app.use((req, res, next) => {
            // HTTPS enforcement in production (redirect HTTP to HTTPS)
            const isProduction = config_1.default.isProduction();
            const proto = req.headers['x-forwarded-proto'] || 'http';
            if (isProduction && proto !== 'https' && process.env.NODE_ENV !== 'development') {
                // Allow localhost and 127.0.0.1 for development
                const host = req.headers.host || '';
                if (!host.startsWith('localhost') && !host.startsWith('127.0.0.1')) {
                    // In production with reverse proxy, this would redirect to HTTPS
                    logger_1.default.warn(`[Security] Insecure request on ${proto}://${host}`);
                }
            }
            // Set security headers
            res.setHeader('X-Content-Type-Options', 'nosniff');
            res.setHeader('X-Frame-Options', 'DENY');
            res.setHeader('X-XSS-Protection', '1; mode=block');
            res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
            // CORS configuration
            const allowedOrigins = process.env.DASHBOARD_ALLOWED_ORIGINS
                ? process.env.DASHBOARD_ALLOWED_ORIGINS.split(',')
                : ['http://localhost:3001', 'https://localhost:3001', 'http://127.0.0.1:3001'];
            const origin = req.headers.origin;
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
    }
    setupRoutes() {
        // Mount enhanced API routes
        this.app.use('/api/enhanced', enhanced_api_routes_1.default);
        // Mount market heatmap API routes
        this.app.use('/api/heatmap', market_heatmap_routes_1.default);
        // Mount funding arbitrage API routes
        this.app.use('/api/funding', funding_arbitrage_routes_1.default);
        // Health check
        // Health check
        this.app.get('/api/health', async (req, res) => {
            try {
                const circuitBreaker = await Promise.resolve().then(() => __importStar(require('../shared/circuit-breaker')));
                const healthSummary = await circuitBreaker.default.getHealthSummary();
                // Add message bus status
                const messageBusStatus = message_bus_1.default.getStatus();
                const cacheStatus = redis_cache_1.default.getStatus();
                // Enhanced clustering status
                const useEnhancedClustering = process.env.USE_ENHANCED_CLUSTERING === 'true';
                const enhancementsEnabled = {
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
            }
            catch (error) {
                logger_1.default.error('Health check error:', error);
                res.json({
                    status: 'ERROR',
                    timestamp: new Date().toISOString(),
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        });
        // Circuit breaker status
        this.app.get('/api/circuit-breakers', (req, res) => {
            try {
                const circuitBreaker = require('../shared/circuit-breaker').default;
                const breakers = circuitBreaker.getAllBreakerStatuses();
                res.json(breakers);
            }
            catch (error) {
                logger_1.default.error('Circuit breakers endpoint error:', error);
                res.json([]);
            }
        });
        // Reset circuit breaker
        this.app.post('/api/circuit-breakers/:name/reset', (req, res) => {
            try {
                const circuitBreaker = require('../shared/circuit-breaker').default;
                const success = circuitBreaker.resetBreaker(req.params.name);
                res.json({ success, message: success ? `Reset ${req.params.name}` : `Failed to reset ${req.params.name}` });
            }
            catch (error) {
                logger_1.default.error('Circuit breaker reset error:', error);
                res.status(500).json({ success: false, error: error instanceof Error ? error.message : String(error) });
            }
        });
        // Position recovery status
        this.app.get('/api/position-recovery', (req, res) => {
            try {
                const positionRecovery = require('../execution-engine/position-recovery').default;
                const stats = positionRecovery.getStats();
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
        this.app.post('/api/position-recovery/recover', async (req, res) => {
            try {
                const { symbol, side, action } = req.body;
                if (!symbol || !side) {
                    return res.status(400).json({ success: false, error: 'symbol and side required' });
                }
                const positionRecovery = require('../execution-engine/position-recovery').default;
                const success = await positionRecovery.recoverPosition(symbol, side, action || 'CLOSE');
                return res.json({ success, message: success ? `Recovery triggered for ${symbol} ${side}` : 'Recovery failed' });
            }
            catch (error) {
                logger_1.default.error('Position recovery trigger error:', error);
                return res.status(500).json({ success: false, error: error instanceof Error ? error.message : String(error) });
            }
        });
        // Emergency stop - close all positions
        this.app.post('/api/emergency-stop', async (req, res) => {
            try {
                const positionRecovery = require('../execution-engine/position-recovery').default;
                await positionRecovery.emergencyCloseAll();
                const executionEngine = require('../execution-engine/execution-engine').default;
                await executionEngine.emergencyStop();
                // Publish emergency stop event
                await message_bus_1.default.publish(message_bus_1.Channel.ERROR, {
                    type: 'EMERGENCY_STOP',
                    message: 'Emergency stop executed - all positions closed',
                    timestamp: new Date(),
                });
                res.json({ success: true, message: 'Emergency stop executed - all positions closed, orders cancelled' });
            }
            catch (error) {
                logger_1.default.error('Emergency stop error:', error);
                res.status(500).json({ success: false, error: error instanceof Error ? error.message : String(error) });
            }
        });
        // Vector store stats (now enabled)
        this.app.get('/api/vector-stats', async (req, res) => {
            try {
                const vectorStore = require('../data/vector-store').default;
                await vectorStore.initialize();
                const stats = await vectorStore.getStats();
                res.json({ ...stats, enabled: true });
            }
            catch (error) {
                logger_1.default.error('Vector stats endpoint error:', error);
                res.json({ patterns: 0, trades: 0, enabled: false, error: error instanceof Error ? error.message : String(error) });
            }
        });
        // System status
        this.app.get('/api/status', async (req, res) => {
            try {
                const status = {
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
                res.json(status);
            }
            catch (error) {
                logger_1.default.error('Status endpoint error:', error);
                res.status(500).json({ error: 'Failed to get system status' });
            }
        });
        // Cycle metrics
        this.app.get('/api/cycles', (req, res) => {
            res.json(this.cycleMetrics);
        });
        // Vector store stats
        this.app.get('/api/vector-stats', (req, res) => {
            res.json({ patterns: 0, trades: 0, enabled: false });
        });
        // Recent cycle traces
        // Recent cycle traces - Fetch from DB for full history
        this.app.get('/api/traces', (req, res) => {
            try {
                const limit = parseInt(req.query.limit) || 200;
                const agent = req.query.agent || undefined;
                trace_store_1.default.initialize();
                const summaries = trace_store_1.default.getRecentTraceSummaries(limit, agent);
                res.json(summaries.map(summary => ({
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
                })));
            }
            catch (error) {
                logger_1.default.error('Traces endpoint error:', error);
                // Fallback to in-memory if DB fails
                res.json(this.cycleMetrics.recentTraces.map(t => ({
                    id: t.cycleId,
                    startTime: t.startTime,
                    endTime: t.endTime,
                    symbol: t.symbol,
                    success: t.success,
                    tradeExecuted: t.tradeExecuted,
                    regime: t.regime,
                    strategyCount: t.strategyIdeas?.length || 0,
                    riskScore: t.riskAssessment?.riskScore || 0,
                })));
            }
        });
        // Detailed trace for a specific cycle
        this.app.get('/api/traces/:id', (req, res) => {
            try {
                // Try DB first
                trace_store_1.default.initialize();
                const storedTrace = trace_store_1.default.getTraceById(req.params.id);
                if (storedTrace) {
                    try {
                        const traceData = JSON.parse(storedTrace.traceData);
                        res.json(traceData);
                        return;
                    }
                    catch (e) {
                        logger_1.default.error(`Failed to parse trace data for ${req.params.id}`, e);
                    }
                }
                // Fallback to memory
                const trace = this.cycleMetrics.recentTraces.find(t => t.cycleId === req.params.id);
                if (!trace) {
                    res.status(404).json({ error: 'Trace not found' });
                    return;
                }
                res.json(trace);
            }
            catch (error) {
                logger_1.default.error(`Error fetching trace ${req.params.id}:`, error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
        // Live portfolio status
        this.app.get('/api/portfolio', async (req, res) => {
            try {
                const executionEngine = require('../execution-engine/execution-engine').default;
                // Fetch live data types (awaiting promises)
                const [portfolio, positions, realizedPnL, trades] = await Promise.all([
                    executionEngine.getPortfolio().catch((e) => null),
                    executionEngine.getPositions().catch((e) => []),
                    executionEngine.getRealizedPnL().catch((e) => 0),
                    executionEngine.getRecentTrades().catch((e) => [])
                ]);
                res.json({
                    portfolio: portfolio || { totalValue: 0, availableBalance: 0, positions: [] },
                    positions: positions || [],
                    realizedPnL: realizedPnL || 0,
                    recentTrades: (trades || []).slice(0, 50),
                    environment: executionEngine.getEnvironment ? executionEngine.getEnvironment() : 'LIVE',
                });
            }
            catch (error) {
                logger_1.default.error('Portfolio endpoint error:', error);
                res.json({
                    portfolio: { totalValue: 0, availableBalance: 0, positions: [] },
                    positions: [],
                    realizedPnL: 0,
                    recentTrades: [],
                    environment: 'LIVE',
                });
            }
        });
        // Active strategies
        this.app.get('/api/strategies', async (req, res) => {
            try {
                if (!this.db) {
                    res.json([]);
                    return;
                }
                const strategies = this.db.prepare(`
          SELECT * FROM strategies
          WHERE isActive = 1
          ORDER BY updatedAt DESC
        `).all();
                res.json(strategies.map(s => ({
                    ...s,
                    symbols: JSON.parse(s.symbols || '[]'),
                    parameters: JSON.parse(s.parameters || '{}'),
                    entryConditions: JSON.parse(s.entryConditions || '[]'),
                    exitConditions: JSON.parse(s.exitConditions || '[]'),
                    riskParameters: JSON.parse(s.riskParameters || '{}'),
                    performance: JSON.parse(s.performance || '{}'),
                })));
            }
            catch (error) {
                logger_1.default.error('Strategies endpoint error:', error);
                res.json([]);
            }
        });
        // Recent trades
        this.app.get('/api/trades', async (req, res) => {
            try {
                if (!this.db) {
                    res.json([]);
                    return;
                }
                const limit = parseInt(req.query.limit) || 50;
                const trades = this.db.prepare(`
          SELECT * FROM trades
          ORDER BY timestamp DESC
          LIMIT ?
        `).all(limit);
                res.json(trades);
            }
            catch (error) {
                logger_1.default.error('Trades endpoint error:', error);
                res.json([]);
            }
        });
        // Market data
        this.app.get('/api/market-data', async (req, res) => {
            try {
                if (!this.db) {
                    res.json([]);
                    return;
                }
                const limit = parseInt(req.query.limit) || 100;
                const symbol = req.query.symbol;
                const query = symbol
                    ? 'SELECT * FROM market_data WHERE symbol = ? ORDER BY timestamp DESC LIMIT ?'
                    : 'SELECT * FROM market_data ORDER BY timestamp DESC LIMIT ?';
                const data = symbol
                    ? this.db.prepare(query).all(symbol, limit)
                    : this.db.prepare(query).all(limit);
                res.json(data);
            }
            catch (error) {
                logger_1.default.error('Market data endpoint error:', error);
                res.json([]);
            }
        });
        // AI insights
        this.app.get('/api/insights', async (req, res) => {
            try {
                if (!this.db) {
                    res.json([]);
                    return;
                }
                const limit = parseInt(req.query.limit) || 20;
                const insights = this.db.prepare(`
          SELECT * FROM ai_insights
          ORDER BY timestamp DESC
          LIMIT ?
        `).all(limit);
                res.json(insights.map(i => ({
                    ...i,
                    data: JSON.parse(i.data || '{}'),
                })));
            }
            catch (error) {
                logger_1.default.error('Insights endpoint error:', error);
                res.json([]);
            }
        });
        // Configuration (safe subset)
        this.app.get('/api/config', (req, res) => {
            try {
                const cfg = config_1.default.get();
                const safeConfig = {
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
        this.app.get('/api/cache/stats', async (req, res) => {
            try {
                const cacheStats = await redis_cache_1.default.getStats();
                const llmStats = require('../shared/openrouter-service').default?.getCacheStats?.() || {
                    hits: 0,
                    misses: 0,
                    hitRate: 0,
                };
                res.json({
                    redis: cacheStats,
                    llm: llmStats,
                });
            }
            catch (error) {
                logger_1.default.error('Cache stats endpoint error:', error);
                res.json({
                    redis: { totalKeys: 0, memoryBytes: 0 },
                    llm: { hits: 0, misses: 0, hitRate: 0 },
                });
            }
        });
        // =========================================================================
        // RESEARCH API ENDPOINTS
        // =========================================================================
        // Strategy ideas - recently generated strategies
        this.app.get('/api/research/ideas', async (req, res) => {
            try {
                const limit = parseInt(req.query.limit) || 50;
                // Try to get from trace store (ideas are stored in recent traces)
                trace_store_1.default.initialize();
                const traces = trace_store_1.default.getRecentTraceSummaries(limit * 2);
                // Extract ideas from traces
                const ideas = [];
                for (const trace of traces) {
                    if (trace.strategyIdeas && Array.isArray(trace.strategyIdeas)) {
                        for (const idea of trace.strategyIdeas) {
                            ideas.push({
                                id: `idea_${trace.id}_${ideas.length}`,
                                name: idea.name || 'Unnamed Strategy',
                                description: idea.description || idea.rationale || '',
                                timestamp: trace.startTime,
                                confidence: idea.confidence || 0.5,
                                expectedReturn: idea.expectedReturn || 0,
                                regime: trace.regime || 'UNKNOWN',
                                tags: idea.tags || [trace.regime, trace.agentType].filter(Boolean),
                                traceId: trace.id,
                                symbol: trace.symbol
                            });
                        }
                    }
                }
                // Sort by newest first and limit
                ideas.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
                res.json(ideas.slice(0, limit));
            }
            catch (error) {
                logger_1.default.error('Research ideas endpoint error:', error);
                res.json([]);
            }
        });
        // Backtest jobs - currently running and recent backtests
        this.app.get('/api/research/backtests', async (req, res) => {
            try {
                // Get active backtests from cycle metrics
                const activeBacktests = Object.values(this.cycleMetrics.activeCycles)
                    .filter((cycle) => cycle.step === 'BACKTEST')
                    .map((cycle) => ({
                    id: `bt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    strategyName: cycle.symbol ? `${cycle.symbol} Strategy` : 'Unknown',
                    status: 'running',
                    progress: cycle.backtestProgress || 0,
                    startTime: cycle.startTime
                }));
                // Get completed backtests from recent traces
                const completedBacktests = this.cycleMetrics.recentTraces
                    .filter((t) => t.backtestResults && Array.isArray(t.backtestResults))
                    .flatMap((t) => t.backtestResults.map((result, idx) => ({
                    id: `bt_${t.cycleId}_${idx}`,
                    strategyName: result.strategyName || `Strategy ${idx + 1}`,
                    status: result.error ? 'failed' : 'completed',
                    progress: 100,
                    startTime: t.startTime,
                    endTime: t.endTime,
                    result: {
                        sharpe: result.sharpe,
                        winRate: result.winRate,
                        pnl: result.pnl,
                        trades: result.trades
                    }
                })));
                res.json([...activeBacktests, ...completedBacktests.slice(0, 20)]);
            }
            catch (error) {
                logger_1.default.error('Research backtests endpoint error:', error);
                res.json([]);
            }
        });
        // Strategy leaderboard - top performing strategies
        this.app.get('/api/research/leaderboard', async (req, res) => {
            try {
                if (!this.db) {
                    res.json([]);
                    return;
                }
                const limit = parseInt(req.query.limit) || 20;
                // Get strategies with performance metrics
                const strategies = this.db.prepare(`
          SELECT * FROM strategies 
          WHERE performance IS NOT NULL
          ORDER BY 
            json_extract(performance, '$.sharpe') DESC,
            json_extract(performance, '$.winRate') DESC
          LIMIT ?
        `).all(limit);
                const leaderboard = strategies.map((s) => {
                    const perf = JSON.parse(s.performance || '{}');
                    return {
                        id: s.id,
                        name: s.name,
                        sharpe: perf.sharpe || 0,
                        winRate: (perf.winRate || 0) * 100,
                        pnl: perf.pnl || perf.totalReturn || 0,
                        trades: perf.trades || 0,
                        maxDrawdown: perf.maxDrawdown || 0,
                        createdAt: s.createdAt,
                        updatedAt: s.updatedAt
                    };
                });
                res.json(leaderboard);
            }
            catch (error) {
                logger_1.default.error('Research leaderboard endpoint error:', error);
                // Fallback to trace-based leaderboard
                const limit = parseInt(req.query.limit) || 20;
                const traceLeaderboard = this.cycleMetrics.recentTraces
                    .filter((t) => t.selectedStrategy && t.backtestResults)
                    .map((t) => {
                    const result = t.backtestResults?.find((r) => r.strategyName === t.selectedStrategy?.name);
                    return {
                        id: t.cycleId,
                        name: t.selectedStrategy?.name || 'Unknown',
                        sharpe: result?.sharpe || 0,
                        winRate: (result?.winRate || 0) * 100,
                        pnl: result?.pnl || 0,
                        trades: result?.trades || 0,
                        timestamp: t.endTime
                    };
                })
                    .sort((a, b) => (b.sharpe || 0) - (a.sharpe || 0));
                res.json(traceLeaderboard.slice(0, limit));
            }
        });
        // Evolution data - generation statistics
        this.app.get('/api/research/evolution', async (req, res) => {
            try {
                // Get unique generations from traces
                const generations = new Map();
                for (const trace of this.cycleMetrics.recentTraces) {
                    const gen = trace.generation || Math.floor(Math.random() * 10) + 1;
                    if (!generations.has(gen)) {
                        generations.set(gen, {
                            number: gen,
                            fitness: 0,
                            avgFitness: 0,
                            populationSize: 0,
                            strategies: [],
                            timestamp: trace.endTime
                        });
                    }
                    const genData = generations.get(gen);
                    if (trace.backtestResults) {
                        for (const result of trace.backtestResults) {
                            genData.strategies.push(result);
                            genData.fitness = Math.max(genData.fitness, result.sharpe || 0);
                        }
                    }
                }
                // Calculate averages
                const evolution = Array.from(generations.values())
                    .map(g => ({
                    number: g.number,
                    fitness: g.fitness,
                    avgFitness: g.strategies.length > 0
                        ? g.strategies.reduce((sum, s) => sum + (s.sharpe || 0), 0) / g.strategies.length
                        : 0,
                    populationSize: g.strategies.length,
                    bestStrategy: g.strategies.sort((a, b) => (b.sharpe || 0) - (a.sharpe || 0))[0]?.strategyName || null,
                    timestamp: g.timestamp
                }))
                    .sort((a, b) => a.number - b.number);
                res.json(evolution);
            }
            catch (error) {
                logger_1.default.error('Research evolution endpoint error:', error);
                res.json([]);
            }
        });
        // =========================================================================
        // News API routes
        this.app.get('/api/news/clusters', async (req, res) => {
            try {
                const limit = parseInt(req.query.limit) || 20;
                const hours = parseInt(req.query.hours) || 24;
                const category = req.query.category;
                const force = req.query.force === 'true';
                const heatmap = await news_heatmap_service_1.default.getHeatmap({
                    limit,
                    hours,
                    category: category || 'ALL',
                    force,
                });
                res.json(heatmap.clusters);
            }
            catch (error) {
                logger_1.default.error('Clusters endpoint error:', error);
                res.json([]);
            }
        });
        this.app.get('/api/news/heatmap', async (req, res) => {
            try {
                const limit = parseInt(req.query.limit) || 80;
                const hours = parseInt(req.query.hours) || 24;
                const category = req.query.category;
                const force = req.query.force === 'true';
                const heatmap = await news_heatmap_service_1.default.getHeatmap({
                    limit,
                    hours,
                    category: category || 'ALL',
                    force,
                });
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
            }
            catch (error) {
                logger_1.default.error('Heatmap endpoint error:', error);
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
            }
        });
        this.app.get('/api/news/heatmap/timeline', async (req, res) => {
            try {
                const hours = parseInt(req.query.hours) || 24;
                const bucketHours = parseInt(req.query.bucketHours) || 2;
                const category = req.query.category || 'ALL';
                const timeline = await news_heatmap_service_1.default.getTimeline(hours, bucketHours, category);
                res.json(timeline);
            }
            catch (error) {
                logger_1.default.error('Heatmap timeline endpoint error:', error);
                res.json({
                    generatedAt: new Date().toISOString(),
                    hours: 24,
                    bucketHours: 2,
                    points: [],
                });
            }
        });
        this.app.post('/api/news/heatmap/rebuild', async (req, res) => {
            try {
                const limit = parseInt(req.query.limit) || 80;
                const hours = parseInt(req.query.hours) || 24;
                const category = req.query.category;
                const rebuilt = await news_heatmap_service_1.default.rebuild({
                    limit,
                    hours,
                    category: category || 'ALL',
                    force: true,
                });
                this.hotClustersCache = rebuilt.clusters;
                this.lastHotClustersFetch = Date.now();
                res.json({
                    success: true,
                    generatedAt: rebuilt.generatedAt,
                    totalArticles: rebuilt.totalArticles,
                    totalClusters: rebuilt.totalClusters,
                    llm: rebuilt.llm,
                });
            }
            catch (error) {
                logger_1.default.error('Heatmap rebuild endpoint error:', error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        });
        this.app.get('/api/news/clusters/:id', async (req, res) => {
            try {
                const hours = parseInt(req.query.hours) || 48;
                const cluster = await news_heatmap_service_1.default.getClusterDetails(req.params.id, hours);
                if (!cluster) {
                    res.status(404).json({ error: 'Cluster not found' });
                    return;
                }
                res.json(cluster);
            }
            catch (error) {
                logger_1.default.error(`Error fetching cluster ${req.params.id}:`, error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
        this.app.get('/api/news', async (req, res) => {
            try {
                const limit = parseInt(req.query.limit) || 50;
                const category = req.query.category;
                const news = category ? await news_store_1.default.getNewsByCategory(category, limit) : await news_store_1.default.getRecentNews(limit);
                res.json(news);
            }
            catch (error) {
                logger_1.default.error('News endpoint error:', error);
                res.json([]);
            }
        });
        this.app.get('/api/news/stats', async (req, res) => {
            try {
                const stats = await news_store_1.default.getStats();
                res.json(stats);
            }
            catch (error) {
                logger_1.default.error('News stats endpoint error:', error);
                res.json({
                    total: 0,
                    byCategory: {},
                    byImportance: {},
                    bySentiment: {},
                    latestArticle: null,
                    totalTags: 0,
                });
            }
        });
        this.app.get('/api/news/tags', async (req, res) => {
            try {
                const tags = await news_store_1.default.getTags();
                res.json(tags);
            }
            catch (error) {
                logger_1.default.error('News tags endpoint error:', error);
                res.json([]);
            }
        });
        this.app.get('/api/news/search', async (req, res) => {
            try {
                const q = req.query.q;
                const limit = parseInt(req.query.limit) || 20;
                if (!q) {
                    res.status(400).json({ error: 'Query parameter required' });
                    return;
                }
                const news = await news_store_1.default.searchNews(q, limit);
                res.json(news);
            }
            catch (error) {
                logger_1.default.error('News search endpoint error:', error);
                res.json([]);
            }
        });
        this.app.get('/api/news/:id', async (req, res) => {
            try {
                const article = await news_store_1.default.getArticleById(req.params.id);
                if (!article) {
                    res.status(404).json({ error: 'Article not found' });
                    return;
                }
                res.json(article);
            }
            catch (error) {
                logger_1.default.error(`Error fetching article ${req.params.id}:`, error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
        this.app.post('/api/news/:id/summarize', async (req, res) => {
            try {
                const article = await news_store_1.default.getArticleById(req.params.id);
                if (!article) {
                    res.status(404).json({ error: 'Article not found' });
                    return;
                }
                if (article.summary && article.summary.length > 50) {
                    res.json({ id: article.id, summary: article.summary, cached: true });
                    return;
                }
                const content = article.content || article.snippet;
                if (!content) {
                    res.status(400).json({ error: 'Article has no content for summarization' });
                    return;
                }
                const summary = await glm_service_1.default.summarizeArticle(content);
                await news_store_1.default.updateArticleSummary(article.id, summary);
                res.json({ id: article.id, summary, cached: false });
            }
            catch (error) {
                logger_1.default.error(`Error summarizing article ${req.params.id}:`, error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
        // Prediction markets API routes
        this.app.get('/api/predictions/status', (req, res) => {
            try {
                const status = prediction_store_1.default.getAgentStatus();
                res.json(status);
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
        this.app.get('/api/predictions/markets', async (req, res) => {
            try {
                const limit = parseInt(req.query.limit) || 50;
                const minVolume = Number.parseFloat(process.env.PREDICTION_MIN_VOLUME || '');
                const markets = await polymarket_client_1.default.fetchMarkets(limit * 2);
                const filtered = markets
                    .filter(market => market.status === 'OPEN' || market.status === 'UNKNOWN')
                    .filter(market => (market.volume ?? 0) >= (Number.isFinite(minVolume) ? minVolume : 0))
                    .slice(0, limit);
                res.json(filtered);
            }
            catch (error) {
                logger_1.default.error('Predictions markets endpoint error:', error);
                res.json([]);
            }
        });
        this.app.get('/api/predictions/positions', (req, res) => {
            try {
                res.json(prediction_store_1.default.getPositions());
            }
            catch (error) {
                logger_1.default.error('Predictions positions endpoint error:', error);
                res.json([]);
            }
        });
        this.app.get('/api/predictions/trades', (req, res) => {
            try {
                const limit = parseInt(req.query.limit) || 50;
                res.json(prediction_store_1.default.getTrades(limit));
            }
            catch (error) {
                logger_1.default.error('Predictions trades endpoint error:', error);
                res.json([]);
            }
        });
        this.app.get('/api/predictions/backtests', (req, res) => {
            try {
                const limit = parseInt(req.query.limit) || 50;
                res.json(prediction_store_1.default.getBacktests(limit));
            }
            catch (error) {
                logger_1.default.error('Predictions backtests endpoint error:', error);
                res.json([]);
            }
        });
        this.app.get('/api/predictions/traces', (req, res) => {
            try {
                const limit = parseInt(req.query.limit) || 200;
                trace_store_1.default.initialize();
                const summaries = trace_store_1.default.getRecentTraceSummaries(limit, 'PREDICTION');
                res.json(summaries);
            }
            catch (error) {
                logger_1.default.error('Predictions traces endpoint error:', error);
                res.json([]);
            }
        });
        this.app.get('/api/predictions/news', async (req, res) => {
            try {
                const marketId = req.query.marketId;
                const marketSlug = req.query.marketSlug;
                if (!marketId && !marketSlug) {
                    res.status(400).json({ error: 'marketId or marketSlug required' });
                    return;
                }
                const news = await news_store_1.default.getNewsByMarket(marketId || marketSlug, marketSlug);
                res.json(news);
            }
            catch (error) {
                logger_1.default.error('Predictions news endpoint error:', error);
                res.json([]);
            }
        });
        // ============================================================================
        // pump.fun API ENDPOINTS
        // ============================================================================
        // Get recent analyzed tokens
        this.app.get('/api/pumpfun/tokens', async (req, res) => {
            try {
                const limit = parseInt(req.query.limit) || 50;
                const minScore = parseFloat(req.query.minScore) || 0;
                await pumpfun_store_1.default.initialize();
                const tokens = await pumpfun_store_1.default.getRecentTokens(limit, minScore);
                res.json({ tokens });
            }
            catch (error) {
                logger_1.default.error('[PumpFun] Tokens endpoint error:', error);
                res.json({ tokens: [] });
            }
        });
        // Get token by mint address
        this.app.get('/api/pumpfun/token/:mint', async (req, res) => {
            try {
                await pumpfun_store_1.default.initialize();
                const token = pumpfun_store_1.default.getTokenByMint(req.params.mint);
                if (!token) {
                    res.status(404).json({ error: 'Token not found' });
                    return;
                }
                res.json({ token });
            }
            catch (error) {
                logger_1.default.error(`[PumpFun] Error fetching token ${req.params.mint}:`, error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
        // Get pump.fun statistics
        this.app.get('/api/pumpfun/stats', async (req, res) => {
            try {
                await pumpfun_store_1.default.initialize();
                const stats = pumpfun_store_1.default.getStats();
                res.json({ stats });
            }
            catch (error) {
                logger_1.default.error('[PumpFun] Stats endpoint error:', error);
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
            }
        });
        // Get high confidence tokens
        this.app.get('/api/pumpfun/high-confidence', async (req, res) => {
            try {
                const configuredThreshold = config_1.default.get().pumpfun?.minScoreThreshold ?? 0.7;
                const requestedMinScore = parseFloat(req.query.minScore);
                const minScore = Number.isFinite(requestedMinScore) ? requestedMinScore : configuredThreshold;
                const limit = parseInt(req.query.limit) || 100;
                await pumpfun_store_1.default.initialize();
                const tokens = await pumpfun_store_1.default.getHighConfidenceTokens(minScore, limit);
                res.json({ tokens });
            }
            catch (error) {
                logger_1.default.error('[PumpFun] High confidence endpoint error:', error);
                res.json({ tokens: [] });
            }
        });
        // Get tokens by recommendation
        this.app.get('/api/pumpfun/recommendation/:rec', async (req, res) => {
            try {
                const validRecs = ['STRONG_BUY', 'BUY', 'HOLD', 'AVOID', 'STRONG_AVOID'];
                const rec = req.params.rec.toUpperCase();
                if (!validRecs.includes(rec)) {
                    res.status(400).json({ error: 'Invalid recommendation' });
                    return;
                }
                const limit = parseInt(req.query.limit) || 50;
                await pumpfun_store_1.default.initialize();
                const tokens = await pumpfun_store_1.default.getByRecommendation(rec, limit);
                res.json({ tokens });
            }
            catch (error) {
                logger_1.default.error(`[PumpFun] Recommendation endpoint error:`, error);
                res.json({ tokens: [] });
            }
        });
        // Subscribe to pump.fun events (for WebSocket clients)
        this.app.get('/pumpfun', (req, res) => {
            res.sendFile(path_1.default.join(__dirname, '../../dashboard/public/pumpfun.html'));
        });
        this.app.get('/pumpfun.html', (req, res) => {
            res.sendFile(path_1.default.join(__dirname, '../../dashboard/public/pumpfun.html'));
        });
        // Serve dashboard
        this.app.get('/', (req, res) => {
            res.sendFile(path_1.default.join(__dirname, '../../dashboard/public/index.html'));
        });
        this.app.get('/trace', (req, res) => {
            res.sendFile(path_1.default.join(__dirname, '../../dashboard/public/trace.html'));
        });
        this.app.get('/news', (req, res) => {
            res.sendFile(path_1.default.join(__dirname, '../../dashboard/public/news.html'));
        });
        this.app.get('/heatmap', (req, res) => {
            res.sendFile(path_1.default.join(__dirname, '../../dashboard/public/news-heatmap.html'));
        });
        this.app.get('/heatmap-bubbles', (req, res) => {
            res.redirect('/heatmap');
        });
        this.app.get('/heatmap-grid', (req, res) => {
            res.redirect('/heatmap');
        });
        this.app.get('/predictions', (req, res) => {
            res.sendFile(path_1.default.join(__dirname, '../../dashboard/public/predictions.html'));
        });
        this.app.get('/pools.html', (req, res) => {
            res.sendFile(path_1.default.join(__dirname, '../../dashboard/public/pools.html'));
        });
        this.app.get('/pools', (req, res) => {
            res.sendFile(path_1.default.join(__dirname, '../../dashboard/public/pools.html'));
        });
        this.app.get('/enhanced-heatmap', (req, res) => {
            res.redirect('/heatmap');
        });
        this.app.get('/funding-arbitrage', (req, res) => {
            res.sendFile(path_1.default.join(__dirname, '../../dashboard/public/funding-arbitrage.html'));
        });
        this.app.get('/funding-arbitrage.html', (req, res) => {
            res.sendFile(path_1.default.join(__dirname, '../../dashboard/public/funding-arbitrage.html'));
        });
        this.app.get('/research', (req, res) => {
            res.sendFile(path_1.default.join(__dirname, '../../dashboard/public/research.html'));
        });
        this.app.get('/research.html', (req, res) => {
            res.sendFile(path_1.default.join(__dirname, '../../dashboard/public/research.html'));
        });
        // =========================================================================
        // SAFEKEEPING FUND API
        // =========================================================================
        // Safekeeping fund state
        this.app.get('/api/safekeeping', async (req, res) => {
            try {
                // Try to get from Redis cache first
                const cached = await redis_cache_1.default.get('safekeeping', 'state');
                if (cached) {
                    res.json(cached);
                    return;
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
            }
            catch (error) {
                logger_1.default.error('[Dashboard] Safekeeping state error:', error);
                res.status(500).json({ error: 'Failed to get safekeeping state' });
            }
        });
        // Trigger manual rebalance
        this.app.post('/api/safekeeping/rebalance', async (req, res) => {
            try {
                logger_1.default.info('[Dashboard] Manual rebalance triggered');
                // Publish to message bus
                await message_bus_1.default.publish('safekeeping:rebalance:trigger', {
                    manual: true,
                    source: 'dashboard'
                });
                res.json({ success: true, message: 'Rebalance triggered' });
            }
            catch (error) {
                logger_1.default.error('[Dashboard] Rebalance trigger error:', error);
                res.status(500).json({ error: 'Failed to trigger rebalance' });
            }
        });
        // Emergency halt
        this.app.post('/api/safekeeping/halt', async (req, res) => {
            try {
                logger_1.default.warn('[Dashboard] Emergency halt triggered');
                // Publish to message bus
                await message_bus_1.default.publish('safekeeping:emergency:halt', {
                    reason: req.body?.reason || 'Manual halt from dashboard',
                    source: 'dashboard'
                });
                res.json({ success: true, message: 'Emergency halt triggered' });
            }
            catch (error) {
                logger_1.default.error('[Dashboard] Emergency halt error:', error);
                res.status(500).json({ error: 'Failed to trigger emergency halt' });
            }
        });
        // 404 handler
        this.app.use((req, res) => {
            res.status(404).json({ error: 'Endpoint not found' });
        });
    }
    setupWebSocket() {
        // Main dashboard namespace
        this.io.on('connection', (socket) => {
            logger_1.default.info(`Dashboard client connected: ${socket.id}`);
            // Send initial state
            socket.emit('cycle_metrics', this.cycleMetrics);
            // Send message bus connection status
            socket.emit('message_bus_status', {
                connected: this.messageBusConnected,
            });
            socket.on('disconnect', () => {
                logger_1.default.info(`Dashboard client disconnected: ${socket.id}`);
            });
        });
        logger_1.default.info('[Dashboard] WebSocket namespaces set up');
    }
    startNewsPolling() {
        if (!Number.isFinite(this.newsPollIntervalMs) || this.newsPollIntervalMs <= 0) {
            return;
        }
        if (this.newsPollTimer) {
            clearInterval(this.newsPollTimer);
        }
        this.newsPollTimer = setInterval(() => {
            void this.pollNewsUpdates();
        }, this.newsPollIntervalMs);
        void this.pollNewsUpdates();
    }
    async pollNewsUpdates() {
        try {
            const limit = Number.isFinite(this.newsPollLimit) ? this.newsPollLimit : 25;
            const latest = await news_store_1.default.getRecentNews(limit);
            if (!latest.length)
                return;
            if (!this.lastNewsId) {
                this.lastNewsId = latest[0].id;
                return;
            }
            if (latest[0].id === this.lastNewsId) {
                return;
            }
            const newItems = [];
            for (const item of latest) {
                if (item.id === this.lastNewsId)
                    break;
                newItems.push(item);
            }
            this.lastNewsId = latest[0].id;
            if (newItems.length > 0) {
                this.io.emit('news_update', { items: newItems });
            }
        }
        catch (error) {
            logger_1.default.error('[Dashboard] News poll failed:', error);
        }
    }
    // Called by the agent to update cycle status
    updateCycleStatus(cycleId, step, data = {}) {
        this.cycleMetrics.currentStep = step;
        this.cycleMetrics.activeCycles[cycleId] = {
            step,
            startTime: this.cycleMetrics.activeCycles[cycleId]?.startTime || new Date(),
            lastUpdate: new Date(),
            ...data,
        };
        // Broadcast to all clients
        this.io.emit('cycle_update', { cycleId, step, data, timestamp: new Date() });
    }
    // Called when a cycle completes
    completeCycle(cycleId, success, state) {
        this.cycleMetrics.totalCycles++;
        if (success) {
            this.cycleMetrics.successfulCycles++;
        }
        else {
            this.cycleMetrics.failedCycles++;
        }
        const tradeExecuted = !!state.executionResult && state.executionResult.status === 'FILLED';
        if (tradeExecuted) {
            this.cycleMetrics.tradesExecuted++;
        }
        this.cycleMetrics.lastCycleTime = new Date();
        delete this.cycleMetrics.activeCycles[cycleId];
        // Store pruned trace
        const trace = {
            cycleId,
            startTime: state.cycleStartTime || new Date(),
            endTime: new Date(),
            symbol: state.symbol,
            success,
            tradeExecuted,
            regime: state.regime,
            indicators: state.indicators, // Full indicators object
            candles: state.candles?.slice(-5), // Last 5 candles for context
            similarPatternsCount: state.similarPatterns?.length || 0,
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
                cycleId,
                startTime: state.cycleStartTime || new Date(),
                endTime: new Date(),
                symbol: state.symbol,
                timeframe: state.timeframe || '1h',
                success,
                tradeExecuted,
                regime: state.regime,
                indicators: state.indicators,
                candles: state.candles?.slice(-20), // Keep more candles for analysis
                similarPatternsCount: state.similarPatterns?.length || 0,
                strategyIdeas: state.strategyIdeas,
                backtestResults: state.backtestResults,
                selectedStrategy: state.selectedStrategy,
                signal: state.signal,
                riskAssessment: state.riskAssessment,
                executionResult: state.executionResult,
                thoughts: state.thoughts,
                errors: state.errors,
            });
            logger_1.default.debug(`[Dashboard] Trace ${cycleId} persisted for LLM analysis`);
        }
        catch (error) {
            logger_1.default.error('[Dashboard] Failed to persist trace:', error);
        }
        // Broadcast completion
        this.io.emit('cycle_complete', {
            cycleId,
            success,
            tradeExecuted,
            metrics: this.cycleMetrics,
            traceSummary: {
                id: trace.cycleId,
                symbol: trace.symbol,
                regime: trace.regime,
                thoughts: trace.thoughts?.slice(-1)[0],
            }
        });
        // Publish to message bus (if connected)
        if (this.messageBusConnected) {
            void message_bus_1.default.publish(message_bus_1.Channel.CYCLE_COMPLETE, {
                cycleId,
                symbol: state.symbol,
                success,
                tradeExecuted,
                timestamp: new Date(),
            });
        }
    }
    async start() {
        return new Promise((resolve, reject) => {
            try {
                this.server.listen(this.port, '0.0.0.0', () => {
                    logger_1.default.info(`Dashboard server started on port ${this.port}`);
                    logger_1.default.info(`Access dashboard at: http://0.0.0.0:${this.port}`);
                    logger_1.default.info(`Message bus: ${this.messageBusConnected ? 'CONNECTED' : 'DISCONNECTED (polling fallback)'}`);
                    resolve();
                });
                this.server.on('error', (error) => {
                    logger_1.default.error('Dashboard server error:', error);
                    reject(error);
                });
            }
            catch (error) {
                logger_1.default.error('Failed to start dashboard server:', error);
                reject(error);
            }
        });
    }
    async stop() {
        return new Promise((resolve) => {
            if (this.newsPollTimer) {
                clearInterval(this.newsPollTimer);
                this.newsPollTimer = null;
            }
            // Disconnect from message bus
            if (this.messageBusConnected) {
                void message_bus_1.default.disconnect();
                void redis_cache_1.default.disconnect();
            }
            this.io.close(() => {
                this.server.close(() => {
                    logger_1.default.info('Dashboard server stopped');
                    resolve();
                });
            });
        });
    }
}
// Singleton instance
const dashboardServer = new DashboardServer();
// Start if run directly
if (require.main === module) {
    dashboardServer.start().catch((error) => {
        logger_1.default.error('Failed to start dashboard server:', error);
        process.exit(1);
    });
    process.on('SIGINT', async () => {
        logger_1.default.info('Shutting down dashboard server...');
        await dashboardServer.stop();
        process.exit(0);
    });
    process.on('SIGTERM', async () => {
        logger_1.default.info('Shutting down dashboard server...');
        await dashboardServer.stop();
        process.exit(0);
    });
}
exports.default = dashboardServer;
//# sourceMappingURL=dashboard-server.js.map