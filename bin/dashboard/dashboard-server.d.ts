declare class DashboardServer {
    private app;
    private server;
    private io;
    private db;
    private port;
    private newsPollTimer;
    private lastNewsId;
    private newsPollIntervalMs;
    private newsPollLimit;
    private messageBusConnected;
    private hotClustersCache;
    private lastHotClustersFetch;
    private readonly HOT_CLUSTERS_CACHE_TTL;
    private cycleMetrics;
    constructor();
    /**
     * Connect to Redis message bus for event-driven updates
     */
    private connectMessageBus;
    /**
     * Subscribe to news events from message bus
     */
    private subscribeToNewsEvents;
    /**
     * Get hot clusters with caching
     */
    private getHotClustersCached;
    private setupMiddleware;
    private setupRoutes;
    private setupWebSocket;
    private startNewsPolling;
    private pollNewsUpdates;
    updateCycleStatus(cycleId: string, step: string, data?: any): void;
    completeCycle(cycleId: string, success: boolean, state: any): void;
    start(): Promise<void>;
    stop(): Promise<void>;
}
declare const dashboardServer: DashboardServer;
export default dashboardServer;
//# sourceMappingURL=dashboard-server.d.ts.map