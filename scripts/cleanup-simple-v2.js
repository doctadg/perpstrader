#!/usr/bin/env node
// Simple database cleanup using node-sqlite3 with VACUUM handling

const sqlite3 = require('sqlite3');
const fs = require('fs');
const path = require('path');

const PERPS_DIR = '/home/d/PerpsTrader';
const DATA_DIR = `${PERPS_DIR}/data`;

// Configuration
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
  return `${PERPS_DIR}/data/backups/${dbName}_${dateStr}.db`;
}

async function cleanupDatabase(dbName, tableName, keepDays) {
  const dbPath = `${DATA_DIR}/${dbName}.db`;
  const backupPath = getBackupPath(dbName);

  console.log(`=== Starting cleanup for ${tableName} ===`);
  console.log(`Backing up to ${backupPath}...`);

  try {
    const sizeBefore = fs.statSync(dbPath).size;
    console.log(`Size before: ${Math.round(sizeBefore / 1024 / 1024)} MB`);

    const db = new sqlite3.Database(dbPath);

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - keepDays);

    // Backup database
    fs.copyFileSync(dbPath, backupPath);
    console.log(`✓ Backup created: ${backupPath}`);

    // Delete old records
    const cutoff = cutoffDate.toISOString();
    const deleted = db.prepare(`DELETE FROM ${tableName} WHERE timestamp < ?`).run(cutoff);
    deleted.finalize();

    // Get count after deletion
    const afterCount = db.prepare(`SELECT COUNT(*) as count FROM ${tableName}`).get();
    const deletedCount = afterCount.count;

    console.log(`✓ Deleted ${deletedCount} old records from ${tableName}`);

    // Close database
    db.close();

    // Re-open database for vacuum
    const db2 = new sqlite3.Database(dbPath);

    // Get size before vacuum
    const sizeBeforeVac = fs.statSync(dbPath).size;
    console.log(`Size before vacuum: ${Math.round(sizeBeforeVac / 1024 / 1024)} MB`);

    // Vacuum
    db2.pragma('journal_mode', 'DELETE');
    db2.exec('VACUUM');
    db2.close();

    // Get size after vacuum
    const sizeAfter = fs.statSync(dbPath).size;
    const spaceSavedKB = Math.round((sizeBeforeVac - sizeAfter) / 1024);
    const spaceSavedMB = Math.round(spaceSavedKB / 1024);

    console.log(`✓ Vacuum complete. Space saved: ~${spaceSavedMB} MB`);

    // Get final size
    const sizeAfterFinal = fs.statSync(dbPath).size;
    console.log(`Size after: ${Math.round(sizeAfterFinal / 1024 / 1024)} MB`);

    console.log(`=== Cleanup complete for ${tableName} ===`);

  } catch (error) {
    console.error(`✗ Cleanup failed: ${error.message}`);
    throw error;
  }
}

async function main() {
  const dbName = process.argv[2];

  if (!CONFIG[dbName]) {
    console.error('Usage: node cleanup-simple-v2.js <database-name>');
    console.error('Options: trading, market_data, ai_insights, news, predictions');
    process.exit(1);
  }

  const config = CONFIG[dbName];
  console.log(`Starting PerpsTrader database cleanup...`);
  console.log(`Database: ${dbName}`);

  try {
    if (dbName === 'trading') {
      await cleanupDatabase(config.trading.table, config.trading.keepDays);
      await cleanupDatabase(config.market_data.table, config.market_data.keepDays);
      await cleanupDatabase(config.ai_insights.table, config.ai_insights.keepDays);
    } else if (dbName === 'news') {
      await cleanupDatabase(config.news.table, config.news.keepDays);
    } else if (dbName === 'predictions') {
      await cleanupDatabase(config.predictions.table, config.predictions.keepDays);
    } else {
      console.error(`Unknown database: ${dbName}`);
      process.exit(1);
    }

    console.log('All cleanup tasks completed successfully');

  } catch (error) {
    console.error(`Cleanup failed: ${error.message}`);
    process.exit(1);
  }
}

main();
