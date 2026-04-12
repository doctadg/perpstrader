#!/usr/bin/env node
// =============================================================================
// perps CLI — Command-line interface for the Agent API
// =============================================================================
// Usage: perps <command> [subcommand] [options]
// =============================================================================

import { Command } from 'commander';
import chalk from 'chalk';
import axios, { AxiosError } from 'axios';

// ---------------------------------------------------------------------------
// Globals
// ---------------------------------------------------------------------------

const DEFAULT_API_URL = process.env.PERPS_API_URL || 'http://localhost:3001';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getBaseUrl(cmd: Command): string {
  const opts = cmd.opts() as { apiUrl?: string };
  return (opts.apiUrl || DEFAULT_API_URL).replace(/\/+$/, '');
}

function getAgentBase(cmd: Command): string {
  return getBaseUrl(cmd) + '/api/agent';
}

async function apiGet(cmd: Command, path: string, params?: Record<string, any>): Promise<any> {
  const url = getAgentBase(cmd) + path;
  const res = await axios.get(url, { params, timeout: 15000 });
  return res.data;
}

async function apiPost(cmd: Command, path: string, body?: any): Promise<any> {
  const url = getAgentBase(cmd) + path;
  const res = await axios.post(url, body, { timeout: 15000 });
  return res.data;
}

async function apiGetRaw(cmd: Command, path: string, params?: Record<string, any>): Promise<any> {
  // For non-agent endpoints
  const url = getBaseUrl(cmd) + path;
  const res = await axios.get(url, { params, timeout: 15000 });
  return res.data;
}

