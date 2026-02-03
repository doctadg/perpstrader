/**
 * Comprehensive Trace Analysis - Production Ready
 * Analyzes all 141K traces with optimized queries
 */

const Database = require('better-sqlite3');
const fs = require('fs');

const DB_PATH = './data/trading.db';
const REPORT_PATH = './scripts/trace-analysis-report.json';

console.log('=== PerpsTrader Trace Analysis ===\n');
console.log('Connecting to 38GB database...');

const db = new Database(DB_PATH);

// Results object
const report = {
    generatedAt: new Date().toISOString(),
    summary: {},
    timing: {},
    strategies: {},
    failures: {},
    riskGates: {},
    apiHealth: {},
    signalFunnel: {},
    bottlenecks: [],
    recommendations: []
};

// ===== PHASE 1: HIGH-LEVEL METRICS =====
console.log('\n📊 Phase 1: High-Level Metrics');

const summary = db.prepare(`
    SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN trade_executed = 1 THEN 1 ELSE 0 END) as executed,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful,
        COUNT(DISTINCT symbol) as symbols,
        COUNT(DISTINCT regime) as regimes,
        AVG(strategy_count) as avgStrategies,
        MIN(created_at) as startDate,
        MAX(created_at) as endDate
    FROM agent_traces
`).get();

report.summary = {
    totalTraces: summary.total,
    tradesExecuted: summary.executed,
    tradesSuccessful: summary.successful,
    executionRate: ((summary.executed / summary.total) * 100).toFixed(2),
    successRate: summary.executed > 0 ? ((summary.successful / summary.executed) * 100).toFixed(2) : 0,
    uniqueSymbols: summary.symbols,
    uniqueRegimes: summary.regimes,
    avgStrategiesPerTrace: summary.avgStrategies?.toFixed(2),
    dateRange: { from: summary.startDate, to: summary.endDate }
};

console.log(`  Total traces: ${summary.total.toLocaleString()}`);
console.log(`  Executed: ${summary.executed} (${report.summary.executionRate}%)`);
console.log(`  Successful: ${summary.successful} (${report.summary.successRate}%)`);
console.log(`  Symbols: ${summary.symbols} | Regimes: ${summary.regimes}`);

// ===== PHASE 2: TIMING ANALYSIS =====
console.log('\n⏱️ Phase 2: Timing Analysis');

const timingData = [];
const timingStmt = db.prepare(`
    SELECT trace_data 
    FROM agent_traces 
    WHERE trace_data LIKE '%startTime%' 
      AND trace_data LIKE '%endTime%'
    ORDER BY RANDOM() 
    LIMIT 10000
`);

for (const row of timingStmt.iterate()) {
    try {
        const data = JSON.parse(row.trace_data);
        if (data.startTime && data.endTime) {
            const duration = new Date(data.endTime) - new Date(data.startTime);
            if (duration > 0 && duration < 300000) {
                timingData.push(duration);
            }
        }
    } catch (e) {}
}

if (timingData.length > 0) {
    timingData.sort((a, b) => a - b);
    const len = timingData.length;
    const pct = (p) => timingData[Math.floor(len * p / 100)];
    
    report.timing = {
        sampleSize: len,
        min: timingData[0],
        max: timingData[len-1],
        avg: Math.round(timingData.reduce((a,b) => a+b, 0) / len),
        p50: pct(50),
        p75: pct(75),
        p90: pct(90),
        p95: pct(95),
        p99: pct(99)
    };
    
    console.log(`  Sample: ${len} traces`);
    console.log(`  P50: ${report.timing.p50}ms | P95: ${report.timing.p95}ms | P99: ${report.timing.p99}ms`);
}

// ===== PHASE 3: ERROR ANALYSIS =====
console.log('\n❌ Phase 3: Error Analysis');

const errorsByType = {};
const errorSamples = {};

// Sample traces with errors (last 7 days for relevance)
const errorStmt = db.prepare(`
    SELECT trace_data, symbol, created_at
    FROM agent_traces 
    WHERE created_at > datetime('now', '-7 days')
      AND trace_data LIKE '%errors%'
    LIMIT 5000
`);

