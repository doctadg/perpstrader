export interface ApiData {
    status: any;
    portfolio: any;
    positions: any;
    signals: any;
    news: any;
    predictions: any;
    risk: any;
    strategies: any;
}
export declare function checkConnection(): Promise<boolean>;
export declare function fetchAllData(): Promise<{
    data: ApiData;
    connected: boolean;
}>;
export declare function getApiUrl(): string;
