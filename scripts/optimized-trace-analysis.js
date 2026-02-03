/**
 * Optimized Trace Analysis for PerpsTrader
 * Fast analysis using chunked queries and sampling for large datasets
 */

const Database = require('better-sqlite3');
const fs = require('fs');

const DB_PATH = './data/trading.db';
const REPORT_PATH = './scripts/trace-analysis-report.json';

class FastTraceAnalyzer {
    constructor() {
        this.db = new Database(DB_PATH);
        this.report = {
            generatedAt: new Date().toISOString(),
            summary: {},
            timing: {},
            strategies: {},
            failures: { total: 0, byType: {}, patterns: [] },
            riskGates: { total: 0, approved: 0, rejected: 0, byReason: {} },
            apiFailures: { hyperliquid: 0, database: 0, redis: 0 },
            signalFlow: {},
            bottlenecks: [],
            recommendations: []
        };
        this.errorsByType = {};
    }

    analyze() {
        console.log('=== Optimized Trace Analysis ===\n');
        
        this.analyzeSummary();
        this.analyzeRecentTraces();
        this.analyzeErrors();
        this.analyzeSignalFlow();
        this.analyzeTiming();
        this.analyzeStrategies();
        this.identifyBottlenecks();
        this.generateRecommendations();
        this.saveReport();
        this.printSummary();
        
        this.db.close();
        console.log(`\n✅ Report saved to: ${REPORT_PATH}`);
    }

