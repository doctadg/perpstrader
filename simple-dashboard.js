const express = require('express');
const path = require('path');
const app = express();
const port = 3001;

const dataManager = require('./bin/data-manager/data-manager.js');
const aiTradingAgent = require('./bin/agent-core/ai-agent.js');

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../../dashboard/public')));

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.get('/api/status', async (req, res) => {
  try {
    const status = await dataManager.default.getSystemStatus();
    if (status) {
      res.json(status);
    } else {
      res.json({
        agent: 'STOPPED',
        execution: 'STOPPED',
        research: 'STOPPED',
        data: 'RUNNING',
        dashboard: 'RUNNING',
        uptime: 0,
        lastUpdate: new Date(),
        errors: []
      });
    }
  } catch (error) {
    console.error('Failed to get status:', error);
    res.json({
      agent: 'UNKNOWN',
      execution: 'STOPPED',
      research: 'STOPPED',
      data: 'RUNNING',
      dashboard: 'RUNNING',
      uptime: 0,
      lastUpdate: new Date(),
      errors: []
    });
  }
});

app.get('/api/strategies', async (req, res) => {
  try {
    const strategies = await dataManager.default.getAllStrategies();
    res.json(strategies);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get strategies' });
  }
});

app.get('/api/trades', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const trades = await dataManager.default.getTrades(undefined, undefined, limit);
    res.json(trades);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get trades' });
  }
});

app.get('/api/insights', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const insights = await dataManager.default.getAIInsights(undefined, limit);
    res.json(insights);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get insights' });
  }
});

app.get('/api/performance', async (req, res) => {
  try {
    const timeframe = req.query.timeframe || '7d';
    const performance = await dataManager.default.getPortfolioPerformance(timeframe);
    res.json(performance);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get performance data' });
  }
});

app.get('/api/config', (req, res) => {
  try {
    const safeConfig = {
      app: { name: 'PerpsTrader AI', version: '1.0.0' },
      risk: { maxPositionSize: 0.1, maxDailyLoss: 0.05, maxLeverage: 5 },
      trading: { symbols: ['BTC', 'ETH', 'SOL'], strategies: 20 }
    };
    res.json(safeConfig);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get configuration' });
  }
});

app.post('/api/emergency-stop', async (req, res) => {
  try {
    await aiTradingAgent.default.emergencyStop();
    res.json({ message: 'Emergency stop activated' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to activate emergency stop' });
  }
});

app.get('/api/market-data', async (req, res) => {
  try {
    const symbol = req.query.symbol || 'BTC';
    const data = await dataManager.default.getMarketData(symbol, undefined, undefined, 100);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get market data' });
  }
});

// Serve main dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'dashboard/public/index.html'));
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Start server
app.listen(port, '0.0.0.0', () => {
  console.log(`Dashboard server started on port ${port}`);
  console.log(`Access dashboard at: http://0.0.0.0:${port}`);
});

module.exports = app;
