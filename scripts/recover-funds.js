#!/usr/bin/env node
/**
 * Hyperliquid Fund Recovery Script
 * 
 * This script:
 * 1. Checks the current account state (balance, positions)
 * 2. Closes any open positions
 * 3. Withdraws all available funds to the specified address
 * 
 * IMPORTANT: This is for MAINNET - real money is involved!
 */

require('dotenv').config();
const { WalletClient, HttpTransport, PublicClient } = require('@nktkas/hyperliquid');
const { privateKeyToAccount } = require('viem/accounts');

// Configuration
const PRIVATE_KEY = process.env.HYPERLIQUID_PRIVATE_KEY || '0xfa0f031555db618d9ece53fe32e5a4fba54fbb794b3cb2396adfd73df9722bf6';
const WALLET_ADDRESS = process.env.HYPERLIQUID_MAIN_ADDRESS || '0xA72d98271e2C39E88738711E8B4d540627F5c047';
const DESTINATION_ADDRESS = process.argv[2] || '0x18b7DA6c95D088aD19BE78d0563725C992271F02'; // Default to main wallet
const IS_TESTNET = false; // MAINNET

// Safety check - confirm before proceeding
async function confirmAction(message) {
    console.log(`\n⚠️  ${message}`);
    console.log('This is MAINNET - real money is involved!');
    console.log(`Source: ${WALLET_ADDRESS}`);
    console.log(`Destination: ${DESTINATION_ADDRESS}`);
    
    // In non-interactive mode, we proceed with caution
    console.log('\n⚠️  AUTO-CONFIRMING IN NON-INTERACTIVE MODE ⚠️\n');
    return true;
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    console.log('='.repeat(70));
    console.log('HYPERLIQUID FUND RECOVERY SCRIPT');
    console.log('='.repeat(70));
    console.log(`Network: ${IS_TESTNET ? 'TESTNET' : 'MAINNET ⚠️ REAL MONEY'}`);
    console.log(`Source Address: ${WALLET_ADDRESS}`);
    console.log(`Destination Address: ${DESTINATION_ADDRESS}`);
    console.log('='.repeat(70));

    // Initialize wallet
    let wallet;
    try {
        wallet = privateKeyToAccount(PRIVATE_KEY);
        console.log(`\n✓ Wallet initialized: ${wallet.address}`);
        if (wallet.address.toLowerCase() !== WALLET_ADDRESS.toLowerCase()) {
            console.error(`⚠️  WARNING: Wallet address mismatch!`);
            console.error(`  Expected: ${WALLET_ADDRESS}`);
            console.error(`  Actual:   ${wallet.address}`);
        }
    } catch (error) {
        console.error('✗ Failed to initialize wallet:', error.message);
        process.exit(1);
    }

    // Initialize clients
    const transport = new HttpTransport({ isTestnet: IS_TESTNET, timeout: 30000 });
    const publicClient = new PublicClient({ transport });
    const walletClient = new WalletClient({ 
        transport, 
        wallet, 
        isTestnet: IS_TESTNET 
    });

    // Step 1: Get Account State
    console.log('\n' + '='.repeat(70));
    console.log('STEP 1: CHECKING ACCOUNT STATE');
    console.log('='.repeat(70));

    let accountState;
    try {
        const state = await publicClient.clearinghouseState({ user: WALLET_ADDRESS });
        
        const equity = parseFloat(state.marginSummary?.accountValue || '0');
        const withdrawable = parseFloat(state.withdrawable || '0');
        const marginUsed = parseFloat(state.marginSummary?.totalMarginUsed || '0');
        
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
                        markPrice: parseFloat(pos.positionValue) / Math.abs(size),
                        unrealizedPnL: parseFloat(pos.unrealizedPnl),
                        leverage: parseFloat((assetPos.position.leverage?.value || '1').toString()),
                        marginUsed: parseFloat(pos.marginUsed || '0')
                    });
                }
            }
        }

        accountState = {
            equity,
            withdrawable,
            marginUsed,
            positions
        };

        console.log(`\nAccount Value (Equity): $${equity.toFixed(2)}`);
        console.log(`Withdrawable Balance:   $${withdrawable.toFixed(2)}`);
        console.log(`Margin Used:            $${marginUsed.toFixed(2)}`);
        console.log(`Open Positions:         ${positions.length}`);

        if (positions.length > 0) {
            console.log('\n--- Open Positions ---');
            positions.forEach((pos, i) => {
                console.log(`\n${i + 1}. ${pos.symbol} ${pos.side}`);
                console.log(`   Size: ${pos.size} @ $${pos.entryPrice.toFixed(2)}`);
                console.log(`   Mark Price: $${pos.markPrice.toFixed(2)}`);
                console.log(`   Unrealized PnL: $${pos.unrealizedPnL.toFixed(2)}`);
                console.log(`   Leverage: ${pos.leverage}x`);
            });
        }

    } catch (error) {
        console.error('✗ Failed to get account state:', error.message);
        process.exit(1);
    }

    // Step 2: Check Open Orders
    console.log('\n' + '='.repeat(70));
    console.log('STEP 2: CHECKING OPEN ORDERS');
    console.log('='.repeat(70));

    let openOrders = [];
    try {
        openOrders = await publicClient.openOrders({ user: WALLET_ADDRESS });
        console.log(`Open Orders: ${openOrders.length}`);
        
        if (openOrders.length > 0) {
            console.log('\n--- Open Orders ---');
            openOrders.forEach((order, i) => {
                console.log(`${i + 1}. ${order.coin} ${order.side} ${order.sz} @ $${order.limitPx}`);
            });
        }
    } catch (error) {
        console.error('✗ Failed to get open orders:', error.message);
    }

    // Step 3: Close Positions (if any)
    if (accountState.positions.length > 0) {
        console.log('\n' + '='.repeat(70));
        console.log('STEP 3: CLOSING OPEN POSITIONS');
        console.log('='.repeat(70));

        await confirmAction(`About to close ${accountState.positions.length} open position(s)`);

        // Get current prices
        let mids;
        try {
            mids = await publicClient.allMids();
        } catch (error) {
            console.error('✗ Failed to get market prices:', error.message);
            process.exit(1);
        }

        for (const pos of accountState.positions) {
            const symbol = pos.symbol;
            const closeSide = pos.side === 'LONG' ? 'SELL' : 'BUY';
            const size = pos.size;
            
            console.log(`\nClosing ${symbol} ${pos.side} position...`);
            console.log(`  Size: ${size}`);
            console.log(`  Side: ${closeSide}`);

            try {
                // Get asset index
                const meta = await publicClient.meta();
                const assetIndex = meta.universe.findIndex(a => a.name === symbol);
                
                if (assetIndex === -1) {
                    console.error(`  ✗ Unknown symbol: ${symbol}`);
                    continue;
                }

                // Get current price
                const currentPrice = parseFloat(mids[symbol]);
                if (!currentPrice) {
                    console.error(`  ✗ Could not get price for ${symbol}`);
                    continue;
                }

                // Calculate order price with slippage
                const slippage = 0.02; // 2% slippage for market-like execution
                const orderPrice = closeSide === 'SELL' 
                    ? currentPrice * (1 - slippage) 
                    : currentPrice * (1 + slippage);

                // Format price based on symbol
                let formattedPrice;
                if (symbol === 'BTC') {
                    formattedPrice = Math.round(orderPrice).toString();
                } else if (symbol === 'ETH') {
                    formattedPrice = (Math.round(orderPrice * 10) / 10).toFixed(1);
                } else {
                    formattedPrice = (Math.round(orderPrice * 100) / 100).toFixed(2);
                }

                // Format size
                const formattedSize = symbol === 'BTC' ? size.toFixed(5) : size.toFixed(4);

                console.log(`  Current Price: $${currentPrice.toFixed(2)}`);
                console.log(`  Order Price: $${formattedPrice}`);

                const result = await walletClient.order({
                    orders: [{
                        a: assetIndex,
                        b: closeSide === 'BUY',
                        p: formattedPrice,
                        s: formattedSize,
                        r: true, // reduceOnly
                        t: { limit: { tif: 'Ioc' } } // IOC for immediate execution
                    }],
                    grouping: 'na'
                });

                if (result.status === 'ok') {
                    const orderStatus = result.response?.data?.statuses?.[0];
                    if (orderStatus?.filled) {
                        console.log(`  ✓ Position closed successfully`);
                        console.log(`    Filled at: $${orderStatus.filled.avgPx || formattedPrice}`);
                    } else if (orderStatus?.error) {
                        console.error(`  ✗ Error: ${orderStatus.error}`);
                    } else {
                        console.log(`  ? Status unclear:`, JSON.stringify(orderStatus));
                    }
                } else {
                    console.error(`  ✗ Order failed:`, result);
                }

                // Wait between orders
                await sleep(1000);

            } catch (error) {
                console.error(`  ✗ Failed to close position:`, error.message);
            }
        }

        // Re-check account state after closing positions
        console.log('\nRe-checking account state after closing positions...');
        await sleep(2000);
        
        try {
            const state = await publicClient.clearinghouseState({ user: WALLET_ADDRESS });
            accountState.withdrawable = parseFloat(state.withdrawable || '0');
            accountState.equity = parseFloat(state.marginSummary?.accountValue || '0');
            
            console.log(`\nUpdated Withdrawable Balance: $${accountState.withdrawable.toFixed(2)}`);
        } catch (error) {
            console.error('✗ Failed to get updated account state:', error.message);
        }
    }

    // Step 4: Cancel Open Orders
    if (openOrders.length > 0) {
        console.log('\n' + '='.repeat(70));
        console.log('STEP 4: CANCELLING OPEN ORDERS');
        console.log('='.repeat(70));

        for (const order of openOrders) {
            try {
                const meta = await publicClient.meta();
                const assetIndex = meta.universe.findIndex(a => a.name === order.coin);
                
                if (assetIndex === -1) continue;

                console.log(`Cancelling order ${order.oid} for ${order.coin}...`);
                
                const result = await walletClient.cancel({
                    cancels: [{
                        a: assetIndex,
                        o: parseInt(order.oid)
                    }]
                });

                if (result.status === 'ok') {
                    console.log(`  ✓ Order cancelled`);
                } else {
                    console.error(`  ✗ Cancel failed:`, result);
                }

                await sleep(500);
            } catch (error) {
                console.error(`  ✗ Failed to cancel order:`, error.message);
            }
        }
    }

    // Step 5: Withdraw Funds
    console.log('\n' + '='.repeat(70));
    console.log('STEP 5: WITHDRAWING FUNDS');
    console.log('='.repeat(70));

    if (accountState.withdrawable <= 0) {
        console.log('⚠️  No withdrawable balance available.');
        console.log('If you just closed positions, wait a few minutes for the balance to settle.');
        process.exit(0);
    }

    // Reserve some for gas/fees (Hyperliquid doesn't need much)
    const withdrawalAmount = Math.floor(accountState.withdrawable);
    
    console.log(`\nWithdrawal Details:`);
    console.log(`  Total Withdrawable: $${accountState.withdrawable.toFixed(2)}`);
    console.log(`  Amount to Withdraw: $${withdrawalAmount}`);
    console.log(`  Destination: ${DESTINATION_ADDRESS}`);

    await confirmAction(`About to withdraw $${withdrawalAmount} USDC to ${DESTINATION_ADDRESS}`);

    try {
        console.log('\nInitiating withdrawal...');
        
        const result = await walletClient.withdraw3({
            destination: DESTINATION_ADDRESS,
            amount: withdrawalAmount.toString()
        });

        console.log('\n--- Withdrawal Result ---');
        console.log(JSON.stringify(result, null, 2));

        if (result.status === 'ok') {
            console.log('\n✓✓✓ WITHDRAWAL SUCCESSFUL ✓✓✓');
            console.log(`\n$${withdrawalAmount} USDC has been withdrawn to:`);
            console.log(DESTINATION_ADDRESS);
            console.log('\nNote: The funds should arrive in a few minutes.');
            console.log('Check the Hyperliquid UI or Arbiscan to confirm.');
        } else {
            console.error('\n✗✗✗ WITHDRAWAL FAILED ✗✗✗');
            console.error('Error:', result);
            process.exit(1);
        }

    } catch (error) {
        console.error('\n✗✗✗ WITHDRAWAL ERROR ✗✗✗');
        console.error('Error:', error.message);
        console.error('\nStack:', error.stack);
        process.exit(1);
    }

    console.log('\n' + '='.repeat(70));
    console.log('RECOVERY COMPLETE');
    console.log('='.repeat(70));
}

main().catch(error => {
    console.error('\nFatal error:', error);
    process.exit(1);
});