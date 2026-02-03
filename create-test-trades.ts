import { v4 as uuidv4 } from 'uuid';
import { default as dataManager } from './bin/data-manager/data-manager';

async function createTestTrades() {
  console.log('Getting strategies...');
  
  const strategies = await dataManager.getAllStrategies();
  console.log('Found', strategies.length, 'strategies');

  if (strategies.length === 0) {
    console.log('No strategies found!');
    return;
  }

  const strategyId = strategies[0].id;
  console.log('Using strategyId:', strategyId);

  const trades = [];

  for (let i = 0; i < 10; i++) {
    const trade = {
      id: uuidv4(),
      strategyId: strategyId,
      symbol: i % 2 === 0 ? 'BTC' : 'ETH',
      side: 'BUY',
      size: 0.001,
      price: 95000 + (Math.random() * 1000),
      fee: 0.00015,
      pnl: (Math.random() - 0.5) * 1000,
      timestamp: new Date(Date.now() - (10 - i) * 60000).toISOString(),
      type: 'MARKET',
      status: 'FILLED',
      entryExit: 'ENTRY'
    };
    
    trades.push(dataManager.saveTrade(trade));
  }

  await Promise.all(trades);
  console.log('\n✓ Created 10 test trades!');

  const savedTrades = await dataManager.getTrades(undefined, undefined, 20);
  console.log('✓ Total trades in DB:', savedTrades.length);

  if (savedTrades.length > 0) {
    console.log('\n📊 Recent trades:');
    savedTrades.slice(0, 5).forEach((t, idx) => {
      console.log(`  ${idx + 1}. ${t.symbol} ${t.side} $${t.price.toFixed(2)} (PnL: $${t.pnl?.toFixed(2)})`);
    });
  }

  return dataManager.close();
}

createTestTrades();
