/**
 * Test Script: Hyperliquid Transaction Execution
 * Tests that the agent can successfully place orders on Hyperliquid testnet
 */

import './src/polyfills';
import 'dotenv/config';
import hyperliquidClient from './src/execution-engine/hyperliquid-client';
import executionEngine from './src/execution-engine/execution-engine';
import logger from './src/shared/logger';

async function testHyperliquidConnection() {
    console.log('\n========================================');
    console.log('TEST 1: Hyperliquid Connection & Account');
    console.log('========================================\n');

    try {
        // Initialize the client
        await hyperliquidClient.initialize();
        console.log('✓ Hyperliquid client initialized');

        // Check configuration
        const isConfigured = hyperliquidClient.isConfigured();
        console.log(`✓ Client configured: ${isConfigured}`);

        if (!isConfigured) {
            console.log('✗ FAILED: Hyperliquid client is not configured for trading');
            return false;
        }

        // Get wallet addresses
        const walletAddress = hyperliquidClient.getWalletAddress();
        const userAddress = hyperliquidClient.getUserAddress();
        console.log(`✓ Signer wallet: ${walletAddress}`);
        console.log(`✓ User address (main): ${userAddress}`);

        // Get account state
        const accountState = await hyperliquidClient.getAccountState();
        console.log(`✓ Account Equity: $${accountState.equity.toFixed(2)}`);
        console.log(`✓ Withdrawable: $${accountState.withdrawable.toFixed(2)}`);
        console.log(`✓ Margin Used: $${accountState.marginUsed.toFixed(2)}`);
        console.log(`✓ Open Positions: ${accountState.positions.length}`);

        if (accountState.positions.length > 0) {
            for (const pos of accountState.positions) {
                console.log(`  → ${pos.symbol}: ${pos.side} ${pos.size} @ ${pos.entryPrice.toFixed(2)} (PnL: ${pos.unrealizedPnL.toFixed(2)})`);
            }
        }

        return true;
    } catch (error) {
        console.log(`✗ FAILED: ${error}`);
        return false;
    }
}

async function testOrderPlacement() {
    console.log('\n========================================');
    console.log('TEST 2: Order Placement (Small Test Order)');
    console.log('========================================\n');

    try {
        // Get current BTC price
        const mids = await hyperliquidClient.getAllMids();
        const btcPrice = mids['BTC'];
        console.log(`✓ Current BTC mid price: $${btcPrice.toFixed(2)}`);

        // Calculate a very small position size (minimum allowed)
        // For BTC on Hyperliquid testnet, minimum is usually 0.001 BTC
        const testSize = 0.001;
        const testValue = testSize * btcPrice;
        console.log(`✓ Test order: BUY ${testSize} BTC (~$${testValue.toFixed(2)})`);

        // Place a limit order far from market (won't fill, just test submission)
        const safeLimitPrice = btcPrice * 0.9; // 10% below market
        console.log(`✓ Using limit price: $${safeLimitPrice.toFixed(2)} (10% below market - won't fill)`);

        const orderResult = await hyperliquidClient.placeOrder({
            symbol: 'BTC',
            side: 'BUY',
            size: testSize,
            price: safeLimitPrice,
            orderType: 'limit'
        });

        console.log(`✓ Order submission result:`);
        console.log(`  → Success: ${orderResult.success}`);
        console.log(`  → Status: ${orderResult.status}`);
        if (orderResult.orderId) {
            console.log(`  → Order ID: ${orderResult.orderId}`);
        }
        if (orderResult.error) {
            console.log(`  → Error: ${orderResult.error}`);
        }

        // If order was placed, cancel it immediately
        if (orderResult.success && orderResult.orderId) {
            console.log('\n  Cancelling test order...');
            const cancelResult = await hyperliquidClient.cancelOrder('BTC', orderResult.orderId);
            console.log(`  → Cancel result: ${cancelResult ? 'SUCCESS' : 'FAILED'}`);
        }

        return orderResult.success || orderResult.status === 'RESTING';
    } catch (error) {
        console.log(`✗ FAILED: ${error}`);
        return false;
    }
}

