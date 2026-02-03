/**
 * Hyperliquid SDK Client Wrapper
 *
 * Provides a centralized interface for interacting with Hyperliquid testnet/mainnet
 * using the @nktkas/hyperliquid SDK with proper EIP-712 signing.
 *
 * Enhanced with Nautilus-inspired features:
 * - Token bucket rate limiting
 * - Overfill protection
 * - State snapshots
 * - Message bus integration
 */
export interface HyperliquidPosition {
    symbol: string;
    side: 'LONG' | 'SHORT';
    size: number;
    entryPrice: number;
    markPrice: number;
    unrealizedPnL: number;
    leverage: number;
    marginUsed: number;
}
export interface HyperliquidAccountState {
    equity: number;
    withdrawable: number;
    positions: HyperliquidPosition[];
    marginUsed: number;
}
export interface HyperliquidOrderResult {
    success: boolean;
    orderId?: string;
    filledPrice?: number;
    filledSize?: number;
    status: string;
    error?: string;
}
export declare class HyperliquidClient {
    private transport;
    private publicClient;
    private walletClient;
    private wallet;
    private walletAddress;
    private userAddress;
    private isTestnet;
    private assetIndices;
    private assetNames;
    private isInitialized;
    constructor();
    /**
     * Initialize asset indices from the API
     */
    initialize(): Promise<void>;
    /**
     * Check if the client is configured for trading
     */
    isConfigured(): boolean;
    /**
     * Get the wallet address (signer)
     */
    getWalletAddress(): string;
    /**
     * Get the user address (target account)
     */
    getUserAddress(): string;
    /**
     * Get asset index by symbol
     */
    getAssetIndex(symbol: string): number | undefined;
    /**
     * Get all current mid prices (with rate limiting)
     */
    getAllMids(): Promise<Record<string, number>>;
    /**
     * Get account state (balance, positions) - with rate limiting
     */
    getAccountState(): Promise<HyperliquidAccountState>;
    /**
     * Get open orders
     */
    getOpenOrders(): Promise<any[]>;
    /**
     * Place an order (enhanced with rate limiting, retry logic, and overfill protection)
     */
    placeOrder(params: {
        symbol: string;
        side: 'BUY' | 'SELL';
        size: number;
        price?: number;
        reduceOnly?: boolean;
        orderType?: 'limit' | 'market';
        clientOrderId?: string;
    }): Promise<HyperliquidOrderResult>;
    /**
     * Check if an error is retryable (temporary network/server issues)
     */
    private isRetryableError;
    /**
     * Cancel an order
     */
    cancelOrder(symbol: string, orderId: string): Promise<boolean>;
    /**
     * Cancel all open orders
     */
    cancelAllOrders(): Promise<boolean>;
    /**
     * Update leverage for a symbol
     */
    updateLeverage(symbol: string, leverage: number, isCross?: boolean): Promise<boolean>;
    /**
     * Format price to appropriate precision for the asset
     * BTC uses $1 tick, ETH uses $0.1, SOL/others use $0.01
     */
    private formatPrice;
    /**
     * Format size to appropriate precision for the asset
     */
    private formatSize;
    /**
     * Get L2 order book
     */
    getL2Book(symbol: string): Promise<any>;
    /**
     * Get recent trades
     */
    getRecentTrades(symbol: string): Promise<any[]>;
}
declare const hyperliquidClient: HyperliquidClient;
export default hyperliquidClient;
//# sourceMappingURL=hyperliquid-client.d.ts.map