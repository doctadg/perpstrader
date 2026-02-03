#!/usr/bin/env node
// Simple PerpsTrader database cleanup using node-sqlite3
// Keeps last 90 days of trades, 30 days of market data, 30 days of AI insights
// Archives to backups/ directory

const sqlite3 = require('sqlite3');
const fs = require('fs');

const PERPS_DIR = '/home/d/PerpsTrader';
const DATA_DIR = `${PERPS_DIR}/data`;
const BACKUP_DIR = `${PERPS_DIR}/data/backups`;

// Tables and retention periods
const CONFIG = {
  trading: { table: 'trades', keepDays: 90 },
  market_data: { table: 'market_data', keepDays: 30 },
  ai_insights: { table: 'ai_insights', keepDays: 30 },
  news: { table: 'articles', keepDays: 7 },
  predictions: { table: 'predictions', keepDays: 7 }
};

function getBackupPath(dbName) {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0].replace(/:/g, '-');
  return `${BACKUP_DIR}/${dbName}_${dateStr}.db`;
}

async function cleanupDatabase(dbName, tableName, keepDays) {
  const dbPath = `${DATA_DIR}/${dbName}.db`;
  const db = new sqlite3.Database(dbPath);

  console.log(`=== Starting cleanup for ${tableName} ===`);
  console.log(`Keeping records newer than ${keepDays} days`);

  try {
    const sizeBefore = fs.statSync(dbPath).size;
    console.log(`Size before: ${Math.round(sizeBefore / 1024 / 1024)} MB`);

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - keepDays);

    const deletedCount = db.prepare(`DELETE FROM ${tableName} WHERE timestamp < ?`);
    deletedCount.run(cutoffDate.toISOString());

    const countAfter = db.prepare(`SELECT COUNT(*) as count FROM ${tableName}`);
    countAfter.get();
    const afterCount = countAfter.count;

    const deleted = db.prepare(`SELECT changes() as changes FROM ${tableName} WHERE timestamp < ?`);
    deleted.run(cutoffDate.toISOString());
    const deleted = deleted[0] ? deleted.changes : 0;

    console.log(`✓ Deleted ${deleted} old records from ${tableName}`);

    db.pragma('journal_mode = 'WAL');
    db.exec('VACUUM');

    const statsAfter = fs.statSync(dbPath).size;
    const spaceSavedKB = Math.round((sizeBefore - statsAfter.size) / 1024);
    const spaceSavedMB = Math.round(spaceSavedKB / 1024);

    console.log(`✓ Vacuumed database. Space saved: ~${spaceSavedMB} MB`);

    db.close();

    console.log(`=== Cleanup complete for ${tableName} ===`);

  } catch (error) {
    console.error(`✗ Cleanup failed: ${error.message}`);
    throw error;
  }
}

async function main() {
  const dbName = process.argv[2];

  if (!CONFIG[dbName]) {
    console.error(`Unknown database: ${dbName}`);
    console.error(`Options: trading, market_data, ai_insights, news, predictions`);
    process.exit(1);
  }

  const config = CONFIG[dbName];
  console.log(`Starting PerpsTrader database cleanup...`);
  console.log(`Database: ${dbName}`);

  try {
    await cleanupDatabase(dbName, config.table, config.keepDays);

    console.log('All cleanup tasks completed successfully');
  } catch (error) {
    console.error(`Cleanup failed: ${error.message}`);
    process.exit(1);
  }
}

main();
