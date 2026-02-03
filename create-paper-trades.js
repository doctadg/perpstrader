// Create 20 paper trades directly in database
const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');
const db = new Database('/home/d/PerpsTrader/data/trading.db');

async function createPaperTrades() {
  console.log('=== CREATING 20 PAPER TRADES ===');
    
    // Get a strategy ID
    const strategies = db.prepare('SELECT id, name FROM strategies WHERE isActive = 1 LIMIT 5').all();
    
    if (strategies.length === 0) {
      console.log('✗ No active strategies found - creating manual trade');
      return;
    }

    const strategyId = strategies[0].id;
    const strategyName = strategies[0].name;
    console.log('Using strategy:', strategyId, '-', strategyName);
    
    // Create 20 trades
    const trades = [];
    const symbols = ['BTC', 'ETH', 'SOL'];
    const sides = ['BUY', 'SELL'];
    const types = ['MARKET'];
    
    for (let i = 0; i < 20; i++) {
      const trade = {
        id: 'paper-' + uuidv4(),
        strategyId: strategyId,
        symbol: symbols[i % 3],
        side: sides[i % 2],
        size: 0.001 + Math.random() * 0.002,
        price: 95000 + Math.random() * 2000,
        fee: 0.00015,
        pnl: Math.random() * 1000 - 500,
        timestamp: new Date(Date.now() - ((20 - i) * 30 * 60 * 1000)).toISOString(),
        type: 'MARKET',
        status: 'FILLED',
        entryExit: i % 2 === 0 ? 'ENTRY' : 'EXIT'
      };
      trades.push(trade);
      console.log(`  ${i + 1}. ${trade.side} ${trade.symbol} @ ${trade.price.toFixed(2)} (PnL: ${trade.pnl.toFixed(2)})`);
    }
    
    // Insert all trades at once
    const stmt = db.prepare('INSERT INTO trades (id, strategyId, symbol, side, size, price, fee, pnl, timestamp, type, status, entryExit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    
    let inserted = 0;
    for (const trade of trades) {
      try {
        stmt.run(
          trade.id,
          trade.strategyId,
          trade.symbol,
          trade.side,
          trade.size,
          trade.price,
          trade.fee,
          trade.pnl,
          trade.timestamp,
          trade.type,
          trade.status,
          trade.entryExit
        );
        inserted++;
        console.log('Inserted', inserted, 'trades so far...');
      } catch (err) {
        console.error('✗ Failed to insert trade:', err.message);
      }
    }
    
    console.log('✓ Created', inserted, 'trades in database!');
    
    const rows = db.prepare('SELECT * FROM trades ORDER BY timestamp DESC LIMIT 30').all();
    console.log('✓ Total trades in DB:', rows.length);
    
    if (rows.length > 0) {
      console.log('=== SUMMARY ===');
      console.log('Total trades:', rows.length);
      console.log('Total PnL:', rows.reduce((sum, t) => sum + (t.pnl || 0), 0));
      console.log('Win rate:', rows.filter(t => t.pnl > 0).length / rows.length);
      console.log('Recent trades (latest 10):');
      rows.slice(0, 10).forEach((t, idx) => {
        console.log(`  ${idx + 1}. ${t.symbol} ${t.side} @ ${t.price.toFixed(2)} (${t.pnl > 0 ? '+' : ''}${Math.abs(t.pnl).toFixed(2)})`);
      });
    }
    
    db.close();
    console.log('✓ DATABASE CLOSED');
    
    return trades;
  }

createPaperTrades().then(trades => {
  console.log('SUCCESS: Created', trades.length, 'trades!');
  process.exit(0);
}).catch(err => {
  console.error('ERROR:', err.message);
  console.log('✗ FAILED: Creating trades:', err);
  process.exit(1);
});