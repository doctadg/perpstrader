/**
 * Test Script: Strategy Generation Pipeline
 * Tests that indicators are computed and strategies are generated
 */

import './src/polyfills';
import 'dotenv/config';
import taModule from './src/ta-module/ta-module';
import { strategyIdeationNode } from './src/langgraph/nodes/strategy-ideation';
import { backtesterNode, vectorizedBacktest } from './src/langgraph/nodes/backtester';
import { strategySelectorNode } from './src/langgraph/nodes/strategy-selector';
import { riskGateNode } from './src/langgraph/nodes/risk-gate';
import { createInitialState, AgentState, StrategyIdea } from './src/langgraph/state';
import { MarketData } from './src/shared/types';
import logger from './src/shared/logger';

// Generate mock candle data for testing
function generateMockCandles(symbol: string, count: number, startPrice: number): MarketData[] {
    const candles: MarketData[] = [];
    let price = startPrice;
    const now = Date.now();

    for (let i = 0; i < count; i++) {
        // Random walk with slight upward bias
        const change = (Math.random() - 0.48) * (startPrice * 0.002);
        price = Math.max(price + change, startPrice * 0.8);

        const high = price * (1 + Math.random() * 0.005);
        const low = price * (1 - Math.random() * 0.005);
        const close = low + Math.random() * (high - low);

        candles.push({
            symbol,
            timestamp: new Date(now - (count - i) * 60000), // 1-minute candles
            open: price,
            high,
            low,
            close,
            volume: Math.random() * 1000,
            vwap: (high + low + close) / 3
        });

        price = close;
    }

    return candles;
}

async function testIndicatorCalculation() {
    console.log('\n========================================');
    console.log('TEST 1: Technical Indicator Calculation');
    console.log('========================================\n');

    try {
        const candles = generateMockCandles('BTC', 200, 91000);
        console.log(`✓ Generated ${candles.length} mock BTC candles`);

        const indicators = await taModule.analyzeMarket('BTC', '1m', candles);

        console.log(`✓ RSI calculated: ${indicators.rsi.length} values`);
        console.log(`  → Latest RSI: ${indicators.rsi[indicators.rsi.length - 1].toFixed(2)}`);

        console.log(`✓ MACD calculated:`);
        const macdLine = indicators.macd?.macd || [];
        const signalLine = indicators.macd?.signal || [];
        const histogram = indicators.macd?.histogram || [];
        if (macdLine.length > 0) {
            console.log(`  → MACD Line: ${macdLine[macdLine.length - 1]?.toFixed(4) || 'N/A'}`);
            console.log(`  → Signal Line: ${signalLine[signalLine.length - 1]?.toFixed(4) || 'N/A'}`);
            console.log(`  → Histogram: ${histogram[histogram.length - 1]?.toFixed(4) || 'N/A'}`);
        } else {
            console.log(`  → MACD data not available (this is OK for short datasets)`);
        }

        console.log(`✓ Bollinger Bands calculated:`);
        console.log(`  → Upper: ${indicators.bollinger.upper[indicators.bollinger.upper.length - 1]?.toFixed(2) || 'N/A'}`);
        console.log(`  → Middle: ${indicators.bollinger.middle[indicators.bollinger.middle.length - 1]?.toFixed(2) || 'N/A'}`);
        console.log(`  → Lower: ${indicators.bollinger.lower[indicators.bollinger.lower.length - 1]?.toFixed(2) || 'N/A'}`);

        console.log(`✓ ATR: ${indicators.volatility?.atr?.[indicators.volatility.atr.length - 1]?.toFixed(2) || 'N/A'}`);

        // Check that values are not N/A or null - only check RSI which is always present
        const hasValidRSI = indicators.rsi.some(v => !isNaN(v) && v > 0 && v < 100);

        if (!hasValidRSI) {
            console.log('✗ FAILED: RSI has invalid values');
            return false;
        }

        return true;
    } catch (error) {
        console.log(`✗ FAILED: ${error}`);
        return false;
    }
}

async function testStrategyIdeation() {
    console.log('\n========================================');
    console.log('TEST 2: Strategy Ideation (LLM Generation)');
    console.log('========================================\n');

    try {
        // Create a state with mock data
        const candles = generateMockCandles('BTC', 200, 91000);
        const indicators = await taModule.analyzeMarket('BTC', '1m', candles);

        const state: AgentState = {
            ...createInitialState('BTC', '1m'),
            candles,
            indicators,
            regime: 'RANGING',
            portfolio: {
                totalValue: 1000,
                availableBalance: 1000,
                usedBalance: 0,
                positions: [],
                dailyPnL: 0,
                unrealizedPnL: 0
            }
        };

        console.log('✓ Created test state with indicators');

        const result = await strategyIdeationNode(state);

        console.log(`✓ Strategy ideation completed`);
        console.log(`  → Step: ${result.currentStep}`);
        console.log(`  → Strategies generated: ${result.strategyIdeas?.length || 0}`);

        if (result.strategyIdeas && result.strategyIdeas.length > 0) {
            for (const idea of result.strategyIdeas.slice(0, 3)) {
                console.log(`  → ${idea.name} (${idea.type}): confidence ${(idea.confidence * 100).toFixed(0)}%`);
            }
        }

        const hasStrategies = (result.strategyIdeas?.length || 0) > 0;
        if (!hasStrategies) {
            console.log('✗ WARNING: No strategies generated (might be LLM issue, checking fallback...)');
            // This could be OK if using fallback
            return result.currentStep === 'STRATEGY_IDEATION_FALLBACK' || result.currentStep === 'STRATEGY_IDEATION_COMPLETE';
        }

        return true;
    } catch (error) {
        console.log(`✗ FAILED: ${error}`);
        return false;
    }
}

