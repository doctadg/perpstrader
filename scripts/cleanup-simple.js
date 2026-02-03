#!/usr/bin/env node
// Simple database cleanup script for PerpsTrader
// Usage: node cleanup-simple.js <database-name>

const sqlite3 = require('sqlite3');
const fs = require('fs');
const path = require('path');

const PERPS_DIR = '/home/d/PerpsTrader';
const DATA_DIR = `${PERPS_DIR}/data`;
const BACKUP_DIR = `${PERPS_DIR}/data/backups`;

// Configuration
const CONFIG = {
  trading: { table: 'trades', keepDays: 90 },
  market_data: { table: 'market_data', keepDays: 30 },
  ai_insights: { table: 'ai_insights', keepDays: 30 },
  news: { table: 'articles', keepDays: 7 },
  predictions: { table: 'predictions', keepDays: 7 }
};

function cleanupDatabase(dbName, tableName, keepDays) {
  const dbPath = `${DATA_DIR}/${dbName}.db`;
  const db = new sqlite3.Database(dbPath);

  console.log(`=== Starting cleanup for ${dbName}.${tableName} ===`);
  console.log(`Keeping records newer than ${keepDays} days`);

  try {
    const sizeBefore = fs.statSync(dbPath).size;
    console.log(`Size before: ${Math.round(sizeBefore / 1024 / 1024)} MB`);

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - keepDays);

    // Get count before
    const countBefore = db.prepare(`SELECT COUNT(*) as count FROM ${tableName}`);
    const countBeforeResult = countBefore.get();
    const beforeCount = countBeforeResult.count;

    // Delete old records
    const deleted = db.prepare(`DELETE FROM ${tableName} WHERE timestamp < ?`);
    deleted.run(cutoffDate.toISOString());

    // Get count after
    const countAfter = db.prepare(`SELECT COUNT(*) as count FROM ${tableName}`);
    const countAfterResult = countAfter.get();
    const afterCount = countAfterResult.count;

    const deletedCount = beforeCount - afterCount;

    console.log(`✓ Deleted ${deletedCount} old records from ${tableName}`);

    // Vacuum to reclaim space
    db.exec('VACUUM');

    // Get file size after
    const statsAfter = fs.statSync(dbPath);
    const sizeAfter = statsAfter.size;
    const spaceSavedKB = Math.round((sizeBefore - sizeAfter) / 1024);
    const spaceSavedMB = Math.round(spaceSavedKB / 1024);

    console.log(`✓ Vacuum complete. Space saved: ~${spaceSavedMB} MB`);

    db.close();

    console.log(`Size after: ${Math.round(sizeAfter / 1024 / 1024)} MB`);
    console.log(`=== Cleanup complete for ${dbName}.${tableName} ===`);

  } catch (error) {
    console.error(`✗ Cleanup failed: ${error.message}`);
    process.exit(1);
  }
}

async function main() {
  const dbName = process.argv[2];

  if (!CONFIG[dbName]) {
    console.error('Usage: node cleanup-simple.js <database-name>');
    console.error('Options: trading, market_data, ai_insights, news, predictions');
    process.exit(1);
  }

  const config = CONFIG[dbName];

  console.log('Starting PerpsTrader database cleanup...');

  try {
    await cleanupDatabase(dbName, config.table, config.keepDays);
    console.log('All cleanup tasks completed successfully');
  } catch (error) {
    console.error(`Cleanup failed: ${error.message}`);
    process.exit(1);
  }
}

main();
