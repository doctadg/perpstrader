#!/usr/bin/env node
/**
 * Query PerpsTrader Database for Account Info
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = '/home/d/PerpsTrader/data/trading.db';

async function main() {
    console.log('='.repeat(70));
    console.log('PERPSTRADER DATABASE QUERY');
    console.log('='.repeat(70));

    try {
        const db = new Database(DB_PATH, { readonly: true });
        
        // Get all tables
        console.log('\n--- Tables in Database ---');
        const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
        tables.forEach(t => console.log(`  - ${t.name}`));

        // Check for positions table
        const hasPositions = tables.some(t => t.name === 'positions');
        if (hasPositions) {
            console.log('\n--- Recent Positions ---');
            try {
                const positions = db.prepare('SELECT * FROM positions ORDER BY id DESC LIMIT 10').all();
                console.log(`Found ${positions.length} position records`);
                if (positions.length > 0) {
                    console.log(JSON.stringify(positions[0], null, 2));
                }
            } catch (e) {
                console.log('Error querying positions:', e.message);
            }
        }

        // Check for trades table
        const hasTrades = tables.some(t => t.name === 'trades');
        if (hasTrades) {
            console.log('\n--- Recent Trades ---');
            try {
                const trades = db.prepare('SELECT * FROM trades ORDER BY id DESC LIMIT 10').all();
                console.log(`Found ${trades.length} trade records`);
                if (trades.length > 0) {
                    console.log(JSON.stringify(trades[0], null, 2));
                }
            } catch (e) {
                console.log('Error querying trades:', e.message);
            }
        }

        // Check for accounts/wallet info
        const hasAccounts = tables.some(t => t.name === 'accounts');
        if (hasAccounts) {
            console.log('\n--- Accounts ---');
            try {
                const accounts = db.prepare('SELECT * FROM accounts').all();
                console.log(JSON.stringify(accounts, null, 2));
            } catch (e) {
                console.log('Error querying accounts:', e.message);
            }
        }

        // Check for portfolio_snapshots
        const hasSnapshots = tables.some(t => t.name === 'portfolio_snapshots');
        if (hasSnapshots) {
            console.log('\n--- Portfolio Snapshots ---');
            try {
                const snapshots = db.prepare('SELECT * FROM portfolio_snapshots ORDER BY timestamp DESC LIMIT 5').all();
                console.log(`Found ${snapshots.length} snapshots`);
                snapshots.forEach(s => {
                    console.log(`  ${new Date(s.timestamp).toISOString()}: $${s.total_value}`);
                });
            } catch (e) {
                console.log('Error querying snapshots:', e.message);
            }
        }

        // Check config table
        const hasConfig = tables.some(t => t.name === 'config');
        if (hasConfig) {
            console.log('\n--- Config ---');
            try {
                const config = db.prepare('SELECT * FROM config').all();
                config.forEach(c => {
                    if (c.key.includes('wallet') || c.key.includes('address') || c.key.includes('key')) {
                        console.log(`  ${c.key}: ${c.value}`);
                    }
                });
            } catch (e) {
                console.log('Error querying config:', e.message);
            }
        }

        db.close();
        
    } catch (error) {
        console.error('Database error:', error.message);
    }

    console.log('\n' + '='.repeat(70));
}

main();