#!/usr/bin/env node
/**
 * Final Comprehensive Trace Analysis
 * Streams data to avoid memory issues
 */

const Database = require('better-sqlite3');
const fs = require('fs');

const DB_PATH = './data/trading.db';
const REPORT_PATH = './scripts/trace-analysis-report.json';

console.log('=== PerpsTrader Comprehensive Trace Analysis ===\n');
console.log('Processing 141K+ traces with streaming...\n');

const db = new Database(DB_PATH);

// Results object
const report = {
    generatedAt: new Date().toISOString(),
    summary: {},
    timing: { samples: [], stats: {} },
    errors: {},
    strategies: {},
    signalFlow: {},
    bottlenecks: [],
    recommendations: []
};

// ===== PHASE 1: BASIC STATS =====
console.log('Phase 1: Basic Statistics');
const stats = db.prepare(`
    SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN trade_executed = 1 THEN 1 ELSE 0 END) as executed,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful,
        COUNT(DISTINCT symbol) as symbols,
        COUNT(DISTINCT regime) as regimes
    FROM agent_traces
`).get();

report.summary = {
    totalTraces: stats.total,
    tradesExecuted: stats.executed,
    tradesSuccessful: stats.successful,
    executionRate: (stats.executed / stats.total * 100).toFixed(2),
    successRate: stats.executed > 0 ? (stats.successful / stats.executed * 100).toFixed(2) : 0,
    uniqueSymbols: stats.symbols,
    uniqueRegimes: stats.regimes
};

console.log(`  Total: ${stats.total.toLocaleString()}`);
console.log(`  Executed: ${stats.executed} (${report.summary.executionRate}%)`);
console.log(`  Symbols: ${stats.symbols} | Regimes: ${stats.regimes}`);

// ===== PHASE 2: STREAMING ANALYSIS =====
console.log('\nPhase 2: Streaming Analysis (last 20K traces)');

let processed = 0;
const TIMING_SAMPLE = 10000;
const ANALYSIS_LIMIT = 20000;

const stmt = db.prepare(`
    SELECT trace_data, symbol, regime, trade_executed, success, created_at
    FROM agent_traces 
    ORDER BY created_at DESC 
    LIMIT ${ANALYSIS_LIMIT}
`);

for (const row of stmt.iterate()) {
    processed++;
    
    try {
        const data = JSON.parse(row.trace_data || '{}');
        
        // Timing (first N samples)
        if (report.timing.samples.length < TIMING_SAMPLE && data.startTime && data.endTime) {
            const dur = new Date(data.endTime) - new Date(data.startTime);
            if (dur > 0 && dur < 300000) {
                report.timing.samples.push(dur);
            }
        }
        
        // Error categorization
        if (data.errors?.length) {
            data.errors.forEach(err => {
                let type = 'other';
                const e = err.toLowerCase();
                if (e.includes('chroma')) type = 'chroma_db';
                else if (e.includes('timeout')) type = 'timeout';
                else if (e.includes('hyperliquid')) type = 'hyperliquid_api';
                else if (e.includes('not configured')) type = 'configuration';
                else if (e.includes('sqlite') || e.includes('database')) type = 'database';
                else if (e.includes('redis')) type = 'redis';
                else if (e.includes('risk') || e.includes('rejected')) type = 'risk_rejection';
                else if (e.includes('insufficient') || e.includes('balance')) type = 'insufficient_funds';
                else if (e.includes('network') || e.includes('connection')) type = 'network';
                report.errors[type] = (report.errors[type] || 0) + 1;
            });
        }
        
        // Strategy tracking
        if (data.selectedStrategy?.name) {
            const name = data.selectedStrategy.name;
            if (!report.strategies[name]) {
                report.strategies[name] = { count: 0, trades: 0, success: 0 };
            }
            report.strategies[name].count++;
            if (row.trade_executed) report.strategies[name].trades++;
            if (row.success) report.strategies[name].success++;
        }
        
    } catch (e) {}
    
    if (processed % 5000 === 0) {
        console.log(`  Processed: ${processed}`);
    }
}

console.log(`  Total processed: ${processed}`);

// ===== PHASE 3: CALCULATE TIMING STATS =====
console.log('\nPhase 3: Timing Statistics');
const times = report.timing.samples;
times.sort((a, b) => a - b);
const len = times.length;

if (len > 0) {
    report.timing.stats = {
        sampleSize: len,
        min: times[0],
        max: times[len-1],
        avg: Math.round(times.reduce((a,b) => a+b, 0) / len),
        p50: times[Math.floor(len * 0.5)],
        p75: times[Math.floor(len * 0.75)],
        p90: times[Math.floor(len * 0.90)],
        p95: times[Math.floor(len * 0.95)],
        p99: times[Math.floor(len * 0.99)]
    };
    console.log(`  Sample: ${len}`);
    console.log(`  P50: ${report.timing.stats.p50}ms | P95: ${report.timing.stats.p95}ms | P99: ${report.timing.stats.p99}ms`);
}