function formatUptime(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h`;
  return `${h}h ${m % 60}m`;
}

function formatPnl(val: number): string {
  if (val > 0) return chalk.green(`+$${val.toFixed(2)}`);
  if (val < 0) return chalk.red(`-$${Math.abs(val).toFixed(2)}`);
  return chalk.gray('$0.00');
}

function healthColor(h: string): string {
  switch (h) {
    case 'HEALTHY': return chalk.green.bold('HEALTHY');
    case 'DEGRADED': return chalk.yellow.bold('DEGRADED');
    case 'CRITICAL': return chalk.red.bold('CRITICAL');
    default: return chalk.gray(String(h));
  }
}

function statusColor(s: string): string {
  switch (s) {
    case 'RUNNING': return chalk.green.bold('RUNNING');
    case 'STOPPED': return chalk.gray('STOPPED');
    case 'ERROR': return chalk.red.bold('ERROR');
    case 'STARTING': return chalk.yellow('STARTING');
    default: return chalk.gray(String(s));
  }
}

function printJson(data: any): void {
  console.log(JSON.stringify(data, null, 2));
}

function printTable(headers: string[], rows: string[][]): void {
  if (rows.length === 0) {
    console.log(chalk.gray('  (no data)'));
    return;
  }

  // Calculate column widths
  const widths = headers.map((h, i) => {
    const maxData = rows.reduce((max, row) => Math.max(max, (row[i] || '').length), 0);
    return Math.max(h.length + 2, maxData + 2);
  });

  // Header
  const headerLine = headers.map((h, i) => h.padEnd(widths[i])).join('');
  console.log(chalk.cyan.bold(headerLine));
  console.log(chalk.cyan(widths.map(w => '─'.repeat(w)).join('')));

  // Rows
  for (const row of rows) {
    console.log(row.map((cell, i) => (cell || '').padEnd(widths[i])).join(''));
  }
}

async function handleError(err: unknown): Promise<never> {
  if (err instanceof AxiosError) {
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
      console.error(chalk.red(`\n  ✗ Connection refused — is the dashboard server running?`));
      console.error(chalk.gray(`    Expected: ${err.config?.url}`));
      process.exit(1);
    }
    const data = err.response?.data as any;
    if (data?.error) {
      console.error(chalk.red(`\n  ✗ ${data.error}`));
      if (data.timestamp) console.error(chalk.gray(`    ${data.timestamp}`));
      process.exit(1);
    }
    console.error(chalk.red(`\n  ✗ HTTP ${err.response?.status || 'unknown'}: ${err.message}`));
  } else if (err instanceof Error) {
    console.error(chalk.red(`\n  ✗ ${err.message}`));
  } else {
    console.error(chalk.red(`\n  ✗ Unknown error: ${err}`));
  }
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Program
// ---------------------------------------------------------------------------

const program = new Command();

program
  .name('perps')
  .description('PerpsTrader Agent API CLI')
  .version('2.0.0')
  .option('--api-url <url>', 'API base URL', DEFAULT_API_URL)
  .hook('preAction', (cmd) => {
    // validate --api-url parses
    try { new URL(cmd.opts().apiUrl as string); } catch {
      console.error(chalk.red(`Invalid --api-url: ${cmd.opts().apiUrl}`));
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
  .action(async function (this: Command) {
    try {
      const data = await apiGet(this, '/status');
      if (this.opts().json) { printJson(data); return; }

      console.log();
      console.log(chalk.bold('  PerpsTrader System Status'));
      console.log(chalk.gray('  ' + '─'.repeat(48)));
      console.log(chalk.cyan('  Health:    ') + healthColor(data.health));
      console.log(chalk.cyan('  Uptime:    ') + chalk.white(formatUptime(data.uptime)));
      console.log(chalk.cyan('  Version:   ') + chalk.white(data.version || 'N/A'));
      console.log(chalk.cyan('  Env:       ') + chalk.white(data.environment || 'N/A'));
      console.log(chalk.cyan('  Cache:     ') + (data.cache?.connected ? chalk.green('Connected') : chalk.red('Disconnected')));
      console.log(chalk.cyan('  Msg Bus:   ') + (data.messageBus?.connected ? chalk.green('Connected') : chalk.red('Disconnected')));

      if (data.agents?.length) {
        console.log();
        printTable(
          ['Agent', 'Status', 'Uptime', 'Cycles', 'Error'],
          data.agents.map((a: any) => [
            chalk.white(a.name),
            statusColor(a.status),
            a.uptime > 0 ? formatUptime(a.uptime) : chalk.gray('-'),
            String(a.cyclesCompleted ?? '-'),
            a.error ? chalk.red(a.error.slice(0, 40)) : '',
          ])
        );
      }

      console.log();
    } catch (e) { await handleError(e); }
  });

// ===========================================================================
// perps agents
// ===========================================================================

const agentsCmd = program.command('agents').description('Manage agents');

agentsCmd
  .command('list')
  .description('List all agents and their status')
  .option('--json', 'Output raw JSON', false)
  .action(async function (this: Command) {
    try {
      const data = await apiGet(this.parent!, '/agents');
      if (this.opts().json) { printJson(data); return; }

      console.log();
      printTable(
        ['Agent', 'Status', 'Cycles', 'Errors', 'Last Activity'],
        (data.agents || []).map((a: any) => [
          chalk.white.bold(a.name),
          statusColor(a.status),
          String(a.cyclesCompleted ?? 0),
          String(a.errorCount ?? 0),
          a.lastActivity ? new Date(a.lastActivity).toLocaleString() : chalk.gray('-'),
        ])
      );
      console.log();
    } catch (e) { await handleError(e); }
  });

agentsCmd
  .command('start')
  .description('Start a specific agent')
  .requiredOption('--type <name>', 'Agent name (news, execution, prediction, pumpfun, safekeeping, research)')
  .option('--json', 'Output raw JSON', false)
  .action(async function (this: Command) {
    try {
      const { type } = this.opts();
      const data = await apiPost(this.parent!, `/start/${type}`);
      if (this.opts().json) { printJson(data); return; }

      console.log();
      if (data.success) {
        console.log(chalk.green(`  ✓ Agent "${type}" started successfully`));
      } else {
        console.log(chalk.yellow(`  ⚠ Agent "${type}": ${data.message || 'unknown state'}`));
      }
      console.log();
    } catch (e) { await handleError(e); }
  });

agentsCmd
  .command('stop')
  .description('Stop a specific agent')
  .requiredOption('--type <name>', 'Agent name')
  .option('--json', 'Output raw JSON', false)
  .action(async function (this: Command) {
    try {
      const { type } = this.opts();
      const data = await apiPost(this.parent!, `/stop/${type}`);
      if (this.opts().json) { printJson(data); return; }

      console.log();
      if (data.success) {
        console.log(chalk.green(`  ✓ Agent "${type}" stopped successfully`));
      } else {
        console.log(chalk.yellow(`  ⚠ Agent "${type}": ${data.message || 'unknown state'}`));
      }
      console.log();
    } catch (e) { await handleError(e); }
  });

// ===========================================================================
// perps positions
// ===========================================================================

const positionsCmd = program.command('positions').description('Manage positions');

positionsCmd
  .command('list')
  .description('List open positions')
  .option('--json', 'Output raw JSON', false)
  .action(async function (this: Command) {
    try {
      const data = await apiGet(this.parent!, '/positions');
      if (this.opts().json) { printJson(data); return; }

      const positions = data.positions || [];
      console.log();
      if (positions.length === 0) {
        console.log(chalk.gray('  No open positions'));
      } else {
        printTable(
          ['Symbol', 'Side', 'Size', 'Entry', 'Mark', 'PnL', 'Leverage'],
          positions.map((p: any) => [
            chalk.white.bold(p.coin || p.symbol || '-'),
            p.side === 'Long' ? chalk.green('LONG') : chalk.red('SHORT'),
            String(p.size ?? p.quantity ?? '-'),
            String(p.entryPrice ?? p.entry ?? '-'),
            String(p.markPrice ?? p.mark ?? '-'),
            formatPnl(p.pnl ?? p.unrealizedPnl ?? 0),
            String(p.leverage ?? '-'),
          ])
        );
      }
      console.log();
    } catch (e) { await handleError(e); }
  });

positionsCmd
  .command('close')
  .description('Close a position')
  .requiredOption('--symbol <symbol>', 'Symbol (e.g. BTC, ETH)')
  .option('--side <side>', 'Side (long or short)')
  .option('--id <id>', 'Position ID (overrides --symbol)')
  .option('--json', 'Output raw JSON', false)
  .action(async function (this: Command) {
    try {
      const { id, symbol, side } = this.opts();
      const positionId = id || `${symbol}_${side?.toLowerCase() || 'long'}`;
      const data = await apiPost(this.parent!, `/close/${positionId}`);
      if (this.opts().json) { printJson(data); return; }

      console.log();
      if (data.success) {
        console.log(chalk.green(`  ✓ Position closed: ${positionId}`));
        if (data.realizedPnl !== undefined) {
          console.log(chalk.cyan('  Realized PnL: ') + formatPnl(data.realizedPnl));
        }
      } else {
        console.log(chalk.yellow(`  ⚠ ${data.message || 'Failed to close position'}`));
      }
      console.log();
    } catch (e) { await handleError(e); }
  });

// ===========================================================================
// perps orders
// ===========================================================================

const ordersCmd = program.command('orders').description('Manage orders');

ordersCmd
  .command('list')
  .description('List open orders')
  .option('--json', 'Output raw JSON', false)
  .action(async function (this: Command) {
    try {
      const data = await apiGet(this.parent!, '/orders');
      if (this.opts().json) { printJson(data); return; }

      const orders = data.orders || [];
      console.log();
      if (orders.length === 0) {
        console.log(chalk.gray('  No open orders'));
      } else {
        printTable(
          ['ID', 'Symbol', 'Side', 'Type', 'Price', 'Size', 'Status'],
          orders.slice(0, 50).map((o: any) => [
            String(o.id || o.oid || '-').slice(0, 12),
            chalk.white.bold(o.coin || o.symbol || '-'),
            o.side === 'Buy' ? chalk.green('BUY') : chalk.red('SELL'),
            String(o.orderType || o.type || '-'),
            String(o.limitPx ?? o.price ?? '-'),
            String(o.sz ?? o.size ?? '-'),
            statusColor(o.status || o.state || '-'),
          ])
        );
        if (orders.length > 50) console.log(chalk.gray(`  ... and ${orders.length - 50} more`));
      }
      console.log();
    } catch (e) { await handleError(e); }
  });

ordersCmd
  .command('cancel')
  .description('Cancel an order')
  .requiredOption('--id <orderId>', 'Order ID to cancel')
  .option('--json', 'Output raw JSON', false)
  .action(async function (this: Command) {
    try {
      const { id } = this.opts();
      const data = await apiPost(this.parent!, '/orders/cancel', { orderId: id });
      if (this.opts().json) { printJson(data); return; }

      console.log();
      if (data.success) {
        console.log(chalk.green(`  ✓ Order ${id} cancelled`));
      } else {
        console.log(chalk.yellow(`  ⚠ ${data.message || 'Failed to cancel order'}`));
      }
      console.log();
    } catch (e) { await handleError(e); }
  });

ordersCmd
  .command('cancel-all')
  .description('Cancel all open orders')
  .option('--json', 'Output raw JSON', false)
  .action(async function (this: Command) {
    try {
      const data = await apiPost(this.parent!, '/orders/cancel-all');
      if (this.opts().json) { printJson(data); return; }

      console.log();
      if (data.success) {
        console.log(chalk.green(`  ✓ Cancelled ${data.cancelledCount ?? 'all'} orders`));
      } else {
        console.log(chalk.yellow(`  ⚠ ${data.message || 'Failed to cancel orders'}`));
      }
      console.log();
    } catch (e) { await handleError(e); }
  });

// ===========================================================================
// perps portfolio
// ===========================================================================

program
  .command('portfolio')
  .description('Show portfolio summary (balance, PnL, exposure)')
  .option('--json', 'Output raw JSON', false)
  .action(async function (this: Command) {
    try {
      const data = await apiGet(this, '/portfolio');
      if (this.opts().json) { printJson(data); return; }

      console.log();
      console.log(chalk.bold('  Portfolio Summary'));
      console.log(chalk.gray('  ' + '─'.repeat(48)));

      const acct = data.account || data;
      console.log(chalk.cyan('  Balance:      ') + chalk.white.bold(`$${(acct.accountValue ?? acct.balance ?? 0).toLocaleString()}`));
      console.log(chalk.cyan('  Equity:       ') + chalk.white.bold(`$${(acct.totalMarginUsed !== undefined ? (acct.accountValue ?? 0) - acct.totalMarginUsed : acct.equity ?? 0).toLocaleString()}`));

      if (data.positions) {
        const totalPnl = (data.positions as any[]).reduce((s: number, p: any) => s + (p.pnl ?? p.unrealizedPnl ?? 0), 0);
        console.log(chalk.cyan('  Unrealized:   ') + formatPnl(totalPnl));
        console.log(chalk.cyan('  Positions:    ') + chalk.white(String(data.positions.length)));
      }

      if (acct.leverage !== undefined) {
        console.log(chalk.cyan('  Leverage:     ') + chalk.white(`${acct.leverage}x`));
      }

      if (data.positions?.length) {
        console.log();
        printTable(
          ['Symbol', 'Side', 'Size', 'PnL', '% Change'],
          (data.positions as any[]).map((p: any) => [
            chalk.white.bold(p.coin || p.symbol || '-'),
            p.side === 'Long' ? chalk.green('LONG') : chalk.red('SHORT'),
            String(p.size ?? p.quantity ?? '-'),
            formatPnl(p.pnl ?? p.unrealizedPnl ?? 0),
            p.percentageChange != null ? `${p.percentageChange.toFixed(2)}%` : '-',
          ])
        );
      }
      console.log();
    } catch (e) { await handleError(e); }
  });

// ===========================================================================
// perps risk
// ===========================================================================

program
  .command('risk')
  .description('Show risk metrics (drawdown, daily loss, limits)')
  .option('--json', 'Output raw JSON', false)
  .action(async function (this: Command) {
    try {
      const data = await apiGet(this, '/risk');
      if (this.opts().json) { printJson(data); return; }

      console.log();
      console.log(chalk.bold('  Risk Metrics'));
      console.log(chalk.gray('  ' + '─'.repeat(48)));

      const m = data.metrics || data;
      const printRisk = (label: string, val: any, warn?: number, crit?: number) => {
        const num = typeof val === 'number' ? val : parseFloat(val);
        let color = chalk.white;
        if (!isNaN(num)) {
          if (crit !== undefined && num >= crit) color = chalk.red.bold;
          else if (warn !== undefined && num >= warn) color = chalk.yellow.bold;
          else color = chalk.green;
        }
        console.log(chalk.cyan(`  ${label.padEnd(18)}`) + color(String(val ?? 'N/A')));
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
        console.log(chalk.bold('  Risk Limits'));
        console.log(chalk.gray('  ' + '─'.repeat(48)));
        const limits = data.limits as any;
        if (limits.maxPositionSize != null) console.log(chalk.cyan('  Max Position:   ') + chalk.white(String(limits.maxPositionSize)));
        if (limits.maxLeverage != null) console.log(chalk.cyan('  Max Leverage:   ') + chalk.white(`${limits.maxLeverage}x`));
        if (limits.maxOpenPositions != null) console.log(chalk.cyan('  Max Positions:  ') + chalk.white(String(limits.maxOpenPositions)));
        if (limits.maxDailyLoss != null) console.log(chalk.cyan('  Max Daily Loss: ') + chalk.white(`$${limits.maxDailyLoss}`));
      }

      if (data.circuitBreakers?.length) {
        console.log();
        console.log(chalk.bold('  Circuit Breakers'));
        console.log(chalk.gray('  ' + '─'.repeat(48)));
        for (const cb of data.circuitBreakers) {
          const state = cb.state === 'CLOSED' ? chalk.green('CLOSED') : cb.state === 'OPEN' ? chalk.red.bold('OPEN') : chalk.yellow('HALF-OPEN');
          console.log(chalk.cyan(`  ${cb.name?.padEnd(20)}`) + state);
        }
      }
      console.log();
    } catch (e) { await handleError(e); }
  });

// ===========================================================================
// perps news
// ===========================================================================

program
  .command('news')
  .description('Show recent news articles')
  .option('--limit <n>', 'Number of articles', '10')
  .option('--json', 'Output raw JSON', false)
  .action(async function (this: Command) {
    try {
      const { limit } = this.opts();
      const data = await apiGet(this, '/news', { limit });
      if (this.opts().json) { printJson(data); return; }

      const articles = data.articles || [];
      console.log();
      if (articles.length === 0) {
        console.log(chalk.gray('  No recent news articles'));
      } else {
        for (const a of articles) {
          const sentiment = a.sentiment;
          const sentIcon = sentiment === 'positive' ? chalk.green('▲') : sentiment === 'negative' ? chalk.red('▼') : chalk.gray('●');
          const impact = a.impact || a.impactScore || 0;
          const impactColor = impact >= 0.7 ? chalk.red.bold : impact >= 0.4 ? chalk.yellow : chalk.gray;

          console.log(chalk.white.bold(`  ${a.title || a.headline || 'Untitled'}`));
          console.log(chalk.gray(`    ${a.source || a.publisher || ''} ${a.publishedAt || a.timestamp ? '· ' + new Date(a.publishedAt || a.timestamp).toLocaleString() : ''}`));
          console.log(`    ${sentIcon} Sentiment: ${chalk.white(String(sentiment || 'neutral'))}  ${impactColor('Impact: ' + (typeof impact === 'number' ? (impact * 100).toFixed(0) + '%' : impact))}`);
          if (a.summary) console.log(chalk.gray(`    ${a.summary.slice(0, 120)}${a.summary.length > 120 ? '...' : ''}`));
          console.log();
        }
      }
    } catch (e) { await handleError(e); }
  });

// ===========================================================================
// perps predictions
// ===========================================================================

program
  .command('predictions')
  .description('Show prediction market positions and signals')
  .option('--market <filter>', 'Filter by market (default: all)', 'all')
  .option('--json', 'Output raw JSON', false)
  .action(async function (this: Command) {
    try {
      const data = await apiGet(this, '/predictions');
      if (this.opts().json) { printJson(data); return; }

      console.log();
      console.log(chalk.bold('  Prediction Markets'));
      console.log(chalk.gray(`  Total Positions: ${data.totalPositions ?? 0}   Unrealized PnL: ${formatPnl(data.unrealizedPnL ?? 0)}`));
      console.log();

      const positions = (data.positions || []) as any[];
      const filtered = this.opts().market !== 'all'
        ? positions.filter((p: any) => (p.marketTitle || p.market || '').toLowerCase().includes(this.opts().market.toLowerCase()))
        : positions;

      if (filtered.length > 0) {
        printTable(
          ['Market', 'Outcome', 'Side', 'Size', 'PnL'],
          filtered.map((p: any) => [
            chalk.white((p.marketTitle || p.market || '-').slice(0, 40)),
            String(p.outcome || '-'),
            p.side === 'BUY' ? chalk.green('BUY') : chalk.red('SELL'),
            String(p.size ?? p.amount ?? '-'),
            formatPnl(p.unrealizedPnl ?? p.pnl ?? 0),
          ])
        );
      } else {
        console.log(chalk.gray('  No prediction market positions'));
      }

      if (data.signals?.length) {
        console.log();
        console.log(chalk.bold('  Recent Signals'));
        printTable(
          ['Market', 'Action', 'Confidence', 'Reason'],
          data.signals.slice(0, 10).map((s: any) => [
            chalk.white((s.marketTitle || '-').slice(0, 35)),
            s.action === 'BUY' ? chalk.green('BUY') : chalk.red('SELL'),
            s.confidence != null ? `${(s.confidence * 100).toFixed(0)}%` : '-',
            (s.reason || '-').slice(0, 40),
          ])
        );
      }
      console.log();
    } catch (e) { await handleError(e); }
  });

// ===========================================================================
// perps strategies
// ===========================================================================

program
  .command('strategies')
  .description('List trading strategies')
  .option('--json', 'Output raw JSON', false)
  .action(async function (this: Command) {
    try {
      const data = await apiGet(this, '/strategies');
      if (this.opts().json) { printJson(data); return; }

      const strategies = data.strategies || [];
      console.log();
      if (strategies.length === 0) {
        console.log(chalk.gray('  No strategies found'));
      } else {
        printTable(
          ['Name', 'Type', 'Status', 'Win Rate', 'Trades', 'PnL'],
          strategies.map((s: any) => [
            chalk.white.bold(s.name || '-'),
            String(s.type || s.category || '-'),
            s.active ? chalk.green('ACTIVE') : chalk.gray('INACTIVE'),
            s.winRate != null ? `${(s.winRate * 100).toFixed(1)}%` : '-',
            String(s.totalTrades ?? s.trades ?? '-'),
            formatPnl(s.totalPnl ?? s.pnl ?? 0),
          ])
        );
      }
      console.log();
    } catch (e) { await handleError(e); }
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
  .action(async function (this: Command) {
    try {
      const { limit } = this.opts();
      const data = await apiGet(this, '/backtest/history', { limit });
      if (this.opts().json) { printJson(data); return; }

      const runs = data.runs || [];
      console.log();
      console.log(chalk.bold(`  Backtest History  (${data.total ?? runs.length} runs)`));
      console.log();

      if (runs.length === 0) {
        console.log(chalk.gray('  No backtest results found'));
      } else {
        printTable(
          ['Strategy', 'Symbol', 'Period', 'Return', 'Sharpe', 'Max DD', 'Trades'],
          runs.map((r: any) => [
            chalk.white((r.strategyName || r.strategy || '-').slice(0, 20)),
            String(r.symbol || r.coin || '-'),
            `${r.startDate || '?'} → ${r.endDate || '?'}`,
            r.totalReturn != null ? chalk.bold((r.totalReturn >= 0 ? '+' : '') + (r.totalReturn * 100).toFixed(1) + '%') : '-',
            r.sharpeRatio != null ? String(r.sharpeRatio.toFixed(2)) : '-',
            r.maxDrawdown != null ? `${(r.maxDrawdown * 100).toFixed(1)}%` : '-',
            String(r.totalTrades ?? r.trades ?? '-'),
          ])
        );
      }
      console.log();
    } catch (e) { await handleError(e); }
  });

// ===========================================================================
// perps research
// ===========================================================================

program
  .command('research')
  .description('Show recent research / evolution results')
  .option('--limit <n>', 'Number of results', '5')
  .option('--json', 'Output raw JSON', false)
  .action(async function (this: Command) {
    try {
      const { limit } = this.opts();
      const data = await apiGet(this, '/evolution');
      if (this.opts().json) { printJson(data); return; }

      const results = data.results || data.generations || data.runs || [];
      console.log();
      console.log(chalk.bold('  Research & Evolution'));
      console.log();

      if (results.length === 0) {
        console.log(chalk.gray('  No research results found'));
        // Also try backtest history as fallback
        console.log(chalk.gray('  Showing recent backtests instead:'));
        try {
          const bt = await apiGet(this, '/backtest/history', { limit });
          const runs = bt.runs || [];
          if (runs.length > 0) {
            printTable(
              ['Strategy', 'Return', 'Sharpe', 'Trades'],
              runs.slice(0, Number(limit)).map((r: any) => [
                chalk.white(r.strategyName || r.strategy || '-'),
                r.totalReturn != null ? `${(r.totalReturn >= 0 ? '+' : '') + (r.totalReturn * 100).toFixed(1)}%` : '-',
                r.sharpeRatio != null ? String(r.sharpeRatio.toFixed(2)) : '-',
                String(r.totalTrades ?? r.trades ?? '-'),
              ])
            );
          }
        } catch { /* ignore */ }
      } else {
        for (const r of (results as any[]).slice(0, Number(limit))) {
          console.log(chalk.white.bold(`  ${r.strategyName || r.name || r.id || 'Unknown'}`));
          console.log(chalk.gray(`    Fitness: ${r.fitness ?? '-'}  Generation: ${r.generation ?? '-'}`));
          if (r.metrics) {
            const keys = Object.keys(r.metrics).slice(0, 4);
            console.log(chalk.gray(`    ${keys.map(k => `${k}: ${r.metrics[k]}`).join('  ')}`));
          }
          console.log();
        }
      }
      console.log();
    } catch (e) { await handleError(e); }
  });

// ===========================================================================
// perps config
// ===========================================================================

program
  .command('config')
  .description('Show configuration (secrets hidden by default)')
  .option('--show-secrets', 'Reveal secret values', false)
  .option('--json', 'Output raw JSON', false)
  .action(async function (this: Command) {
    try {
      const data = await apiGetRaw(this, '/api/config');
      if (this.opts().json) { printJson(data); return; }

      const showSecrets = this.opts().showSecrets;
      const SECRET_PATTERNS = [/key/i, /secret/i, /password/i, /private/i, /token/i, /wallet/i, /mnemonic/i, /seed/i];

      console.log();
      console.log(chalk.bold('  Configuration'));
      console.log(chalk.gray('  ' + '─'.repeat(48)));

      function printConfig(obj: any, prefix = '') {
        for (const [key, val] of Object.entries(obj)) {
          const fullKey = prefix ? `${prefix}.${key}` : key;
          if (val && typeof val === 'object' && !Array.isArray(val)) {
            console.log(chalk.cyan(`  ${fullKey}:`));
            printConfig(val, fullKey);
          } else {
            const isSecret = SECRET_PATTERNS.some(p => p.test(key));
            if (isSecret && !showSecrets) {
              console.log(chalk.gray(`    ${key}: `) + chalk.yellow('••••••••'));
            } else {
              console.log(chalk.gray(`    ${key}: `) + chalk.white(String(val ?? 'null')));
            }
          }
        }
      }

      printConfig(data.config || data);
      console.log();
    } catch (e) { await handleError(e); }
  });

// ===========================================================================
// perps emergency-stop
// ===========================================================================

program
  .command('emergency-stop')
  .description('⚠️  Emergency shutdown — close all positions and stop all agents')
  .option('--yes', 'Skip confirmation', false)
  .option('--json', 'Output raw JSON', false)
  .action(async function (this: Command) {
    const yes = this.opts().yes;

    if (!yes) {
      console.log();
      console.log(chalk.red.bold('  ╔══════════════════════════════════════╗'));
      console.log(chalk.red.bold('  ║  ⚠️  EMERGENCY STOP                 ║'));
      console.log(chalk.red.bold('  ║  This will close ALL positions and   ║'));
      console.log(chalk.red.bold('  ║  stop ALL agents immediately!        ║'));
      console.log(chalk.red.bold('  ╚══════════════════════════════════════╝'));
      console.log();

      // Simple confirmation via stdin
      const readline = await import('readline');
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const answer = await new Promise<string>(resolve => {
        rl.question(chalk.yellow('  Type "YES" to confirm: '), resolve);
      });
      rl.close();

      if (answer.trim() !== 'YES') {
        console.log(chalk.gray('\n  Cancelled.'));
        return;
      }
    }

    try {
      const data = await apiPost(this, '/emergency-stop');
      if (this.opts().json) { printJson(data); return; }

      console.log();
      if (data.success) {
        console.log(chalk.green.bold('  ✓ Emergency stop executed successfully'));
        if (data.positionsClosed != null) console.log(chalk.cyan(`    Positions closed: ${data.positionsClosed}`));
        if (data.ordersCancelled != null) console.log(chalk.cyan(`    Orders cancelled: ${data.ordersCancelled}`));
        if (data.agentsStopped != null) console.log(chalk.cyan(`    Agents stopped: ${data.agentsStopped}`));
      } else {
        console.log(chalk.yellow(`  ⚠ ${data.message || 'Emergency stop may not have completed fully'}`));
      }
      console.log();
    } catch (e) { await handleError(e); }
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
  .action(async function (this: Command) {
    try {
      const { minScore, limit } = this.opts();
      const data = await apiGetRaw(this, '/api/pumpfun/tokens', { minScore, limit });
      if (this.opts().json) { printJson(data); return; }

      const tokens = data.tokens || [];
      console.log();
      if (tokens.length === 0) {
        console.log(chalk.gray('  No tokens found matching criteria'));
      } else {
        printTable(
          ['Token', 'Score', 'Market Cap', 'Liquidity', 'Vol 24h', 'Rec'],
          tokens.slice(0, 30).map((t: any) => {
            const score = t.score ?? t.confidenceScore ?? 0;
            const scoreColor = score >= 0.8 ? chalk.green.bold : score >= 0.6 ? chalk.yellow : chalk.gray;
            return [
              chalk.white.bold((t.name || t.symbol || '-').slice(0, 16)),
              scoreColor(typeof score === 'number' ? score.toFixed(2) : String(score)),
              t.marketCap != null ? `$${Number(t.marketCap).toLocaleString()}` : '-',
              t.liquidity != null ? `$${Number(t.liquidity).toLocaleString()}` : '-',
              t.volume24h != null ? `$${Number(t.volume24h).toLocaleString()}` : '-',
              chalk.blue(t.recommendation || t.rec || '-'),
            ];
          })
        );
        if (tokens.length > 30) console.log(chalk.gray(`  ... and ${tokens.length - 30} more`));
      }
      console.log();
    } catch (e) { await handleError(e); }
  });

// ===========================================================================
// Parse
// ===========================================================================

program.parse(process.argv);