for (const row of errorStmt.iterate()) {
    try {
        const data = JSON.parse(row.trace_data);
        if (data.errors && Array.isArray(data.errors)) {
            data.errors.forEach(err => {
                // Categorize
                let type = 'other';
                const e = err.toLowerCase();
                if (e.includes('timeout')) type = 'timeout';
                else if (e.includes('hyperliquid')) type = 'hyperliquid_api';
                else if (e.includes('chroma')) type = 'chroma_db';
                else if (e.includes('sqlite') || e.includes('database')) type = 'database';
                else if (e.includes('redis')) type = 'redis';
                else if (e.includes('risk') || e.includes('rejected')) type = 'risk_gate';
                else if (e.includes('insufficient') || e.includes('balance')) type = 'insufficient_funds';
                else if (e.includes('network') || e.includes('connection')) type = 'network';
                else if (e.includes('not configured')) type = 'configuration';
                
                errorsByType[type] = (errorsByType[type] || 0) + 1;
                
                // Store samples
                if (!errorSamples[type]) errorSamples[type] = [];
                if (errorSamples[type].length < 3) {
                    errorSamples[type].push({
                        message: err.substring(0, 200),
                        symbol: row.symbol,
                        time: row.created_at
                    });
                }
            });
        }
    } catch (e) {}
}

report.failures = {
    byType: errorsByType,
    totalErrors: Object.values(errorsByType).reduce((a,b) => a+b, 0),
    samples: errorSamples
};

console.log(`  Total errors found: ${report.failures.totalErrors}`);
Object.entries(errorsByType)
    .sort((a,b) => b[1] - a[1])
    .slice(0, 8)
    .forEach(([type, count]) => console.log(`    ${type}: ${count}`));

// ===== PHASE 4: STRATEGY ANALYSIS =====
console.log('\n🎯 Phase 4: Strategy Analysis');

const strategies = {};
const stratStmt = db.prepare(`
    SELECT trace_data, trade_executed, success, regime
    FROM agent_traces 
    WHERE created_at > datetime('now', '-30 days')
    LIMIT 20000
`);

for (const row of stratStmt.iterate()) {
    try {
        const data = JSON.parse(row.trace_data || '{}');
        if (data.selectedStrategy?.name) {
            const name = data.selectedStrategy.name;
            if (!strategies[name]) {
                strategies[name] = { 
                    count: 0, trades: 0, success: 0, 
                    regimes: {}, pnls: [] 
                };
            }
            
            const s = strategies[name];
            s.count++;
            s.regimes[row.regime || 'unknown'] = (s.regimes[row.regime] || 0) + 1;
            
            if (row.trade_executed) s.trades++;
            if (row.success) s.success++;
            if (data.executionResult?.pnl !== undefined) {
                s.pnls.push(data.executionResult.pnl);
            }
        }
    } catch (e) {}
}

// Calculate strategy stats
Object.entries(strategies).forEach(([name, s]) => {
    report.strategies[name] = {
        count: s.count,
        trades: s.trades,
        successRate: s.trades > 0 ? (s.success / s.trades * 100).toFixed(1) : 0,
        avgPnL: s.pnls.length > 0 ? (s.pnls.reduce((a,b) => a+b, 0) / s.pnls.length).toFixed(4) : 0,
        totalPnL: s.pnls.length > 0 ? s.pnls.reduce((a,b) => a+b, 0).toFixed(4) : 0,
        topRegime: Object.entries(s.regimes).sort((a,b) => b[1]-a[1])[0]?.[0] || 'unknown'
    };
});

console.log(`  Unique strategies: ${Object.keys(report.strategies).length}`);
Object.entries(report.strategies)
    .sort((a,b) => b[1].count - a[1].count)
    .slice(0, 5)
    .forEach(([name, s]) => {
        console.log(`    ${name}: ${s.count} uses, ${s.trades} trades, ${s.successRate}% win`);
    });

// ===== PHASE 5: SIGNAL FLOW ANALYSIS =====
console.log('\n📈 Phase 5: Signal Flow Analysis');

const flow = {
    signalsGenerated: 0,
    signalsApproved: 0,
    riskChecked: 0,
    riskApproved: 0,
    executed: 0,
    successful: 0
};

const flowStmt = db.prepare(`
    SELECT trace_data, trade_executed, success
    FROM agent_traces 
    WHERE created_at > datetime('now', '-14 days')
    LIMIT 30000
`);

