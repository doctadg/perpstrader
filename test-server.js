const express = require('express');
const app = express();
const port = 3000;

app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Test server running on port ${port}`);
});