#!/usr/bin/env node
/**
 * Funding Rate Arbitrage Background Job
 *
 * Updates funding rates every 5 minutes and sends alerts for extreme funding events
 * Run with: node bin/funding-arbitrage-job.js
 * Cron: Every 5 minutes
 */
declare class FundingArbitrageJob {
    private isRunning;
    private updateTimer;
    private cleanupTimer;
    start(): Promise<void>;
    stop(): Promise<void>;
    private runUpdate;
    private checkAndAlert;
    private checkCrossExchangeAlerts;
    private sendCrossExchangeNotification;
    private formatExchangeName;
    private sendNotification;
    private runCleanup;
}
export { FundingArbitrageJob };
//# sourceMappingURL=funding-arbitrage-job.d.ts.map