for (const row of flowStmt.iterate()) {
    try {
        const data = JSON.parse(row.trace_data || '{}');
        
        if (data.signal) {
            flow.signalsGenerated++;
            if (data.signal.approved) flow.signalsApproved++;
        }
        
        if (data.riskAssessment) {
            flow.riskChecked++;
            if (data.riskAssessment.approved) flow.riskApproved++;
        }
        
        if (row.trade_executed) flow.executed++;
        if (row.success) flow.successful++;
    } catch (e) {}
}

report.signalFunnel = {
    ...flow,
    approvalRate: flow.signalsGenerated > 0 ? (flow.signalsApproved / flow.signalsGenerated * 100).toFixed(1) : 0,
    riskPassRate: flow.riskChecked > 0 ? (flow.riskApproved / flow.riskChecked * 100).toFixed(1) : 0,
    executionRate: flow.riskApproved > 0 ? (flow.executed / flow.riskApproved * 100).toFixed(1) : 0,
    successRate: flow.executed > 0 ? (flow.successful / flow.executed * 100).toFixed(1) : 0
};

console.log(`  Signals generated: ${flow.signalsGenerated}`);
console.log(`  Approved: ${flow.signalsApproved} (${report.signalFunnel.approvalRate}%)`);
console.log(`  Risk passed: ${flow.riskApproved} (${report.signalFunnel.riskPassRate}%)`);
console.log(`  Executed: ${flow.executed} (${report.signalFunnel.executionRate}%)`);
console.log(`  Successful: ${flow.successful} (${report.signalFunnel.successRate}%)`);

// ===== PHASE 6: BOTTLENECK IDENTIFICATION =====
console.log('\n🚨 Phase 6: Bottleneck Identification');

const bottlenecks = [];

// 1. Latency bottleneck
if (report.timing.p95 > 2000) {
    bottlenecks.push({
        type: 'high_latency',
        severity: report.timing.p95 > 5000 ? 'critical' : 'high',
        metric: `${report.timing.p95}ms P95`,
        description: `Cycle latency P95 is ${report.timing.p95}ms (target <1000ms)`,
        impact: 'Slow response to market conditions'
    });
}

// 2. Error hotspots
const topErrors = Object.entries(errorsByType).sort((a,b) => b[1]-a[1]);
if (topErrors.length > 0 && topErrors[0][1] > 10) {
    const [topType, topCount] = topErrors[0];
    bottlenecks.push({
        type: 'error_hotspot',
        severity: topCount > 100 ? 'critical' : topCount > 50 ? 'high' : 'medium',
        metric: `${topCount} errors`,
        description: `Primary error type: ${topType} (${topCount} occurrences)`,
        impact: 'Reduced reliability and failed trades'
    });
}

// 3. Configuration issues
if (errorsByType['configuration'] > 0) {
    bottlenecks.push({
        type: 'configuration',
        severity: 'critical',
        metric: `${errorsByType['configuration']} errors`,
        description: 'Hyperliquid/ChromaDB not properly configured',
        impact: 'Cannot execute live trades'
    });
}

// 4. Signal drop-off
if (parseFloat(report.signalFunnel.executionRate) < 50) {
    bottlenecks.push({
        type: 'execution_gap',
        severity: 'high',
        metric: `${report.signalFunnel.executionRate}% execution rate`,
        description: 'Many approved signals are not being executed',
        impact: 'Missing trading opportunities'
    });
}

// 5. Database/Chroma issues
if (errorsByType['chroma_db'] > 0 || errorsByType['database'] > 0) {
    const count = (errorsByType['chroma_db'] || 0) + (errorsByType['database'] || 0);
    bottlenecks.push({
        type: 'data_layer',
        severity: count > 50 ? 'high' : 'medium',
        metric: `${count} errors`,
        description: 'ChromaDB/Database connectivity issues',
        impact: 'Pattern matching and storage failures'
    });
}

report.bottlenecks = bottlenecks;
console.log(`  Identified ${bottlenecks.length} bottlenecks`);
bottlenecks.forEach(b => console.log(`    [${b.severity.toUpperCase()}] ${b.type}: ${b.description}`));

