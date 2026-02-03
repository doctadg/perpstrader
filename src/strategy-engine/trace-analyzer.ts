// Trace Analyzer Service - Daily LLM Processing of Agent Traces
// Analyzes execution traces to improve trading strategy

import traceStore, { StoredTrace, TraceData } from '../data/trace-store';
import glmService from '../shared/glm-service';
import logger from '../shared/logger';
import BetterSqlite3 from 'better-sqlite3';
import configManager from '../shared/config';

const fullConfig = configManager.get();
const dbPath = fullConfig.database?.connection || './data/trading.db';
const TRACE_ANALYSIS_BATCH_SIZE = Math.max(100, parseInt(process.env.TRACE_ANALYSIS_BATCH_SIZE || '1000', 10));

/**
 * Summary of traces for analysis
 */
interface TraceSummary {
    totalTraces: number;
    totalTrades: number;
    totalEntries: number;
    totalExits: number;
    wins: number;
    losses: number;
    totalPnl: number;
    totalFees: number;
    totalWinPnl: number;
    totalLossPnl: number;
    avgPnl: number;
    profitFactor: number;
    dateRange: { start: string; end: string };
    bySymbol: Record<string, {
        count: number;
        trades: number;
        wins: number;
        losses: number;
        successRate: number;
        totalPnl: number;
        avgPnl: number;
        totalFees: number;
        regimes: Record<string, number>;
    }>;
    commonPatterns: {
        description: string;
        frequency: number;
        wins: number;
        successRate: number;
        outcome: string;
    }[];
    strategyPerformance: {
        strategyName: string;
        usage: number;
        executed: number;
        success: number;
        successRate: number;
        totalPnl: number;
        avgPnl: number;
    }[];
}

/**
 * Analysis insight from LLM
 */
interface AnalysisInsight {
    id: string;
    type: 'TRACE_ANALYSIS';
    title: string;
    description: string;
    confidence: number;
    actionable: boolean;
    timestamp: string;
    data: {
        batchId: string;
        tracesAnalyzed: number;
        recommendations: string[];
        parameters: Record<string, any>;
        patterns: string[];
        summary?: Record<string, any>;
    };
}

/**
 * Aggregate traces into a summary for LLM analysis
 */
