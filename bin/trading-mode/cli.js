"use strict";
// Trading Mode CLI Tool
// Usage: npx ts-node src/trading-mode/cli.ts <command> [args]
// Fallback: node bin/trading-mode/cli.js <command> [args]
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
const http_1 = __importDefault(require("http"));
// ---------------------------------------------------------------------------
// ANSI color helpers (no dependencies)
// ---------------------------------------------------------------------------
const C = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
};
function modeColor(mode) {
    switch (mode) {
        case 'paper':
            return `${C.green}${C.bold}${mode}${C.reset}`;
        case 'testnet':
            return `${C.yellow}${mode}${C.reset}`;
        case 'live':
            return `${C.red}${C.bold}${mode}${C.reset}`;
        default:
            return mode;
    }
}
function enabledColor(enabled) {
    return enabled ? `${C.green}ON${C.reset}` : `${C.red}OFF${C.reset}`;
}
function header(text) {
    console.log(`\n${C.cyan}${C.bold}═══ ${text} ═══${C.reset}`);
}
function labelValue(label, value) {
    console.log(`  ${C.dim}${label}:${C.reset} ${value}`);
}
function warn(text) {
    console.log(`\n${C.yellow}⚠  ${text}${C.reset}`);
}
function error(text) {
    console.log(`\n${C.red}✗  ${text}${C.reset}`);
}
function ok(text) {
    console.log(`\n${C.green}✓  ${text}${C.reset}`);
}
// ---------------------------------------------------------------------------
// Simple HTTP helpers (no axios/fetch dep)
// ---------------------------------------------------------------------------
const API_BASE = process.env.MODE_API_URL || 'http://localhost:3001/api/mode';
function httpGet(path) {
    return new Promise((resolve, reject) => {
        const req = http_1.default.get(`${API_BASE}${path}`, { timeout: 5000 }, (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode || 500, body: JSON.parse(data) });
                }
                catch {
                    resolve({ status: res.statusCode || 500, body: data });
                }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
    });
}
function httpPut(path, body) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify(body);
        const url = new URL(`${API_BASE}${path}`);
        const req = http_1.default.request({
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
            timeout: 5000,
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode || 500, body: JSON.parse(data) });
                }
                catch {
                    resolve({ status: res.statusCode || 500, body: data });
                }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
        req.write(payload);
        req.end();
    });
}
function httpPost(path, body) {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : '';
        const url = new URL(`${API_BASE}${path}`);
        const headers = { 'Content-Type': 'application/json' };
        if (payload)
            headers['Content-Length'] = String(Buffer.byteLength(payload));
        const req = http_1.default.request({
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            method: 'POST',
            headers,
            timeout: 5000,
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode || 500, body: JSON.parse(data) });
                }
                catch {
                    resolve({ status: res.statusCode || 500, body: data });
                }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
        if (payload)
            req.write(payload);
        req.end();
    });
}
// ---------------------------------------------------------------------------
// Fallback: direct SQLite access when API is not running
// ---------------------------------------------------------------------------
async function useFallback() {
    try {
        await httpGet('/status');
        return false;
    }
    catch {
        return true;
    }
}
async function fallbackStatus() {
    // Dynamically import the controller (ts-node compatible)
    const { TradingModeController } = await Promise.resolve().then(() => __importStar(require('./controller')));
    const controller = TradingModeController.getInstance();
    return controller.getStatus();
}
async function fallbackSetMode(subsystem, mode) {
    const { TradingModeController } = await Promise.resolve().then(() => __importStar(require('./controller')));
    const controller = TradingModeController.getInstance();
    const pending = controller.setMode(subsystem === 'all' ? 'all' : subsystem, mode, 'cli');
    return { success: true, state: controller.getStatus().state, pendingConfirmation: pending };
}
async function fallbackConfirm(token) {
    const { TradingModeController } = await Promise.resolve().then(() => __importStar(require('./controller')));
    const controller = TradingModeController.getInstance();
    return controller.confirmModeChange(token);
}
async function fallbackHistory(limit) {
    const { TradingModeController } = await Promise.resolve().then(() => __importStar(require('./controller')));
    const controller = TradingModeController.getInstance();
    return controller.getHistory(limit);
}
async function fallbackEnvOverrides() {
    const { TradingModeController } = await Promise.resolve().then(() => __importStar(require('./controller')));
    const controller = TradingModeController.getInstance();
    return controller.exportEnvOverrides();
}
async function fallbackToggleSubsystem(subsystem, enable) {
    const { TradingModeController } = await Promise.resolve().then(() => __importStar(require('./controller')));
    const controller = TradingModeController.getInstance();
    const state = enable
        ? controller.enableSubsystem(subsystem)
        : controller.disableSubsystem(subsystem);
    return { success: true, state };
}
// ---------------------------------------------------------------------------
// Command handlers
// ---------------------------------------------------------------------------
async function cmdStatus() {
    const fallback = await useFallback();
    let status;
    if (fallback) {
        warn('Dashboard API not reachable, reading directly from SQLite');
        status = await fallbackStatus();
    }
    else {
        const res = await httpGet('/status');
        if (res.status !== 200) {
            error('Failed to get status');
            process.exit(1);
        }
        status = res.body;
    }
    header('Trading Mode Status');
    labelValue('Global mode', modeColor(status.state.global));
    for (const sub of ['perps', 'predictions', 'pumpfun']) {
        const info = status.subsystems[sub];
        console.log('');
        console.log(`  ${C.bold}${sub}${C.reset}  ${C.dim}(${info.description})${C.reset}`);
        labelValue('  Mode', modeColor(info.mode));
        labelValue('  Enabled', enabledColor(info.enabled));
        labelValue('  Env var', `${info.envVar}`);
    }
    if (status.pendingConfirmation) {
        console.log('');
        warn(`Pending live confirmation!`);
        labelValue('  Token', `${C.yellow}${status.pendingConfirmation.token}${C.reset}`);
        labelValue('  Subsystem', status.pendingConfirmation.subsystem);
        labelValue('  Expires', status.pendingConfirmation.expiresAt);
        console.log('');
        console.log(`  To confirm: ${C.cyan}perps mode confirm ${status.pendingConfirmation.token}${C.reset}`);
    }
    console.log('');
}
async function cmdSet(args) {
    // args can be: [mode] or [subsystem, mode]
    let subsystem = 'all';
    let mode;
    if (args.length === 1) {
        mode = args[0];
    }
    else if (args.length === 2) {
        subsystem = args[0];
        mode = args[1];
    }
    else {
        error('Usage: perps mode set [subsystem] <paper|testnet|live>');
        process.exit(1);
    }
    if (!mode || !['paper', 'testnet', 'live'].includes(mode)) {
        error('Mode must be one of: paper, testnet, live');
        process.exit(1);
    }
    const validSubs = ['perps', 'predictions', 'pumpfun', 'all'];
    if (!validSubs.includes(subsystem)) {
        error(`Subsystem must be one of: ${validSubs.join(', ')}`);
        process.exit(1);
    }
    const fallback = await useFallback();
    let result;
    if (fallback) {
        warn('Dashboard API not reachable, writing directly to SQLite');
        result = await fallbackSetMode(subsystem, mode);
    }
    else {
        const res = await httpPut('/set', { subsystem, mode, source: 'cli' });
        result = res.body;
    }
    if (result.pendingConfirmation) {
        warn(`Live mode requires confirmation!`);
        labelValue('  Token', `${C.yellow}${C.bold}${result.pendingConfirmation.token}${C.reset}`);
        labelValue('  Target', `${subsystem} → ${modeColor('live')}`);
        labelValue('  Expires', result.pendingConfirmation.expiresAt);
        console.log('');
        console.log(`  To confirm: ${C.cyan}perps mode confirm ${result.pendingConfirmation.token}${C.reset}`);
        console.log('');
        process.exit(0);
    }
    if (result.success) {
        ok(`Mode set: ${subsystem} → ${modeColor(mode)}`);
        if (result.state) {
            labelValue('  Global', modeColor(result.state.global));
        }
    }
    else {
        error('Failed to set mode');
        if (result.error)
            console.log(`  ${C.dim}${result.error}${C.reset}`);
        process.exit(1);
    }
}
async function cmdConfirm(args) {
    const token = args[0];
    if (!token) {
        error('Usage: perps mode confirm <token>');
        process.exit(1);
    }
    const fallback = await useFallback();
    let result;
    if (fallback) {
        result = await fallbackConfirm(token);
    }
    else {
        const res = await httpPost(`/confirm/${token}`);
        result = res.body;
    }
    if (result.success) {
        ok('Live mode confirmed!');
        if (result.state) {
            labelValue('  Global', modeColor(result.state.global));
            for (const sub of ['perps', 'predictions', 'pumpfun']) {
                labelValue(`  ${sub}`, modeColor(result.state[sub]));
            }
        }
    }
    else {
        error('Confirmation failed');
        if (result.error)
            console.log(`  ${C.dim}${result.error}${C.reset}`);
        process.exit(1);
    }
}
async function cmdHistory(args) {
    const limit = parseInt(args[0]) || 20;
    const fallback = await useFallback();
    let records;
    if (fallback) {
        warn('Dashboard API not reachable, reading directly from SQLite');
        records = await fallbackHistory(limit);
    }
    else {
        const res = await httpGet(`/history?limit=${limit}`);
        records = res.body;
    }
    if (!records || records.length === 0) {
        console.log(`\n${C.dim}No mode changes recorded.${C.reset}\n`);
        return;
    }
    header('Mode Change History');
    for (const r of records) {
        const time = new Date(r.timestamp).toLocaleString();
        const confirmed = r.confirmed ? '✓' : '○';
        const subsystem = r.subsystem === 'global' ? 'GLOBAL' : r.subsystem;
        console.log(`  ${C.dim}${time}${C.reset}  ${C.bold}${subsystem}${C.reset}  ${modeColor(r.fromMode)} → ${modeColor(r.toMode)}  ${confirmed}  ${C.dim}(${r.source})${C.reset}`);
        if (r.reason) {
            console.log(`    ${C.dim}${r.reason}${C.reset}`);
        }
    }
    console.log('');
}
async function cmdEnv() {
    const fallback = await useFallback();
    let overrides;
    if (fallback) {
        warn('Dashboard API not reachable, reading directly from SQLite');
        overrides = await fallbackEnvOverrides();
    }
    else {
        const res = await httpGet('/env-overrides');
        overrides = res.body;
    }
    header('Environment Variable Overrides');
    for (const [key, value] of Object.entries(overrides)) {
        const isLive = value === 'false' && (key === 'PAPER_TRADING' || key === 'PREDICTION_PAPER_TRADING' || key === 'PUMPFUN_PAPER_MODE');
        const color = isLive ? C.red : C.green;
        console.log(`  ${C.bold}${key}${C.reset}=${color}${value}${C.reset}`);
    }
    console.log('');
    console.log(`  ${C.dim}# Set these before starting subsystems${C.reset}`);
    console.log('');
}
async function cmdEnable(args) {
    const subsystem = args[0];
    if (!subsystem || !['perps', 'predictions', 'pumpfun'].includes(subsystem)) {
        error('Usage: perps mode enable <perps|predictions|pumpfun>');
        process.exit(1);
    }
    const fallback = await useFallback();
    if (fallback) {
        await fallbackToggleSubsystem(subsystem, true);
    }
    else {
        await httpPost(`/enable/${subsystem}`);
    }
    ok(`${subsystem} enabled`);
}
async function cmdDisable(args) {
    const subsystem = args[0];
    if (!subsystem || !['perps', 'predictions', 'pumpfun'].includes(subsystem)) {
        error('Usage: perps mode disable <perps|predictions|pumpfun>');
        process.exit(1);
    }
    const fallback = await useFallback();
    if (fallback) {
        await fallbackToggleSubsystem(subsystem, false);
    }
    else {
        await httpPost(`/disable/${subsystem}`);
    }
    ok(`${subsystem} disabled`);
}
// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
    const args = process.argv.slice(2);
    // Expect: perps mode <command> [args...]
    // But also support: cli.ts status (when called directly)
    let command;
    if (args[0] === 'perps' && args[1] === 'mode') {
        command = args[2];
        args.splice(0, 3);
    }
    else if (args[0] === 'mode') {
        command = args[1];
        args.splice(0, 2);
    }
    else {
        // Direct command without prefix
        command = args[0];
        args.splice(0, 1);
    }
    if (!command) {
        console.log(`${C.cyan}${C.bold}PerpsTrader Mode Controller${C.reset}`);
        console.log('');
        console.log(`  ${C.bold}Usage:${C.reset}  perps mode <command> [args]`);
        console.log('');
        console.log(`${C.bold}Commands:${C.reset}`);
        console.log(`  status                      Show current mode for all subsystems`);
        console.log(`  set [subsystem] <mode>       Set mode (paper|testnet|live)`);
        console.log(`  confirm <token>             Confirm live mode switch`);
        console.log(`  enable <subsystem>          Enable a subsystem`);
        console.log(`  disable <subsystem>         Disable a subsystem`);
        console.log(`  history [limit]             Show audit log`);
        console.log(`  env                         Show env var overrides`);
        console.log('');
        process.exit(0);
    }
    switch (command) {
        case 'status':
            await cmdStatus();
            break;
        case 'set':
            await cmdSet(args);
            break;
        case 'confirm':
            await cmdConfirm(args);
            break;
        case 'enable':
            await cmdEnable(args);
            break;
        case 'disable':
            await cmdDisable(args);
            break;
        case 'history':
            await cmdHistory(args);
            break;
        case 'env':
            await cmdEnv();
            break;
        default:
            error(`Unknown command: ${command}`);
            console.log(`  Run ${C.cyan}perps mode${C.reset} for usage`);
            process.exit(1);
    }
}
main().catch((err) => {
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
});
//# sourceMappingURL=cli.js.map