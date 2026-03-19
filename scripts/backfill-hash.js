const Database = require('better-sqlite3');
const nodeCrypto = require('crypto');
const db = new Database('data/trading.db');
const rows = db.prepare('SELECT id, name, parameters FROM strategies WHERE params_hash IS NULL').all();
console.log('Backfilling params_hash for', rows.length, 'strategies...');
const update = db.prepare('UPDATE strategies SET params_hash = ? WHERE id = ?');
let count = 0;
for (const row of rows) {
  const hash = nodeCrypto.createHash('sha256').update(row.name + '|' + row.parameters).digest('hex');
  update.run(hash, row.id);
  count++;
}
console.log('Backfilled', count, 'hashes');
db.close();