function aggregateTraces(traces: StoredTrace[]): TraceSummary {
    const summary: TraceSummary = {
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

    const strategyUsage: Record<string, { usage: number; executed: number; success: number; totalPnl: number }> = {};
    const regimeOutcomes: Record<string, { success: number; total: number }> = {};

    for (const trace of traces) {
        const data = JSON.parse(trace.traceData) as TraceData;
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
            } else {
                summary.losses++;
                summary.bySymbol[trace.symbol].losses++;
                summary.bySymbol[trace.symbol].totalPnl += tradePnl || 0;
                summary.bySymbol[trace.symbol].totalFees += tradeFee;
                summary.totalLossPnl += Math.abs(tradePnl || 0);
            }
        } else if (data.executionResult?.entryExit === 'ENTRY') {
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

function recomputeSummary(summary: TraceSummary): TraceSummary {
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

function mergeSummaries(base: TraceSummary, next: TraceSummary): TraceSummary {
    const parseDate = (value: string) => (value ? new Date(value).getTime() : NaN);
    const startTime = Math.min(
        parseDate(base.dateRange.start),
        parseDate(next.dateRange.start)
    );
    const endTime = Math.max(
        parseDate(base.dateRange.end),
        parseDate(next.dateRange.end)
    );

    const merged: TraceSummary = {
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
        const mergedRegimes: Record<string, number> = {};
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

    const patternMap = new Map<string, { description: string; frequency: number; wins: number; successRate: number; outcome: string }>();
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

    const strategyMap = new Map<string, { strategyName: string; usage: number; executed: number; success: number; successRate: number; totalPnl: number; avgPnl: number }>();
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
function buildAnalysisPrompt(summary: TraceSummary, sampleThoughts: string[]): string {
    return `You are an expert trading system analyst. Analyze the following execution trace summary and provide actionable insights to improve trading performance.

## TRACE SUMMARY
- **Total Traces Analyzed**: ${summary.totalTraces}
- **Date Range**: ${summary.dateRange.start} to ${summary.dateRange.end}
- **Completed Trades**: ${summary.totalTrades} (Entries: ${summary.totalEntries}, Exits: ${summary.totalExits})
- **Win/Loss**: ${summary.wins} / ${summary.losses} (${summary.totalTrades > 0 ? ((summary.wins / summary.totalTrades) * 100).toFixed(1) : '0.0'}% win rate)
- **Total PnL**: ${summary.totalPnl.toFixed(2)} | **Avg PnL/Trade**: ${summary.avgPnl.toFixed(4)}
- **Profit Factor**: ${Number.isFinite(summary.profitFactor) ? summary.profitFactor.toFixed(2) : 'N/A'} | **Total Fees**: ${summary.totalFees.toFixed(2)}

## BY SYMBOL PERFORMANCE
${Object.entries(summary.bySymbol).map(([symbol, stats]) =>
        `- ${symbol}: ${stats.count} cycles, ${stats.trades} trades, ${(stats.successRate * 100).toFixed(1)}% win rate, PnL ${stats.totalPnl.toFixed(2)} (avg ${stats.avgPnl.toFixed(4)})
      Regimes: ${Object.entries(stats.regimes).map(([r, c]) => `${r}(${c})`).join(', ')}`
    ).join('\n')}

## REGIME PATTERNS
${summary.commonPatterns.map(p =>
        `- ${p.description}: ${p.frequency} trades, ${(p.successRate * 100).toFixed(1)}% win rate, ${p.outcome} outcomes`
    ).join('\n')}

## STRATEGY PERFORMANCE
${summary.strategyPerformance.map(s =>
        `- ${s.strategyName}: Used ${s.usage}x, Executed ${s.executed}x, ${(s.successRate * 100).toFixed(1)}% win rate, PnL ${s.totalPnl.toFixed(2)} (avg ${s.avgPnl.toFixed(4)})`
    ).join('\n')}

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
function parseAnalysisResponse(response: string): any {
    try {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            logger.warn('[TraceAnalyzer] Could not find JSON in response');
            return null;
        }
        return JSON.parse(jsonMatch[0]);
    } catch (error) {
        logger.error('[TraceAnalyzer] Failed to parse analysis response:', error);
        return null;
    }
}

/**
 * Store analysis insight in database
 */
function storeInsight(insight: AnalysisInsight): void {
    try {
        const db = new BetterSqlite3(dbPath);

        const stmt = db.prepare(`
            INSERT INTO ai_insights (id, type, title, description, confidence, actionable, timestamp, data)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
            insight.id,
            insight.type,
            insight.title,
            insight.description,
            insight.confidence,
            insight.actionable ? 1 : 0,
            insight.timestamp,
            JSON.stringify(insight.data)
        );

        db.close();
        logger.info(`[TraceAnalyzer] Stored insight: ${insight.title}`);
    } catch (error) {
        logger.error('[TraceAnalyzer] Failed to store insight:', error);
    }
}

/**
 * Run daily trace analysis
 */
export async function runDailyTraceAnalysis(): Promise<AnalysisInsight[]> {
    logger.info('[TraceAnalyzer] Starting daily trace analysis...');

    // Initialize trace store
    traceStore.initialize();

    const insights: AnalysisInsight[] = [];
    let combinedSummary: TraceSummary | null = null;
    const comprehensiveThoughts: string[] = [];
    let batchIndex = 0;

    while (true) {
        const traces = traceStore.getUnanalyzedTraces(TRACE_ANALYSIS_BATCH_SIZE);

        if (traces.length === 0) {
            if (batchIndex === 0) {
                logger.info('[TraceAnalyzer] No unanalyzed traces found');
            }
            break;
        }

        batchIndex += 1;
        logger.info(`[TraceAnalyzer] Processing batch ${batchIndex} with ${traces.length} traces`);

        // Aggregate traces
        const summary = aggregateTraces(traces);
        combinedSummary = combinedSummary ? mergeSummaries(combinedSummary, summary) : summary;

        // Collect sample thoughts from traces
        const sampleThoughts: string[] = [];
        for (const trace of traces.slice(0, 20)) {
            const data = JSON.parse(trace.traceData) as TraceData;
            sampleThoughts.push(...(data.thoughts || []).slice(-3));
        }
        for (const thought of sampleThoughts) {
            if (comprehensiveThoughts.length >= 60) break;
            if (thought && !comprehensiveThoughts.includes(thought)) {
                comprehensiveThoughts.push(thought);
            }
        }

        // Build prompt and call LLM
        const prompt = buildAnalysisPrompt(summary, sampleThoughts);

        let analysisResult: any = null;

        if (glmService.canUseService()) {
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
                const axios = (await import('axios')).default;
                const config = configManager.get();

                const response = await axios.post(
                    `${config.glm.baseUrl}/chat/completions`,
                    {
                        model: config.glm.model,
                        messages: [
                            { role: 'system', content: 'You are an expert trading system analyst. Analyze traces and provide actionable insights.' },
                            { role: 'user', content: prompt }
                        ],
                        temperature: 0.5,
                        max_tokens: 4000,
                    },
                    {
                        headers: {
                            'Authorization': `Bearer ${config.glm.apiKey}`,
                            'Content-Type': 'application/json',
                        },
                        timeout: 60000,
                    }
                );

                const responseText = response.data.choices[0]?.message?.content || '';
                analysisResult = parseAnalysisResponse(responseText);

            } catch (error) {
                logger.error('[TraceAnalyzer] LLM analysis failed:', error);
            }
        } else {
            logger.warn('[TraceAnalyzer] GLM service not available, generating fallback analysis');
        }

        // Generate fallback analysis if LLM failed
        if (!analysisResult) {
            analysisResult = generateFallbackAnalysis(summary);
        }

        // Create batch ID
        const batchId = crypto.randomUUID();

        // Create insight
        const insight: AnalysisInsight = {
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
                recommendations: (analysisResult.recommendations || []).map((r: any) =>
                    typeof r === 'string' ? r : r.recommendation
                ),
                parameters: analysisResult.parameterAdjustments || {},
                patterns: analysisResult.keyFindings || [],
            },
        };

        // Store insight
        storeInsight(insight);

        // Mark traces as analyzed
        const traceIds = traces.map(t => t.id);
        traceStore.markTracesAnalyzed(traceIds, batchId);

        insights.push(insight);
    }

    if (combinedSummary) {
        const prompt = buildAnalysisPrompt(combinedSummary, comprehensiveThoughts);
        let analysisResult: any = null;

        if (glmService.canUseService()) {
            try {
                const axios = (await import('axios')).default;
                const config = configManager.get();

                const response = await axios.post(
                    `${config.glm.baseUrl}/chat/completions`,
                    {
                        model: config.glm.model,
                        messages: [
                            { role: 'system', content: 'You are an expert trading system analyst. Produce a comprehensive, systematic review to improve algorithm performance.' },
                            { role: 'user', content: prompt }
                        ],
                        temperature: 0.4,
                        max_tokens: 4000,
                    },
                    {
                        headers: {
                            'Authorization': `Bearer ${config.glm.apiKey}`,
                            'Content-Type': 'application/json',
                        },
                        timeout: 60000,
                    }
                );

                const responseText = response.data.choices[0]?.message?.content || '';
                analysisResult = parseAnalysisResponse(responseText);
            } catch (error) {
                logger.error('[TraceAnalyzer] Comprehensive LLM analysis failed:', error);
            }
        }

        if (!analysisResult) {
            analysisResult = generateFallbackAnalysis(combinedSummary);
        }

        const batchId = crypto.randomUUID();
        const comprehensiveInsight: AnalysisInsight = {
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
                recommendations: (analysisResult.recommendations || []).map((r: any) =>
                    typeof r === 'string' ? r : r.recommendation
                ),
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
    const cleaned = traceStore.cleanupOldTraces(30);
    if (cleaned > 0) {
        logger.info(`[TraceAnalyzer] Cleaned up ${cleaned} old traces`);
    }

    logger.info(`[TraceAnalyzer] Daily analysis complete: ${insights.length} insights generated`);

    return insights;
}

/**
 * Generate fallback analysis when LLM is unavailable
 */
function generateFallbackAnalysis(summary: TraceSummary): any {
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

export default { runDailyTraceAnalysis };
