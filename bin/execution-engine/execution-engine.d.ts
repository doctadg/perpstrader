import { TradingSignal, Trade, Portfolio, Position, RiskAssessment } from '../shared/types';
export declare class ExecutionEngine {
    private isTestnet;
    constructor();
    private initializeClient;
    /**
     * Update current price for a symbol (for portfolio valuation)
     */
    updatePrice(symbol: string, price: number): void;
    executeSignal(signal: TradingSignal, riskAssessment: RiskAssessment): Promise<Trade>;
    getPortfolio(): Promise<Portfolio>;
    cancelOrder(orderId: string, symbol?: string): Promise<boolean>;
    getOpenOrders(symbol?: string): Promise<any[]>;
    getHistoricalTrades(symbol: string, limit?: number): Promise<any[]>;
    getMarketData(symbol: string): Promise<any>;
    subscribeToWebSocket(callback: (data: any) => void): Promise<void>;
    unsubscribeFromWebSocket(): void;
    emergencyStop(): Promise<void>;
    validateCredentials(): Promise<boolean>;
    isConfigured(): boolean;
    getEnvironment(): string;
    /**
     * Get recently executed trades from DB
     * Replaces getPaperTrades
     */
    getRecentTrades(limit?: number): Promise<Trade[]>;
    /**
     * Get current positions from Hyperliquid
     * Replaces getPaperPositions
     */
    getPositions(): Promise<Position[]>;
    /**
     * Get realized P&L from DB
     * Replaces getPaperRealizedPnL (Approximation)
     */
    getRealizedPnL(): Promise<number>;
    /**
     * Get the wallet address being used
     */
    getWalletAddress(): string;
}
declare const executionEngine: ExecutionEngine;
export default executionEngine;
//# sourceMappingURL=execution-engine.d.ts.map