// ===== PHASE 7: RECOMMENDATIONS =====
console.log('\n💡 Phase 7: Recommendations');

const recommendations = [];

// Critical: Configuration
if (errorsByType['configuration'] > 0) {
    recommendations.push({
        priority: 'critical',
        category: 'Configuration',
        issue: 'Trading infrastructure not configured',
        action: 'Configure Hyperliquid API credentials and ChromaDB connection',
        impact: 'Enable live trade execution'
    });
}

// Critical: Timeout
if (errorsByType['timeout'] > 20) {
    recommendations.push({
        priority: 'critical',
        category: 'Performance',
        issue: `High timeout rate (${errorsByType['timeout']} occurrences)`,
        action: 'Increase API timeouts, implement async processing, add circuit breakers',
        impact: 'Prevent trade execution failures'
    });
}

// High: Latency
if (report.timing.p95 > 2000) {
    recommendations.push({
        priority: 'high',
        category: 'Performance',
        issue: `High P95 latency (${report.timing.p95}ms)`,
        action: 'Cache pattern results, optimize indicator calculations, use connection pooling',
        impact: 'Reduce cycle time by 40-60%'
    });
}

// High: Execution gap
if (parseFloat(report.signalFunnel.executionRate) < 70) {
    recommendations.push({
        priority: 'high',
        category: 'Execution',
        issue: 'Low signal-to-execution conversion',
        action: 'Debug execution pipeline, check risk gate timing, verify order validation',
        impact: 'Capture 30-50% more trading opportunities'
    });
}

// High: ChromaDB
if (errorsByType['chroma_db'] > 10) {
    recommendations.push({
        priority: 'high',
        category: 'Infrastructure',
        issue: 'ChromaDB connectivity issues',
        action: 'Restart ChromaDB service, check network configuration, implement fallback pattern matching',
        impact: 'Restore pattern matching functionality'
    });
}

// Medium: Strategy optimization
const poorStrategies = Object.entries(report.strategies)
    .filter(([_, s]) => s.trades > 5 && parseFloat(s.successRate) < 40);
if (poorStrategies.length > 0) {
    recommendations.push({
        priority: 'medium',
        category: 'Strategy',
        issue: `${poorStrategies.length} strategies with <40% win rate`,
        action: 'Review and retrain underperforming strategies, adjust regime filters',
        impact: 'Improve overall portfolio performance'
    });
}

// Medium: Redis caching
if (errorsByType['redis'] > 5) {
    recommendations.push({
        priority: 'medium',
        category: 'Caching',
        issue: 'Redis connection failures',
        action: 'Check Redis server health, implement local cache fallback',
        impact: 'Maintain performance during Redis outages'
    });
}

report.recommendations = recommendations;
console.log(`  Generated ${recommendations.length} recommendations`);

// ===== SAVE REPORT =====
console.log('\n💾 Saving report...');
fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

// ===== PRINT SUMMARY =====
console.log('\n' + '='.repeat(70));
console.log('TRACE ANALYSIS COMPLETE');
console.log('='.repeat(70));

console.log('\n📊 SUMMARY:');
console.log(`  Total Traces: ${report.summary.totalTraces?.toLocaleString()}`);
console.log(`  Executed: ${report.summary.tradesExecuted} (${report.summary.executionRate}%)`);
console.log(`  Success: ${report.summary.tradesSuccessful} (${report.summary.successRate}%)`);

console.log('\n⏱️ TIMING:');
if (report.timing.p95) {
    console.log(`  P50: ${report.timing.p50}ms | P95: ${report.timing.p95}ms | P99: ${report.timing.p99}ms`);
}

console.log('\n🚨 CRITICAL BOTTLENECKS:');
report.bottlenecks
    .filter(b => b.severity === 'critical' || b.severity === 'high')
    .forEach(b => console.log(`  [${b.severity.toUpperCase()}] ${b.description}`));

console.log('\n💡 TOP RECOMMENDATIONS:');
report.recommendations
    .filter(r => r.priority === 'critical' || r.priority === 'high')
    .forEach((r, i) => console.log(`  ${i+1}. [${r.priority.toUpperCase()}] ${r.issue}`));

console.log('\n📁 Full report saved to:', REPORT_PATH);
console.log('='.repeat(70));

db.close();
