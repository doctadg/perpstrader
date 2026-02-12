import { PredictionTrade, PredictionPosition, PredictionPortfolio } from '../../shared/types';
interface AlertMessage {
    type: 'TRADE' | 'STOP_LOSS' | 'DAILY_PNL' | 'EMERGENCY_STOP' | 'ERROR' | 'INFO';
    title: string;
    message: string;
    data?: Record<string, any>;
    priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}
declare class AlertingService {
    private config;
    private alertHistory;
    private readonly MAX_HISTORY;
    private dailyReportScheduled;
    constructor();
    private loadConfig;
    private scheduleDailyReport;
    /**
     * Alert on trade execution
     */
    tradeExecuted(trade: PredictionTrade, portfolio: PredictionPortfolio): Promise<void>;
    /**
     * Alert on stop loss trigger
     */
    stopLossTriggered(position: PredictionPosition, exitPrice: number, pnl: number): Promise<void>;
    /**
     * Alert on emergency stop
     */
    emergencyStop(reason: string, portfolio: PredictionPortfolio): Promise<void>;
    /**
     * Alert on error
     */
    error(error: Error, context?: string): Promise<void>;
    /**
     * Daily P&L report
     */
    dailyPnLReport(dailyPnL: number, totalTrades: number, winRate: number, portfolio: PredictionPortfolio): Promise<void>;
    /**
     * Generic info alert
     */
    info(title: string, message: string, data?: Record<string, any>): Promise<void>;
    private sendAlert;
    private sendTelegram;
    private sendDiscord;
    private sendWebhook;
    private sendDailyPnLReport;
    /**
     * Export trade journal for tax reporting
     */
    exportTradeJournal(trades: PredictionTrade[]): string;
    /**
     * Get alert history
     */
    getAlertHistory(type?: AlertMessage['type'], since?: number): Array<{
        timestamp: number;
        message: AlertMessage;
    }>;
    /**
     * Test all alert channels
     */
    testAlerts(): Promise<{
        telegram: boolean;
        discord: boolean;
        webhook: boolean;
    }>;
}
declare const alertingService: AlertingService;
export default alertingService;
//# sourceMappingURL=alerting-service.d.ts.map