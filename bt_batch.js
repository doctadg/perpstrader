
const { BacktestEngine } = require("./bin/backtest/enhanced-backtest");
const Database = require("better-sqlite3");
const db = new Database("./data/trading.db", { readonly: true });

const strategies = [{"id": "hermes-d4f7a2e1b3c8", "name": "ETH RSI BB Dedicated MR v1", "symbols": ["ETH"], "type": "MEAN_REVERSION", "params": "{\"rsiPeriod\":12,\"oversold\":28,\"overbought\":72,\"bbPeriod\":20,\"bbStdDev\":2.2}", "risk": "{\"stopLoss\":0.012,\"takeProfit\":0.025,\"maxPositionSize\":0.07,\"maxLeverage\":3}"}, {"id": "hermes-b8e1c3f4a5d2", "name": "FARTCOIN Ultra-Selective MR v1", "symbols": ["FARTCOIN"], "type": "MEAN_REVERSION", "params": "{\"rsiPeriod\":10,\"oversold\":23,\"overbought\":77,\"bbPeriod\":22,\"bbStdDev\":2.8}", "risk": "{\"stopLoss\":0.025,\"takeProfit\":0.05,\"maxPositionSize\":0.05,\"maxLeverage\":3}"}, {"id": "hermes-a2b3c4d5e6f7", "name": "SOL ETH Power Pair MR v1", "symbols": ["SOL", "ETH"], "type": "MEAN_REVERSION", "params": "{\"rsiPeriod\":14,\"oversold\":30,\"overbought\":70,\"bbPeriod\":20,\"bbStdDev\":2.0}", "risk": "{\"stopLoss\":0.015,\"takeProfit\":0.03,\"maxPositionSize\":0.06,\"maxLeverage\":3}"}, {"id": "hermes-c5d6e7f8a9b0", "name": "BCH Steady MR v1", "symbols": ["BCH"], "type": "MEAN_REVERSION", "params": "{\"rsiPeriod\":14,\"oversold\":30,\"overbought\":70,\"bbPeriod\":20,\"bbStdDev\":2.0}", "risk": "{\"stopLoss\":0.015,\"takeProfit\":0.025,\"maxPositionSize\":0.05,\"maxLeverage\":3}"}, {"id": "hermes-e8f9a0b1c2d3", "name": "kPEPE Aggressive MR v1", "symbols": ["kPEPE"], "type": "MEAN_REVERSION", "params": "{\"rsiPeriod\":10,\"oversold\":25,\"overbought\":75,\"bbPeriod\":18,\"bbStdDev\":2.2}", "risk": "{\"stopLoss\":0.02,\"takeProfit\":0.04,\"maxPositionSize\":0.08,\"maxLeverage\":4}"}, {"id": "hermes-6fbdecb42fee", "name": "Winners Only RSI BB Scalp", "symbols": ["SOL", "ETH", "FARTCOIN", "BCH", "kPEPE"], "type": "MEAN_REVERSION", "params": "{\"rsiPeriod\":14,\"oversold\":30,\"overbought\":70,\"bbPeriod\":20,\"bbStdDev\":2.0}", "risk": "{\"stopLoss\":0.015,\"takeProfit\":0.025,\"maxPositionSize\":0.04,\"maxLeverage\":3}"}];
const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

async function run() {
    const results = [];
    for (const s of strategies) {
        try {
            const placeholders = s.symbols.map(() => '?').join(', ');
            const limit = Math.min(2000, s.symbols.length * 1000);
            const rows = db.prepare(
                `SELECT symbol, timestamp, open, high, low, close, volume
                 FROM market_data WHERE symbol IN (${placeholders}) AND timestamp >= ?
                 ORDER BY symbol, timestamp ASC LIMIT ${limit}`
            ).all(...s.symbols, cutoff);
            
            if (rows.length < 100) {
                results.push({id: s.id, name: s.name, error: "insufficient_data", candles: rows.length});
                continue;
            }
            
            const marketData = rows.map(r => ({
                symbol: r.symbol, timestamp: new Date(r.timestamp),
                open: r.open, high: r.high, low: r.low, close: r.close, volume: r.volume,
            }));
            
            const strategy = {
                id: s.id, name: s.name, type: s.type, symbols: s.symbols, timeframe: "15m",
                parameters: JSON.parse(s.params), entryConditions: [], exitConditions: [],
                riskParameters: JSON.parse(s.risk),
            };
            
            const engine = new BacktestEngine({initialCapital: 10000, commissionRate: 0.0005, slippageBps: 5});
            const bt = await engine.runBacktest(strategy, marketData);
            
            results.push({
                id: s.id, name: s.name, symbols: s.symbols,
                candles: rows.length, totalTrades: bt.totalTrades,
                sharpe: Math.round(bt.sharpeRatio * 100) / 100,
                winRate: Math.round(bt.winRate * 100) / 100,
                totalReturn: Math.round(bt.totalReturn * 10000) / 100,
                maxDrawdown: Math.round(bt.maxDrawdown * 100) / 100,
                profitFactor: Math.round((bt.profitFactor || 0) * 100) / 100,
                finalCapital: Math.round(bt.finalCapital * 100) / 100,
            });
        } catch (e) {
            results.push({id: s.id, name: s.name, error: e.message?.substring(0, 200)});
        }
    }
    console.log(JSON.stringify(results, null, 2));
    db.close();
}
run();
