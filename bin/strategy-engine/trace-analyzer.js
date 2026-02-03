"use strict";
// Trace Analyzer Service - Daily LLM Processing of Agent Traces
// Analyzes execution traces to improve trading strategy
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runDailyTraceAnalysis = runDailyTraceAnalysis;
const trace_store_1 = __importDefault(require("../data/trace-store"));
const glm_service_1 = __importDefault(require("../shared/glm-service"));
const logger_1 = __importDefault(require("../shared/logger"));
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const config_1 = __importDefault(require("../shared/config"));
const fullConfig = config_1.default.get();
const dbPath = fullConfig.database?.connection || './data/trading.db';
const TRACE_ANALYSIS_BATCH_SIZE = Math.max(100, parseInt(process.env.TRACE_ANALYSIS_BATCH_SIZE || '1000', 10));
/**
 * Aggregate traces into a summary for LLM analysis
 */
function aggregateTraces(traces) {
    const summary = {
        totalTraces: traces.length,
        totalTrades: 0,
        totalEntries: 0,
        totalExits: 0,
        wins: 0,
        losses: 0,
        totalPnl: 0,
        totalFees: 0,
        totalWinPnl: 0,
        totalLossPnl: 0,
        avgPnl: 0,
        profitFactor: 0,
        dateRange: {
            start: traces[0]?.createdAt || '',
            end: traces[traces.length - 1]?.createdAt || '',
        },
        bySymbol: {},
        commonPatterns: [],
        strategyPerformance: [],
    };
    const strategyUsage = {};
    const regimeOutcomes = {};
    for (const trace of traces) {
        const data = JSON.parse(trace.traceData);
        const exitTrade = data.executionResult?.entryExit === 'EXIT';
        const tradePnl = typeof data.executionResult?.pnl === 'number' ? data.executionResult?.pnl : null;
        const tradeFee = typeof data.executionResult?.fee === 'number' ? data.executionResult?.fee : 0;
        const tradeSuccess = exitTrade && tradePnl !== null ? tradePnl > 0 : null;
        // By symbol stats
        if (!summary.bySymbol[trace.symbol]) {
            summary.bySymbol[trace.symbol] = {
                count: 0,
                trades: 0,
                wins: 0,
                losses: 0,
                successRate: 0,
                totalPnl: 0,
                avgPnl: 0,
                totalFees: 0,
                regimes: {},
            };
        }
        summary.bySymbol[trace.symbol].count++;
        if (exitTrade) {
            summary.bySymbol[trace.symbol].trades++;
            summary.totalTrades++;
            summary.totalExits++;
            summary.totalPnl += tradePnl || 0;
            summary.totalFees += tradeFee;
            if (tradeSuccess) {
                summary.wins++;
                summary.bySymbol[trace.symbol].wins++;
                summary.bySymbol[trace.symbol].totalPnl += tradePnl || 0;
                summary.bySymbol[trace.symbol].totalFees += tradeFee;
                summary.totalWinPnl += tradePnl || 0;
            }
            else {
                summary.losses++;
                summary.bySymbol[trace.symbol].losses++;
                summary.bySymbol[trace.symbol].totalPnl += tradePnl || 0;
                summary.bySymbol[trace.symbol].totalFees += tradeFee;
                summary.totalLossPnl += Math.abs(tradePnl || 0);
            }
        }
        else if (data.executionResult?.entryExit === 'ENTRY') {
            summary.totalEntries++;
        }
        // Regime tracking
        const regime = trace.regime || 'UNKNOWN';
        if (!summary.bySymbol[trace.symbol].regimes[regime]) {
            summary.bySymbol[trace.symbol].regimes[regime] = 0;
        }
        summary.bySymbol[trace.symbol].regimes[regime]++;
        // Regime outcomes
        if (!regimeOutcomes[regime]) {
            regimeOutcomes[regime] = { success: 0, total: 0 };
        }
        if (exitTrade) {
            regimeOutcomes[regime].total++;
            if (tradeSuccess) {
                regimeOutcomes[regime].success++;
            }
        }
        // Strategy usage
        if (data.selectedStrategy) {
            const stratName = data.selectedStrategy.name || 'Unknown';
            if (!strategyUsage[stratName]) {
                strategyUsage[stratName] = { usage: 0, executed: 0, success: 0, totalPnl: 0 };
            }
            strategyUsage[stratName].usage++;
            if (exitTrade) {
                strategyUsage[stratName].executed++;
                if (tradeSuccess) {
                    strategyUsage[stratName].success++;
                }
                strategyUsage[stratName].totalPnl += tradePnl || 0;
            }
        }
    }
    // Common patterns based on regime outcomes
    summary.commonPatterns = Object.entries(regimeOutcomes).map(([regime, stats]) => {
        const successRate = stats.total > 0 ? stats.success / stats.total : 0;
        return {
            description: `${regime} regime`,
            frequency: stats.total,
            wins: stats.success,
            successRate,
            outcome: successRate > 0.5 ? 'POSITIVE' : 'NEGATIVE',
        };
    });
    // Strategy performance
    summary.strategyPerformance = Object.entries(strategyUsage).map(([name, stats]) => ({
        strategyName: name,
        usage: stats.usage,
        executed: stats.executed,
        success: stats.success,
        successRate: stats.executed > 0 ? stats.success / stats.executed : 0,
        totalPnl: stats.totalPnl,
        avgPnl: stats.executed > 0 ? stats.totalPnl / stats.executed : 0,
    }));
    return recomputeSummary(summary);
}
function recomputeSummary(summary) {
    summary.avgPnl = summary.totalTrades > 0 ? summary.totalPnl / summary.totalTrades : 0;
    summary.profitFactor = summary.totalLossPnl > 0 ? summary.totalWinPnl / summary.totalLossPnl : summary.totalWinPnl > 0 ? Infinity : 0;
    for (const symbol of Object.keys(summary.bySymbol)) {
        const s = summary.bySymbol[symbol];
        s.successRate = s.trades > 0 ? s.wins / s.trades : 0;
        s.avgPnl = s.trades > 0 ? s.totalPnl / s.trades : 0;
    }
    summary.commonPatterns = summary.commonPatterns.map(p => {
        const successRate = p.frequency > 0 ? p.wins / p.frequency : 0;
        return {
            ...p,
            successRate,
            outcome: successRate > 0.5 ? 'POSITIVE' : 'NEGATIVE',
        };
    });
    summary.strategyPerformance = summary.strategyPerformance.map(s => ({
        ...s,
        successRate: s.executed > 0 ? s.success / s.executed : 0,
        avgPnl: s.executed > 0 ? s.totalPnl / s.executed : 0,
    }));
    return summary;
}
function mergeSummaries(base, next) {
    const parseDate = (value) => (value ? new Date(value).getTime() : NaN);
    const startTime = Math.min(parseDate(base.dateRange.start), parseDate(next.dateRange.start));
    const endTime = Math.max(parseDate(base.dateRange.end), parseDate(next.dateRange.end));
    const merged = {
        totalTraces: base.totalTraces + next.totalTraces,
        totalTrades: base.totalTrades + next.totalTrades,
        totalEntries: base.totalEntries + next.totalEntries,
        totalExits: base.totalExits + next.totalExits,
        wins: base.wins + next.wins,
        losses: base.losses + next.losses,
        totalPnl: base.totalPnl + next.totalPnl,
        totalFees: base.totalFees + next.totalFees,
        totalWinPnl: base.totalWinPnl + next.totalWinPnl,
        totalLossPnl: base.totalLossPnl + next.totalLossPnl,
        avgPnl: 0,
        profitFactor: 0,
        dateRange: {
            start: Number.isFinite(startTime) ? new Date(startTime).toISOString() : base.dateRange.start || next.dateRange.start,
            end: Number.isFinite(endTime) ? new Date(endTime).toISOString() : base.dateRange.end || next.dateRange.end,
        },
        bySymbol: {},
        commonPatterns: [],
        strategyPerformance: [],
    };
    const symbols = new Set([...Object.keys(base.bySymbol), ...Object.keys(next.bySymbol)]);
    for (const symbol of symbols) {
        const a = base.bySymbol[symbol];
        const b = next.bySymbol[symbol];
        const mergedRegimes = {};
        if (a?.regimes) {
            for (const [regime, count] of Object.entries(a.regimes)) {
                mergedRegimes[regime] = (mergedRegimes[regime] || 0) + count;
            }
        }
        if (b?.regimes) {
            for (const [regime, count] of Object.entries(b.regimes)) {
                mergedRegimes[regime] = (mergedRegimes[regime] || 0) + count;
            }
        }
        merged.bySymbol[symbol] = {
            count: (a?.count || 0) + (b?.count || 0),
            trades: (a?.trades || 0) + (b?.trades || 0),
            wins: (a?.wins || 0) + (b?.wins || 0),
            losses: (a?.losses || 0) + (b?.losses || 0),
            successRate: 0,
            totalPnl: (a?.totalPnl || 0) + (b?.totalPnl || 0),
            avgPnl: 0,
            totalFees: (a?.totalFees || 0) + (b?.totalFees || 0),
            regimes: mergedRegimes,
        };
    }
    const patternMap = new Map();
    for (const p of base.commonPatterns) {
        patternMap.set(p.description, { ...p });
    }
    for (const p of next.commonPatterns) {
        const existing = patternMap.get(p.description);
        if (!existing) {
            patternMap.set(p.description, { ...p });
            continue;
        }
        existing.frequency += p.frequency;
        existing.wins += p.wins;
    }
    merged.commonPatterns = Array.from(patternMap.values());
    const strategyMap = new Map();
    for (const s of base.strategyPerformance) {
        strategyMap.set(s.strategyName, { ...s });
    }
    for (const s of next.strategyPerformance) {
        const existing = strategyMap.get(s.strategyName);
        if (!existing) {
            strategyMap.set(s.strategyName, { ...s });
            continue;
        }
        existing.usage += s.usage;
        existing.executed += s.executed;
        existing.success += s.success;
        existing.totalPnl += s.totalPnl;
    }
    merged.strategyPerformance = Array.from(strategyMap.values());
    return recomputeSummary(merged);
}
/**
 * Build analysis prompt for LLM
 */
