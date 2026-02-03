export interface MarketData {
  symbol: string;
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  vwap?: number;
  bid?: number;
  ask?: number;
  bidSize?: number;
  askSize?: number;
}

export interface OrderBookSnapshot {
  symbol: string;
  timestamp: Date;
  bids: Array<{ price: number; size: number }>;
  asks: Array<{ price: number; size: number }>;
  midPrice: number;
  spread: number;
}

export interface FundingRate {
  symbol: string;
  timestamp: Date;
  fundingRate: number;
  nextFundingTime: Date;
}

export interface Trade {
  timestamp: Date;
  price: number;
  size: number;
  side: 'buy' | 'sell';
  symbol: string;
}
