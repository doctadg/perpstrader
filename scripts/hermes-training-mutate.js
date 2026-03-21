/**
 * Hermes Training Cycle - Conservative Mutant Generation
 * Based on diagnosis: SOL SELL best performer ($1.39), 64% win rate on exits.
 * Previous mutants overtraded (1000+ trades, 15-30% win rates).
 * Key insight: fewer trades with wider stops = better.
 * 
 * Generating 5 conservative mutants focused on:
 * - Higher win rate targets (>50%)
 * - Fewer signals (quality over quantity)
 * - Focus on SOL (best historical performer)
 * - Wider stop losses to avoid premature exits
 * - Longer timeframes to reduce noise
 */
const Database = require('better-sqlite3');
const crypto = require('crypto');
const db = new Database('/home/d/PerpsTrader/data/trading.db');

const NOW = new Date().toISOString();
const CYCLE_ID = `cycle-${Date.now()}`;

// === MUTANTS ===
const mutants = [
  {
    name: "SOL RSI Mean Reversion Conservative v3",
    description: "SOL-focused mean reversion with high RSI threshold, wide BB, 30m TF for fewer signals",
    type: "MEAN_REVERSION",
    symbols: JSON.stringify(["SOL"]),
    timeframe: "30m",
    parameters: JSON.stringify({ rsiPeriod: 14, oversold: 25, overbought: 75, bbPeriod: 20, bbStdDev: 2.0, volumeFilter: 1.5 }),
    entryConditions: JSON.stringify(["RSI(14) < 25", "Price below BB(20,2.0) lower band", "Volume > 1.5x 20-period average"]),
    exitConditions: JSON.stringify(["RSI(14) > 50 (mean reversion target)", "Stop loss 2.5%", "Time-based exit after 24 bars"]),
    riskParameters: JSON.stringify({ maxPositionSize: 0.05, stopLoss: 0.025, takeProfit: 0.04, maxLeverage: 3 }),
    confidence: 0.82,
    rationale: "SOL SELL was best performer ($1.39, 7 trades). Wider BB (2.0 stddev) = rarer but higher-conviction entries. 30m TF reduces noise. Wider SL (2.5%) avoids getting stopped out.",
    market_context: JSON.stringify({ regime: "ranging", volatility: "low-medium", notes: "SOL showing range-bound behavior, ideal for mean reversion" })
  },
  {
    name: "Multi-Asset RSI Extreme Reversion",
    description: "Multi-asset mean reversion entering ONLY at extreme RSI levels (<20 or >80)",
    type: "MEAN_REVERSION",
    symbols: JSON.stringify(["SOL", "BTC", "ETH", "LINK", "BCH", "NEAR", "kPEPE"]),
    timeframe: "1h",
    parameters: JSON.stringify({ rsiPeriod: 14, oversold: 20, overbought: 80, bbPeriod: 20, bbStdDev: 2.0, minSignalStrength: 0.8 }),
    entryConditions: JSON.stringify(["RSI(14) < 20 (extreme oversold) OR RSI(14) > 80 (extreme overbought)", "Price touching BB(20,2.0) band", "No cooldown violation"]),
    exitConditions: JSON.stringify(["RSI returns to 40-60 neutral zone", "Trailing stop at 1.5x ATR", "Max hold: 48 bars (48h on 1h TF)"]),
    riskParameters: JSON.stringify({ maxPositionSize: 0.03, stopLoss: 0.03, takeProfit: 0.05, maxLeverage: 3 }),
    confidence: 0.78,
    rationale: "Extreme RSI entries historically have highest reversal rates. 1h TF = fewer signals but higher quality. Multi-asset for diversification. Only 2-3 trades per week expected.",
    market_context: JSON.stringify({ regime: "mixed", volatility: "normal", notes: "Extreme RSI conditions rare but high-conviction" })
  },
  {
    name: "SOL EMA Trend with RSI Filter",
    description: "SOL trend following on 1h with strict RSI confirmation to avoid fakeouts",
    type: "TREND_FOLLOWING",
    symbols: JSON.stringify(["SOL"]),
    timeframe: "1h",
    parameters: JSON.stringify({ emaFast: 12, emaSlow: 26, rsiPeriod: 14, rsiMin: 45, atrPeriod: 14, atrMultiplier: 2.0 }),
    entryConditions: JSON.stringify(["EMA(12) crosses above EMA(26) for LONG, below for SHORT", "RSI(14) > 45 for LONG (momentum confirmation)", "ATR below 2.0x (not in extreme volatility)"]),
    exitConditions: JSON.stringify(["EMA(12) crosses back through EMA(26)", "Trailing stop: entry - 2x ATR", "Take profit: 1.5x risk"]),
    riskParameters: JSON.stringify({ maxPositionSize: 0.04, stopLoss: 0.02, takeProfit: 0.03, maxLeverage: 4 }),
    confidence: 0.72,
    rationale: "Previous EMA strategies failed on 5m/15m (too noisy). 1h TF with RSI filter reduces fake signals. SOL trends well on higher timeframes.",
    market_context: JSON.stringify({ regime: "trending", volatility: "normal", notes: "SOL showing mild uptrend on daily chart" })
  },
  {
    name: "BTC BCH ZEC RSI Bollinger Reversion",
    description: "Alt-coin mean reversion focusing on historically profitable symbols",
    type: "MEAN_REVERSION",
    symbols: JSON.stringify(["BTC", "BCH", "ZEC", "TAO"]),
    timeframe: "1h",
    parameters: JSON.stringify({ rsiPeriod: 12, oversold: 28, overbought: 72, bbPeriod: 20, bbStdDev: 2.0, cooldownBars: 6 }),
    entryConditions: JSON.stringify(["RSI(12) < 28", "Price < BB(20,2.0) lower", "Cooldown: 6 bars since last trade on symbol"]),
    exitConditions: JSON.stringify(["RSI(12) > 55", "Price > BB(20,2.0) middle", "Stop: 2%"]),
    riskParameters: JSON.stringify({ maxPositionSize: 0.03, stopLoss: 0.02, takeProfit: 0.035, maxLeverage: 3 }),
    confidence: 0.74,
    rationale: "BCH SELL was profitable ($0.09, 4 trades). ZEC SELL very profitable ($1.69, 1 trade). These alts revert well. Cooldown prevents overtrading.",
    market_context: JSON.stringify({ regime: "ranging", volatility: "normal", notes: "Alt-coins showing range-bound behavior" })
  },
  {
    name: "kPEPE NEAR Micro-Cap Momentum",
    description: "Micro-cap momentum on 15m with tight risk management for high-volatility assets",
    type: "TREND_FOLLOWING",
    symbols: JSON.stringify(["kPEPE", "NEAR", "ENA"]),
    timeframe: "15m",
    parameters: JSON.stringify({ emaFast: 8, emaSlow: 21, rsiPeriod: 10, atrPeriod: 10, atrMultiplier: 1.8, volumeSpike: 2.0 }),
    entryConditions: JSON.stringify(["EMA(8) > EMA(21) for LONG", "RSI(10) between 40-70 (momentum, not overbought)", "Volume > 2x average (volume spike confirms move)"]),
    exitConditions: JSON.stringify(["EMA(8) < EMA(21)", "Stop: 1.5%", "Take profit: 2.5%"]),
    riskParameters: JSON.stringify({ maxPositionSize: 0.02, stopLoss: 0.015, takeProfit: 0.025, maxLeverage: 3 }),
    confidence: 0.68,
    rationale: "kPEPE BUY was profitable ($0.30, 3 trades, $0.10 avg). NEAR small profit. These need momentum + volume confirmation. Small position sizes for safety.",
    market_context: JSON.stringify({ regime: "volatile", volatility: "high", notes: "Micro-caps need volume confirmation to filter noise" })
  }
];

