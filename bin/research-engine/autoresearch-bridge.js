"use strict";
// AutoResearch Bridge - Manages the Python AutoResearch agent lifecycle and communication
// Bridges external Python experiments into PerpsTrader's research engine
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.autoResearchBridge = exports.AutoResearchBridge = void 0;
exports.registerAutoResearchBridge = registerAutoResearchBridge;
require("dotenv/config");
const child_process_1 = require("child_process");
const path_1 = __importDefault(require("path"));
const ioredis_1 = __importDefault(require("ioredis"));
const logger_1 = __importDefault(require("../shared/logger"));
const message_bus_1 = require("../shared/message-bus");
const experiment_store_1 = require("./experiment-store");
const idea_queue_1 = require("./idea-queue");
// ─── Configuration ────────────────────────────────────────────────────────────
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6380';
const PYTHON_EXECUTABLE = process.env.PYTHON_EXECUTABLE || 'python3';
const AUTORESEARCH_DIR = process.env.AUTORESEARCH_DIR || path_1.default.join(__dirname, '../../autoresearch/');
const EXPERIMENT_SCRIPT = path_1.default.join(AUTORESEARCH_DIR, 'experiment.py');
const DEFAULT_BRIDGE_CONFIG = {
    experimentInterval: 30 * 60 * 1000, // 30 minutes
    autoAdoptThreshold: 1.5, // e.g. Sharpe ratio >= 1.5
    adoptMetric: 'sharpe_ratio',
    maxConcurrentExperiments: 2,
    gpuBudget: 0,
    triggerChannels: ['research:autoresearch:trigger'],
    experimentTimeoutMs: 60 * 60 * 1000, // 1 hour
    resultPollIntervalMs: 10 * 1000, // 10 seconds
};
// ─── AutoResearchBridge ───────────────────────────────────────────────────────
class AutoResearchBridge {
    config;
    _store;
    _queue;
    /** Public accessor for experiment store (used by registered commands) */
    get store() {
        return this._store;
    }
    // Redis subscriber for trigger channel
    redisSubscriber = null;
    redisPublisher = null;
    // Lifecycle
    isRunning = false;
    startedAt = 0;
    cycleTimer = null;
    resultPollTimer = null;
    lastExperimentAt = null;
    lastError = null;
    // Active child processes keyed by experiment id
    activeProcesses = new Map();
    retryCounts = new Map();
    MAX_RETRIES = 3;
    constructor(config) {
        this.config = { ...DEFAULT_BRIDGE_CONFIG, ...config };
        this._store = experiment_store_1.experimentStore;
        this._queue = idea_queue_1.ideaQueue;
    }
    // ─── Public API ──────────────────────────────────────────────────────────
    /**
     * Start the bridge: init connections, begin monitoring
     */
    async start() {
        if (this.isRunning) {
            logger_1.default.warn('[AutoResearchBridge] Already running');
            return;
        }
        logger_1.default.info('═══════════════════════════════════════════════════════════');
        logger_1.default.info('  AutoResearch Bridge Starting');
        logger_1.default.info('═══════════════════════════════════════════════════════════');
        logger_1.default.info(`[AutoResearchBridge] Experiment interval: ${this.config.experimentInterval / 60000}min`);
        logger_1.default.info(`[AutoResearchBridge] Auto-adopt threshold: ${this.config.autoAdoptThreshold} (${this.config.adoptMetric})`);
        logger_1.default.info(`[AutoResearchBridge] Max concurrent: ${this.config.maxConcurrentExperiments}`);
        logger_1.default.info(`[AutoResearchBridge] Trigger channels: ${this.config.triggerChannels.join(', ')}`);
        this.isRunning = true;
        this.startedAt = Date.now();
        // Initialize store
        await this._store.initialize();
        // Connect Redis subscriber for triggers
        await this.connectRedis();
        // Start the experiment cycle timer
        this.scheduleExperimentCycle();
        // Start result polling
        this.scheduleResultPolling();
        // Publish startup status
        await this.publishStatus();
        logger_1.default.info('[AutoResearchBridge] Started successfully');
    }
    /**
     * Graceful shutdown
     */
    async stop() {
        logger_1.default.info('[AutoResearchBridge] Stopping...');
        this.isRunning = false;
        // Clear timers
        if (this.cycleTimer) {
            clearTimeout(this.cycleTimer);
            this.cycleTimer = null;
        }
        if (this.resultPollTimer) {
            clearInterval(this.resultPollTimer);
            this.resultPollTimer = null;
        }
        // Kill all active child processes
        for (const [expId, proc] of this.activeProcesses) {
            logger_1.default.info(`[AutoResearchBridge] Killing process for experiment ${expId}`);
            proc.kill('SIGTERM');
        }
        this.activeProcesses.clear();
        // Disconnect Redis
        await this.disconnectRedis();
        // Publish final status
        await this.publishStatus();
        logger_1.default.info('[AutoResearchBridge] Stopped');
    }
    /**
     * Trigger a new experiment by spawning the Python script
     */
    async triggerExperiment(experimentType, params) {
        if (!this.isRunning) {
            throw new Error('[AutoResearchBridge] Not running');
        }
        // Check concurrency limit
        if (this.activeProcesses.size >= this.config.maxConcurrentExperiments) {
            throw new Error(`[AutoResearchBridge] Max concurrent experiments reached (${this.activeProcesses.size}/${this.config.maxConcurrentExperiments})`);
        }
        // Create experiment record
        const experiment = await this._store.createExperiment({
            experimentType,
            parameters: params || {},
            description: `AutoResearch experiment: ${experimentType}`,
        });
        // Update status to running
        await this._store.updateExperiment(experiment.id, { status: 'running' });
        // Spawn the Python process
        await this.spawnExperimentProcess(experiment.id, experimentType, params);
        return experiment;
    }
    /**
     * Run a full experiment cycle: trigger → wait → evaluate → adopt/discard
     */
    async runExperimentCycle() {
        const startTime = Date.now();
        logger_1.default.info('[AutoResearchBridge] ╔══════════════════════════════════════════════════════════╗');
        logger_1.default.info('[AutoResearchBridge] ║  Experiment Cycle Starting                                ║');
        logger_1.default.info('[AutoResearchBridge] ╚══════════════════════════════════════════════════════════╝');
        try {
            // Check for any running experiments — don't double-fire
            const running = await this._store.getExperiments({ status: 'running' }, 1, 0);
            if (running.length > 0) {
                logger_1.default.info(`[AutoResearchBridge] ${running.length} experiment(s) still running, skipping trigger`);
                return;
            }
            // Check active process slots
            if (this.activeProcesses.size >= this.config.maxConcurrentExperiments) {
                logger_1.default.info('[AutoResearchBridge] All experiment slots occupied, skipping trigger');
                return;
            }
            // Trigger a default experiment
            await this.triggerExperiment('strategy_optimization');
            // Poll for result with timeout
            await this.waitForLatestResult();
            const duration = Date.now() - startTime;
            logger_1.default.info(`[AutoResearchBridge] Experiment cycle completed in ${duration}ms`);
        }
        catch (error) {
            this.lastError = error instanceof Error ? error.message : String(error);
            logger_1.default.error('[AutoResearchBridge] Experiment cycle error:', error);
        }
    }
    /**
     * Check for newly completed experiments in SQLite
     */
    async checkResults() {
        if (!this.isRunning)
            return [];
        try {
            const completed = await this._store.getExperiments({ status: 'completed' }, 10, 0);
            for (const exp of completed) {
                // Only process experiments we haven't seen completed yet
                // (detected by checking if they still have their default empty result
                //   vs experiments already adopted/discarded)
                if (exp.metrics && Object.keys(exp.metrics).length > 0) {
                    // Evaluate for adoption
                    const metricValue = exp.metrics[this.config.adoptMetric];
                    if (metricValue !== undefined && metricValue >= this.config.autoAdoptThreshold) {
                        logger_1.default.info(`[AutoResearchBridge] Experiment ${exp.id} exceeds threshold ` +
                            `(${this.config.adoptMetric}=${metricValue} >= ${this.config.autoAdoptThreshold})`);
                        await this.adoptExperiment(exp.id);
                    }
                    else {
                        logger_1.default.info(`[AutoResearchBridge] Experiment ${exp.id} below threshold ` +
                            `(${this.config.adoptMetric}=${metricValue ?? 'N/A'} < ${this.config.autoAdoptThreshold})`);
                        await this.discardExperiment(exp.id);
                    }
                }
            }
            return completed;
        }
        catch (error) {
            this.lastError = error instanceof Error ? error.message : String(error);
            logger_1.default.error('[AutoResearchBridge] Error checking results:', error);
            return [];
        }
    }
    /**
     * Adopt an experiment: promote it into the research engine's idea queue
     */
    async adoptExperiment(experimentId) {
        try {
            const experiment = await this._store.getExperiment(experimentId);
            if (experiment.status === 'adopted') {
                logger_1.default.debug(`[AutoResearchBridge] Experiment ${experimentId} already adopted`);
                return;
            }
            // Mark as adopted in experiment store
            await this._store.updateExperiment(experimentId, {
                status: 'adopted',
                completedAt: experiment.completedAt || new Date().toISOString(),
            });
            // Convert experiment into a strategy idea and push into idea queue
            const idea = {
                id: `ar-${experimentId}`,
                name: `AutoResearch: ${experiment.experimentType}`,
                description: experiment.description || `AutoResearch experiment ${experimentId}`,
                type: 'AI_PREDICTION',
                symbols: experiment.parameters?.symbols || ['BTC'],
                timeframe: experiment.parameters?.timeframe || '15m',
                parameters: experiment.parameters,
                entryConditions: experiment.result
                    ? [`AutoResearch signal: ${experiment.result}`]
                    : ['AutoResearch-generated strategy'],
                exitConditions: ['AutoResearch risk management'],
                riskParameters: {
                    maxPositionSize: experiment.parameters?.maxPositionSize || 0.1,
                    stopLoss: experiment.parameters?.stopLoss || 0.02,
                    takeProfit: experiment.parameters?.takeProfit || 0.05,
                    maxLeverage: experiment.parameters?.maxLeverage || 10,
                },
                confidence: Math.min(1.0, 0.5 + (experiment.metrics[this.config.adoptMetric] || 0) / 5),
                rationale: `Adopted from AutoResearch experiment ${experimentId}. Metrics: ${JSON.stringify(experiment.metrics)}`,
                status: 'PENDING',
                marketContext: experiment.parameters?.marketContext,
                createdAt: new Date(experiment.createdAt),
                updatedAt: new Date(),
            };
            await this._queue.initialize();
            await this._queue.addIdeas([idea]);
            // Publish adoption event
            await message_bus_1.messageBus.publish('research:autoresearch:result', {
                action: 'adopted',
                experimentId,
                experimentType: experiment.experimentType,
                metrics: experiment.metrics,
                ideaId: idea.id,
            });
            logger_1.default.info(`[AutoResearchBridge] Adopted experiment ${experimentId} → idea ${idea.id}`);
        }
        catch (error) {
            this.lastError = error instanceof Error ? error.message : String(error);
            logger_1.default.error(`[AutoResearchBridge] Failed to adopt experiment ${experimentId}:`, error);
        }
    }
    /**
     * Discard an experiment that didn't meet thresholds
     */
    async discardExperiment(experimentId) {
        try {
            const experiment = await this._store.getExperiment(experimentId);
            if (experiment.status === 'discarded' || experiment.status === 'adopted') {
                return;
            }
            await this._store.updateExperiment(experimentId, {
                status: 'discarded',
                completedAt: experiment.completedAt || new Date().toISOString(),
            });
            // Publish discard event
            await message_bus_1.messageBus.publish('research:autoresearch:result', {
                action: 'discarded',
                experimentId,
                experimentType: experiment.experimentType,
                metrics: experiment.metrics,
            });
            logger_1.default.info(`[AutoResearchBridge] Discarded experiment ${experimentId}`);
        }
        catch (error) {
            this.lastError = error instanceof Error ? error.message : String(error);
            logger_1.default.error(`[AutoResearchBridge] Failed to discard experiment ${experimentId}:`, error);
        }
    }
    /**
     * Get current bridge status
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            activeExperiments: this.activeProcesses.size,
            totalExperiments: 0, // Populated from store when called with getStats()
            adoptedCount: 0,
            lastExperimentAt: this.lastExperimentAt,
            lastError: this.lastError,
            uptimeMs: this.isRunning ? Date.now() - this.startedAt : 0,
        };
    }
    /**
     * Get stats — delegates to experiment-store
     */
    async getStats() {
        const storeStats = await this._store.getStats();
        const status = this.getStatus();
        return {
            ...status,
            ...storeStats,
        };
    }
    // ─── Private: Process Management ─────────────────────────────────────────
    /**
     * Spawn a Python experiment process
     */
    async spawnExperimentProcess(experimentId, experimentType, params) {
        const args = [
            EXPERIMENT_SCRIPT,
            '--experiment-id', experimentId,
            '--experiment-type', experimentType,
            '--db-path', this.getDbPath(),
        ];
        // Pass parameters as JSON via stdin
        const paramJson = JSON.stringify(params || {});
        logger_1.default.info(`[AutoResearchBridge] Spawning process: ${PYTHON_EXECUTABLE} ${args.join(' ')}`);
        const childProcess = (0, child_process_1.spawn)(PYTHON_EXECUTABLE, args, {
            cwd: AUTORESEARCH_DIR,
            env: {
                ...process.env,
                AUTORESEARCH_EXPERIMENT_ID: experimentId,
                AUTORESEARCH_EXPERIMENT_TYPE: experimentType,
                AUTORESEARCH_DB_PATH: this.getDbPath(),
                CUDA_VISIBLE_DEVICES: this.config.gpuBudget > 0 ? '0' : '',
            },
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        // Send parameters via stdin
        childProcess.stdin?.write(paramJson);
        childProcess.stdin?.end();
        this.activeProcesses.set(experimentId, childProcess);
        this.lastExperimentAt = new Date().toISOString();
        // Capture stdout
        childProcess.stdout?.on('data', (data) => {
            const output = data.toString().trim();
            logger_1.default.info(`[AutoResearchBridge:${experimentId}] ${output}`);
            this.parseProcessOutput(experimentId, output);
        });
        // Capture stderr
        childProcess.stderr?.on('data', (data) => {
            logger_1.default.warn(`[AutoResearchBridge:${experimentId}] STDERR: ${data.toString().trim()}`);
        });
        // Handle process exit
        childProcess.on('close', async (code) => {
            this.activeProcesses.delete(experimentId);
            if (code === 0) {
                logger_1.default.info(`[AutoResearchBridge] Experiment ${experimentId} process exited successfully`);
            }
            else {
                logger_1.default.error(`[AutoResearchBridge] Experiment ${experimentId} process exited with code ${code}`);
                await this.handleExperimentFailure(experimentId, `Process exited with code ${code}`);
            }
            await this.publishStatus();
        });
        // Handle process errors
        childProcess.on('error', async (err) => {
            this.activeProcesses.delete(experimentId);
            logger_1.default.error(`[AutoResearchBridge] Experiment ${experimentId} process error:`, err);
            await this.handleExperimentFailure(experimentId, err.message);
            await this.publishStatus();
        });
        // Set a timeout to kill long-running experiments
        setTimeout(() => {
            if (this.activeProcesses.has(experimentId)) {
                logger_1.default.warn(`[AutoResearchBridge] Experiment ${experimentId} timed out, killing...`);
                childProcess.kill('SIGKILL');
            }
        }, this.config.experimentTimeoutMs).unref();
    }
    /**
     * Parse process stdout for metrics and results
     */
    parseProcessOutput(experimentId, output) {
        // Look for JSON lines with metrics
        const lines = output.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
                try {
                    const parsed = JSON.parse(trimmed);
                    if (parsed.metrics && typeof parsed.metrics === 'object') {
                        this._store.updateExperiment(experimentId, {
                            metrics: parsed.metrics,
                            result: parsed.result || parsed.summary || '',
                            status: 'completed',
                            completedAt: new Date().toISOString(),
                            commitHash: parsed.commit_hash || null,
                        }).catch((err) => {
                            logger_1.default.error(`[AutoResearchBridge] Failed to update experiment ${experimentId}:`, err);
                        });
                    }
                }
                catch {
                    // Not valid JSON — skip
                }
            }
        }
    }
    /**
     * Handle experiment failure with retry logic
     */
    async handleExperimentFailure(experimentId, errorMsg) {
        const retryCount = this.retryCounts.get(experimentId) || 0;
        if (retryCount < this.MAX_RETRIES) {
            this.retryCounts.set(experimentId, retryCount + 1);
            logger_1.default.info(`[AutoResearchBridge] Retrying experiment ${experimentId} ` +
                `(attempt ${retryCount + 1}/${this.MAX_RETRIES})`);
            // Reset status to pending for retry
            await this._store.updateExperiment(experimentId, { status: 'pending' });
            // Retry after a short delay
            setTimeout(() => {
                if (this.isRunning) {
                    this.triggerExperiment('strategy_optimization').catch((err) => {
                        logger_1.default.error('[AutoResearchBridge] Retry trigger failed:', err);
                    });
                }
            }, 5000 * (retryCount + 1)).unref();
        }
        else {
            this.retryCounts.delete(experimentId);
            this.lastError = errorMsg;
            await this._store.updateExperiment(experimentId, {
                status: 'failed',
                result: errorMsg,
                completedAt: new Date().toISOString(),
            });
        }
    }
    // ─── Private: Redis ─────────────────────────────────────────────────────
    async connectRedis() {
        try {
            this.redisSubscriber = new ioredis_1.default(REDIS_URL, {
                retryStrategy: (times) => Math.min(times * 200, 5000),
                maxRetriesPerRequest: null,
                lazyConnect: true,
            });
            this.redisPublisher = new ioredis_1.default(REDIS_URL, {
                retryStrategy: (times) => Math.min(times * 200, 5000),
                maxRetriesPerRequest: 3,
                lazyConnect: true,
            });
            await this.redisSubscriber.connect();
            await this.redisPublisher.connect();
            // Subscribe to trigger channels
            for (const channel of this.config.triggerChannels) {
                await this.redisSubscriber.subscribe(channel);
                logger_1.default.info(`[AutoResearchBridge] Subscribed to trigger channel: ${channel}`);
            }
            // Handle trigger messages
            this.redisSubscriber.on('message', async (channel, data) => {
                try {
                    const message = JSON.parse(data);
                    logger_1.default.info(`[AutoResearchBridge] Trigger received on ${channel}`, message);
                    const experimentType = message.experimentType || message.type || 'strategy_optimization';
                    const params = message.parameters || message.params;
                    await this.triggerExperiment(experimentType, params);
                }
                catch (error) {
                    logger_1.default.error(`[AutoResearchBridge] Failed to handle trigger on ${channel}:`, error);
                }
            });
            logger_1.default.info(`[AutoResearchBridge] Redis connected at ${REDIS_URL}`);
        }
        catch (error) {
            logger_1.default.error('[AutoResearchBridge] Failed to connect Redis:', error);
            // Non-fatal: triggers just won't work until Redis is available
        }
    }
    async disconnectRedis() {
        if (this.redisSubscriber) {
            await this.redisSubscriber.quit().catch(() => { });
            this.redisSubscriber = null;
        }
        if (this.redisPublisher) {
            await this.redisPublisher.quit().catch(() => { });
            this.redisPublisher = null;
        }
    }
    /**
     * Publish status update to Redis
     */
    async publishStatus() {
        try {
            const status = this.getStatus();
            const payload = {
                ...status,
                timestamp: new Date().toISOString(),
            };
            // Publish via message bus
            await message_bus_1.messageBus.publish('research:autoresearch:status', payload);
            // Also publish directly via Redis publisher
            if (this.redisPublisher) {
                await this.redisPublisher.publish('research:autoresearch:status', JSON.stringify(payload));
            }
        }
        catch (error) {
            logger_1.default.debug('[AutoResearchBridge] Failed to publish status:', error);
        }
    }
    // ─── Private: Scheduling ────────────────────────────────────────────────
    scheduleExperimentCycle() {
        if (!this.isRunning)
            return;
        const runCycle = async () => {
            try {
                await this.runExperimentCycle();
            }
            catch (error) {
                logger_1.default.error('[AutoResearchBridge] Experiment cycle error:', error);
            }
            if (this.isRunning) {
                this.cycleTimer = setTimeout(runCycle, this.config.experimentInterval);
            }
        };
        // First run after a short delay
        setTimeout(runCycle, 5000).unref();
    }
    scheduleResultPolling() {
        if (!this.isRunning)
            return;
        this.resultPollTimer = setInterval(async () => {
            try {
                await this.checkResults();
            }
            catch (error) {
                logger_1.default.error('[AutoResearchBridge] Result polling error:', error);
            }
        }, this.config.resultPollIntervalMs);
    }
    // ─── Private: Helpers ───────────────────────────────────────────────────
    /**
     * Wait for the latest triggered experiment to produce a result
     */
    async waitForLatestResult() {
        const pollStart = Date.now();
        const timeout = this.config.experimentTimeoutMs;
        while (Date.now() - pollStart < timeout) {
            const latest = await this._store.getLatestResult();
            if (latest && latest.completedAt) {
                logger_1.default.info(`[AutoResearchBridge] Got result for experiment ${latest.id}`);
                return;
            }
            await this.sleep(this.config.resultPollIntervalMs);
        }
        logger_1.default.warn('[AutoResearchBridge] Timed out waiting for experiment result');
    }
    getDbPath() {
        const dbConfig = config_1.default.getSection('database');
        return dbConfig.connection;
    }
    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
exports.AutoResearchBridge = AutoResearchBridge;
// ─── Singleton & Registration ─────────────────────────────────────────────────
exports.autoResearchBridge = new AutoResearchBridge();
exports.default = exports.autoResearchBridge;
// Import needed for getDbPath helper
const config_1 = __importDefault(require("../shared/config"));
/**
 * Register AutoResearch bridge commands with the research control system.
 * Call this during application startup to wire up the bridge.
 *
 * Usage in research-control or main entrypoint:
 *   import { registerAutoResearchBridge } from './research-engine/autoresearch-bridge';
 *   registerAutoResearchBridge();
 */
function registerAutoResearchBridge() {
    logger_1.default.info('[AutoResearchBridge] Registering commands...');
    const commands = {
        /**
         * Trigger a manual experiment
         * Usage: autoresearch trigger [type] [params_json]
         */
        'autoresearch:trigger': async (type, paramsJson) => {
            const experimentType = type || 'strategy_optimization';
            let params;
            if (paramsJson) {
                try {
                    params = JSON.parse(paramsJson);
                }
                catch {
                    throw new Error(`Invalid JSON parameters: ${paramsJson}`);
                }
            }
            const experiment = await exports.autoResearchBridge.triggerExperiment(experimentType, params);
            return { experimentId: experiment.id, type: experiment.experimentType, status: experiment.status };
        },
        /**
         * Run a full experiment cycle
         */
        'autoresearch:cycle': async () => {
            await exports.autoResearchBridge.runExperimentCycle();
            return { status: 'cycle_complete' };
        },
        /**
         * Check for new results and process them
         */
        'autoresearch:check': async () => {
            const results = await exports.autoResearchBridge.checkResults();
            return { count: results.length, experiments: results.map(r => r.id) };
        },
        /**
         * Adopt a specific experiment by id
         */
        'autoresearch:adopt': async (experimentId) => {
            if (!experimentId)
                throw new Error('experimentId is required');
            await exports.autoResearchBridge.adoptExperiment(experimentId);
            return { experimentId, status: 'adopted' };
        },
        /**
         * Discard a specific experiment by id
         */
        'autoresearch:discard': async (experimentId) => {
            if (!experimentId)
                throw new Error('experimentId is required');
            await exports.autoResearchBridge.discardExperiment(experimentId);
            return { experimentId, status: 'discarded' };
        },
        /**
         * Get bridge status
         */
        'autoresearch:status': async () => {
            return exports.autoResearchBridge.getStatus();
        },
        /**
         * Get full stats including experiment store statistics
         */
        'autoresearch:stats': async () => {
            return exports.autoResearchBridge.getStats();
        },
        /**
         * Get the best experiments by a specific metric
         */
        'autoresearch:best': async (metric, limit) => {
            const metricName = metric || 'sharpe_ratio';
            const count = limit ? parseInt(limit, 10) : 10;
            return exports.autoResearchBridge.store.getBestExperiments(metricName, count);
        },
        /**
         * List experiments with optional filter
         */
        'autoresearch:list': async (status, type, limit) => {
            const count = limit ? parseInt(limit, 10) : 20;
            return exports.autoResearchBridge.store.getExperiments({ status: status, experimentType: type }, count, 0);
        },
        /**
         * Cleanup old experiments
         */
        'autoresearch:cleanup': async (daysOld) => {
            const days = daysOld ? parseInt(daysOld, 10) : 30;
            const removed = await exports.autoResearchBridge.store.cleanupOldExperiments(days);
            return { removed, daysOld: days };
        },
    };
    logger_1.default.info(`[AutoResearchBridge] Registered ${Object.keys(commands).length} commands`);
    return { bridge: exports.autoResearchBridge, commands };
}
//# sourceMappingURL=autoresearch-bridge.js.map