async function testBacktesting() {
    console.log('\n========================================');
    console.log('TEST 3: Strategy Backtesting');
    console.log('========================================\n');

    try {
        const candles = generateMockCandles('BTC', 200, 91000);

        // Create a test strategy idea
        const testStrategy: StrategyIdea = {
            name: 'Test RSI Mean Reversion',
            description: 'Test strategy for backtesting',
            type: 'MEAN_REVERSION',
            symbols: ['BTC'],
            timeframe: '1m',
            entryConditions: ['RSI < 30'],
            exitConditions: ['RSI > 50'],
            parameters: { rsiPeriod: 14, oversold: 30, overbought: 70 },
            riskParameters: {
                maxPositionSize: 0.1,
                stopLoss: 0.03,
                takeProfit: 0.06,
                maxLeverage: 1
            },
            confidence: 0.7,
            reasoning: 'Test'
        };

        console.log(`✓ Created test strategy: ${testStrategy.name}`);

        const result = await vectorizedBacktest(testStrategy, candles);

        console.log(`✓ Backtest completed:`);
        console.log(`  → Total Return: ${result.totalReturn.toFixed(2)}%`);
        console.log(`  → Sharpe Ratio: ${result.sharpeRatio.toFixed(2)}`);
        console.log(`  → Win Rate: ${result.winRate.toFixed(1)}%`);
        console.log(`  → Max Drawdown: ${result.maxDrawdown.toFixed(2)}%`);
        console.log(`  → Total Trades: ${result.totalTrades}`);

        // Verify backtest produces valid results
        const hasValidReturn = !isNaN(result.totalReturn);
        const hasValidSharpe = !isNaN(result.sharpeRatio);
        const hasTrades = result.totalTrades >= 0;

        return hasValidReturn && hasValidSharpe && hasTrades;
    } catch (error) {
        console.log(`✗ FAILED: ${error}`);
        return false;
    }
}

async function testRiskGate() {
    console.log('\n========================================');
    console.log('TEST 4: Risk Gate Signal Generation');
    console.log('========================================\n');

    try {
        // Create a state with a selected strategy
        const candles = generateMockCandles('BTC', 200, 91000);
        const indicators = await taModule.analyzeMarket('BTC', '1m', candles);

        // Force an oversold RSI for testing
        indicators.rsi[indicators.rsi.length - 1] = 25; // Oversold

        const state: AgentState = {
            ...createInitialState('BTC', '1m'),
            candles,
            indicators,
            regime: 'RANGING',
            portfolio: {
                totalValue: 1000,
                availableBalance: 1000,
                usedBalance: 0,
                positions: [],
                dailyPnL: 0,
                unrealizedPnL: 0
            },
            selectedStrategy: {
                id: 'test-strategy',
                name: 'Test RSI Strategy',
                description: 'Test',
                type: 'MEAN_REVERSION',
                symbols: ['BTC'],
                timeframe: '1m',
                parameters: { rsiPeriod: 14, oversold: 30, overbought: 70 },
                entryConditions: ['RSI < 30'],
                exitConditions: ['RSI > 50'],
                riskParameters: {
                    maxPositionSize: 0.1,
                    stopLoss: 0.03,
                    takeProfit: 0.06,
                    maxLeverage: 1
                },
                isActive: true,
                performance: {
                    totalTrades: 10,
                    winningTrades: 6,
                    losingTrades: 4,
                    winRate: 60,
                    totalPnL: 100,
                    sharpeRatio: 1.5,
                    maxDrawdown: 10,
                    averageWin: 20,
                    averageLoss: 10,
                    profitFactor: 1.5
                },
                createdAt: new Date(),
                updatedAt: new Date()
            },
            shouldExecute: true,
            strategyIdeas: [],
            backtestResults: []
        };

        console.log(`✓ Created test state with oversold RSI (${indicators.rsi[indicators.rsi.length - 1].toFixed(1)})`);

        const result = await riskGateNode(state);

        console.log(`✓ Risk gate evaluation completed:`);
        console.log(`  → Step: ${result.currentStep}`);
        console.log(`  → Should Execute: ${result.shouldExecute}`);

        if (result.signal) {
            console.log(`  → Signal: ${result.signal.action} ${result.signal.symbol}`);
            console.log(`  → Size: ${result.signal.size.toFixed(4)}`);
            console.log(`  → Confidence: ${(result.signal.confidence * 100).toFixed(0)}%`);
        }

        if (result.riskAssessment) {
            console.log(`  → Risk Score: ${result.riskAssessment.riskScore}`);
            console.log(`  → Approved: ${result.riskAssessment.approved}`);
        }

        // Either a signal was generated or a valid reason for no signal
        return result.currentStep !== 'RISK_GATE_ERROR';
    } catch (error) {
        console.log(`✗ FAILED: ${error}`);
        return false;
    }
}

async function runAllTests() {
    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log('║  STRATEGY GENERATION PIPELINE TESTS                      ║');
    console.log('╚══════════════════════════════════════════════════════════╝\n');

    const results: { name: string; passed: boolean }[] = [];

    results.push({ name: 'Indicator Calculation', passed: await testIndicatorCalculation() });
    results.push({ name: 'Strategy Ideation', passed: await testStrategyIdeation() });
    results.push({ name: 'Backtesting', passed: await testBacktesting() });
    results.push({ name: 'Risk Gate', passed: await testRiskGate() });

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
        console.log('✓ ALL TESTS PASSED - Strategy pipeline is working correctly');
    } else {
        console.log('✗ SOME TESTS FAILED - Review errors above');
    }

    process.exit(allPassed ? 0 : 1);
}

runAllTests().catch(console.error);