// Insert mutants into strategy_ideas table
const insertIdea = db.prepare(`
  INSERT INTO strategy_ideas (id, name, description, type, symbols, timeframe, parameters, entry_conditions, exit_conditions, risk_parameters, confidence, rationale, status, market_context, created_at, updated_at, params_hash)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?)
`);

let inserted = 0;
let duplicates = 0;

for (const m of mutants) {
  const id = crypto.randomUUID();
  const paramsHash = crypto.createHash('sha256').update(m.parameters + m.riskParameters).digest('hex');
  
  // Check for duplicates
  const existing = db.prepare("SELECT id FROM strategy_ideas WHERE params_hash = ? AND type = ?").get(paramsHash, m.type);
  if (existing) {
    console.log(`SKIP (duplicate hash): ${m.name}`);
    duplicates++;
    continue;
  }
  
  insertIdea.run(
    id, m.name, m.description, m.type, m.symbols, m.timeframe,
    m.parameters, m.entryConditions, m.exitConditions, m.riskParameters,
    m.confidence, m.rationale, m.market_context, NOW, NOW, paramsHash
  );
  console.log(`INSERT: ${m.name} (id: ${id.substring(0,8)}...)`);
  inserted++;
}

console.log(`\n=== RESULTS ===`);
console.log(`Inserted: ${inserted}`);
console.log(`Duplicates: ${duplicates}`);
console.log(`Total pending ideas: ${db.prepare("SELECT COUNT(*) as cnt FROM strategy_ideas WHERE status='PENDING'").get().cnt}`);

db.close();