    analyzeSummary() {
        console.log('📊 Database Summary');
        
        const stats = this.db.prepare(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN trade_executed = 1 THEN 1 ELSE 0 END) as executed,
                SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful,
                COUNT(DISTINCT symbol) as symbols,
                COUNT(DISTINCT regime) as regimes,
                AVG(strategy_count) as avgStrategies,
                MIN(created_at) as minDate,
                MAX(created_at) as maxDate
            FROM agent_traces
        `).get();
        
        this.report.summary = {
            totalTraces: stats.total,
            tradesExecuted: stats.executed,
            tradesSuccessful: stats.successful,
            executionRate: ((stats.executed / stats.total) * 100).toFixed(2),
            successRate: stats.executed > 0 ? ((stats.successful / stats.executed) * 100).toFixed(2) : 0,
            symbols: stats.symbols,
            regimes: stats.regimes,
            avgStrategies: stats.avgStrategies?.toFixed(2),
            dateRange: { from: stats.minDate, to: stats.maxDate }
        };
        
        console.log(`  Total: ${stats.total.toLocaleString()} traces`);
        console.log(`  Executed: ${stats.executed.toLocaleString()} (${this.report.summary.executionRate}%)`);
        console.log(`  Success: ${stats.successful.toLocaleString()} (${this.report.summary.successRate}%)`);
        console.log(`  Date range: ${stats.minDate} to ${stats.maxDate}`);
    }

    analyzeRecentTraces() {
        console.log('\n🔍 Analyzing Recent Trace Data (last 10K for detailed inspection)');
        
        const traces = this.db.prepare(`
            SELECT trace_data, symbol, created_at, trade_executed, success, regime
            FROM agent_traces 
            ORDER BY created_at DESC 
            LIMIT 10000
        `).all();
        
        let processed = 0;
        let hasStrategy = 0;
        let hasSignal = 0;
        let hasRisk = 0;
        let hasExecution = 0;
        let errorsFound = 0;
        
        const strategies = {};
        const thoughts = [];
        
        for (const row of traces) {
            try {
                const data = JSON.parse(row.trace_data || '{}');
                processed++;
                
                if (data.selectedStrategy) hasStrategy++;
                if (data.signal) hasSignal++;
                if (data.riskAssessment) hasRisk++;
                if (data.executionResult) hasExecution++;
                if (data.errors?.length) errorsFound += data.errors.length;
                
                // Strategy tracking
                if (data.selectedStrategy?.name) {
                    const name = data.selectedStrategy.name;
                    if (!strategies[name]) {
                        strategies[name] = { count: 0, trades: 0, success: 0, pnls: [] };
                    }
                    strategies[name].count++;
                    if (row.trade_executed) strategies[name].trades++;
                    if (row.success) strategies[name].success++;
                    if (data.executionResult?.pnl !== undefined) {
                        strategies[name].pnls.push(data.executionResult.pnl);
                    }
                }
                
                // Collect thoughts for pattern analysis
                if (data.thoughts?.length) {
                    thoughts.push(...data.thoughts.slice(-2));
                }
                
                // Error categorization
                if (data.errors?.length) {
                    data.errors.forEach(err => this.categorizeError(err, row));
                }
                
            } catch (e) {
                this.errorsByType['json_parse'] = (this.errorsByType['json_parse'] || 0) + 1;
            }
        }
        
        // Store strategy stats
        Object.entries(strategies).forEach(([name, s]) => {
            this.report.strategies[name] = {
                count: s.count,
                trades: s.trades,
                successRate: s.trades > 0 ? (s.success / s.trades * 100).toFixed(1) : 0,
                avgPnL: s.pnls.length > 0 ? (s.pnls.reduce((a,b)=>a+b,0) / s.pnls.length).toFixed(4) : 0
            };
        });
        
        // Analyze thoughts for patterns
        const thoughtPatterns = this.analyzeThoughts(thoughts);
        
        console.log(`  Processed: ${processed} traces`);
        console.log(`  With strategy: ${hasStrategy} (${(hasStrategy/processed*100).toFixed(1)}%)`);
        console.log(`  With signal: ${hasSignal} (${(hasSignal/processed*100).toFixed(1)}%)`);
        console.log(`  With risk: ${hasRisk} (${(hasRisk/processed*100).toFixed(1)}%)`);
        console.log(`  With execution: ${hasExecution} (${(hasExecution/processed*100).toFixed(1)}%)`);
        console.log(`  Errors found: ${errorsFound}`);
        console.log(`  Unique strategies: ${Object.keys(strategies).length}`);
        
        this.report.recentAnalysis = {
            sampleSize: processed,
            hasStrategy: hasStrategy,
            hasSignal: hasSignal,
            hasRisk: hasRisk,
            hasExecution: hasExecution,
            errorsFound: errorsFound,
            thoughtPatterns
        };
    }

    categorizeError(error, row) {
        let category = 'other';
        const err = error.toLowerCase();
        
        if (err.includes('timeout')) category = 'timeout';
        else if (err.includes('hyperliquid')) category = 'hyperliquid_api';
        else if (err.includes('database') || err.includes('sqlite')) category = 'database';
        else if (err.includes('redis')) category = 'redis';
        else if (err.includes('risk') || err.includes('rejected')) category = 'risk_gate';
        else if (err.includes('insufficient') || err.includes('balance') || err.includes('margin')) category = 'funds';
        else if (err.includes('network') || err.includes('connection') || err.includes('econnrefused')) category = 'network';
        else if (err.includes('rate limit') || err.includes('429')) category = 'rate_limit';
        
        this.errorsByType[category] = (this.errorsByType[category] || 0) + 1;
        
        // Track API failures specifically
        if (category === 'hyperliquid_api') this.report.apiFailures.hyperliquid++;
        if (category === 'database') this.report.apiFailures.database++;
        if (category === 'redis') this.report.apiFailures.redis++;
    }

    analyzeThoughts(thoughts) {
        const patterns = {
            'No actionable': 0,
            'Risk rejected': 0,
            'Timeout': 0,
            'Pattern matched': 0,
            'Regime detected': 0,
            'Sharpe ratio': 0,
            'WinRate': 0,
            'Backtest': 0,
            'Signal generated': 0,
            'Execution failed': 0
        };
        
        thoughts.forEach(t => {
            if (t.includes('No actionable')) patterns['No actionable']++;
            if (t.includes('risk') && t.includes('reject')) patterns['Risk rejected']++;
            if (t.includes('timeout') || t.includes('Timeout')) patterns['Timeout']++;
            if (t.includes('pattern') || t.includes('Pattern')) patterns['Pattern matched']++;
            if (t.includes('regime') || t.includes('Regime')) patterns['Regime detected']++;
            if (t.includes('Sharpe')) patterns['Sharpe ratio']++;
            if (t.includes('WinRate') || t.includes('win rate')) patterns['WinRate']++;
            if (t.includes('backtest') || t.includes('Backtest')) patterns['Backtest']++;
            if (t.includes('signal') || t.includes('Signal')) patterns['Signal generated']++;
            if (t.includes('execution') && (t.includes('fail') || t.includes('error'))) patterns['Execution failed']++;
        });
        
        return Object.entries(patterns)
            .filter(([_, c]) => c > 0)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);
    }

    analyzeErrors() {
        console.log('\n❌ Error Analysis');
        
        this.report.failures.byType = this.errorsByType;
        this.report.failures.total = Object.values(this.errorsByType).reduce((a,b) => a+b, 0);
        
        console.log(`  Total error instances: ${this.report.failures.total}`);
        Object.entries(this.errorsByType)
            .sort((a, b) => b[1] - a[1])
            .forEach(([type, count]) => {
                console.log(`    ${type}: ${count}`);
            });
    }

    analyzeSignalFlow() {
        console.log('\n📈 Signal Flow Analysis');
        
        // Sample recent traces for signal flow
        const traces = this.db.prepare(`
            SELECT trace_data, trade_executed, success
            FROM agent_traces 
            WHERE created_at > datetime('now', '-7 days')
        `).all();
        
        let flow = {
            generated: 0,
            approved: 0,
            riskChecked: 0,
            riskApproved: 0,
            executed: 0,
            successful: 0
        };
        
        for (const row of traces) {
            try {
                const data = JSON.parse(row.trace_data || '{}');
                
                if (data.signal) {
                    flow.generated++;
                    if (data.signal.approved) flow.approved++;
                }
                
                if (data.riskAssessment) {
                    flow.riskChecked++;
                    if (data.riskAssessment.approved) {
                        flow.riskApproved++;
                    } else {
                        const reason = data.riskAssessment.reason || 'unknown';
                        this.report.riskGates.byReason[reason] = (this.report.riskGates.byReason[reason] || 0) + 1;
                    }
                }
                
                if (row.trade_executed) flow.executed++;
                if (row.success) flow.successful++;
                
            } catch (e) {}
        }
        
        this.report.signalFlow = flow;
        this.report.riskGates.total = flow.riskChecked;
        this.report.riskGates.approved = flow.riskApproved;
        this.report.riskGates.rejected = flow.riskChecked - flow.riskApproved;
        
        console.log(`  Signals generated: ${flow.generated}`);
        console.log(`  Signals approved: ${flow.approved} (${flow.generated > 0 ? (flow.approved/flow.generated*100).toFixed(1) : 0}%)`);
        console.log(`  Risk checked: ${flow.riskChecked}`);
        console.log(`  Risk approved: ${flow.riskApproved} (${flow.riskChecked > 0 ? (flow.riskApproved/flow.riskChecked*100).toFixed(1) : 0}%)`);
        console.log(`  Executed: ${flow.executed}`);
        console.log(`  Successful: ${flow.successful} (${flow.executed > 0 ? (flow.successful/flow.executed*100).toFixed(1) : 0}%)`);
    }

    analyzeTiming() {
        console.log('\n⏱️ Timing Analysis');
        
        // Sample traces with timing data
        const traces = this.db.prepare(`
            SELECT trace_data
            FROM agent_traces 
            WHERE trace_data LIKE '%startTime%' AND trace_data LIKE '%endTime%'
            ORDER BY RANDOM()
            LIMIT 5000
        `).all();
        
        const durations = [];
        
        for (const row of traces) {
            try {
                const data = JSON.parse(row.trace_data);
                if (data.startTime && data.endTime) {
                    const start = new Date(data.startTime).getTime();
                    const end = new Date(data.endTime).getTime();
                    const duration = end - start;
                    
                    if (duration > 0 && duration < 300000) { // < 5 min
                        durations.push(duration);
                    }
                }
            } catch (e) {}
        }
        
        if (durations.length > 0) {
            durations.sort((a, b) => a - b);
            const len = durations.length;
            
            this.report.timing = {
                sampleSize: len,
                min: durations[0],
                max: durations[len-1],
                avg: (durations.reduce((a,b) => a+b, 0) / len).toFixed(0),
                p50: durations[Math.floor(len * 0.5)].toFixed(0),
                p75: durations[Math.floor(len * 0.75)].toFixed(0),
                p90: durations[Math.floor(len * 0.90)].toFixed(0),
                p95: durations[Math.floor(len * 0.95)].toFixed(0),
                p99: durations[Math.floor(len * 0.99)].toFixed(0)
            };
            
            console.log(`  Sample size: ${len} traces`);
            console.log(`  Min: ${this.report.timing.min}ms`);
            console.log(`  Avg: ${this.report.timing.avg}ms`);
            console.log(`  P50: ${this.report.timing.p50}ms`);
            console.log(`  P95: ${this.report.timing.p95}ms`);
            console.log(`  P99: ${this.report.timing.p99}ms`);
            console.log(`  Max: ${this.report.timing.max}ms`);
        }
    }

    analyzeStrategies() {
        console.log('\n🎯 Strategy Performance');
        
        const strategies = Object.entries(this.report.strategies)
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, 10);
        
        console.log('  Top 10 strategies by usage:');
        strategies.forEach(([name, s]) => {
            console.log(`    ${name}: ${s.count} uses, ${s.trades} trades, ${s.successRate}% win, avg PnL: ${s.avgPnL}`);
        });
    }

    identifyBottlenecks() {
        console.log('\n🚨 Bottleneck Identification');
        
        const bottlenecks = [];
        
        // 1. Timing bottlenecks
        if (this.report.timing.p95 > 2000) {
            bottlenecks.push({
                type: 'latency',
                severity: this.report.timing.p95 > 5000 ? 'critical' : 'high',
                value: this.report.timing.p95,
                description: `P95 latency is ${this.report.timing.p95}ms (target: <1000ms)`
            });
        }
        
        // 2. Error bottlenecks
        const topError = Object.entries(this.errorsByType).sort((a,b) => b[1]-a[1])[0];
        if (topError && topError[1] > 10) {
            bottlenecks.push({
                type: 'errors',
                severity: topError[1] > 100 ? 'critical' : 'high',
                value: topError[1],
                description: `Most common error: "${topError[0]}" (${topError[1]} instances)`
            });
        }
        
        // 3. Signal funnel bottlenecks
        const flow = this.report.signalFlow;
        if (flow.generated > 0) {
            const approvalRate = flow.approved / flow.generated;
            const executionRate = flow.approved > 0 ? flow.executed / flow.approved : 0;
            
            if (approvalRate < 0.5) {
                bottlenecks.push({
                    type: 'signal_approval',
                    severity: 'medium',
                    value: approvalRate,
                    description: `Only ${(approvalRate*100).toFixed(1)}% of signals are approved`
                });
            }
            
            if (executionRate < 0.7) {
                bottlenecks.push({
                    type: 'signal_execution',
                    severity: 'high',
                    value: executionRate,
                    description: `Only ${(executionRate*100).toFixed(1)}% of approved signals are executed`
                });
            }
        }
        
        // 4. Risk gate bottlenecks
        if (this.report.riskGates.total > 0) {
            const rejectionRate = this.report.riskGates.rejected / this.report.riskGates.total;
            if (rejectionRate > 0.5) {
                const topReason = Object.entries(this.report.riskGates.byReason).sort((a,b) => b[1]-a[1])[0];
                bottlenecks.push({
                    type: 'risk_gate',
                    severity: rejectionRate > 0.8 ? 'high' : 'medium',
                    value: rejectionRate,
                    description: `Risk gate rejects ${(rejectionRate*100).toFixed(1)}% - top reason: ${topReason?.[0] || 'unknown'}`
                });
            }
        }
        
        // 5. API failures
        const totalApiErrors = this.report.apiFailures.hyperliquid + 
                              this.report.apiFailures.database + 
                              this.report.apiFailures.redis;
        if (totalApiErrors > 20) {
            bottlenecks.push({
                type: 'api_failures',
                severity: totalApiErrors > 100 ? 'critical' : 'high',
                value: totalApiErrors,
                description: `Total API failures: HL=${this.report.apiFailures.hyperliquid}, DB=${this.report.apiFailures.database}, Redis=${this.report.apiFailures.redis}`
            });
        }
        
        this.report.bottlenecks = bottlenecks;
        console.log(`  Identified ${bottlenecks.length} bottlenecks`);
    }

    generateRecommendations() {
        console.log('\n💡 Generating Recommendations');
        
        const recs = [];
        
        // Latency recommendations
        if (this.report.timing.p95 > 2000) {
            recs.push({
                priority: 'critical',
                category: 'Performance',
                issue: `High P95 latency (${this.report.timing.p95}ms)`,
                recommendation: 'Implement async indicator calculations, cache pattern matching results, optimize database queries',
                impact: 'Reduce cycle time by 40-60%'
            });
        }
        
        // Error recommendations
        const topError = Object.entries(this.errorsByType).sort((a,b) => b[1]-a[1])[0];
        if (topError) {
            if (topError[0] === 'timeout') {
                recs.push({
                    priority: 'critical',
                    category: 'Reliability',
                    issue: `Frequent timeouts (${topError[1]} instances)`,
                    recommendation: 'Increase API timeouts, implement circuit breaker, add request queuing',
                    impact: 'Prevent trade execution failures'
                });
            }
            if (topError[0] === 'hyperliquid_api') {
                recs.push({
                    priority: 'high',
                    category: 'API Integration',
                    issue: 'Hyperliquid API failures',
                    recommendation: 'Add retry logic with exponential backoff, implement order state verification',
                    impact: 'Reduce failed trades by 50%+'
                });
            }
            if (topError[0] === 'database') {
                recs.push({
                    priority: 'high',
                    category: 'Database',
                    issue: 'Database errors',
                    recommendation: 'Enable WAL mode, add connection pooling, optimize indexes on agent_traces',
                    impact: 'Improve stability with 38GB database'
                });
            }
        }
        
        // Signal flow recommendations
        const flow = this.report.signalFlow;
        if (flow.approved > 0 && flow.executed / flow.approved < 0.7) {
            recs.push({
                priority: 'high',
                category: 'Execution',
                issue: 'Approved signals not being executed',
                recommendation: 'Review execution logic between risk approval and trade execution, check for race conditions',
                impact: 'Capture more trading opportunities'
            });
        }
        
        // Risk gate recommendations
        if (this.report.riskGates.total > 0) {
            const rate = this.report.riskGates.rejected / this.report.riskGates.total;
            if (rate > 0.7) {
                recs.push({
                    priority: 'medium',
                    category: 'Risk Management',
                    issue: `Conservative risk settings (${(rate*100).toFixed(0)}% rejection)`,
                    recommendation: 'Review risk thresholds, may be filtering profitable opportunities',
                    impact: 'Better risk/reward balance'
                });
            }
        }
        
        // Strategy recommendations
        const poorStrategies = Object.entries(this.report.strategies)
            .filter(([_, s]) => s.trades > 5 && parseFloat(s.successRate) < 30);
        if (poorStrategies.length > 0) {
            recs.push({
                priority: 'medium',
                category: 'Strategy',
                issue: `${poorStrategies.length} underperforming strategies`,
                recommendation: 'Disable strategies with <30% win rate after 5+ trades, retrain models',
                impact: 'Improve overall portfolio performance'
            });
        }
        
        this.report.recommendations = recs.sort((a,b) => {
            const order = { critical: 0, high: 1, medium: 2, low: 3 };
            return order[a.priority] - order[b.priority];
        });
        
        console.log(`  Generated ${recs.length} recommendations`);
    }

    saveReport() {
        fs.writeFileSync(REPORT_PATH, JSON.stringify(this.report, null, 2));
    }

    printSummary() {
        console.log('\n' + '='.repeat(60));
        console.log('ANALYSIS COMPLETE');
        console.log('='.repeat(60));
        
        console.log('\n📊 OVERVIEW:');
        console.log(`  Traces: ${this.report.summary.totalTraces?.toLocaleString()}`);
        console.log(`  Execution: ${this.report.summary.executionRate}% | Success: ${this.report.summary.successRate}%`);
        
        console.log('\n⏱️ TIMING:');
        if (this.report.timing.p50) {
            console.log(`  P50: ${this.report.timing.p50}ms | P95: ${this.report.timing.p95}ms | P99: ${this.report.timing.p99}ms`);
        }
        
        console.log('\n🚨 TOP BOTTLENECKS:');
        this.report.bottlenecks.slice(0, 5).forEach(b => {
            console.log(`  [${b.severity.toUpperCase()}] ${b.description}`);
        });
        
        console.log('\n💡 TOP RECOMMENDATIONS:');
        this.report.recommendations.slice(0, 5).forEach((r, i) => {
            console.log(`  ${i+1}. [${r.priority.toUpperCase()}] ${r.issue}`);
        });
        
        console.log('\n' + '='.repeat(60));
    }
}

// Run
new FastTraceAnalyzer().analyze();
