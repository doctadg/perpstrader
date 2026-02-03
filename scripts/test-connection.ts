
import '../src/polyfills';
import path from 'path';

import config from '../src/shared/config';
import hyperliquidClient from '../src/execution-engine/hyperliquid-client';

async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function testConnection() {
    console.log('Testing Hyperliquid Connection...');
    console.log('Current Directory:', process.cwd());
    console.log('Env Keys loaded:', Object.keys(process.env).filter(k => k.startsWith('HYPERLIQUID')));

    // Check raw process.env
    const pk = process.env.HYPERLIQUID_PRIVATE_KEY;
    console.log('Raw Private Key length:', pk ? pk.length : 'undefined');

    console.log('Config Testnet:', config.getSection('hyperliquid').testnet);
    const configPk = config.getSection('hyperliquid').privateKey;
    console.log('Config Private Key length:', configPk ? configPk.length : 'undefined');

    try {
        await hyperliquidClient.initialize();

        if (hyperliquidClient.isConfigured()) {
            console.log('\nSUCCESS: Client is configured for LIVE trading.');
            console.log('Wallet Address:', hyperliquidClient.getWalletAddress());

            console.log('\nFetching Account State...');
            const state = await hyperliquidClient.getAccountState();
            console.log(`Equity: $${state.equity}`);
            console.log(`Withdrawable: $${state.withdrawable}`);
            console.log('Open Positions:', state.positions.length);

            if (state.positions.length > 0) {
                console.table(state.positions);
            }

            console.log('\nChecking Open Orders...');
            const orders = await hyperliquidClient.getOpenOrders();
            console.log('Open Orders:', orders.length);
            if (orders.length > 0) {
                console.table(orders);
            }

            // Test Placing an Order
            console.log('\nTEST: Placing a Limit Buy Order for ETH...');
            // Place a limit buy far below price to avoid fill
            const mids = await hyperliquidClient.getAllMids();
            const ethPrice = mids['ETH'];
            if (!ethPrice) {
                console.error('Failed to get ETH price');
                return;
            }
            console.log('Current ETH Price:', ethPrice);

            const testPrice = Number((ethPrice * 0.5).toFixed(1)); // 50% below market
            console.log(`Placing Buy Order: 0.01 ETH @ ${testPrice}`);

            const orderResult = await hyperliquidClient.placeOrder({
                symbol: 'ETH',
                side: 'BUY',
                size: 0.01,
                price: testPrice,
                orderType: 'limit'
            });

            console.log('Order Result:', JSON.stringify(orderResult, null, 2));

            if (orderResult.success && orderResult.status === 'RESTING' && orderResult.orderId) {
                console.log('Order successfully placed and resting.');

                // Wait a bit
                await sleep(2000);

                // Cancel the order
                console.log(`\nTEST: Cancelling Order ${orderResult.orderId}...`);
                const cancelResult = await hyperliquidClient.cancelOrder('ETH', orderResult.orderId);
                console.log('Cancel Result:', cancelResult);

                if (cancelResult) {
                    console.log('SUCCESS: Order test cycle complete.');
                } else {
                    console.error('FAILED to cancel order.');
                }
            } else {
                console.error('Order placement failed or filled immediately (unexpected).');
            }

        } else {
            console.log('\nWARNING: Client is NOT configured (falling back to Paper Trading).');
        }

    } catch (error) {
        console.error('\nERROR: Connection test failed:', error);
    }

    process.exit(0);
}

testConnection();
