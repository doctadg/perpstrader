#!/usr/bin/env node
/**
 * Hyperliquid Account Check Script
 * 
 * This script only CHECKS the account state - no transactions are made.
 */

require('dotenv').config();
const { PublicClient, HttpTransport } = require('@nktkas/hyperliquid');

// Configuration
const WALLET_ADDRESS = process.env.HYPERLIQUID_MAIN_ADDRESS || '0xA72d98271e2C39E88738711E8B4d540627F5c047';
const IS_TESTNET = false; // MAINNET

async function main() {
    console.log('='.repeat(70));
    console.log('HYPERLIQUID ACCOUNT CHECK');
    console.log('='.repeat(70));
    console.log(`Network: ${IS_TESTNET ? 'TESTNET' : 'MAINNET'}`);
    console.log(`Address: ${WALLET_ADDRESS}`);
    console.log('='.repeat(70));

    const transport = new HttpTransport({ isTestnet: IS_TESTNET, timeout: 30000 });
    const publicClient = new PublicClient({ transport });

    try {
        // Get Account State
        console.log('\n--- Account Balance ---');
        const state = await publicClient.clearinghouseState({ user: WALLET_ADDRESS });
        
        const equity = parseFloat(state.marginSummary?.accountValue || '0');
        const withdrawable = parseFloat(state.withdrawable || '0');
        const marginUsed = parseFloat(state.marginSummary?.totalMarginUsed || '0');
        
        console.log(`Account Value (Equity): $${equity.toFixed(2)}`);
        console.log(`Withdrawable Balance:   $${withdrawable.toFixed(2)}`);
        console.log(`Margin Used:            $${marginUsed.toFixed(2)}`);
        console.log(`\n💰 FUNDS AVAILABLE FOR WITHDRAWAL: $${withdrawable.toFixed(2)}`);

        // Get Open Positions
        console.log('\n--- Open Positions ---');
        const positions = [];
        if (state.assetPositions) {
            for (const assetPos of state.assetPositions) {
                const pos = assetPos.position;
                const size = parseFloat(pos.szi);
                if (size !== 0) {
                    positions.push({
                        symbol: pos.coin,
                        side: size > 0 ? 'LONG' : 'SHORT',
                        size: Math.abs(size),
                        entryPrice: parseFloat(pos.entryPx || '0'),
                        positionValue: parseFloat(pos.positionValue),
                        unrealizedPnL: parseFloat(pos.unrealizedPnl),
                        leverage: parseFloat((assetPos.position.leverage?.value || '1').toString()),
                    });
                }
            }
        }

        if (positions.length === 0) {
            console.log('No open positions.');
        } else {
            console.log(`Found ${positions.length} open position(s):\n`);
            positions.forEach((pos, i) => {
                console.log(`${i + 1}. ${pos.symbol} ${pos.side}`);
                console.log(`   Size: ${pos.size.toFixed(6)}`);
                console.log(`   Entry: $${pos.entryPrice.toFixed(2)}`);
                console.log(`   Value: $${pos.positionValue.toFixed(2)}`);
                console.log(`   Unrealized PnL: $${pos.unrealizedPnL.toFixed(2)}`);
                console.log(`   Leverage: ${pos.leverage}x`);
            });
        }

        // Get Open Orders
        console.log('\n--- Open Orders ---');
        const openOrders = await publicClient.openOrders({ user: WALLET_ADDRESS });
        
        if (openOrders.length === 0) {
            console.log('No open orders.');
        } else {
            console.log(`Found ${openOrders.length} open order(s):\n`);
            openOrders.forEach((order, i) => {
                const side = order.side === 'A' ? 'SELL' : 'BUY';
                console.log(`${i + 1}. ${order.coin} ${side} ${order.sz} @ $${order.limitPx}`);
            });
        }

        // Summary
        console.log('\n' + '='.repeat(70));
        console.log('SUMMARY');
        console.log('='.repeat(70));
        console.log(`Total Equity:       $${equity.toFixed(2)}`);
        console.log(`Withdrawable:       $${withdrawable.toFixed(2)}`);
        console.log(`Open Positions:     ${positions.length}`);
        console.log(`Open Orders:        ${openOrders.length}`);
        
        if (positions.length > 0) {
            console.log('\n⚠️  You have open positions that need to be closed first.');
            console.log('   Run: node scripts/recover-funds.js');
        } else if (withdrawable > 0) {
            console.log('\n✓ Ready to withdraw!');
            console.log('   Run: node scripts/recover-funds.js');
        } else {
            console.log('\n⚠️  No withdrawable balance.');
        }

    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }

    console.log('='.repeat(70));
}

main();