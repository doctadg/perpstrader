#!/usr/bin/env node
"use strict";
// =============================================================================
// perps CLI — Command-line interface for the Agent API
// =============================================================================
// Usage: perps <command> [subcommand] [options]
// =============================================================================
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
const commander_1 = require("commander");
const chalk_1 = __importDefault(require("chalk"));
const axios_1 = __importStar(require("axios"));
// ---------------------------------------------------------------------------
// Globals
// ---------------------------------------------------------------------------
const DEFAULT_API_URL = process.env.PERPS_API_URL || 'http://localhost:3001';
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function getBaseUrl(cmd) {
    const opts = cmd.opts();
    return (opts.apiUrl || DEFAULT_API_URL).replace(/\/+$/, '');
}
function getAgentBase(cmd) {
    return getBaseUrl(cmd) + '/api/agent';
}
async function apiGet(cmd, path, params) {
    const url = getAgentBase(cmd) + path;
    const res = await axios_1.default.get(url, { params, timeout: 15000 });
    return res.data;
}
async function apiPost(cmd, path, body) {
    const url = getAgentBase(cmd) + path;
    const res = await axios_1.default.post(url, body, { timeout: 15000 });
    return res.data;
}
async function apiGetRaw(cmd, path, params) {
    // For non-agent endpoints
    const url = getBaseUrl(cmd) + path;
    const res = await axios_1.default.get(url, { params, timeout: 15000 });
    return res.data;
}
function formatUptime(ms) {
    if (ms < 1000)
        return `${ms}ms`;
    const s = Math.floor(ms / 1000);
    if (s < 60)
        return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60)
        return `${m}m ${s % 60}s`;
    const h = Math.floor(m / 60);
    const d = Math.floor(h / 24);
    if (d > 0)
        return `${d}d ${h % 24}h`;
    return `${h}h ${m % 60}m`;
}
function formatPnl(val) {
    if (val > 0)
        return chalk_1.default.green(`+$${val.toFixed(2)}`);
    if (val < 0)
        return chalk_1.default.red(`-$${Math.abs(val).toFixed(2)}`);
    return chalk_1.default.gray('$0.00');
}
function healthColor(h) {
    switch (h) {
        case 'HEALTHY': return chalk_1.default.green.bold('HEALTHY');
        case 'DEGRADED': return chalk_1.default.yellow.bold('DEGRADED');
        case 'CRITICAL': return chalk_1.default.red.bold('CRITICAL');
        default: return chalk_1.default.gray(String(h));
    }
}
function statusColor(s) {
    switch (s) {
        case 'RUNNING': return chalk_1.default.green.bold('RUNNING');
        case 'STOPPED': return chalk_1.default.gray('STOPPED');
        case 'ERROR': return chalk_1.default.red.bold('ERROR');
        case 'STARTING': return chalk_1.default.yellow('STARTING');
        default: return chalk_1.default.gray(String(s));
    }
}
function printJson(data) {
    console.log(JSON.stringify(data, null, 2));
}
function printTable(headers, rows) {
    if (rows.length === 0) {
        console.log(chalk_1.default.gray('  (no data)'));
        return;
    }
    // Calculate column widths
    const widths = headers.map((h, i) => {
        const maxData = rows.reduce((max, row) => Math.max(max, (row[i] || '').length), 0);
        return Math.max(h.length + 2, maxData + 2);
    });
    // Header
    const headerLine = headers.map((h, i) => h.padEnd(widths[i])).join('');
    console.log(chalk_1.default.cyan.bold(headerLine));
    console.log(chalk_1.default.cyan(widths.map(w => '─'.repeat(w)).join('')));
    // Rows
    for (const row of rows) {
        console.log(row.map((cell, i) => (cell || '').padEnd(widths[i])).join(''));
    }
}
async function handleError(err) {
    if (err instanceof axios_1.AxiosError) {
        if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
            console.error(chalk_1.default.red(`\n  ✗ Connection refused — is the dashboard server running?`));
            console.error(chalk_1.default.gray(`    Expected: ${err.config?.url}`));
            process.exit(1);
        }
        const data = err.response?.data;
        if (data?.error) {
            console.error(chalk_1.default.red(`\n  ✗ ${data.error}`));
            if (data.timestamp)
                console.error(chalk_1.default.gray(`    ${data.timestamp}`));
            process.exit(1);
        }
        console.error(chalk_1.default.red(`\n  ✗ HTTP ${err.response?.status || 'unknown'}: ${err.message}`));
    }
    else if (err instanceof Error) {
        console.error(chalk_1.default.red(`\n  ✗ ${err.message}`));
    }
    else {
        console.error(chalk_1.default.red(`\n  ✗ Unknown error: ${err}`));
    }
    process.exit(1);
}
// ---------------------------------------------------------------------------
// Program
// ---------------------------------------------------------------------------
const program = new commander_1.Command();
program
    .name('perps')
    .description('PerpsTrader Agent API CLI')
    .version('2.0.0')
    .option('--api-url <url>', 'API base URL', DEFAULT_API_URL)
    .hook('preAction', (cmd) => {
    // validate --api-url parses
    try {
        new URL(cmd.opts().apiUrl);
    }
    catch {
        console.error(chalk_1.default.red(`Invalid --api-url: ${cmd.opts().apiUrl}`));
        process.exit(1);
    }
});
// ===========================================================================
// perps status
// ===========================================================================
program
    .command('status')
    .description('Show system status (uptime, health, agent states)')
    .option('--json', 'Output raw JSON', false)
    .action(async function () {
    try {
        const data = await apiGet(this, '/status');
        if (this.opts().json) {
            printJson(data);
            return;
        }
        console.log();
        console.log(chalk_1.default.bold('  PerpsTrader System Status'));
        console.log(chalk_1.default.gray('  ' + '─'.repeat(48)));
        console.log(chalk_1.default.cyan('  Health:    ') + healthColor(data.health));
        console.log(chalk_1.default.cyan('  Uptime:    ') + chalk_1.default.white(formatUptime(data.uptime)));
        console.log(chalk_1.default.cyan('  Version:   ') + chalk_1.default.white(data.version || 'N/A'));
        console.log(chalk_1.default.cyan('  Env:       ') + chalk_1.default.white(data.environment || 'N/A'));
        console.log(chalk_1.default.cyan('  Cache:     ') + (data.cache?.connected ? chalk_1.default.green('Connected') : chalk_1.default.red('Disconnected')));
        console.log(chalk_1.default.cyan('  Msg Bus:   ') + (data.messageBus?.connected ? chalk_1.default.green('Connected') : chalk_1.default.red('Disconnected')));
        if (data.agents?.length) {
            console.log();
            printTable(['Agent', 'Status', 'Uptime', 'Cycles', 'Error'], data.agents.map((a) => [
                chalk_1.default.white(a.name),
                statusColor(a.status),
                a.uptime > 0 ? formatUptime(a.uptime) : chalk_1.default.gray('-'),
                String(a.cyclesCompleted ?? '-'),
                a.error ? chalk_1.default.red(a.error.slice(0, 40)) : '',
            ]));
        }
        console.log();
    }
    catch (e) {
        await handleError(e);
    }
});
// ===========================================================================
// perps agents
// ===========================================================================
const agentsCmd = program.command('agents').description('Manage agents');
agentsCmd
    .command('list')
    .description('List all agents and their status')
    .option('--json', 'Output raw JSON', false)
    .action(async function () {
    try {
        const data = await apiGet(this.parent, '/agents');
        if (this.opts().json) {
            printJson(data);
            return;
        }
        console.log();
        printTable(['Agent', 'Status', 'Cycles', 'Errors', 'Last Activity'], (data.agents || []).map((a) => [
            chalk_1.default.white.bold(a.name),
            statusColor(a.status),
            String(a.cyclesCompleted ?? 0),
            String(a.errorCount ?? 0),
            a.lastActivity ? new Date(a.lastActivity).toLocaleString() : chalk_1.default.gray('-'),
        ]));
        console.log();
    }
    catch (e) {
        await handleError(e);
    }
});
agentsCmd
    .command('start')
    .description('Start a specific agent')
    .requiredOption('--type <name>', 'Agent name (news, execution, prediction, pumpfun, safekeeping, research)')
    .option('--json', 'Output raw JSON', false)
    .action(async function () {
    try {
        const { type } = this.opts();
        const data = await apiPost(this.parent, `/start/${type}`);
        if (this.opts().json) {
            printJson(data);
            return;
        }
        console.log();
        if (data.success) {
            console.log(chalk_1.default.green(`  ✓ Agent "${type}" started successfully`));
        }
        else {
            console.log(chalk_1.default.yellow(`  ⚠ Agent "${type}": ${data.message || 'unknown state'}`));
        }
        console.log();
    }
    catch (e) {
        await handleError(e);
    }
});
agentsCmd
    .command('stop')
    .description('Stop a specific agent')
    .requiredOption('--type <name>', 'Agent name')
    .option('--json', 'Output raw JSON', false)
    .action(async function () {
    try {
        const { type } = this.opts();
        const data = await apiPost(this.parent, `/stop/${type}`);
        if (this.opts().json) {
            printJson(data);
            return;
        }
        console.log();
        if (data.success) {
            console.log(chalk_1.default.green(`  ✓ Agent "${type}" stopped successfully`));
        }
        else {
            console.log(chalk_1.default.yellow(`  ⚠ Agent "${type}": ${data.message || 'unknown state'}`));
        }
        console.log();
    }
    catch (e) {
        await handleError(e);
    }
});
// ===========================================================================
// perps positions
// ===========================================================================
const positionsCmd = program.command('positions').description('Manage positions');
positionsCmd
    .command('list')
    .description('List open positions')
    .option('--json', 'Output raw JSON', false)
    .action(async function () {
    try {
        const data = await apiGet(this.parent, '/positions');
        if (this.opts().json) {
            printJson(data);
            return;
        }
        const positions = data.positions || [];
        console.log();
        if (positions.length === 0) {
            console.log(chalk_1.default.gray('  No open positions'));
        }
        else {
            printTable(['Symbol', 'Side', 'Size', 'Entry', 'Mark', 'PnL', 'Leverage'], positions.map((p) => [
                chalk_1.default.white.bold(p.coin || p.symbol || '-'),
                p.side === 'Long' ? chalk_1.default.green('LONG') : chalk_1.default.red('SHORT'),
                String(p.size ?? p.quantity ?? '-'),
                String(p.entryPrice ?? p.entry ?? '-'),
                String(p.markPrice ?? p.mark ?? '-'),
                formatPnl(p.pnl ?? p.unrealizedPnl ?? 0),
                String(p.leverage ?? '-'),
            ]));
        }
        console.log();
    }
    catch (e) {
        await handleError(e);
    }
});
positionsCmd
    .command('close')
    .description('Close a position')
    .requiredOption('--symbol <symbol>', 'Symbol (e.g. BTC, ETH)')
    .option('--side <side>', 'Side (long or short)')
    .option('--id <id>', 'Position ID (overrides --symbol)')
    .option('--json', 'Output raw JSON', false)
    .action(async function () {
    try {
        const { id, symbol, side } = this.opts();
        const positionId = id || `${symbol}_${side?.toLowerCase() || 'long'}`;
        const data = await apiPost(this.parent, `/close/${positionId}`);
        if (this.opts().json) {
            printJson(data);
            return;
        }
        console.log();
        if (data.success) {
            console.log(chalk_1.default.green(`  ✓ Position closed: ${positionId}`));
            if (data.realizedPnl !== undefined) {
                console.log(chalk_1.default.cyan('  Realized PnL: ') + formatPnl(data.realizedPnl));
            }
        }
        else {
            console.log(chalk_1.default.yellow(`  ⚠ ${data.message || 'Failed to close position'}`));
        }
        console.log();
    }
    catch (e) {
        await handleError(e);
    }
});
// ===========================================================================
// perps orders
// ===========================================================================
const ordersCmd = program.command('orders').description('Manage orders');
ordersCmd
    .command('list')
    .description('List open orders')
    .option('--json', 'Output raw JSON', false)
    .action(async function () {
    try {
        const data = await apiGet(this.parent, '/orders');
        if (this.opts().json) {
            printJson(data);
            return;
        }
        const orders = data.orders || [];
        console.log();
        if (orders.length === 0) {
            console.log(chalk_1.default.gray('  No open orders'));
        }
        else {
            printTable(['ID', 'Symbol', 'Side', 'Type', 'Price', 'Size', 'Status'], orders.slice(0, 50).map((o) => [
                String(o.id || o.oid || '-').slice(0, 12),
                chalk_1.default.white.bold(o.coin || o.symbol || '-'),
                o.side === 'Buy' ? chalk_1.default.green('BUY') : chalk_1.default.red('SELL'),
                String(o.orderType || o.type || '-'),
                String(o.limitPx ?? o.price ?? '-'),
                String(o.sz ?? o.size ?? '-'),
                statusColor(o.status || o.state || '-'),
            ]));
            if (orders.length > 50)
                console.log(chalk_1.default.gray(`  ... and ${orders.length - 50} more`));
        }
        console.log();
    }
    catch (e) {
        await handleError(e);
    }
});
ordersCmd
    .command('cancel')
    .description('Cancel an order')
    .requiredOption('--id <orderId>', 'Order ID to cancel')
    .option('--json', 'Output raw JSON', false)
    .action(async function () {
    try {
        const { id } = this.opts();
        const data = await apiPost(this.parent, '/orders/cancel', { orderId: id });
        if (this.opts().json) {
            printJson(data);
            return;
        }
        console.log();
        if (data.success) {
            console.log(chalk_1.default.green(`  ✓ Order ${id} cancelled`));
        }
        else {
            console.log(chalk_1.default.yellow(`  ⚠ ${data.message || 'Failed to cancel order'}`));
        }
        console.log();
    }
    catch (e) {
        await handleError(e);
    }
});
ordersCmd
    .command('cancel-all')
    .description('Cancel all open orders')
    .option('--json', 'Output raw JSON', false)
    .action(async function () {
    try {
        const data = await apiPost(this.parent, '/orders/cancel-all');
        if (this.opts().json) {
            printJson(data);
            return;
        }
        console.log();
        if (data.success) {
            console.log(chalk_1.default.green(`  ✓ Cancelled ${data.cancelledCount ?? 'all'} orders`));
        }
        else {
            console.log(chalk_1.default.yellow(`  ⚠ ${data.message || 'Failed to cancel orders'}`));
        }
        console.log();
    }
    catch (e) {
        await handleError(e);
    }
});
// ===========================================================================
// perps portfolio
// ===========================================================================
program
    .command('portfolio')
    .description('Show portfolio summary (balance, PnL, exposure)')
    .option('--json', 'Output raw JSON', false)
    .action(async function () {
    try {
        const data = await apiGet(this, '/portfolio');
        if (this.opts().json) {
            printJson(data);
            return;
        }
        console.log();
        console.log(chalk_1.default.bold('  Portfolio Summary'));
        console.log(chalk_1.default.gray('  ' + '─'.repeat(48)));
        const acct = data.account || data;
        console.log(chalk_1.default.cyan('  Balance:      ') + chalk_1.default.white.bold(`$${(acct.accountValue ?? acct.balance ?? 0).toLocaleString()}`));
        console.log(chalk_1.default.cyan('  Equity:       ') + chalk_1.default.white.bold(`$${(acct.totalMarginUsed !== undefined ? (acct.accountValue ?? 0) - acct.totalMarginUsed : acct.equity ?? 0).toLocaleString()}`));
        if (data.positions) {
            const totalPnl = data.positions.reduce((s, p) => s + (p.pnl ?? p.unrealizedPnl ?? 0), 0);
            console.log(chalk_1.default.cyan('  Unrealized:   ') + formatPnl(totalPnl));
            console.log(chalk_1.default.cyan('  Positions:    ') + chalk_1.default.white(String(data.positions.length)));
        }
        if (acct.leverage !== undefined) {
            console.log(chalk_1.default.cyan('  Leverage:     ') + chalk_1.default.white(`${acct.leverage}x`));
        }
        if (data.positions?.length) {
            console.log();
            printTable(['Symbol', 'Side', 'Size', 'PnL', '% Change'], data.positions.map((p) => [
                chalk_1.default.white.bold(p.coin || p.symbol || '-'),
                p.side === 'Long' ? chalk_1.default.green('LONG') : chalk_1.default.red('SHORT'),
                String(p.size ?? p.quantity ?? '-'),
                formatPnl(p.pnl ?? p.unrealizedPnl ?? 0),
                p.percentageChange != null ? `${p.percentageChange.toFixed(2)}%` : '-',
            ]));
        }
        console.log();
    }
    catch (e) {
        await handleError(e);
    }
});
// ===========================================================================
// perps risk
// ===========================================================================
program
    .command('risk')
    .description('Show risk metrics (drawdown, daily loss, limits)')
    .option('--json', 'Output raw JSON', false)
    .action(async function () {
    try {
        const data = await apiGet(this, '/risk');
        if (this.opts().json) {
            printJson(data);
            return;
        }
        console.log();
        console.log(chalk_1.default.bold('  Risk Metrics'));
        console.log(chalk_1.default.gray('  ' + '─'.repeat(48)));
        const m = data.metrics || data;
        const printRisk = (label, val, warn, crit) => {
            const num = typeof val === 'number' ? val : parseFloat(val);
            let color = chalk_1.default.white;
            if (!isNaN(num)) {
                if (crit !== undefined && num >= crit)
                    color = chalk_1.default.red.bold;
                else if (warn !== undefined && num >= warn)
                    color = chalk_1.default.yellow.bold;
                else
                    color = chalk_1.default.green;
            }
            console.log(chalk_1.default.cyan(`  ${label.padEnd(18)}`) + color(String(val ?? 'N/A')));
        };
        printRisk('Max Drawdown', m.maxDrawdown ?? m.drawdown, 10, 20);
        printRisk('Daily PnL', m.dailyPnL ?? m.todayPnL);
        printRisk('Daily Loss Limit', m.dailyLossLimit ?? m.maxDailyLoss);
        printRisk('Total Exposure', m.totalExposure ?? m.exposure);
        printRisk('Open Positions', m.openPositionCount ?? m.positionCount);
        printRisk('Used Margin', m.usedMargin ?? m.marginUsed);
        printRisk('Free Margin', m.freeMargin);
        printRisk('Margin Usage', m.marginUsagePercent != null ? `${m.marginUsagePercent}%` : m.marginUsage);
        printRisk('Risk Score', m.riskScore, 60, 80);
        if (data.limits) {
            console.log();
            console.log(chalk_1.default.bold('  Risk Limits'));
            console.log(chalk_1.default.gray('  ' + '─'.repeat(48)));
            const limits = data.limits;
            if (limits.maxPositionSize != null)
                console.log(chalk_1.default.cyan('  Max Position:   ') + chalk_1.default.white(String(limits.maxPositionSize)));
            if (limits.maxLeverage != null)
                console.log(chalk_1.default.cyan('  Max Leverage:   ') + chalk_1.default.white(`${limits.maxLeverage}x`));
            if (limits.maxOpenPositions != null)
                console.log(chalk_1.default.cyan('  Max Positions:  ') + chalk_1.default.white(String(limits.maxOpenPositions)));
            if (limits.maxDailyLoss != null)
                console.log(chalk_1.default.cyan('  Max Daily Loss: ') + chalk_1.default.white(`$${limits.maxDailyLoss}`));
        }
        if (data.circuitBreakers?.length) {
            console.log();
            console.log(chalk_1.default.bold('  Circuit Breakers'));
            console.log(chalk_1.default.gray('  ' + '─'.repeat(48)));
            for (const cb of data.circuitBreakers) {
                const state = cb.state === 'CLOSED' ? chalk_1.default.green('CLOSED') : cb.state === 'OPEN' ? chalk_1.default.red.bold('OPEN') : chalk_1.default.yellow('HALF-OPEN');
                console.log(chalk_1.default.cyan(`  ${cb.name?.padEnd(20)}`) + state);
            }
        }
        console.log();
    }
    catch (e) {
        await handleError(e);
    }
});
// ===========================================================================
// perps news
// ===========================================================================
program
    .command('news')
    .description('Show recent news articles')
    .option('--limit <n>', 'Number of articles', '10')
    .option('--json', 'Output raw JSON', false)
    .action(async function () {
    try {
        const { limit } = this.opts();
        const data = await apiGet(this, '/news', { limit });
        if (this.opts().json) {
            printJson(data);
            return;
        }
        const articles = data.articles || [];
        console.log();
        if (articles.length === 0) {
            console.log(chalk_1.default.gray('  No recent news articles'));
        }
        else {
            for (const a of articles) {
                const sentiment = a.sentiment;
                const sentIcon = sentiment === 'positive' ? chalk_1.default.green('▲') : sentiment === 'negative' ? chalk_1.default.red('▼') : chalk_1.default.gray('●');
                const impact = a.impact || a.impactScore || 0;
                const impactColor = impact >= 0.7 ? chalk_1.default.red.bold : impact >= 0.4 ? chalk_1.default.yellow : chalk_1.default.gray;
                console.log(chalk_1.default.white.bold(`  ${a.title || a.headline || 'Untitled'}`));
                console.log(chalk_1.default.gray(`    ${a.source || a.publisher || ''} ${a.publishedAt || a.timestamp ? '· ' + new Date(a.publishedAt || a.timestamp).toLocaleString() : ''}`));
                console.log(`    ${sentIcon} Sentiment: ${chalk_1.default.white(String(sentiment || 'neutral'))}  ${impactColor('Impact: ' + (typeof impact === 'number' ? (impact * 100).toFixed(0) + '%' : impact))}`);
                if (a.summary)
                    console.log(chalk_1.default.gray(`    ${a.summary.slice(0, 120)}${a.summary.length > 120 ? '...' : ''}`));
                console.log();
            }
        }
    }
    catch (e) {
        await handleError(e);
    }
});
// ===========================================================================
// perps predictions
// ===========================================================================
program
    .command('predictions')
    .description('Show prediction market positions and signals')
    .option('--market <filter>', 'Filter by market (default: all)', 'all')
    .option('--json', 'Output raw JSON', false)
    .action(async function () {
    try {
        const data = await apiGet(this, '/predictions');
        if (this.opts().json) {
            printJson(data);
            return;
        }
        console.log();
        console.log(chalk_1.default.bold('  Prediction Markets'));
        console.log(chalk_1.default.gray(`  Total Positions: ${data.totalPositions ?? 0}   Unrealized PnL: ${formatPnl(data.unrealizedPnL ?? 0)}`));
        console.log();
        const positions = (data.positions || []);
        const filtered = this.opts().market !== 'all'
            ? positions.filter((p) => (p.marketTitle || p.market || '').toLowerCase().includes(this.opts().market.toLowerCase()))
            : positions;
        if (filtered.length > 0) {
            printTable(['Market', 'Outcome', 'Side', 'Size', 'PnL'], filtered.map((p) => [
                chalk_1.default.white((p.marketTitle || p.market || '-').slice(0, 40)),
                String(p.outcome || '-'),
                p.side === 'BUY' ? chalk_1.default.green('BUY') : chalk_1.default.red('SELL'),
                String(p.size ?? p.amount ?? '-'),
                formatPnl(p.unrealizedPnl ?? p.pnl ?? 0),
            ]));
        }
        else {
            console.log(chalk_1.default.gray('  No prediction market positions'));
        }
        if (data.signals?.length) {
            console.log();
            console.log(chalk_1.default.bold('  Recent Signals'));
            printTable(['Market', 'Action', 'Confidence', 'Reason'], data.signals.slice(0, 10).map((s) => [
                chalk_1.default.white((s.marketTitle || '-').slice(0, 35)),
                s.action === 'BUY' ? chalk_1.default.green('BUY') : chalk_1.default.red('SELL'),
                s.confidence != null ? `${(s.confidence * 100).toFixed(0)}%` : '-',
                (s.reason || '-').slice(0, 40),
            ]));
        }
        console.log();
    }
    catch (e) {
        await handleError(e);
    }
});
// ===========================================================================
// perps strategies
// ===========================================================================
program
    .command('strategies')
    .description('List trading strategies')
    .option('--json', 'Output raw JSON', false)
    .action(async function () {
    try {
        const data = await apiGet(this, '/strategies');
        if (this.opts().json) {
            printJson(data);
            return;
        }
        const strategies = data.strategies || [];
        console.log();
        if (strategies.length === 0) {
            console.log(chalk_1.default.gray('  No strategies found'));
        }
        else {
            printTable(['Name', 'Type', 'Status', 'Win Rate', 'Trades', 'PnL'], strategies.map((s) => [
                chalk_1.default.white.bold(s.name || '-'),
                String(s.type || s.category || '-'),
                s.active ? chalk_1.default.green('ACTIVE') : chalk_1.default.gray('INACTIVE'),
                s.winRate != null ? `${(s.winRate * 100).toFixed(1)}%` : '-',
                String(s.totalTrades ?? s.trades ?? '-'),
                formatPnl(s.totalPnl ?? s.pnl ?? 0),
            ]));
        }
        console.log();
    }
    catch (e) {
        await handleError(e);
    }
});
// ===========================================================================
// perps backtest
// ===========================================================================
program
    .command('backtest')
    .description('Show backtest results')
    .option('--strategy <name>', 'Filter by strategy name', 'all')
    .option('--limit <n>', 'Number of results', '20')
    .option('--json', 'Output raw JSON', false)
    .action(async function () {
    try {
        const { limit } = this.opts();
        const data = await apiGet(this, '/backtest/history', { limit });
        if (this.opts().json) {
            printJson(data);
            return;
        }
        const runs = data.runs || [];
        console.log();
        console.log(chalk_1.default.bold(`  Backtest History  (${data.total ?? runs.length} runs)`));
        console.log();
        if (runs.length === 0) {
            console.log(chalk_1.default.gray('  No backtest results found'));
        }
        else {
            printTable(['Strategy', 'Symbol', 'Period', 'Return', 'Sharpe', 'Max DD', 'Trades'], runs.map((r) => [
                chalk_1.default.white((r.strategyName || r.strategy || '-').slice(0, 20)),
                String(r.symbol || r.coin || '-'),
                `${r.startDate || '?'} → ${r.endDate || '?'}`,
                r.totalReturn != null ? chalk_1.default.bold((r.totalReturn >= 0 ? '+' : '') + (r.totalReturn * 100).toFixed(1) + '%') : '-',
                r.sharpeRatio != null ? String(r.sharpeRatio.toFixed(2)) : '-',
                r.maxDrawdown != null ? `${(r.maxDrawdown * 100).toFixed(1)}%` : '-',
                String(r.totalTrades ?? r.trades ?? '-'),
            ]));
        }
        console.log();
    }
    catch (e) {
        await handleError(e);
    }
});
// ===========================================================================
// perps research
// ===========================================================================
program
    .command('research')
    .description('Show recent research / evolution results')
    .option('--limit <n>', 'Number of results', '5')
    .option('--json', 'Output raw JSON', false)
    .action(async function () {
    try {
        const { limit } = this.opts();
        const data = await apiGet(this, '/evolution');
        if (this.opts().json) {
            printJson(data);
            return;
        }
        const results = data.results || data.generations || data.runs || [];
        console.log();
        console.log(chalk_1.default.bold('  Research & Evolution'));
        console.log();
        if (results.length === 0) {
            console.log(chalk_1.default.gray('  No research results found'));
            // Also try backtest history as fallback
            console.log(chalk_1.default.gray('  Showing recent backtests instead:'));
            try {
                const bt = await apiGet(this, '/backtest/history', { limit });
                const runs = bt.runs || [];
                if (runs.length > 0) {
                    printTable(['Strategy', 'Return', 'Sharpe', 'Trades'], runs.slice(0, Number(limit)).map((r) => [
                        chalk_1.default.white(r.strategyName || r.strategy || '-'),
                        r.totalReturn != null ? `${(r.totalReturn >= 0 ? '+' : '') + (r.totalReturn * 100).toFixed(1)}%` : '-',
                        r.sharpeRatio != null ? String(r.sharpeRatio.toFixed(2)) : '-',
                        String(r.totalTrades ?? r.trades ?? '-'),
                    ]));
                }
            }
            catch { /* ignore */ }
        }
        else {
            for (const r of results.slice(0, Number(limit))) {
                console.log(chalk_1.default.white.bold(`  ${r.strategyName || r.name || r.id || 'Unknown'}`));
                console.log(chalk_1.default.gray(`    Fitness: ${r.fitness ?? '-'}  Generation: ${r.generation ?? '-'}`));
                if (r.metrics) {
                    const keys = Object.keys(r.metrics).slice(0, 4);
                    console.log(chalk_1.default.gray(`    ${keys.map(k => `${k}: ${r.metrics[k]}`).join('  ')}`));
                }
                console.log();
            }
        }
        console.log();
    }
    catch (e) {
        await handleError(e);
    }
});
// ===========================================================================
// perps config
// ===========================================================================
program
    .command('config')
    .description('Show configuration (secrets hidden by default)')
    .option('--show-secrets', 'Reveal secret values', false)
    .option('--json', 'Output raw JSON', false)
    .action(async function () {
    try {
        const data = await apiGetRaw(this, '/api/config');
        if (this.opts().json) {
            printJson(data);
            return;
        }
        const showSecrets = this.opts().showSecrets;
        const SECRET_PATTERNS = [/key/i, /secret/i, /password/i, /private/i, /token/i, /wallet/i, /mnemonic/i, /seed/i];
        console.log();
        console.log(chalk_1.default.bold('  Configuration'));
        console.log(chalk_1.default.gray('  ' + '─'.repeat(48)));
        function printConfig(obj, prefix = '') {
            for (const [key, val] of Object.entries(obj)) {
                const fullKey = prefix ? `${prefix}.${key}` : key;
                if (val && typeof val === 'object' && !Array.isArray(val)) {
                    console.log(chalk_1.default.cyan(`  ${fullKey}:`));
                    printConfig(val, fullKey);
                }
                else {
                    const isSecret = SECRET_PATTERNS.some(p => p.test(key));
                    if (isSecret && !showSecrets) {
                        console.log(chalk_1.default.gray(`    ${key}: `) + chalk_1.default.yellow('••••••••'));
                    }
                    else {
                        console.log(chalk_1.default.gray(`    ${key}: `) + chalk_1.default.white(String(val ?? 'null')));
                    }
                }
            }
        }
        printConfig(data.config || data);
        console.log();
    }
    catch (e) {
        await handleError(e);
    }
});
// ===========================================================================
// perps emergency-stop
// ===========================================================================
program
    .command('emergency-stop')
    .description('⚠️  Emergency shutdown — close all positions and stop all agents')
    .option('--yes', 'Skip confirmation', false)
    .option('--json', 'Output raw JSON', false)
    .action(async function () {
    const yes = this.opts().yes;
    if (!yes) {
        console.log();
        console.log(chalk_1.default.red.bold('  ╔══════════════════════════════════════╗'));
        console.log(chalk_1.default.red.bold('  ║  ⚠️  EMERGENCY STOP                 ║'));
        console.log(chalk_1.default.red.bold('  ║  This will close ALL positions and   ║'));
        console.log(chalk_1.default.red.bold('  ║  stop ALL agents immediately!        ║'));
        console.log(chalk_1.default.red.bold('  ╚══════════════════════════════════════╝'));
        console.log();
        // Simple confirmation via stdin
        const readline = await Promise.resolve().then(() => __importStar(require('readline')));
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        const answer = await new Promise(resolve => {
            rl.question(chalk_1.default.yellow('  Type "YES" to confirm: '), resolve);
        });
        rl.close();
        if (answer.trim() !== 'YES') {
            console.log(chalk_1.default.gray('\n  Cancelled.'));
            return;
        }
    }
    try {
        const data = await apiPost(this, '/emergency-stop');
        if (this.opts().json) {
            printJson(data);
            return;
        }
        console.log();
        if (data.success) {
            console.log(chalk_1.default.green.bold('  ✓ Emergency stop executed successfully'));
            if (data.positionsClosed != null)
                console.log(chalk_1.default.cyan(`    Positions closed: ${data.positionsClosed}`));
            if (data.ordersCancelled != null)
                console.log(chalk_1.default.cyan(`    Orders cancelled: ${data.ordersCancelled}`));
            if (data.agentsStopped != null)
                console.log(chalk_1.default.cyan(`    Agents stopped: ${data.agentsStopped}`));
        }
        else {
            console.log(chalk_1.default.yellow(`  ⚠ ${data.message || 'Emergency stop may not have completed fully'}`));
        }
        console.log();
    }
    catch (e) {
        await handleError(e);
    }
});
// ===========================================================================
// perps pumpfun
// ===========================================================================
program
    .command('pumpfun')
    .description('Show pump.fun token scans')
    .option('--min-score <threshold>', 'Minimum score filter', '0.7')
    .option('--limit <n>', 'Number of tokens', '20')
    .option('--json', 'Output raw JSON', false)
    .action(async function () {
    try {
        const { minScore, limit } = this.opts();
        const data = await apiGetRaw(this, '/api/pumpfun/tokens', { minScore, limit });
        if (this.opts().json) {
            printJson(data);
            return;
        }
        const tokens = data.tokens || [];
        console.log();
        if (tokens.length === 0) {
            console.log(chalk_1.default.gray('  No tokens found matching criteria'));
        }
        else {
            printTable(['Token', 'Score', 'Market Cap', 'Liquidity', 'Vol 24h', 'Rec'], tokens.slice(0, 30).map((t) => {
                const score = t.score ?? t.confidenceScore ?? 0;
                const scoreColor = score >= 0.8 ? chalk_1.default.green.bold : score >= 0.6 ? chalk_1.default.yellow : chalk_1.default.gray;
                return [
                    chalk_1.default.white.bold((t.name || t.symbol || '-').slice(0, 16)),
                    scoreColor(typeof score === 'number' ? score.toFixed(2) : String(score)),
                    t.marketCap != null ? `$${Number(t.marketCap).toLocaleString()}` : '-',
                    t.liquidity != null ? `$${Number(t.liquidity).toLocaleString()}` : '-',
                    t.volume24h != null ? `$${Number(t.volume24h).toLocaleString()}` : '-',
                    chalk_1.default.blue(t.recommendation || t.rec || '-'),
                ];
            }));
            if (tokens.length > 30)
                console.log(chalk_1.default.gray(`  ... and ${tokens.length - 30} more`));
        }
        console.log();
    }
    catch (e) {
        await handleError(e);
    }
});
// ===========================================================================
// Parse
// ===========================================================================
program.parse(process.argv);
//# sourceMappingURL=perps-cli.js.map