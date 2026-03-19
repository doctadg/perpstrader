const Database = require('better-sqlite3');
const db = new Database('data/trading.db');

// Disable foreign key checks during purge
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = OFF');

// Find all duplicate groups (name + params_hash)
const groups = db.prepare(`
  SELECT name, params_hash, COUNT(*) as cnt, MIN(createdAt) as oldest_created
  FROM strategies 
  WHERE params_hash IS NOT NULL
  GROUP BY name, params_hash 
  HAVING cnt > 1
  ORDER BY cnt DESC
`).all();

console.log(`Found ${groups.length} duplicate groups`);
let totalDeleted = 0;
let tradesDeleted = 0;

for (const group of groups) {
  // Keep the oldest one, delete all others
  const keepRow = db.prepare(`
    SELECT id FROM strategies 
    WHERE name = ? AND params_hash = ? 
    ORDER BY createdAt ASC 
    LIMIT 1
  `).get(group.name, group.params_hash);
  
  if (!keepRow) continue;
  
  // Get IDs of clones to delete
  const clones = db.prepare(`
    SELECT id FROM strategies 
    WHERE name = ? AND params_hash = ? AND id != ?
  `).all(group.name, group.params_hash, keepRow.id);
  
  // Delete trades referencing clones
  for (const clone of clones) {
    const tradeResult = db.prepare('DELETE FROM trades WHERE strategyId = ?').run(clone.id);
    tradesDeleted += tradeResult.changes;
  }
  
  // Delete the clone strategies
  const ids = clones.map(c => c.id);
  if (ids.length > 0) {
    const placeholders = ids.map(() => '?').join(',');
    const result = db.prepare(`DELETE FROM strategies WHERE id IN (${placeholders})`).run(...ids);
    totalDeleted += result.changes;
    console.log(`  ${group.name}: deleted ${result.changes} clones, ${tradesDeleted} orphan trades`);
    tradesDeleted = 0;
  }
}

console.log(`\nTotal purged: ${totalDeleted} clone strategies`);

const remaining = db.prepare('SELECT COUNT(*) as c FROM strategies').get();
console.log(`Remaining strategies: ${remaining.c}`);

db.pragma('foreign_keys = ON');
db.close();