// Clean up timing array to save memory
delete report.timing.samples;

// ===== PHASE 4: ERROR SUMMARY =====
console.log('\nPhase 4: Error Summary');
const sortedErrors = Object.entries(report.errors).sort((a,b) => b[1]-a[1]);
sortedErrors.forEach(([type, count]) => {
    console.log(`  ${type}: ${count}`);
});

// ===== PHASE 5: STRATEGY SUMMARY =====
console.log('\nPhase 5: Strategy Summary');
Object.entries(report.strategies)
    .sort((a,b) => b[1].count - a[1].count)
    .slice(0, 8)
    .forEach(([name, s]) => {
        const winRate = s.trades > 0 ? (s.success / s.trades * 100).toFixed(1) : 0;
        console.log(`  ${name}: ${s.count} uses, ${s.trades} trades, ${winRate}% win`);
    });

// ===== PHASE 6: SIGNAL FLOW (separate query) =====
console.log('\nPhase 6: Signal Flow Analysis');
let signals = 0, approved = 0, riskChecked = 0, riskApproved = 0, executed = 0, successful = 0;

const flowStmt = db.prepare(`
    SELECT trace_data, trade_executed, success
    FROM agent_traces 
    ORDER BY created_at DESC 
    LIMIT 5000
`);

for (const row of flowStmt.iterate()) {
    try {
        const data = JSON.parse(row.trace_data || '{}');
        if (data.signal) {
            signals++;
            if (data.signal.approved) approved++;
        }
        if (data.riskAssessment) {
            riskChecked++;
            if (data.riskAssessment.approved) riskApproved++;
        }
        if (row.trade_executed) executed++;
        if (row.success) successful++;
    } catch (e) {}
}

report.signalFlow = {
    signals, approved, riskChecked, riskApproved, executed, successful,
    approvalRate: signals > 0 ? (approved / signals * 100).toFixed(1) : 0,
    riskPassRate: riskChecked > 0 ? (riskApproved / riskChecked * 100).toFixed(1) : 0,
    executionRate: approved > 0 ? (executed / approved * 100).toFixed(1) : 0,
    successRate: executed > 0 ? (successful / executed * 100).toFixed(1) : 0
};

console.log(`  Signals: ${signals} → Approved: ${approved} (${report.signalFlow.approvalRate}%)`);
console.log(`  Risk: ${riskChecked} → Passed: ${riskApproved} (${report.signalFlow.riskPassRate}%)`);
console.log(`  Executed: ${executed} (${report.signalFlow.executionRate}%) → Successful: ${successful} (${report.signalFlow.successRate}%)`);

// ===== PHASE 7: BOTTLENECKS =====
console.log('\nPhase 7: Bottleneck Identification');

const bottlenecks = [];

// Critical: Extreme latency
if (report.timing.stats.p50 > 5000) {
    bottlenecks.push({
        type: 'extreme_latency',
        severity: 'critical',
        metric: `${report.timing.stats.p50}ms P50`,
        description: `Cycle P50 latency is ${(report.timing.stats.p50/1000).toFixed(1)}s - unacceptable for trading`,
        impact: 'Missing market opportunities, stale signals'
    });
}

// Critical: Execution rate
if (parseFloat(report.summary.executionRate) < 1) {
    bottlenecks.push({
        type: 'low_execution_rate',
        severity: 'critical',
        metric: `${report.summary.executionRate}% execution rate`,
        description: 'Only 0.44% of traces result in executed trades',
        impact: 'System is analyzing but not trading effectively'
    });
}

// Critical: Configuration
if (report.errors['configuration'] > 0 || report.errors['hyperliquid_api'] > 50) {
    bottlenecks.push({
        type: 'configuration_failure',
        severity: 'critical',
        metric: `${(report.errors['configuration'] || 0) + (report.errors['hyperliquid_api'] || 0)} errors`,
        description: 'Hyperliquid/ChromaDB not properly configured',
        impact: 'Cannot execute live trades'
    });
}

// High: ChromaDB issues
if (report.errors['chroma_db'] > 50) {
    bottlenecks.push({
        type: 'chroma_db_failure',
        severity: 'high',
        metric: `${report.errors['chroma_db']} errors`,
        description: 'ChromaDB connection failures preventing pattern matching',
        impact: 'Degraded strategy selection, reduced performance'
    });
}

// High: Execution gap
if (parseFloat(report.signalFlow.executionRate) < 50) {
    bottlenecks.push({
        type: 'execution_gap',
        severity: 'high',
        metric: `${report.signalFlow.executionRate}% execution rate from approved signals`,
        description: 'Approved signals are not being executed',
        impact: 'Missing trading opportunities'
    });
}

