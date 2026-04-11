"use strict";
// =============================================================================
// PerpsTrader TUI — Catppuccin Mocha Theme
// =============================================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.box = exports.icons = exports.colors = void 0;
exports.formatUSD = formatUSD;
exports.formatPct = formatPct;
exports.formatNum = formatNum;
exports.timeAgo = timeAgo;
exports.formatUptime = formatUptime;
exports.pnlColor = pnlColor;
exports.pnlIcon = pnlIcon;
exports.truncate = truncate;
exports.padEnd = padEnd;
exports.progressBar = progressBar;
exports.riskLevelColor = riskLevelColor;
exports.signalColor = signalColor;
exports.sentimentColor = sentimentColor;
exports.colors = {
    base: '#1e1e2e',
    mantle: '#181825',
    crust: '#11111b',
    surface0: '#313244',
    surface1: '#45475a',
    surface2: '#585b70',
    overlay0: '#6c7086',
    overlay1: '#7f849c',
    overlay2: '#9399b2',
    subtext0: '#a6adc8',
    subtext1: '#bac2de',
    text: '#cdd6f4',
    rosewater: '#f5e0dc',
    flamingo: '#f2cdcd',
    pink: '#f5c2e7',
    mauve: '#cba6f7',
    red: '#f38ba8',
    maroon: '#eba0ac',
    peach: '#fab387',
    yellow: '#f9e2af',
    green: '#a6e3a1',
    teal: '#94e2d5',
    sky: '#89dceb',
    sapphire: '#74c7ec',
    blue: '#89b4fa',
    lavender: '#b4befe',
};
exports.icons = {
    logo: '',
    live: '\u{f06a9}',
    clock: '\u{f0150}',
    search: '\u{f056d}',
    news: '\u{f042f}',
    chart: '\u{f0df2}',
    wallet: '\u{f0566}',
    risk: '\u{f0df9}',
    strategy: '\u{f0df1}',
    prediction: '\u{f051a}',
    settings: '\u{f0513}',
    quit: '\u{f057c}',
    warning: '\u{f06db}',
    up: '\u{f04a0}',
    down: '\u{f04af}',
    dot: '\u25cf',
    diamond: '\u25c6',
    bullet: '\u25cb',
    check: '\u2713',
    cross: '\u2717',
    right: '\u2192',
    dash: '\u2014',
};
exports.box = {
    tl: '\u256d',
    tr: '\u256e',
    bl: '\u2570',
    br: '\u2571',
    h: '\u2500',
    v: '\u2502',
    lj: '\u251c',
    rj: '\u2524',
    tj: '\u252c',
    bj: '\u2534',
    cross: '\u253c',
};
// =============================================================================
// Formatting Helpers
// =============================================================================
function formatUSD(value) {
    const prefix = value > 0 ? '+' : value < 0 ? '-' : '';
    const abs = Math.abs(value);
    if (abs >= 1000000)
        return `${prefix}$${(abs / 1000000).toFixed(2)}M`;
    if (abs >= 1000)
        return `${prefix}$${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return `${prefix}$${abs.toFixed(2)}`;
}
function formatPct(value) {
    const prefix = value > 0 ? '+' : '';
    return `${prefix}${value.toFixed(2)}%`;
}
function formatNum(value, decimals = 2) {
    if (value == null || isNaN(value))
        return '0';
    return value.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    });
}
function timeAgo(dateStr) {
    if (!dateStr)
        return '';
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    if (isNaN(then))
        return '';
    const diff = Math.floor((now - then) / 1000);
    if (diff < 5)
        return 'just now';
    if (diff < 60)
        return `${diff}s ago`;
    if (diff < 3600)
        return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400)
        return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}
function formatUptime(ms) {
    if (!ms || ms < 0)
        return '0s';
    const days = Math.floor(ms / 86400000);
    const hours = Math.floor((ms % 86400000) / 3600000);
    const mins = Math.floor((ms % 3600000) / 60000);
    if (days > 0)
        return `${days}d ${hours}h`;
    if (hours > 0)
        return `${hours}h ${mins}m`;
    return `${mins}m`;
}
function pnlColor(value) {
    if (value > 0)
        return exports.colors.green;
    if (value < 0)
        return exports.colors.red;
    return exports.colors.text;
}
function pnlIcon(value) {
    if (value > 0)
        return exports.icons.up;
    if (value < 0)
        return exports.icons.down;
    return exports.icons.diamond;
}
function truncate(str, maxLen) {
    if (!str)
        return '';
    if (str.length <= maxLen)
        return str;
    return str.substring(0, maxLen - 1) + '\u2026';
}
function padEnd(str, len) {
    const s = str || '';
    if (s.length >= len)
        return s.substring(0, len);
    return s + ' '.repeat(len - s.length);
}
function progressBar(percent, width, filled = '\u2588', empty = '\u2591') {
    const p = Math.min(100, Math.max(0, percent));
    const filledCount = Math.round((p / 100) * width);
    return filled.repeat(Math.max(0, filledCount)) + empty.repeat(Math.max(0, width - filledCount));
}
function riskLevelColor(level) {
    switch ((level || '').toUpperCase()) {
        case 'LOW':
            return exports.colors.green;
        case 'MEDIUM':
            return exports.colors.yellow;
        case 'HIGH':
            return exports.colors.peach;
        case 'CRITICAL':
            return exports.colors.red;
        default:
            return exports.colors.overlay0;
    }
}
function signalColor(signal) {
    switch ((signal || '').toUpperCase()) {
        case 'BUY':
        case 'LONG':
        case 'BULLISH':
            return exports.colors.green;
        case 'SELL':
        case 'SHORT':
        case 'BEARISH':
            return exports.colors.red;
        default:
            return exports.colors.yellow;
    }
}
function sentimentColor(sentiment) {
    switch ((sentiment || '').toUpperCase()) {
        case 'POSITIVE':
        case 'BULLISH':
            return exports.colors.green;
        case 'NEGATIVE':
        case 'BEARISH':
            return exports.colors.red;
        case 'NEUTRAL':
        default:
            return exports.colors.yellow;
    }
}
