/**
 * Test Script: Position Sizing & Leverage
 * Verifies that the Risk Manager calculates correct position sizes for 40x leverage
 */

import './src/polyfills';
import 'dotenv/config';
import riskManager from './src/risk-manager/risk-manager';
import { Portfolio, TradingSignal } from './src/shared/types';

async function testPositionSizing() {
    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log('║  POSITION SIZING & LEVERAGE TESTS                        ║');
    console.log('║  Target: 40x Leverage, 10-20% Margin Allocation          ║');
    console.log('╚══════════════════════════════════════════════════════════╝\n');

    const portfolio: Portfolio = {
        totalValue: 1000,
        availableBalance: 1000,
        usedBalance: 0,
        positions: [],
        dailyPnL: 0,
        unrealizedPnL: 0
    };

    console.log(`Initial Portfolio: $${portfolio.totalValue.toFixed(2)}`);

    // Test 1: Base Confidence (50%)
    console.log('\nTEST 1: Base Confidence (0.5)');
    const signalBase: TradingSignal = {
        symbol: 'BTC',
        action: 'BUY',
        price: 90000,
        confidence: 0.5,
        timestamp: new Date(),
        reasoning: 'Test'
    };

    const resultBase = await riskManager.evaluateSignal(signalBase, portfolio);

    const sizeBase = resultBase.suggestedSize;
    const notionalBase = sizeBase * signalBase.price;
    const marginBase = notionalBase / resultBase.leverage;
    const marginPercentBase = marginBase / portfolio.availableBalance;

    console.log(`Leverage: ${resultBase.leverage}x`);
    console.log(`Size: ${sizeBase.toFixed(4)} BTC`);
    console.log(`Notional Value: $${notionalBase.toFixed(2)}`);
    console.log(`Margin Used: $${marginBase.toFixed(2)} (${(marginPercentBase * 100).toFixed(1)}%)`);

    const pass1 = resultBase.leverage === 40 && marginPercentBase >= 0.09 && marginPercentBase <= 0.11;
    console.log(`Result: ${pass1 ? '✓ PASS' : '✗ FAIL'}`);

    // Test 2: High Confidence (90%)
    console.log('\nTEST 2: High Confidence (0.9)');
    const signalHigh: TradingSignal = {
        symbol: 'BTC',
        action: 'BUY',
        price: 90000,
        confidence: 0.9,
        timestamp: new Date(),
        reasoning: 'Test'
    };

    const resultHigh = await riskManager.evaluateSignal(signalHigh, portfolio);

    const sizeHigh = resultHigh.suggestedSize;
    const notionalHigh = sizeHigh * signalHigh.price;
    const marginHigh = notionalHigh / resultHigh.leverage;
    const marginPercentHigh = marginHigh / portfolio.availableBalance;

    console.log(`Leverage: ${resultHigh.leverage}x`);
    console.log(`Size: ${sizeHigh.toFixed(4)} BTC`);
    console.log(`Notional Value: $${notionalHigh.toFixed(2)}`);
    console.log(`Margin Used: $${marginHigh.toFixed(2)} (${(marginPercentHigh * 100).toFixed(1)}%)`);

    const pass2 = resultHigh.leverage === 40 && marginPercentHigh >= 0.17 && marginPercentHigh <= 0.21;
    console.log(`Result: ${pass2 ? '✓ PASS' : '✗ FAIL'}`);

    if (pass1 && pass2) {
        console.log('\n✓ ALL SIZING TESTS PASSED');
        process.exit(0);
    } else {
        console.log('\n✗ TESTS FAILED');
        process.exit(1);
    }
}

testPositionSizing().catch(console.error);
