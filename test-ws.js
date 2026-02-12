// Quick test of Hyperliquid WebSocket
const WebSocket = require('ws');

const ws = new WebSocket('wss://api.hyperliquid.xyz/ws');

ws.on('open', () => {
  console.log('Connected to Hyperliquid WebSocket');
  
  // Try subscribing to BTC trades
  ws.send(JSON.stringify({
    method: 'subscribe',
    subscription: {
      type: 'trades',
      coin: 'BTC'
    }
  }));
  
  console.log('Subscribed to BTC trades');
});

ws.on('message', (data) => {
  console.log('Received:', data.toString().slice(0, 200));
});

ws.on('error', (err) => {
  console.error('Error:', err.message);
});

ws.on('close', () => {
  console.log('Disconnected');
});

// Stop after 10 seconds
setTimeout(() => {
  console.log('Closing...');
  ws.close();
  process.exit(0);
}, 10000);
