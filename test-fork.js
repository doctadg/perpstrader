const {fork} = require('child_process');
console.log('Testing fork...');

const c = fork('/home/d/PerpsTrader/bin/safekeeping-fund/main.js');
c.on('spawn', () => {
  console.log('SPAWNED PID', c.pid);
  c.on('message', m => console.log('MSG:', m));
  setTimeout(() => { c.kill(); process.exit(0); }, 5000);
});
c.on('error', e => {
  console.log('FORK ERROR:', e.message);
  process.exit(1);
});
c.on('exit', (code, sig) => {
  console.log('EXIT code=' + code + ' sig=' + sig);
  process.exit(0);
});

setTimeout(() => {
  console.log('TIMEOUT - no spawn event');
  process.exit(1);
}, 10000);
