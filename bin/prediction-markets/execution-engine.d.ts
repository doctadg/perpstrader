import { PredictionRiskAssessment, PredictionSignal, PredictionTrade, PredictionPosition, PredictionPortfolio } from '../shared/types';
type OrderStatus = 'PENDING' | 'FILLED' | 'PARTIAL' | 'CANCELLED' | 'FAILED';
interface PendingOrder {
    id: string;
    signal: PredictionSignal;
    status: OrderStatus;
    submittedAt: number;
    filledAt?: number;
    filledShares?: number;
    filledPrice?: number;
    retryCount: number;
    error?: string;
}
declare class PredictionExecutionEngine {
    private initialBalance;
    private cashBalance;
    private realizedPnL;
    private positions;
    private currentPrices;
    private pendingOrders;
    private orderTimeoutMs;
    private slippageTolerance;
    private isRealTrading;
    constructor();
    updateMarketPrice(marketId: string, yesPrice?: number, noPrice?: number): void;
    executeSignal(signal: PredictionSignal, risk: PredictionRiskAssessment, marketTitle: string): Promise<PredictionTrade>;
    private validatePreExecution;
    private executeTrade;
    private executeBuy;
    private executeSell;
    private hasPendingOrder;
    private startOrderMonitoring;
    getPendingOrders(): PendingOrder[];
    cancelOrder(orderId: string): boolean;
    checkStopLosses(): Array<{
        position: PredictionPosition;
        exitPrice: number;
        pnl: number;
        reason: string;
    }>;
    emergencyCloseAll(): Promise<{
        closed: number;
        failed: number;
        totalPnl: number;
    }>;
    getPortfolio(): PredictionPortfolio;
    getPositions(): PredictionPosition[];
    getPosition(marketId: string, outcome: 'YES' | 'NO'): PredictionPosition | undefined;
    getHealth(): {
        healthy: boolean;
        positions: number;
        pendingOrders: number;
        cashBalance: number;
        isRealTrading: boolean;
    };
}
declare const predictionExecutionEngine: PredictionExecutionEngine;
export default predictionExecutionEngine;
//# sourceMappingURL=execution-engine.d.ts.map