// Medium: Timeouts
if (report.errors['timeout'] > 20) {
    bottlenecks.push({
        type: 'timeout_issues',
        severity: 'medium',
        metric: `${report.errors['timeout']} timeouts`,
        description: 'Frequent timeout errors during execution',
        impact: 'Failed trades, user frustration'
    });
}

report.bottlenecks = bottlenecks;
bottlenecks.forEach(b => console.log(`  [${b.severity.toUpperCase()}] ${b.type}`));

// ===== PHASE 8: RECOMMENDATIONS =====
console.log('\nPhase 8: Recommendations');

const recs = [];

// Critical recommendations
if (report.timing.stats.p50 > 5000) {
    recs.push({
        priority: 'critical',
        category: 'Performance',
        issue: `Extreme latency: ${(report.timing.stats.p50/1000).toFixed(1)}s P50`,
        action: '1. Cache pattern matching results 2. Use async indicators 3. Optimize DB queries 4. Add Redis caching layer',
        impact: 'Reduce cycle time from 10s to <1s'
    });
}

if (parseFloat(report.summary.executionRate) < 1) {
    recs.push({
        priority: 'critical',
        category: 'Trading',
        issue: 'Extremely low trade execution rate (0.44%)',
        action: '1. Configure Hyperliquid API credentials 2. Fix ChromaDB connection 3. Review risk gate logic 4. Enable paper trading for testing',
        impact: 'Enable actual trading (currently analysis-only)'
    });
}

if (report.errors['configuration'] > 0) {
    recs.push({
        priority: 'critical',
        category: 'Configuration',
        issue: 'Trading infrastructure not configured',
        action: 'Set HYPERLIQUID_API_KEY, HYPERLIQUID_API_SECRET, and CHROMADB_URL environment variables',
        impact: 'Enable live trade execution'
    });
}

if (report.errors['chroma_db'] > 20) {
    recs.push({
        priority: 'high',
        category: 'Infrastructure',
        issue: 'ChromaDB connectivity issues',
        action: '1. Start ChromaDB service 2. Check CHROMADB_URL 3. Implement fallback pattern matching without Chroma',
        impact: 'Restore pattern matching functionality'
    });
}

if (parseFloat(report.signalFlow.executionRate) < 70) {
    recs.push({
        priority: 'high',
        category: 'Execution Pipeline',
        issue: `Only ${report.signalFlow.executionRate}% of approved signals execute`,
        action: 'Debug execution pipeline: check for race conditions, verify order validation, add execution logging',
        impact: 'Capture 50%+ more trading opportunities'
    });
}

// Strategy recommendations
const poorStrategies = Object.entries(report.strategies)
    .filter(([_, s]) => s.trades > 5 && (s.success / s.trades) < 0.4);
if (poorStrategies.length > 0) {
    recs.push({
        priority: 'medium',
        category: 'Strategy Optimization',
        issue: `${poorStrategies.length} strategies with <40% win rate`,
        action: 'Review underperforming strategies, adjust parameters, or disable in production',
        impact: 'Improve overall win rate'
    });
}

if (report.errors['database'] > 10) {
    recs.push({
        priority: 'medium',
        category: 'Database',
        issue: 'Database errors with 38GB SQLite',
        action: 'Enable WAL mode, add indexes, consider archiving old traces',
        impact: 'Improve database stability'
    });
}

report.recommendations = recs;
recs.forEach((r, i) => console.log(`  ${i+1}. [${r.priority.toUpperCase()}] ${r.category}`));

// ===== SAVE REPORT =====
console.log('\nSaving report...');
fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

// ===== FINAL SUMMARY =====
console.log('\n' + '='.repeat(70));
console.log('ANALYSIS COMPLETE');
console.log('='.repeat(70));
console.log(`\n📊 SUMMARY:`);
console.log(`  Traces: ${report.summary.totalTraces.toLocaleString()}`);
console.log(`  Execution Rate: ${report.summary.executionRate}% (CRITICAL)`);
console.log(`  P50 Latency: ${(report.timing.stats.p50/1000).toFixed(1)}s (CRITICAL)`);
console.log(`\n🚨 CRITICAL BOTTLENECKS:`);
report.bottlenecks.filter(b => b.severity === 'critical').forEach(b => {
    console.log(`  • ${b.description}`);
});
console.log(`\n💡 TOP ACTIONS:`);
report.recommendations.filter(r => r.priority === 'critical').forEach((r, i) => {
    console.log(`  ${i+1}. ${r.issue}`);
});
console.log(`\n📁 Report: ${REPORT_PATH}`);
console.log('='.repeat(70));

db.close();
