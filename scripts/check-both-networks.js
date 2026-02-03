#!/usr/bin/env node
/**
 * Check Hyperliquid Testnet Account
 */

require('dotenv').config();
const { PublicClient, HttpTransport } = require('@nktkas/hyperliquid');

const WALLET_ADDRESS = process.env.HYPERLIQUID_MAIN_ADDRESS || '0xA72d98271e2C39E88738711E8B4d540627F5c047';

async function checkNetwork(isTestnet) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`Checking ${isTestnet ? 'TESTNET' : 'MAINNET'}`);
    console.log('='.repeat(70));

    const transport = new HttpTransport({ isTestnet, timeout: 30000 });
    const publicClient = new PublicClient({ transport });

    try {
        const state = await publicClient.clearinghouseState({ user: WALLET_ADDRESS });
        
        const equity = parseFloat(state.marginSummary?.accountValue || '0');
        const withdrawable = parseFloat(state.withdrawable || '0');
        
        console.log(`Account Value: $${equity.toFixed(2)}`);
        console.log(`Withdrawable:  $${withdrawable.toFixed(2)}`);
        
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
                        unrealizedPnL: parseFloat(pos.unrealizedPnl)
                    });
                }
            }
        }
        
        console.log(`Positions:     ${positions.length}`);
        if (positions.length > 0) {
            positions.forEach(p => {
                console.log(`  - ${p.symbol} ${p.side} ${p.size} (PnL: $${p.unrealizedPnL.toFixed(2)})`);
            });
        }

        return { equity, withdrawable, positions };
    } catch (error) {
        console.error('Error:', error.message);
        return null;
    }
}

async function main() {
    console.log('HYPERLIQUID ACCOUNT CHECK - BOTH NETWORKS');
    console.log(`Address: ${WALLET_ADDRESS}`);

    // Check testnet
    const testnetData = await checkNetwork(true);
    
    // Check mainnet
    const mainnetData = await checkNetwork(false);

    console.log('\n' + '='.repeat(70));
    console.log('SUMMARY');
    console.log('='.repeat(70));
    
    if (testnetData && testnetData.equity > 0) {
        console.log(`✓ TESTNET: $${testnetData.equity.toFixed(2)} found`);
    } else {
        console.log(`✗ TESTNET: $0`);
    }
    
    if (mainnetData && mainnetData.equity > 0) {
        console.log(`✓ MAINNET: $${mainnetData.equity.toFixed(2)} found`);
    } else {
        console.log(`✗ MAINNET: $0`);
    }
}

main();