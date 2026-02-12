#!/usr/bin/env node
/**
 * Candle Data Population Job
 *
 * Fetches historical candle data for all active trading symbols
 * Run with: node bin/populate-candles.js
 * Cron: Every 15 minutes + on startup
 */
declare class CandlePopulationJob {
    private db;
    private hyperliquidUrl;
    private isRunning;
    private updateTimer;
    constructor();
    private setupDatabase;
    /**
     * Get all active symbols from database
     */
    private getActiveSymbols;
    /**
     * Get last candle timestamp for symbol
     */
    private getLastCandleTimestamp;
    /**
     * Sleep helper for rate limiting
     */
    private sleep;
    /**
     * Fetch candles from Hyperliquid with retry logic
     */
    private fetchCandles;
    /**
     * Store candles in database
     */
    private storeCandles;
    /**
     * Process a single symbol
     */
    private processSymbol;
    /**
     * Run the population job
     */
    run(): Promise<void>;
    /**
     * Start periodic updates
     */
    start(): void;
    /**
     * Stop the service
     */
    stop(): void;
}
declare const candleJob: CandlePopulationJob;
export default candleJob;
//# sourceMappingURL=populate-candles.d.ts.map