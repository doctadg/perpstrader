#!/usr/bin/env node
/**
 * WebSocket Candle Ingestion Service
 *
 * Connects to Hyperliquid WebSocket for real-time candle data
 * No rate limits, continuous feed, builds history automatically
 *
 * Run: node bin/jobs/websocket-candles.js
 */
declare class WebSocketCandleService {
    private db;
    private ws;
    private reconnectTimer;
    private pingTimer;
    private isRunning;
    private activeSymbols;
    private candleBuilders;
    private timeframes;
    constructor();
    private setupDatabase;
    private loadActiveSymbols;
    start(): Promise<void>;
    stop(): void;
    private connect;
    private subscribe;
    private handleMessage;
    private processTrade;
    private processCandle;
    private saveCandle;
    private flushCandles;
    private logStats;
    private startPing;
    private scheduleReconnect;
}
declare const service: WebSocketCandleService;
export default service;
//# sourceMappingURL=websocket-candles.d.ts.map