async function testMarketOrder() {
    console.log('\n========================================');
    console.log('TEST 3: Market Order Execution (Real Trade)');
    console.log('========================================\n');

    try {
        // Get current SOL price (smaller position value than BTC)
        const mids = await hyperliquidClient.getAllMids();
        const solPrice = mids['SOL'];
        console.log(`✓ Current SOL mid price: $${solPrice.toFixed(2)}`);

        // Very small test size
        const testSize = 0.1; // 0.1 SOL
        const testValue = testSize * solPrice;
        console.log(`✓ Test order: BUY ${testSize} SOL (~$${testValue.toFixed(2)})`);

        // Place a market-style order (IOC with slippage)
        const orderResult = await hyperliquidClient.placeOrder({
            symbol: 'SOL',
            side: 'BUY',
            size: testSize,
            orderType: 'market'
        });

        console.log(`✓ Market order result:`);
        console.log(`  → Success: ${orderResult.success}`);
        console.log(`  → Status: ${orderResult.status}`);
        if (orderResult.filledPrice) {
            console.log(`  → Filled Price: $${orderResult.filledPrice.toFixed(2)}`);
        }
        if (orderResult.filledSize) {
            console.log(`  → Filled Size: ${orderResult.filledSize}`);
        }
        if (orderResult.error) {
            console.log(`  → Error: ${orderResult.error}`);
        }

        // If filled, immediately close the position
        if (orderResult.success && orderResult.status === 'FILLED') {
            console.log('\n  Closing position immediately...');
            const closeResult = await hyperliquidClient.placeOrder({
                symbol: 'SOL',
                side: 'SELL',
                size: testSize,
                orderType: 'market',
                reduceOnly: true
            });
            console.log(`  → Close result: ${closeResult.success ? 'SUCCESS' : 'FAILED'}`);
        }

        return orderResult.success;
    } catch (error) {
        console.log(`✗ FAILED: ${error}`);
        return false;
    }
}

async function testExecutionEngine() {
    console.log('\n========================================');
    console.log('TEST 4: Execution Engine Integration');
    console.log('========================================\n');

    try {
        // Test portfolio retrieval
        const portfolio = await executionEngine.getPortfolio();
        console.log(`✓ Portfolio retrieved:`);
        console.log(`  → Total Value: $${portfolio.totalValue.toFixed(2)}`);
        console.log(`  → Available Balance: $${portfolio.availableBalance.toFixed(2)}`);
        console.log(`  → Positions: ${portfolio.positions.length}`);

        // Test environment detection
        const env = executionEngine.getEnvironment();
        console.log(`✓ Environment: ${env}`);

        // Test configuration check
        const isConfigured = executionEngine.isConfigured();
        console.log(`✓ Is Configured: ${isConfigured}`);

        return true;
    } catch (error) {
        console.log(`✗ FAILED: ${error}`);
        return false;
    }
}

async function runAllTests() {
    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log('║  HYPERLIQUID TRANSACTION EXECUTION TESTS                 ║');
    console.log('║  Testing on TESTNET                                      ║');
    console.log('╚══════════════════════════════════════════════════════════╝\n');

    const results: { name: string; passed: boolean }[] = [];

    // Test 1: Connection
    results.push({ name: 'Hyperliquid Connection', passed: await testHyperliquidConnection() });

    // Test 2: Limit Order (safe, cancellable)
    results.push({ name: 'Limit Order Placement', passed: await testOrderPlacement() });

    // Test 3: Market Order (actual trade)
    // Only run if user confirms
    console.log('\n========================================');
    console.log('OPTIONAL: Real Market Order Test');
    console.log('========================================');
    console.log('Skipping real market order test (would cost ~$15)');
    console.log('Enable by uncommenting testMarketOrder() below');
    // Uncomment to test real execution:
    // results.push({ name: 'Market Order Execution', passed: await testMarketOrder() });

    // Test 4: Execution Engine
    results.push({ name: 'Execution Engine', passed: await testExecutionEngine() });

    // Summary
    console.log('\n========================================');
    console.log('TEST SUMMARY');
    console.log('========================================\n');

    let allPassed = true;
    for (const result of results) {
        const status = result.passed ? '✓ PASS' : '✗ FAIL';
        console.log(`${status}: ${result.name}`);
        if (!result.passed) allPassed = false;
    }

    console.log('\n');
    if (allPassed) {
        console.log('✓ ALL TESTS PASSED - Agent can execute transactions on Hyperliquid testnet');
    } else {
        console.log('✗ SOME TESTS FAILED - Review errors above');
    }

    process.exit(allPassed ? 0 : 1);
}

runAllTests().catch(console.error);
