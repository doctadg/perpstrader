export interface ApiData {
    status: any;
    portfolio: any;
    positions: any;
    signals: any;
    news: any;
    predictions: any;
    risk: any;
    strategies: any;
    orders?: any;
    backtest?: any;
}
export declare function checkConnection(): Promise<boolean>;
export declare function fetchAllData(): Promise<{
    data: ApiData;
    connected: boolean;
}>;
export declare function closePosition(positionId: string): Promise<any>;
export declare function cancelOrder(orderId: string): Promise<any>;
export declare function emergencyStop(): Promise<any>;
export declare function triggerCycle(symbol?: string): Promise<any>;
export declare function startAgent(agentName: string): Promise<any>;
export declare function stopAgent(agentName: string): Promise<any>;
export declare function fetchOrders(): Promise<any>;
export declare function fetchBacktestHistory(): Promise<any>;
export declare function getApiUrl(): string;
//# sourceMappingURL=api.d.ts.map