function buildAnalysisPrompt(summary, sampleThoughts) {
    return `You are an expert trading system analyst. Analyze the following execution trace summary and provide actionable insights to improve trading performance.

## TRACE SUMMARY
- **Total Traces Analyzed**: ${summary.totalTraces}
- **Date Range**: ${summary.dateRange.start} to ${summary.dateRange.end}
- **Completed Trades**: ${summary.totalTrades} (Entries: ${summary.totalEntries}, Exits: ${summary.totalExits})
- **Win/Loss**: ${summary.wins} / ${summary.losses} (${summary.totalTrades > 0 ? ((summary.wins / summary.totalTrades) * 100).toFixed(1) : '0.0'}% win rate)
- **Total PnL**: ${summary.totalPnl.toFixed(2)} | **Avg PnL/Trade**: ${summary.avgPnl.toFixed(4)}
- **Profit Factor**: ${Number.isFinite(summary.profitFactor) ? summary.profitFactor.toFixed(2) : 'N/A'} | **Total Fees**: ${summary.totalFees.toFixed(2)}

## BY SYMBOL PERFORMANCE
${Object.entries(summary.bySymbol).map(([symbol, stats]) => `- ${symbol}: ${stats.count} cycles, ${stats.trades} trades, ${(stats.successRate * 100).toFixed(1)}% win rate, PnL ${stats.totalPnl.toFixed(2)} (avg ${stats.avgPnl.toFixed(4)})
      Regimes: ${Object.entries(stats.regimes).map(([r, c]) => `${r}(${c})`).join(', ')}`).join('\n')}

## REGIME PATTERNS
${summary.commonPatterns.map(p => `- ${p.description}: ${p.frequency} trades, ${(p.successRate * 100).toFixed(1)}% win rate, ${p.outcome} outcomes`).join('\n')}

## STRATEGY PERFORMANCE
${summary.strategyPerformance.map(s => `- ${s.strategyName}: Used ${s.usage}x, Executed ${s.executed}x, ${(s.successRate * 100).toFixed(1)}% win rate, PnL ${s.totalPnl.toFixed(2)} (avg ${s.avgPnl.toFixed(4)})`).join('\n')}

## SAMPLE AGENT THOUGHTS
${sampleThoughts.slice(0, 20).map(t => `> ${t}`).join('\n')}

---

Based on this data, provide analysis in the following JSON format:
{
    "overallAssessment": "Brief assessment of agent performance",
    "keyFindings": ["finding1", "finding2", "finding3"],
    "recommendations": [
        {
            "priority": "HIGH" | "MEDIUM" | "LOW",
            "category": "STRATEGY" | "RISK" | "TIMING" | "REGIME",
            "recommendation": "Specific actionable recommendation",
            "expectedImpact": "Expected improvement"
        }
    ],
    "parameterAdjustments": {
        "stopLoss": { "current": 0.03, "suggested": 0.025, "reason": "..." },
        "takeProfit": { "current": 0.06, "suggested": 0.08, "reason": "..." },
        "positionSize": { "current": 0.05, "suggested": 0.04, "reason": "..." }
    },
    "regimeSpecificAdvice": {
        "TRENDING_UP": "advice for trending up markets",
        "TRENDING_DOWN": "advice for trending down markets",
        "RANGING": "advice for ranging markets"
    },
    "confidence": 0.8
}

Focus on ACTIONABLE insights that can directly improve trading performance.`;
}
/**
 * Parse LLM analysis response
 */
