#!/usr/bin/env node
/**
 * Query PerpsTrader Database - Extended
 */

const Database = require('better-sqlite3');

const DB_PATH = '/home/d/PerpsTrader/data/trading.db';

async function main() {
    console.log('='.repeat(70));
    console.log('PERPSTRADER DATABASE - EXTENDED QUERY');
    console.log('='.repeat(70));

    try {
        const db = new Database(DB_PATH, { readonly: true });
        
        // Get all trades
        console.log('\n--- All Trades ---');
        const trades = db.prepare('SELECT * FROM trades ORDER BY timestamp DESC').all();
        console.log(`Total trades: ${trades.length}`);
        
        if (trades.length > 0) {
            console.log('\nMost recent 5 trades:');
            trades.slice(0, 5).forEach((t, i) => {
                console.log(`\n${i+1}. ${t.symbol} ${t.side} ${t.size} @ $${t.price}`);
                console.log(`   Timestamp: ${t.timestamp}`);
                console.log(`   Status: ${t.status}`);
                console.log(`   PnL: $${t.pnl}`);
                console.log(`   Type: ${t.type}`);
            });
        }

        // Get trade statistics
        console.log('\n--- Trade Statistics ---');
        const stats = db.prepare(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status = 'FILLED' THEN 1 ELSE 0 END) as filled,
                SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) as cancelled,
                SUM(CASE WHEN pnl IS NOT NULL THEN pnl ELSE 0 END) as total_pnl
            FROM trades
        `).get();
        console.log(`Total trades: ${stats.total}`);
        console.log(`Filled: ${stats.filled}`);
        console.log(`Cancelled: ${stats.cancelled}`);
        console.log(`Total PnL: $${stats.total_pnl || 0}`);

        // Get strategies
        console.log('\n--- Strategies ---');
        const strategies = db.prepare('SELECT * FROM strategies').all();
        console.log(`Total strategies: ${strategies.length}`);
        strategies.forEach((s, i) => {
            console.log(`\n${i+1}. ${s.name} (${s.type})`);
            console.log(`   Status: ${s.status}`);
            console.log(`   Symbol: ${s.symbol}`);
            console.log(`   Created: ${s.createdAt}`);
        });

        // Get system status
        console.log('\n--- System Status ---');
        const status = db.prepare('SELECT * FROM system_status ORDER BY timestamp DESC LIMIT 10').all();
        status.forEach(s => {
            console.log(`${s.timestamp}: ${s.component} - ${s.status}`);
        });

        // Check for any wallet/address info in agent_traces
        console.log('\n--- Agent Traces (with potential addresses) ---');
        const traces = db.prepare(`
            SELECT * FROM agent_traces 
            WHERE input LIKE '%0x%' OR output LIKE '%0x%' 
            ORDER BY timestamp DESC 
            LIMIT 5
        `).all();
        
        traces.forEach((t, i) => {
            console.log(`\n${i+1}. ${t.timestamp} - ${t.node_name}`);
            // Try to extract addresses
            const inputMatch = t.input?.match(/0x[a-fA-F0-9]{40}/g);
            const outputMatch = t.output?.match(/0x[a-fA-F0-9]{40}/g);
            if (inputMatch) console.log(`   Input addresses: ${[...new Set(inputMatch)]}`);
            if (outputMatch) console.log(`   Output addresses: ${[...new Set(outputMatch)]}`);
        });

        db.close();
        
    } catch (error) {
        console.error('Database error:', error.message);
    }

    console.log('\n' + '='.repeat(70));
}

main();