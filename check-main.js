// Check if startChildProcesses is actually reachable
const path = '/home/d/PerpsTrader/bin/main.js';
const fs = require('fs');
const src = fs.readFileSync(path, 'utf8');

// Find the position of startChildProcesses call
const idx = src.indexOf('startChildProcesses()');
console.log('startChildProcesses() found at char index:', idx);
console.log('Context around it:');
console.log(src.substring(Math.max(0, idx - 200), idx + 100));
