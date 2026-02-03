const { v4: uuidv4 } = require('uuid');
const dataManager = require('./bin/data-manager/data-manager').default;

function createTestTrades() {
  console.log('Getting strategies...');
  
  return dataManager.getAllStrategies().then(strategies => {
    console.log('Found', strategies.length, 'strategies');

    if (strategies.length === 0) {
      console.log('No strategies found!');
      return;
    }

    const strategyId = strategies[0].id;
    console.log('Using strategy:', strategies[0].name);

    const trades = [];

    for (let i = 0; i < 10; i++) {
      const trade = {
        id: uuidv4(),
        strategyId: strategyId,
        symbol: i % 2 === 0 ? 'BTC' : 'ETH',
        side: 'BUY',
        size: 0.001,
        price: 95000 + Math.random() * 1000,
        fee: 0.00015,
        pnl: Math.random() * 1000 - 500,
        timestamp: new Date(Date.now() - (10 - i) * 60000).toISOString(),
        type: 'MARKET',
        status: 'FILLED',
        entryExit: 'ENTRY'
      };

      trades.push(dataManager.saveTrade(trade));
    }

    return Promise.all(trades).then(() => {
      console.log('\n✓ Created 10 test trades!');
      return dataManager.getTrades(undefined, undefined, 20);
    }).then(trades => {
      console.log('\n✓ Total trades in DB:', trades.length);
      
      if (trades.length > 0) {
        console.log('\nRecent trades:');
        trades.slice(0, 5).forEach((t, idx) => {
          console.log(`  ${idx + 1}. ${t.symbol} ${t.side} ${t.price.toFixed(2)} (PnL: $${t.pnl?.toFixed(2) || '0'})`);
        });
      }

      return dataManager.close();
    });
  }).catch(err => {
    console.error('✗ Error:', err.message);
    return dataManager.close();
  });
}

createTestTrades();
