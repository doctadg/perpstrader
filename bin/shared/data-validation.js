"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateRSIData = validateRSIData;
exports.validateCandle = validateCandle;
const logger_1 = __importDefault(require("../shared/logger"));
/**
 * Validate RSI data for quality issues
 */
function validateRSIData(rsi) {
    const issues = [];
    if (!rsi || rsi.length === 0) {
        return { valid: false, issues: ['RSI array is empty'] };
    }
    const validCount = rsi.filter(v => v !== null && v !== undefined && Number.isFinite(v)).length;
    if (validCount < rsi.length * 0.9) {
        issues.push(`RSI contains ${(rsi.length - validCount)} invalid values`);
    }
    const flatSequenceCount = rsi.reduce((count, val, idx, arr) => {
        if (idx > 0 && val === arr[idx - 1])
            count++;
        return count;
    }, 0);
    if (flatSequenceCount > rsi.length * 0.8) {
        issues.push(`RSI is flat: ${flatSequenceCount}/${rsi.length} identical consecutive values`);
    }
    if (rsi.every(v => v === 100)) {
        issues.push('RSI stuck at 100 (all values are 100)');
    }
    if (rsi.every(v => v === 0)) {
        issues.push('RSI stuck at 0 (all values are 0)');
    }
    const stuckAtHigh = rsi.filter(v => v === 100).length > rsi.length * 0.9;
    const stuckAtLow = rsi.filter(v => v === 0).length > rsi.length * 0.9;
    if (stuckAtHigh || stuckAtLow) {
        issues.push(`RSI appears stuck at boundary (${stuckAtHigh ? '100' : '0'})`);
    }
    return { valid: issues.length === 0, issues };
}
/**
 * Validate candle data for quality issues
 */
function validateCandle(candle) {
    // Check for zero or negative prices
    if (candle.open <= 0 || candle.high <= 0 || candle.low <= 0 || candle.close <= 0) {
        logger_1.default.warn(`Invalid candle prices for ${candle.time}: open=${candle.open}, high=${candle.high}, low=${candle.low}, close=${candle.close}`);
        return false;
    }
    // Check for reasonable high/low relationship
    if (candle.high < candle.low) {
        logger_1.default.warn(`Invalid candle high/low: high=${candle.high} < low=${candle.low}`);
        return false;
    }
    // Check close is within high/low bounds
    if (candle.close < candle.low || candle.close > candle.high) {
        logger_1.default.warn(`Close outside high/low bounds: ${candle.close} not in [${candle.low}, ${candle.high}]`);
        return false;
    }
    return true;
}
//# sourceMappingURL=data-validation.js.map