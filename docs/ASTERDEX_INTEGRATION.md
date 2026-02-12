# Asterdex Exchange Integration

Cross-exchange funding rate arbitrage integration between Hyperliquid and Asterdex perpetual DEX.

## Overview

This module adds support for comparing funding rates between Hyperliquid and Asterdex to identify arbitrage opportunities where the same asset has different funding rates across exchanges.

## Files Created/Modified

### New Files

1. **`/src/market-ingester/asterdex-client.ts`**
   - WebSocket and REST API client for Asterdex
   - Configurable endpoints (update when API docs are available)
   - Methods:
     - `connectWebSocket()` - WebSocket connection with auto-reconnect
     - `getFundingRates()` - Fetch all funding rates
     - `getMarkets()` - Get available markets
     - `getMarketInfo(symbol)` - Get specific market details
   - Includes mock data for development when API is unavailable

2. **`/src/market-ingester/cross-exchange-arbitrage.ts`**
   - Cross-exchange arbitrage detector
   - Compares funding rates between HL and Asterdex
   - Calculates spreads and annualized yields
   - Identifies recommended actions:
     - `long_hl_short_aster` - When Asterdex has higher funding
     - `short_hl_long_aster` - When Hyperliquid has higher funding
   - Tracks price differences for execution risk assessment

3. **`/migrations/003_cross_exchange_arbitrage.sql`**
   - Database schema for cross-exchange opportunities
   - Tables:
     - `cross_exchange_opportunities` - Stores detected opportunities
     - `exchange_status` - Tracks exchange connectivity
     - `cross_exchange_executions` - Logs executed arbitrage trades
     - `exchange_symbol_mapping` - Maps symbols between exchanges

### Modified Files

1. **`/src/market-ingester/funding-arbitrage-scanner.ts`**
   - Added `scanCrossExchangeArbitrage()` method
   - Added `getCrossExchangeOpportunities()` method
   - Added `runCompleteScan()` for combined single + cross-exchange scanning

2. **`/src/market-ingester/funding-arbitrage-job.ts`**
   - Added cross-exchange scanning to background job
   - Added cross-exchange alerts for high-urgency opportunities
   - Added Telegram/Discord notifications for cross-exchange events

3. **`/src/dashboard/funding-arbitrage-routes.ts`**
   - Added API endpoints:
     - `GET /api/funding/cross-exchange` - Get opportunities
     - `GET /api/funding/cross-exchange/:symbol` - Get specific symbol
     - `GET /api/funding/cross-exchange/stats` - Get statistics
     - `GET /api/funding/exchanges` - Get exchange status
     - `POST /api/funding/cross-exchange/scan` - Manual scan trigger
     - `POST /api/funding/refresh-all` - Complete scan

4. **`/dashboard/public/funding-arbitrage.html`**
   - Added Cross-Exchange Arbitrage section
   - Shows side-by-side comparison: HL vs Asterdex
   - Highlights best spreads
   - Shows estimated yearly yield
   - Execute buttons (placeholder)
   - Exchange connection status indicators

5. **`/src/shared/types.ts`**
   - Added `asterdex` config section
   - Added `crossExchangeArbitrage` config section

## Configuration

Add to your `.env` file:

```bash
# Asterdex API Endpoints (update when API docs available)
ASTERDEX_WS_ENDPOINT=wss://api.asterdex.io/ws/v1
ASTERDEX_REST_ENDPOINT=https://api.asterdex.io/v1
ASTERDEX_API_KEY=your_api_key_here

# Cross-Exchange Arbitrage Settings
CROSS_EXCHANGE_MIN_SPREAD=0.0001
CROSS_EXCHANGE_MIN_ANNUALIZED=10
CROSS_EXCHANGE_HIGH_URGENCY=50
CROSS_EXCHANGE_MEDIUM_URGENCY=25
CROSS_EXCHANGE_PRICE_DIFF_THRESHOLD=0.5

# Notifications
FUNDING_ALERTS_ENABLED=true
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id
DISCORD_WEBHOOK_URL=your_webhook_url
```

Or add to `config/config.json`:

```json
{
  "asterdex": {
    "wsEndpoint": "wss://api.asterdex.io/ws/v1",
    "restEndpoint": "https://api.asterdex.io/v1",
    "apiKey": "your_api_key"
  },
  "crossExchangeArbitrage": {
    "minSpreadThreshold": 0.0001,
    "minAnnualizedSpread": 10,
    "highUrgencyThreshold": 50,
    "mediumUrgencyThreshold": 25,
    "priceDiffThreshold": 0.5,
    "symbolsToTrack": ["BTC", "ETH", "SOL", "AVAX", "ARB", "OP"]
  }
}
```

## API Endpoints

### Get Cross-Exchange Opportunities
```bash
GET /api/funding/cross-exchange?minSpread=10&urgency=high
```

Response:
```json
{
  "success": true,
  "count": 3,
  "opportunities": [
    {
      "symbol": "BTC",
      "hyperliquidFunding": 0.0001,
      "asterdexFunding": -0.00005,
      "spread": 0.00015,
      "spreadPercent": 0.015,
      "annualizedSpread": 54.75,
      "recommendedAction": "short_hl_long_aster",
      "estimatedYearlyYield": 54.75,
      "urgency": "high",
      "confidence": 85,
      "hyperliquidMarkPrice": 98500,
      "asterdexMarkPrice": 98450,
      "priceDiffPercent": 0.05
    }
  ]
}
```

### Get Exchange Status
```bash
GET /api/funding/exchanges
```

Response:
```json
{
  "success": true,
  "exchanges": [
    {
      "name": "hyperliquid",
      "connected": true,
      "lastUpdate": 1707753600000,
      "symbols": ["BTC", "ETH", "SOL", ...]
    },
    {
      "name": "asterdex",
      "connected": true,
      "lastUpdate": 1707753600000,
      "symbols": ["BTC", "ETH", "SOL", ...]
    }
  ]
}
```

## Key Data Tracked

### Priority Assets
- BTC, ETH, SOL funding on both exchanges
- AVAX, ARB, OP, LINK for additional coverage
- Any other overlapping markets detected

### Funding Payment Timing
- Both exchanges pay every 8 hours (3x per day)
- Annualized rate = fundingRate × 3 × 365

### Arbitrage Calculation
- Spread = HL_Funding - Asterdex_Funding
- If HL > Asterdex: Short HL / Long Asterdex
- If Asterdex > HL: Long HL / Short Asterdex

### Execution Risk Assessment
- Price difference between exchanges monitored
- Configurable threshold (default: 0.5%)
- High price diff = lower confidence score

## Dashboard

Access the enhanced funding arbitrage dashboard at:
```
http://localhost:3001/funding-arbitrage
```

Features:
- Real-time funding rate monitoring
- Single-exchange opportunities (Long/Short)
- Cross-exchange arbitrage opportunities
- Side-by-side exchange comparison
- Execute buttons (placeholder for now)
- Connection status indicators
- Auto-refresh every 1-5 minutes

## Future Enhancements

When Asterdex API documentation is available:
1. Update endpoint URLs in configuration
2. Remove mock data from client
3. Implement actual order execution
4. Add WebSocket subscriptions for real-time updates
5. Implement proper authentication

## Notes

- Mock data is provided for development when API is unavailable
- The system gracefully degrades if one exchange is down
- Cross-exchange opportunities require accounts on both exchanges
- Always verify price differences before executing arbitrage
- Funding rates change every 8 hours - timing matters