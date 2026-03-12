"use strict";
// Test suite for risk manager fixes
// Run with: npx ts-node test-risk-fixes.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const risk_manager_1 = require("./risk-manager");
const risk_manager_optimized_1 = require("./risk-manager-optimized");
const advanced_risk_1 = __importDefault(require("./advanced-risk"));
// Mock data
const mockPortfolio = {
    totalValue: 1000,
    availableBalance: 800,
    positions: []
};
const mockSignal = {
    symbol: 'BTC',
    action: 'LONG',
    price: 50000,
    confidence: 0.7
};
console.log('=== RISK MANAGER CRITICAL FIXES TEST ===\n');
// Test 1: Leverage Cap
console.log('TEST 1: LEVERAGE CAP (should be max 20x)');
const riskManager = new risk_manager_1.RiskManager();
const assessment = await riskManager.evaluateSignal(mockSignal, mockPortfolio);
console.log(`  Leverage returned: ${assessment.leverage}x`);
console.log(`  PASS: ${assessment.leverage <= 20 ? '✓' : '✗ FAIL - Too high!'}\n`);
// Test 2: Stop behavior when losing
console.log('TEST 2: STOP BEHAVIOR WHEN LOSING');
console.log('  Simulating daily PnL = -$30 (losing day)');
// Simulate losing day by calling updateDailyPnL
riskManager.updateDailyPnL(-30);
const losingAssessment = await riskManager.evaluateSignal(mockSignal, mockPortfolio);
console.log(`  Stop Loss: ${(losingAssessment.stopLoss * 100).toFixed(2)}%`);
console.log(`  Take Profit: ${(losingAssessment.takeProfit * 100).toFixed(2)}%`);
const rrRatio = losingAssessment.takeProfit / losingAssessment.stopLoss;
console.log(`  R:R Ratio: 1:${rrRatio.toFixed(2)}`);
console.log(`  PASS: Stops tighten when losing: ${losingAssessment.stopLoss <= 0.01 ? '✓' : '✗ FAIL'}\n`);
// Test 3: Risk:Reward Minimum
console.log('TEST 3: RISK:REWARD MINIMUM (should be 1:3)');
const lowConfSignal = { ...mockSignal, confidence: 0.4 };
const rrAssessment = await riskManager.evaluateSignal(lowConfSignal, mockPortfolio);
const calculatedRR = rrAssessment.takeProfit / rrAssessment.stopLoss;
console.log(`  Low confidence stop: ${(rrAssessment.stopLoss * 100).toFixed(2)}%`);
console.log(`  Low confidence TP: ${(rrAssessment.takeProfit * 100).toFixed(2)}%`);
console.log(`  R:R Ratio: 1:${calculatedRR.toFixed(2)}`);
console.log(`  PASS: R:R >= 1:3: ${calculatedRR >= 3 ? '✓' : '✗ FAIL'}\n`);
// Test 4: Circuit Breaker
console.log('TEST 4: CIRCUIT BREAKER AT -$50');
const cbRiskManager = new risk_manager_1.RiskManager();
// Reset daily PnL first by creating new instance
cbRiskManager.updateDailyPnL(-55); // Trigger circuit breaker
const cbAssessment = await cbRiskManager.evaluateSignal(mockSignal, mockPortfolio);
console.log(`  Daily PnL: -$55`);
console.log(`  Signal approved: ${cbAssessment.approved}`);
console.log(`  Warnings: ${cbAssessment.warnings.join(', ')}`);
console.log(`  PASS: Circuit breaker blocks trading: ${!cbAssessment.approved ? '✓' : '✗ FAIL'}\n`);
// Test 5: Advanced Risk Engine Leverage
console.log('TEST 5: ADVANCED RISK ENGINE LEVERAGE CAP');
console.log(`  Max leverage threshold: ${advanced_risk_1.default['riskThresholds'].maxLeverage}x`);
console.log(`  PASS: Max leverage <= 20x: ${advanced_risk_1.default['riskThresholds'].maxLeverage <= 20 ? '✓' : '✗ FAIL'}\n`);
// Test 6: Optimized Risk Manager
console.log('TEST 6: OPTIMIZED RISK MANAGER');
const optRiskManager = new risk_manager_optimized_1.OptimizedRiskManager();
const optAssessment = await optRiskManager.evaluateSignal(mockSignal, mockPortfolio);
console.log(`  Leverage: Need to check internal LEVERAGE constant in calculatePositionSize`);
console.log(`  (Should be 20x max, not 40x)`);
console.log('\n=== TEST COMPLETE ===');
//# sourceMappingURL=test-risk-fixes.js.map