function parseAnalysisResponse(response) {
    try {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            logger_1.default.warn('[TraceAnalyzer] Could not find JSON in response');
            return null;
        }
        return JSON.parse(jsonMatch[0]);
    }
    catch (error) {
        logger_1.default.error('[TraceAnalyzer] Failed to parse analysis response:', error);
        return null;
    }
}
/**
 * Store analysis insight in database
 */
function storeInsight(insight) {
    try {
        const db = new better_sqlite3_1.default(dbPath);
        const stmt = db.prepare(`
            INSERT INTO ai_insights (id, type, title, description, confidence, actionable, timestamp, data)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run(insight.id, insight.type, insight.title, insight.description, insight.confidence, insight.actionable ? 1 : 0, insight.timestamp, JSON.stringify(insight.data));
        db.close();
        logger_1.default.info(`[TraceAnalyzer] Stored insight: ${insight.title}`);
    }
    catch (error) {
        logger_1.default.error('[TraceAnalyzer] Failed to store insight:', error);
    }
}
/**
 * Run daily trace analysis
 */
async function runDailyTraceAnalysis() {
    logger_1.default.info('[TraceAnalyzer] Starting daily trace analysis...');
    // Initialize trace store
    trace_store_1.default.initialize();
    const insights = [];
    let combinedSummary = null;
    const comprehensiveThoughts = [];
    let batchIndex = 0;
    while (true) {
        const traces = trace_store_1.default.getUnanalyzedTraces(TRACE_ANALYSIS_BATCH_SIZE);
        if (traces.length === 0) {
            if (batchIndex === 0) {
                logger_1.default.info('[TraceAnalyzer] No unanalyzed traces found');
            }
            break;
        }
        batchIndex += 1;
        logger_1.default.info(`[TraceAnalyzer] Processing batch ${batchIndex} with ${traces.length} traces`);
        // Aggregate traces
        const summary = aggregateTraces(traces);
        combinedSummary = combinedSummary ? mergeSummaries(combinedSummary, summary) : summary;
        // Collect sample thoughts from traces
        const sampleThoughts = [];
        for (const trace of traces.slice(0, 20)) {
            const data = JSON.parse(trace.traceData);
            sampleThoughts.push(...(data.thoughts || []).slice(-3));
        }
        for (const thought of sampleThoughts) {
            if (comprehensiveThoughts.length >= 60)
                break;
            if (thought && !comprehensiveThoughts.includes(thought)) {
                comprehensiveThoughts.push(thought);
            }
        }
        // Build prompt and call LLM
        const prompt = buildAnalysisPrompt(summary, sampleThoughts);
        let analysisResult = null;
        if (glm_service_1.default.canUseService()) {
            try {
                // Use the GLM service's internal callAPI through a strategy generation workaround
                // We'll create a custom research data structure to leverage the existing API
                const researchData = {
                    topic: `Daily Trade Analysis (Batch ${batchIndex})`,
                    timestamp: new Date(),
                    searchResults: [],
                    scrapedContent: [],
                    insights: [
                        `Analyzed ${traces.length} execution traces`,
                        `Symbol coverage: ${Object.keys(summary.bySymbol).join(', ')}`,
                        `Date range: ${summary.dateRange.start} to ${summary.dateRange.end}`,
                    ],
                    sources: ['Execution Traces', 'Performance Metrics'],
                    confidence: 0.8,
                };
                // For now, we'll call the API directly since we need a custom prompt
                const axios = (await Promise.resolve().then(() => __importStar(require('axios')))).default;
                const config = config_1.default.get();
                const response = await axios.post(`${config.glm.baseUrl}/chat/completions`, {
                    model: config.glm.model,
                    messages: [
                        { role: 'system', content: 'You are an expert trading system analyst. Analyze traces and provide actionable insights.' },
                        { role: 'user', content: prompt }
                    ],
                    temperature: 0.5,
                    max_tokens: 4000,
                }, {
                    headers: {
                        'Authorization': `Bearer ${config.glm.apiKey}`,
                        'Content-Type': 'application/json',
                    },
                    timeout: 60000,
                });
                const responseText = response.data.choices[0]?.message?.content || '';
                analysisResult = parseAnalysisResponse(responseText);
            }
            catch (error) {
                logger_1.default.error('[TraceAnalyzer] LLM analysis failed:', error);
            }
        }
        else {
            logger_1.default.warn('[TraceAnalyzer] GLM service not available, generating fallback analysis');
        }
        // Generate fallback analysis if LLM failed
        if (!analysisResult) {
            analysisResult = generateFallbackAnalysis(summary);
        }
        // Create batch ID
        const batchId = crypto.randomUUID();
        // Create insight
        const insight = {
            id: crypto.randomUUID(),
            type: 'TRACE_ANALYSIS',
            title: `Daily Trace Analysis - ${new Date().toISOString().split('T')[0]} (Batch ${batchIndex})`,
            description: analysisResult.overallAssessment || 'Analysis completed',
            confidence: analysisResult.confidence || 0.7,
            actionable: true,
            timestamp: new Date().toISOString(),
            data: {
                batchId,
                tracesAnalyzed: traces.length,
                recommendations: (analysisResult.recommendations || []).map((r) => typeof r === 'string' ? r : r.recommendation),
                parameters: analysisResult.parameterAdjustments || {},
                patterns: analysisResult.keyFindings || [],
            },
        };
        // Store insight
        storeInsight(insight);
        // Mark traces as analyzed
        const traceIds = traces.map(t => t.id);
        trace_store_1.default.markTracesAnalyzed(traceIds, batchId);
        insights.push(insight);
    }
    if (combinedSummary) {
        const prompt = buildAnalysisPrompt(combinedSummary, comprehensiveThoughts);
        let analysisResult = null;
        if (glm_service_1.default.canUseService()) {
            try {
                const axios = (await Promise.resolve().then(() => __importStar(require('axios')))).default;
                const config = config_1.default.get();
                const response = await axios.post(`${config.glm.baseUrl}/chat/completions`, {
                    model: config.glm.model,
                    messages: [
                        { role: 'system', content: 'You are an expert trading system analyst. Produce a comprehensive, systematic review to improve algorithm performance.' },
                        { role: 'user', content: prompt }
                    ],
                    temperature: 0.4,
                    max_tokens: 4000,
                }, {
                    headers: {
                        'Authorization': `Bearer ${config.glm.apiKey}`,
                        'Content-Type': 'application/json',
                    },
                    timeout: 60000,
                });
                const responseText = response.data.choices[0]?.message?.content || '';
                analysisResult = parseAnalysisResponse(responseText);
            }
            catch (error) {
                logger_1.default.error('[TraceAnalyzer] Comprehensive LLM analysis failed:', error);
            }
        }
        if (!analysisResult) {
            analysisResult = generateFallbackAnalysis(combinedSummary);
        }
        const batchId = crypto.randomUUID();
        const comprehensiveInsight = {
            id: crypto.randomUUID(),
            type: 'TRACE_ANALYSIS',
            title: `Comprehensive Trace Analysis - ${new Date().toISOString().split('T')[0]}`,
            description: analysisResult.overallAssessment || 'Comprehensive analysis completed',
            confidence: analysisResult.confidence || 0.7,
            actionable: true,
            timestamp: new Date().toISOString(),
            data: {
                batchId,
                tracesAnalyzed: combinedSummary.totalTraces,
                recommendations: (analysisResult.recommendations || []).map((r) => typeof r === 'string' ? r : r.recommendation),
                parameters: analysisResult.parameterAdjustments || {},
                patterns: analysisResult.keyFindings || [],
                summary: {
                    totalTrades: combinedSummary.totalTrades,
                    wins: combinedSummary.wins,
                    losses: combinedSummary.losses,
                    winRate: combinedSummary.totalTrades > 0 ? combinedSummary.wins / combinedSummary.totalTrades : 0,
                    totalPnl: combinedSummary.totalPnl,
                    avgPnl: combinedSummary.avgPnl,
                    profitFactor: combinedSummary.profitFactor,
                },
            },
        };
        storeInsight(comprehensiveInsight);
        insights.push(comprehensiveInsight);
    }
    // Clean up old traces (keep 30 days)
    const cleaned = trace_store_1.default.cleanupOldTraces(30);
    if (cleaned > 0) {
        logger_1.default.info(`[TraceAnalyzer] Cleaned up ${cleaned} old traces`);
    }
    logger_1.default.info(`[TraceAnalyzer] Daily analysis complete: ${insights.length} insights generated`);
    return insights;
}
/**
 * Generate fallback analysis when LLM is unavailable
 */
function generateFallbackAnalysis(summary) {
    const bestStrategy = summary.strategyPerformance.sort((a, b) => b.successRate - a.successRate)[0];
    const worstStrategy = summary.strategyPerformance.sort((a, b) => a.successRate - b.successRate)[0];
    return {
        overallAssessment: `Analyzed ${summary.totalTraces} traces. System is operating with mixed results.`,
        keyFindings: [
            `Most active symbol: ${Object.entries(summary.bySymbol).sort((a, b) => b[1].count - a[1].count)[0]?.[0] || 'N/A'}`,
            bestStrategy ? `Best performing strategy: ${bestStrategy.strategyName} (${(bestStrategy.successRate * 100).toFixed(0)}% success)` : 'No strategy data',
            worstStrategy ? `Needs improvement: ${worstStrategy.strategyName} (${(worstStrategy.successRate * 100).toFixed(0)}% success)` : 'No strategy data',
        ],
        recommendations: [
            {
                priority: 'MEDIUM',
                category: 'STRATEGY',
                recommendation: 'Continue monitoring strategy performance and adjust position sizing based on regime',
                expectedImpact: 'Improved risk-adjusted returns',
            },
        ],
        parameterAdjustments: {},
        regimeSpecificAdvice: {
            TRENDING_UP: 'Increase position size and widen take-profit targets',
            TRENDING_DOWN: 'Reduce position size and tighten stop-losses',
            RANGING: 'Use mean reversion strategies with tight ranges',
        },
        confidence: 0.5,
    };
}
exports.default = { runDailyTraceAnalysis };
//# sourceMappingURL=trace-analyzer.js.map