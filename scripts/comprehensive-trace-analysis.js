/**
 * Comprehensive Trace Analysis for PerpsTrader
 * Analyzes all traces to extract optimization insights
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

// Configuration
const DB_PATH = './data/trading.db';
const REPORT_PATH = './scripts/trace-analysis-report.json';
const CHUNK_SIZE = 5000; // Process in chunks to handle 38GB database

class TraceAnalyzer {
    constructor() {
        this.db = new Database(DB_PATH);
        this.report = {
            generatedAt: new Date().toISOString(),
            summary: {},
            timing: {
                overallLatency: [],
                byStage: {},
                percentiles: {}
            },
            strategies: {},
            failures: {
                total: 0,
                byType: {},
                byStage: {},
                patterns: []
            },
            riskGates: {
                total: 0,
                approved: 0,
                rejected: 0,
                byReason: {}
            },
            apiFailures: {
                hyperliquid: { count: 0, errors: [] },
                database: { count: 0, errors: [] },
                redis: { count: 0, errors: [] }
            },
            signalFlow: {
                generated: 0,
                approved: 0,
                riskChecked: 0,
                riskApproved: 0,
                executed: 0,
                successful: 0
            },
            bottlenecks: [],
            recommendations: []
        };
        
        this.timingData = [];
        this.errorsByType = {};
        this.stageTiming = {
            'cycle-start': [],
            'indicator-calc': [],
            'pattern-match': [],
            'strategy-selection': [],
            'backtest': [],
            'signal-generation': [],
            'risk-assessment': [],
            'execution': [],
            'completion': []
        };
    }

    analyze() {
        console.log('=== PerpsTrader Comprehensive Trace Analysis ===\n');
        console.log('Starting analysis of 141K+ traces...\n');
        
        // Get total count
        const totalTraces = this.db.prepare('SELECT COUNT(*) as c FROM agent_traces').get().c;
        console.log(`Total traces to analyze: ${totalTraces.toLocaleString()}`);
        
        // Phase 1: High-level summary
        this.analyzeSummary();
        
        // Phase 2: Process all traces in chunks
        this.processAllTraces();
        
        // Phase 3: Calculate statistics
        this.calculateStatistics();
        
        // Phase 4: Identify patterns and bottlenecks
        this.identifyBottlenecks();
        
        // Phase 5: Generate recommendations
        this.generateRecommendations();
        
        // Phase 6: Save report
        this.saveReport();
        
        // Print summary
        this.printSummary();
        
        this.db.close();
        console.log(`\n✅ Analysis complete. Report saved to: ${REPORT_PATH}`);
    }

    analyzeSummary() {
        console.log('\n📊 Phase 1: High-Level Summary');
        
        // Basic counts
        const stats = this.db.prepare(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN trade_executed = 1 THEN 1 ELSE 0 END) as executed,
                SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful,
                SUM(CASE WHEN analyzed = 1 THEN 1 ELSE 0 END) as analyzed,
                COUNT(DISTINCT symbol) as uniqueSymbols,
                COUNT(DISTINCT regime) as uniqueRegimes,
                AVG(strategy_count) as avgStrategies,
                AVG(risk_score) as avgRiskScore
            FROM agent_traces
        `).get();
        
        this.report.summary = {
            totalTraces: stats.total,
            tradesExecuted: stats.executed,
            tradesSuccessful: stats.successful,
            executionRate: ((stats.executed / stats.total) * 100).toFixed(2),
            successRate: stats.executed > 0 ? ((stats.successful / stats.executed) * 100).toFixed(2) : 0,
            uniqueSymbols: stats.uniqueSymbols,
            uniqueRegimes: stats.uniqueRegimes,
            avgStrategiesPerTrace: stats.avgStrategies?.toFixed(2) || 0,
            avgRiskScore: stats.avgRiskScore?.toFixed(4) || 0
        };
        
        console.log(`  Total traces: ${stats.total.toLocaleString()}`);
        console.log(`  Trades executed: ${stats.executed.toLocaleString()} (${this.report.summary.executionRate}%)`);
        console.log(`  Successful trades: ${stats.successful.toLocaleString()} (${this.report.summary.successRate}%)`);
        console.log(`  Unique symbols: ${stats.uniqueSymbols}`);
        console.log(`  Unique regimes: ${stats.uniqueRegimes}`);
    }

    processAllTraces() {
        console.log('\n🔍 Phase 2: Processing All Traces');
        
        const total = this.db.prepare('SELECT COUNT(*) as c FROM agent_traces').get().c;
        let processed = 0;
        let lastPercent = 0;
        
        // Process in streaming fashion
        const stmt = this.db.prepare('SELECT * FROM agent_traces ORDER BY created_at');
        
        for (const row of stmt.iterate()) {
            this.processTrace(row);
            processed++;
            
            const percent = Math.floor((processed / total) * 100);
            if (percent > lastPercent && percent % 10 === 0) {
                console.log(`  Progress: ${percent}% (${processed.toLocaleString()} traces)`);
                lastPercent = percent;
            }
        }
        
        console.log(`  Processed: ${processed.toLocaleString()} traces`);
    }

    processTrace(row) {
        try {
            const traceData = row.trace_data ? JSON.parse(row.trace_data) : {};
            
            // 1. Timing analysis
            this.analyzeTiming(row, traceData);
            
            // 2. Strategy tracking
            this.analyzeStrategy(row, traceData);
            
            // 3. Error and failure analysis
            this.analyzeErrors(row, traceData);
            
            // 4. Signal flow tracking
            this.analyzeSignalFlow(row, traceData);
            
            // 5. Risk gate analysis
            this.analyzeRiskGates(row, traceData);
            
            // 6. API failure detection
            this.analyzeApiFailures(row, traceData);
            
        } catch (e) {
            // Track JSON parse errors
            this.errorsByType['json_parse_error'] = (this.errorsByType['json_parse_error'] || 0) + 1;
        }
    }

    analyzeTiming(row, traceData) {
        // Calculate cycle duration
        if (traceData.startTime && traceData.endTime) {
            const start = new Date(traceData.startTime).getTime();
            const end = new Date(traceData.endTime).getTime();
            const duration = end - start;
            
            if (duration > 0 && duration < 300000) { // Filter out anomalies > 5 minutes
                this.timingData.push({
                    duration,
                    symbol: row.symbol,
                    regime: row.regime,
                    tradeExecuted: row.trade_executed,
                    success: row.success,
                    hasStrategy: !!traceData.selectedStrategy,
                    hasSignal: !!traceData.signal,
                    timestamp: row.created_at
                });
            }
        }
    }

    analyzeStrategy(row, traceData) {
        if (traceData.selectedStrategy) {
            const name = traceData.selectedStrategy.name || 'Unknown';
            const type = traceData.selectedStrategy.type || 'Unknown';
            
            if (!this.report.strategies[name]) {
                this.report.strategies[name] = {
                    count: 0,
                    trades: 0,
                    successful: 0,
                    type: type,
                    avgPnL: [],
                    regimes: {}
                };
            }
            
            const strat = this.report.strategies[name];
            strat.count++;
            strat.regimes[row.regime || 'unknown'] = (strat.regimes[row.regime || 'unknown'] || 0) + 1;
            
            if (row.trade_executed) {
                strat.trades++;
                if (row.success) strat.successful++;
            }
            
            if (traceData.executionResult?.pnl !== undefined) {
                strat.avgPnL.push(traceData.executionResult.pnl);
            }
        }
    }

    analyzeErrors(row, traceData) {
        if (traceData.errors && Array.isArray(traceData.errors)) {
            traceData.errors.forEach(error => {
                this.report.failures.total++;
                
                // Categorize errors
                let category = 'unknown';
                if (error.includes('timeout') || error.includes('Timeout')) category = 'timeout';
                else if (error.includes('API') || error.includes('api')) category = 'api_error';
                else if (error.includes('database') || error.includes('Database')) category = 'database_error';
                else if (error.includes('risk') || error.includes('Risk')) category = 'risk_rejection';
                else if (error.includes('insufficient') || error.includes('balance')) category = 'insufficient_funds';
                else if (error.includes('network') || error.includes('Network')) category = 'network_error';
                else if (error.includes('Redis') || error.includes('redis')) category = 'redis_error';
                
                this.errorsByType[category] = (this.errorsByType[category] || 0) + 1;
                
                // Store sample errors (max 10 per type)
                if (this.report.failures.patterns.filter(p => p.type === category).length < 10) {
                    this.report.failures.patterns.push({
                        type: category,
                        message: error,
                        symbol: row.symbol,
                        timestamp: row.created_at
                    });
                }
            });
        }
        
        // Track stage failures
        if (!row.trade_executed && traceData.signal?.approved) {
            this.report.failures.byStage['post_signal_rejection'] = 
                (this.report.failures.byStage['post_signal_rejection'] || 0) + 1;
        }
    }

    analyzeSignalFlow(row, traceData) {
        const flow = this.report.signalFlow;
        
        // Signal generated
        if (traceData.signal) {
            flow.generated++;
            if (traceData.signal.approved) flow.approved++;
        }
        
        // Risk assessment
        if (traceData.riskAssessment) {
            flow.riskChecked++;
            if (traceData.riskAssessment.approved) flow.riskApproved++;
        }
        
        // Execution
        if (row.trade_executed) flow.executed++;
        if (row.success) flow.successful++;
    }

    analyzeRiskGates(row, traceData) {
        if (traceData.riskAssessment) {
            this.report.riskGates.total++;
            
            if (traceData.riskAssessment.approved) {
                this.report.riskGates.approved++;
            } else {
                this.report.riskGates.rejected++;
                
                // Track rejection reasons
                const reason = traceData.riskAssessment.reason || 'unknown';
                this.report.riskGates.byReason[reason] = 
                    (this.report.riskGates.byReason[reason] || 0) + 1;
            }
        }
    }

    analyzeApiFailures(row, traceData) {
        const errors = traceData.errors || [];
        
        errors.forEach(error => {
            if (error.includes('Hyperliquid') || error.includes('hyperliquid')) {
                this.report.apiFailures.hyperliquid.count++;
                if (this.report.apiFailures.hyperliquid.errors.length < 20) {
                    this.report.apiFailures.hyperliquid.errors.push({
                        message: error,
                        symbol: row.symbol,
                        time: row.created_at
                    });
                }
            }
            
            if (error.includes('database') || error.includes('Database') || error.includes('SQLITE')) {
                this.report.apiFailures.database.count++;
                if (this.report.apiFailures.database.errors.length < 20) {
                    this.report.apiFailures.database.errors.push({
                        message: error,
                        symbol: row.symbol,
                        time: row.created_at
                    });
                }
            }
            
            if (error.includes('Redis') || error.includes('redis') || error.includes('REDIS')) {
                this.report.apiFailures.redis.count++;
                if (this.report.apiFailures.redis.errors.length < 20) {
                    this.report.apiFailures.redis.errors.push({
                        message: error,
                        symbol: row.symbol,
                        time: row.created_at
                    });
                }
            }
        });
    }

    calculateStatistics() {
        console.log('\n📈 Phase 3: Calculating Statistics');
        
        // Timing percentiles
        if (this.timingData.length > 0) {
            const durations = this.timingData.map(t => t.duration).sort((a, b) => a - b);
            const len = durations.length;
            
            const percentile = (p) => durations[Math.floor(len * p / 100)];
            
            this.report.timing.percentiles = {
                p50: percentile(50),
                p75: percentile(75),
                p90: percentile(90),
                p95: percentile(95),
                p99: percentile(99),
                min: durations[0],
                max: durations[len - 1],
                avg: durations.reduce((a, b) => a + b, 0) / len
            };
            
            console.log(`  Timing stats calculated for ${len.toLocaleString()} traces`);
            console.log(`  P50: ${this.report.timing.percentiles.p50.toFixed(0)}ms`);
            console.log(`  P95: ${this.report.timing.percentiles.p95.toFixed(0)}ms`);
            console.log(`  P99: ${this.report.timing.percentiles.p99.toFixed(0)}ms`);
        }
        
        // Error breakdown
        this.report.failures.byType = this.errorsByType;
        console.log(`  Error types identified: ${Object.keys(this.errorsByType).length}`);
    }

    identifyBottlenecks() {
        console.log('\n🎯 Phase 4: Identifying Bottlenecks');
        
        const bottlenecks = [];
        
        // 1. High latency traces
        if (this.report.timing.percentiles.p95) {
            const highLatencyThreshold = this.report.timing.percentiles.p95;
            const slowTraces = this.timingData.filter(t => t.duration > highLatencyThreshold);
            
            if (slowTraces.length > 0) {
                bottlenecks.push({
                    type: 'high_latency',
                    severity: 'high',
                    count: slowTraces.length,
                    threshold: highLatencyThreshold,
                    description: `${slowTraces.length} traces (${(slowTraces.length/this.timingData.length*100).toFixed(1)}%) exceed 95th percentile latency`,
                    examples: slowTraces.slice(0, 5)
                });
            }
        }
        
        // 2. Error hotspots
        const errorTypes = Object.entries(this.errorsByType)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);
        
        if (errorTypes.length > 0) {
            bottlenecks.push({
                type: 'error_hotspots',
                severity: errorTypes[0][1] > 100 ? 'high' : 'medium',
                topErrors: errorTypes,
                description: `Top error: "${errorTypes[0][0]}" occurred ${errorTypes[0][1]} times`
            });
        }
        
        // 3. Signal drop-off analysis
        const flow = this.report.signalFlow;
        if (flow.generated > 0) {
            const approvalRate = (flow.approved / flow.generated * 100).toFixed(1);
            const executionRate = flow.approved > 0 ? (flow.executed / flow.approved * 100).toFixed(1) : 0;
            const successRate = flow.executed > 0 ? (flow.successful / flow.executed * 100).toFixed(1) : 0;
            
            bottlenecks.push({
                type: 'signal_funnel',
                severity: executionRate < 50 ? 'high' : 'medium',
                funnel: { approvalRate, executionRate, successRate },
                description: `Signal funnel: ${approvalRate}% approved → ${executionRate}% executed → ${successRate}% successful`
            });
        }
        
        // 4. Risk gate bottlenecks
        if (this.report.riskGates.total > 0) {
            const rejectionRate = (this.report.riskGates.rejected / this.report.riskGates.total * 100).toFixed(1);
            const topReasons = Object.entries(this.report.riskGates.byReason)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3);
            
            bottlenecks.push({
                type: 'risk_gate',
                severity: rejectionRate > 50 ? 'medium' : 'low',
                rejectionRate,
                topRejectionReasons: topReasons,
                description: `Risk gate rejects ${rejectionRate}% of assessments. Top reason: ${topReasons[0]?.[0] || 'none'}`
            });
        }
        
        // 5. API failure bottlenecks
        const totalApiErrors = this.report.apiFailures.hyperliquid.count + 
                              this.report.apiFailures.database.count + 
                              this.report.apiFailures.redis.count;
        
        if (totalApiErrors > 0) {
            bottlenecks.push({
                type: 'api_failures',
                severity: totalApiErrors > 50 ? 'high' : 'medium',
                breakdown: this.report.apiFailures,
                description: `API failures: Hyperliquid(${this.report.apiFailures.hyperliquid.count}), DB(${this.report.apiFailures.database.count}), Redis(${this.report.apiFailures.redis.count})`
            });
        }
        
        // 6. Strategy performance variance
        const strategies = Object.entries(this.report.strategies)
            .filter(([_, s]) => s.trades > 5);
        
        if (strategies.length > 1) {
            const successRates = strategies.map(([_, s]) => s.successful / s.trades);
            const avgRate = successRates.reduce((a, b) => a + b, 0) / successRates.length;
            const variance = successRates.reduce((sum, r) => sum + Math.pow(r - avgRate, 2), 0) / successRates.length;
            
            if (variance > 0.1) {
                bottlenecks.push({
                    type: 'strategy_inconsistency',
                    severity: 'medium',
                    variance: variance.toFixed(4),
                    description: `High variance in strategy success rates (${(variance * 100).toFixed(1)}%) suggests overfitting or regime dependency`
                });
            }
        }
        
        this.report.bottlenecks = bottlenecks;
        console.log(`  Identified ${bottlenecks.length} bottleneck categories`);
    }

    generateRecommendations() {
        console.log('\n💡 Phase 5: Generating Recommendations');
        
        const recommendations = [];
        
        // Based on timing
        if (this.report.timing.percentiles.p95 > 2000) {
            recommendations.push({
                priority: 'high',
                category: 'Performance',
                issue: 'High P95 latency (>2s)',
                recommendation: 'Implement async processing for indicator calculations. Cache pattern matching results.',
                impact: 'Reduce cycle time by 30-50%'
            });
        }
        
        // Based on errors
        if (this.errorsByType['timeout'] > 50) {
            recommendations.push({
                priority: 'critical',
                category: 'Reliability',
                issue: `High timeout count (${this.errorsByType['timeout']})`,
                recommendation: 'Increase timeout thresholds for Hyperliquid API. Implement circuit breaker pattern.',
                impact: 'Prevent failed trades due to API latency spikes'
            });
        }
        
        if (this.errorsByType['api_error'] > 20) {
            recommendations.push({
                priority: 'high',
                category: 'API Resilience',
                issue: 'Frequent Hyperliquid API errors',
                recommendation: 'Add retry logic with exponential backoff. Implement fallback to cached data.',
                impact: 'Reduce API failure rate by 60%+'
            });
        }
        
        // Based on signal funnel
        const flow = this.report.signalFlow;
        if (flow.generated > 0) {
            const executionRate = flow.approved > 0 ? (flow.executed / flow.approved) : 0;
            if (executionRate < 0.5) {
                recommendations.push({
                    priority: 'high',
                    category: 'Execution',
                    issue: `Low execution rate (${(executionRate * 100).toFixed(1)}%)`,
                    recommendation: 'Investigate why approved signals are not being executed. Check risk gate logic post-approval.',
                    impact: 'Capture 2x more trading opportunities'
                });
            }
        }
        
        // Based on risk gates
        if (this.report.riskGates.total > 0) {
            const rejectionRate = this.report.riskGates.rejected / this.report.riskGates.total;
            if (rejectionRate > 0.7) {
                recommendations.push({
                    priority: 'medium',
                    category: 'Risk Management',
                    issue: `High risk rejection rate (${(rejectionRate * 100).toFixed(1)}%)`,
                    recommendation: 'Review risk thresholds. May be too conservative, filtering out profitable opportunities.',
                    impact: 'Balance risk/reward ratio for better returns'
                });
            }
        }
        
        // Based on database errors
        if (this.report.apiFailures.database.count > 10) {
            recommendations.push({
                priority: 'high',
                category: 'Database',
                issue: `Database errors: ${this.report.apiFailures.database.count}`,
                recommendation: 'Optimize SQLite queries. Add connection pooling. Consider WAL mode tuning.',
                impact: 'Prevent data loss and improve reliability'
            });
        }
        
        // Based on Redis errors
        if (this.report.apiFailures.redis.count > 10) {
            recommendations.push({
                priority: 'medium',
                category: 'Caching',
                issue: `Redis errors: ${this.report.apiFailures.redis.count}`,
                recommendation: 'Check Redis connection health. Implement local cache fallback.',
                impact: 'Maintain performance during Redis outages'
            });
        }
        
        // Strategy optimization
        const poorStrategies = Object.entries(this.report.strategies)
            .filter(([_, s]) => s.trades > 10 && (s.successful / s.trades) < 0.3);
        
        if (poorStrategies.length > 0) {
            recommendations.push({
                priority: 'medium',
                category: 'Strategy',
                issue: `${poorStrategies.length} strategies with <30% success rate`,
                recommendation: 'Retrain or disable underperforming strategies. Focus on top performers.',
                impact: 'Improve overall win rate'
            });
        }
        
        // Sort by priority
        const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
        
        this.report.recommendations = recommendations;
        console.log(`  Generated ${recommendations.length} recommendations`);
    }

    saveReport() {
        // Convert strategy PnL arrays to averages for JSON serialization
        Object.values(this.report.strategies).forEach((s) => {
            if (s.avgPnL.length > 0) {
                s.avgPnLValue = s.avgPnL.reduce((a, b) => a + b, 0) / s.avgPnL.length;
                delete s.avgPnL; // Remove large array
            }
        });
        
        fs.writeFileSync(REPORT_PATH, JSON.stringify(this.report, null, 2));
    }

    printSummary() {
        console.log('\n' + '='.repeat(60));
        console.log('ANALYSIS SUMMARY');
        console.log('='.repeat(60));
        
        console.log('\n📊 OVERALL METRICS:');
        console.log(`  Total Traces: ${this.report.summary.totalTraces?.toLocaleString()}`);
        console.log(`  Execution Rate: ${this.report.summary.executionRate}%`);
        console.log(`  Success Rate: ${this.report.summary.successRate}%`);
        
        console.log('\n⏱️ TIMING:');
        if (this.report.timing.percentiles.p50) {
            console.log(`  P50 Latency: ${this.report.timing.percentiles.p50.toFixed(0)}ms`);
            console.log(`  P95 Latency: ${this.report.timing.percentiles.p95.toFixed(0)}ms`);
            console.log(`  P99 Latency: ${this.report.timing.percentiles.p99.toFixed(0)}ms`);
        }
        
        console.log('\n📉 ERRORS:');
        console.log(`  Total Failures: ${this.report.failures.total}`);
        Object.entries(this.report.failures.byType)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .forEach(([type, count]) => {
                console.log(`    ${type}: ${count}`);
            });
        
        console.log('\n🎯 BOTTLENECKS:');
        this.report.bottlenecks.forEach(b => {
            console.log(`  [${b.severity.toUpperCase()}] ${b.type}: ${b.description}`);
        });
        
        console.log('\n💡 TOP RECOMMENDATIONS:');
        this.report.recommendations.slice(0, 5).forEach((r, i) => {
            console.log(`  ${i+1}. [${r.priority.toUpperCase()}] ${r.issue}`);
            console.log(`     → ${r.recommendation}`);
        });
        
        console.log('\n' + '='.repeat(60));
    }
}

// Run analysis
const analyzer = new TraceAnalyzer();
analyzer.analyze();
