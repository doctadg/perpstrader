#!/usr/bin/env node
// Simple PerpsTrader database cleanup using node-sqlite3
// Keeps last 90 days of trades, 30 days of market data, 30 days of AI insights
// Archives to backups/ directory

const sqlite3 = require('sqlite3');
const fs = require('fs');
const path = require('path');

const PERPS_DIR = '/home/d/PerpsTrader';
const DATA_DIR = path.join(PERPS_DIR, 'data');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');

// Tables and retention periods
const CONFIG = {
  trading: {
    table: 'trades',
    keepDays: 90
  },
  market_data: {
    table: 'market_data',
    keepDays: 30
  },
  ai_insights: {
    table: 'ai_insights',
    keepDays: 30
  },
  news: {
    table: 'articles',
    keepDays: 7
  },
  predictions: {
    table: 'predictions',
    keepDays: 7
  }
};

function getBackupPath(dbName) {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0].replace(/:/g, '-');
  return path.join(BACKUP_DIR, `${dbName}_${dateStr}.db`);
}

async function cleanupDatabase(dbName, tableName, keepDays) {
  const dbPath = path.join(DATA_DIR, `${dbName}.db`);
  const db = new sqlite3.Database(dbPath);

  console.log(`=== Starting cleanup for ${tableName} ===`);
  console.log(`Keeping records newer than ${keepDays} days`);

  try {
    const sizeBefore = fs.statSync(dbPath).size;
    console.log(`Size before: ${Math.round(sizeBefore / 1024 / 1024)} MB`);

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - keepDays);

    const countStmt = db.prepare(`SELECT COUNT(*) as count FROM ${tableName}`);
    const countBefore = countStmt.get();
    const beforeCount = countBefore.count;

    const deleteStmt = db.prepare(`DELETE FROM ${tableName} WHERE timestamp < ?`);
    const deleteResult = deleteStmt.run(cutoffDate.toISOString());
    
    const countAfter = countStmt.get();
    const afterCount = countAfter.count;
    const deletedCount = beforeCount - afterCount;

    console.log(`✓ Deleted ${deletedCount} old records from ${tableName}`);

    db.pragma('journal_mode = 'WAL');
    db.exec('VACUUM');

    const statsAfter = fs.statSync(dbPath).size;
    const spaceSavedKB = Math.round((sizeBefore - statsAfter.size) / 1024);
    const spaceSavedMB = Math.round(spaceSavedKB / 1024);

    console.log(`✓ Vacuumed database`);
    console.log(`Space saved: ~${spaceSavedMB} MB`);

    db.close();

    const statsFinal = fs.statSync(dbPath).size;
    console.log(`=== Cleanup complete for ${tableName} ===`);
    console.log(`Size after: ${Math.round(statsFinal.size / 1024 / 1024)} MB`);

  } catch (error) {
    console.error(`✗ Cleanup failed: ${error.message}`);
    process.exit(1);
  }
}

async function main() {
  const dbName = process.argv[2];

  if (!CONFIG[dbName]) {
    console.error('Usage: node cleanup-v3.js <database-name>');
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
