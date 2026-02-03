type AnalysisTaskType = 'backtestBatch' | 'ta';
declare class AnalysisWorkerPool {
    readonly size: number;
    private workers;
    private idleWorkers;
    private queue;
    private pending;
    private currentTaskByWorker;
    private shuttingDown;
    constructor(workerPath: string, size: number);
    runTask<T>(type: AnalysisTaskType, payload: any): Promise<T>;
    shutdown(): void;
    private spawnWorker;
    private handleWorkerMessage;
    private handleWorkerError;
    private removeWorker;
    private dispatch;
}
export declare function getAnalysisWorkerPool(): AnalysisWorkerPool | null;
export {};
//# sourceMappingURL=analysis-worker-pool.d.ts.map