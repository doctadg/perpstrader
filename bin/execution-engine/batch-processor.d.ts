/**
 * Batch Processor
 *
 * Collects orders over a configurable window and batches them for execution.
 * Groups compatible orders (same symbol, same direction) to reduce churn.
 */
import { TradingSignal, RiskAssessment } from '../shared/types';
export interface BatchableOrder {
    id: string;
    signal: TradingSignal;
    riskAssessment: RiskAssessment;
    submittedAt: number;
    priority: number;
}
export interface BatchedOrder {
    symbol: string;
    side: 'BUY' | 'SELL';
    totalSize: number;
    avgConfidence: number;
    avgPrice: number;
    orderCount: number;
    originalOrders: BatchableOrder[];
    batchId: string;
}
export interface BatchProcessorConfig {
    windowMs: number;
    maxOrdersPerBatch: number;
    minOrdersToBatch: number;
    enableBatching: boolean;
}
export declare class BatchProcessor {
    private pendingOrders;
    private batchTimer;
    private isProcessing;
    private config;
    private onBatchReadyCallback;
    constructor(config?: Partial<BatchProcessorConfig>);
    /**
     * Set callback for when batches are ready
     */
    onBatchReady(callback: (batches: BatchedOrder[]) => Promise<void>): void;
    /**
     * Update configuration
     */
    updateConfig(config: Partial<BatchProcessorConfig>): void;
    /**
     * Add an order to the batch queue
     */
    addOrder(signal: TradingSignal, riskAssessment: RiskAssessment): boolean;
    /**
     * Force immediate batch processing
     */
    flush(): Promise<BatchedOrder[]>;
    /**
     * Get current queue stats
     */
    getQueueStats(): {
        pendingCount: number;
        bySymbol: Record<string, number>;
        oldestOrderAgeMs: number;
    };
    /**
     * Clear all pending orders
     */
    clearQueue(): void;
    private scheduleBatch;
    private processBatch;
    private groupOrders;
    private createBatch;
    private calculatePriority;
    /**
     * Check if a signal should be batched or processed immediately
     */
    shouldBatch(signal: TradingSignal, riskAssessment: RiskAssessment): boolean;
    /**
     * Enable/disable batching
     */
    setEnabled(enabled: boolean): void;
}
export declare const batchProcessor: BatchProcessor;
export default batchProcessor;
//# sourceMappingURL=batch-processor.d.ts.map