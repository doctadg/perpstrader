"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAnalysisWorkerPool = getAnalysisWorkerPool;
const worker_threads_1 = require("worker_threads");
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const logger_1 = __importDefault(require("./logger"));
class AnalysisWorkerPool {
    size;
    workers = [];
    idleWorkers = [];
    queue = [];
    pending = new Map();
    currentTaskByWorker = new Map();
    shuttingDown = false;
    constructor(workerPath, size) {
        this.size = size;
        for (let i = 0; i < size; i++) {
            this.spawnWorker(workerPath);
        }
    }
    runTask(type, payload) {
        if (this.shuttingDown) {
            return Promise.reject(new Error('Analysis worker pool is shutting down'));
        }
        const id = crypto_1.default.randomUUID();
        const task = { id, type, payload };
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            this.queue.push(task);
            this.dispatch();
        });
    }
    shutdown() {
        this.shuttingDown = true;
        for (const worker of this.workers) {
            worker.terminate().catch(() => null);
        }
        for (const [id, pending] of this.pending.entries()) {
            pending.reject(new Error('Analysis worker pool shut down'));
            this.pending.delete(id);
        }
        this.queue = [];
        this.idleWorkers = [];
        this.currentTaskByWorker.clear();
    }
    spawnWorker(workerPath) {
        const worker = new worker_threads_1.Worker(workerPath);
        worker.on('message', (message) => {
            this.handleWorkerMessage(worker, message);
        });
        worker.on('error', (error) => {
            this.handleWorkerError(worker, error, workerPath);
        });
        worker.on('exit', (code) => {
            if (code !== 0 && !this.shuttingDown) {
                this.handleWorkerError(worker, new Error(`Worker exited with code ${code}`), workerPath);
            }
        });
        this.workers.push(worker);
        this.idleWorkers.push(worker);
        this.dispatch();
    }
    handleWorkerMessage(worker, message) {
        const { id, result, error } = message || {};
        if (!id) {
            logger_1.default.warn('[AnalysisPool] Worker response missing task id');
            return;
        }
        const pending = this.pending.get(id);
        if (!pending) {
            logger_1.default.warn(`[AnalysisPool] No pending task for id ${id}`);
        }
        else if (error) {
            pending.reject(new Error(error));
        }
        else {
            pending.resolve(result);
        }
        this.pending.delete(id);
        this.currentTaskByWorker.delete(worker);
        if (!this.shuttingDown) {
            this.idleWorkers.push(worker);
            this.dispatch();
        }
    }
    handleWorkerError(worker, error, workerPath) {
        const currentTaskId = this.currentTaskByWorker.get(worker);
        if (currentTaskId) {
            const pending = this.pending.get(currentTaskId);
            if (pending) {
                pending.reject(error);
                this.pending.delete(currentTaskId);
            }
        }
        this.currentTaskByWorker.delete(worker);
        this.removeWorker(worker);
        if (!this.shuttingDown) {
            logger_1.default.warn('[AnalysisPool] Worker failed, respawning', error);
            this.spawnWorker(workerPath);
        }
    }
    removeWorker(worker) {
        this.workers = this.workers.filter(existing => existing !== worker);
        this.idleWorkers = this.idleWorkers.filter(existing => existing !== worker);
    }
    dispatch() {
        while (this.queue.length > 0 && this.idleWorkers.length > 0) {
            const worker = this.idleWorkers.pop();
            const task = this.queue.shift();
            this.currentTaskByWorker.set(worker, task.id);
            worker.postMessage(task);
        }
    }
}
let pool = null;
function resolveWorkerPath() {
    const jsPath = path_1.default.resolve(__dirname, '..', 'workers', 'analysis-worker.js');
    if (fs_1.default.existsSync(jsPath))
        return jsPath;
    const tsPath = path_1.default.resolve(__dirname, '..', 'workers', 'analysis-worker.ts');
    if (fs_1.default.existsSync(tsPath)) {
        logger_1.default.warn('[AnalysisPool] Worker JS not found; build output missing?');
    }
    return null;
}
function getAnalysisWorkerPool() {
    if (!worker_threads_1.isMainThread)
        return null;
    if (pool) {
        return pool;
    }
    const requested = Number.parseInt(process.env.ANALYSIS_WORKER_COUNT || '', 10);
    const enabled = process.env.ANALYSIS_WORKERS_ENABLED !== 'false';
    const workerCount = Number.isFinite(requested) && requested > 0
        ? requested
        : os_1.default.cpus().length;
    if (!enabled || workerCount < 1) {
        return null;
    }
    const workerPath = resolveWorkerPath();
    if (!workerPath) {
        logger_1.default.warn('[AnalysisPool] Worker entrypoint missing; falling back to main thread');
        return null;
    }
    pool = new AnalysisWorkerPool(workerPath, workerCount);
    return pool;
}
//# sourceMappingURL=analysis-worker-pool.js.map