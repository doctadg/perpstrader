import { Worker, isMainThread } from 'worker_threads';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import logger from './logger';

type AnalysisTaskType = 'backtestBatch' | 'ta';

interface AnalysisTask {
  id: string;
  type: AnalysisTaskType;
  payload: any;
}

interface AnalysisResponse {
  id: string;
  result?: any;
  error?: string;
}

type PendingTask = {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
};

class AnalysisWorkerPool {
  readonly size: number;
  private workers: Worker[] = [];
  private idleWorkers: Worker[] = [];
  private queue: AnalysisTask[] = [];
  private pending: Map<string, PendingTask> = new Map();
  private currentTaskByWorker: Map<Worker, string> = new Map();
  private shuttingDown = false;

  constructor(workerPath: string, size: number) {
    this.size = size;
    for (let i = 0; i < size; i++) {
      this.spawnWorker(workerPath);
    }
  }

  runTask<T>(type: AnalysisTaskType, payload: any): Promise<T> {
    if (this.shuttingDown) {
      return Promise.reject(new Error('Analysis worker pool is shutting down'));
    }

    const id = crypto.randomUUID();
    const task: AnalysisTask = { id, type, payload };

    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.queue.push(task);
      this.dispatch();
    });
  }

  shutdown(): void {
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

  private spawnWorker(workerPath: string): void {
    const worker = new Worker(workerPath);

    worker.on('message', (message: AnalysisResponse) => {
      this.handleWorkerMessage(worker, message);
    });

    worker.on('error', (error: Error) => {
      this.handleWorkerError(worker, error, workerPath);
    });

    worker.on('exit', (code: number) => {
      if (code !== 0 && !this.shuttingDown) {
        this.handleWorkerError(worker, new Error(`Worker exited with code ${code}`), workerPath);
      }
    });

    this.workers.push(worker);
    this.idleWorkers.push(worker);
    this.dispatch();
  }

  private handleWorkerMessage(worker: Worker, message: AnalysisResponse): void {
    const { id, result, error } = message || {};

    if (!id) {
      logger.warn('[AnalysisPool] Worker response missing task id');
      return;
    }

    const pending = this.pending.get(id);
    if (!pending) {
      logger.warn(`[AnalysisPool] No pending task for id ${id}`);
    } else if (error) {
      pending.reject(new Error(error));
    } else {
      pending.resolve(result);
    }

    this.pending.delete(id);
    this.currentTaskByWorker.delete(worker);

    if (!this.shuttingDown) {
      this.idleWorkers.push(worker);
      this.dispatch();
    }
  }

  private handleWorkerError(worker: Worker, error: Error, workerPath: string): void {
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
      logger.warn('[AnalysisPool] Worker failed, respawning', error);
      this.spawnWorker(workerPath);
    }
  }

  private removeWorker(worker: Worker): void {
    this.workers = this.workers.filter(existing => existing !== worker);
    this.idleWorkers = this.idleWorkers.filter(existing => existing !== worker);
  }

  private dispatch(): void {
    while (this.queue.length > 0 && this.idleWorkers.length > 0) {
      const worker = this.idleWorkers.pop()!;
      const task = this.queue.shift()!;
      this.currentTaskByWorker.set(worker, task.id);
      worker.postMessage(task);
    }
  }
}

let pool: AnalysisWorkerPool | null = null;

function resolveWorkerPath(): string | null {
  const jsPath = path.resolve(__dirname, '..', 'workers', 'analysis-worker.js');
  if (fs.existsSync(jsPath)) return jsPath;

  const tsPath = path.resolve(__dirname, '..', 'workers', 'analysis-worker.ts');
  if (fs.existsSync(tsPath)) {
    logger.warn('[AnalysisPool] Worker JS not found; build output missing?');
  }

  return null;
}

export function getAnalysisWorkerPool(): AnalysisWorkerPool | null {
  if (!isMainThread) return null;

  if (pool) {
    return pool;
  }

  const requested = Number.parseInt(process.env.ANALYSIS_WORKER_COUNT || '', 10);
  const enabled = process.env.ANALYSIS_WORKERS_ENABLED !== 'false';
  const workerCount = Number.isFinite(requested) && requested > 0
    ? requested
    : os.cpus().length;

  if (!enabled || workerCount < 1) {
    return null;
  }

  const workerPath = resolveWorkerPath();
  if (!workerPath) {
    logger.warn('[AnalysisPool] Worker entrypoint missing; falling back to main thread');
    return null;
  }

  pool = new AnalysisWorkerPool(workerPath, workerCount);
  return pool;
}
