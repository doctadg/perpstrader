#!/usr/bin/env node
"use strict";
// =============================================================================
// PerpsTrader TUI — Main Entry Point
// =============================================================================
// Hyprland rice-style terminal dashboard for the PerpsTrader trading system.
// Uses Ink (React for CLI) with Catppuccin Mocha color palette.
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
exports.waitUntilExit = void 0;
const react_1 = __importStar(require("react"));
const ink_1 = require("ink");
const chalk_1 = __importDefault(require("chalk"));
const T = __importStar(require("./theme"));
const api_1 = require("./api");
const components_1 = require("./components");
const views_1 = require("./views");
// =============================================================================
// Constants
// =============================================================================
const VIEW_NAMES = [
    'Dashboard',
    'Positions',
    'News',
    'Risk',
    'Strategies',
    'Predictions',
];
const DEFAULT_REFRESH_INTERVAL = 5; // seconds
const MIN_REFRESH = 1;
const MAX_REFRESH = 60;
const EMPTY_DATA = {
    status: null,
    portfolio: null,
    positions: null,
    signals: null,
    news: null,
    predictions: null,
    risk: null,
    strategies: null,
};
// =============================================================================
// App Component
// =============================================================================
function App() {
    const { exit } = (0, ink_1.useApp)();
    const { stdout } = (0, ink_1.useStdout)();
    // State
    const [activeView, setActiveView] = (0, react_1.useState)(0);
    const [data, setData] = (0, react_1.useState)(EMPTY_DATA);
    const [connected, setConnected] = (0, react_1.useState)(false);
    const [loading, setLoading] = (0, react_1.useState)(true);
    const [lastRefresh, setLastRefresh] = (0, react_1.useState)(null);
    const [refreshInterval, setRefreshInterval] = (0, react_1.useState)(DEFAULT_REFRESH_INTERVAL);
    const [scrollOffset, setScrollOffset] = (0, react_1.useState)(0);
    const [uptime, setUptime] = (0, react_1.useState)(0);
    const [showHelp, setShowHelp] = (0, react_1.useState)(false);
    const refreshTimerRef = (0, react_1.useRef)(null);
    const uptimeTimerRef = (0, react_1.useRef)(null);
    const mountedRef = (0, react_1.useRef)(true);
    // =============================================================================
    // Data Fetching
    // =============================================================================
    const refresh = (0, react_1.useCallback)(async () => {
        setLoading(true);
        try {
            const result = await (0, api_1.fetchAllData)();
            if (!mountedRef.current)
                return;
            setData(result.data);
            setConnected(result.connected);
            setLastRefresh(new Date());
            setLoading(false);
        }
        catch {
            if (mountedRef.current) {
                setConnected(false);
                setLoading(false);
            }
        }
    }, []);
    // Initial fetch + auto-refresh
    (0, react_1.useEffect)(() => {
        mountedRef.current = true;
        refresh();
        // Auto-refresh interval
        refreshTimerRef.current = setInterval(() => {
            refresh();
        }, refreshInterval * 1000);
        // Uptime ticker
        const startTime = Date.now();
        uptimeTimerRef.current = setInterval(() => {
            setUptime(Date.now() - startTime);
        }, 1000);
        return () => {
            mountedRef.current = false;
            if (refreshTimerRef.current)
                clearInterval(refreshTimerRef.current);
            if (uptimeTimerRef.current)
                clearInterval(uptimeTimerRef.current);
        };
    }, [refreshInterval, refresh]);
    // =============================================================================
    // Keyboard Navigation
    // =============================================================================
    (0, ink_1.useInput)((input, key) => {
        // View switching: 1-6
        if (input >= '1' && input <= '6') {
            setActiveView(parseInt(input) - 1);
            setScrollOffset(0);
            return;
        }
        // Quit
        if (input === 'q' || key.escape) {
            exit();
            return;
        }
        // Manual refresh
        if (input === 'r') {
            refresh();
            return;
        }
        // Adjust refresh interval
        if (input === '+' || input === '=') {
            setRefreshInterval((prev) => Math.max(MIN_REFRESH, prev - 1));
            return;
        }
        if (input === '-') {
            setRefreshInterval((prev) => Math.min(MAX_REFRESH, prev + 1));
            return;
        }
        // Scroll
        if (key.upArrow || input === 'k') {
            setScrollOffset((prev) => Math.max(0, prev - 1));
            return;
        }
        if (key.downArrow || input === 'j') {
            setScrollOffset((prev) => prev + 1);
            return;
        }
        if (input === 'g') {
            setScrollOffset(0);
            return;
        }
        // Tab to cycle views
        if (input === 'h') {
            setActiveView((prev) => (prev - 1 + VIEW_NAMES.length) % VIEW_NAMES.length);
            setScrollOffset(0);
            return;
        }
        if (input === 'l') {
            setActiveView((prev) => (prev + 1) % VIEW_NAMES.length);
            setScrollOffset(0);
            return;
        }
        // Help
        if (input === '?') {
            setShowHelp((prev) => !prev);
            return;
        }
    });
    // =============================================================================
    // Render View
    // =============================================================================
    const renderView = () => {
        switch (activeView) {
            case 0:
                return react_1.default.createElement(views_1.DashboardView, { data: data, loading: loading, scrollOffset: scrollOffset });
            case 1:
                return react_1.default.createElement(views_1.PositionsView, { data: data, loading: loading, scrollOffset: scrollOffset });
            case 2:
                return react_1.default.createElement(views_1.NewsView, { data: data, loading: loading, scrollOffset: scrollOffset });
            case 3:
                return react_1.default.createElement(views_1.RiskView, { data: data, loading: loading, scrollOffset: scrollOffset });
            case 4:
                return react_1.default.createElement(views_1.StrategiesView, { data: data, loading: loading, scrollOffset: scrollOffset });
            case 5:
                return react_1.default.createElement(views_1.PredictionsView, { data: data, loading: loading, scrollOffset: scrollOffset });
            default:
                return react_1.default.createElement(views_1.DashboardView, { data: data, loading: loading, scrollOffset: scrollOffset });
        }
    };
    // =============================================================================
    // Connection Banner
    // =============================================================================
    const connectionBanner = !connected && !loading ? (react_1.default.createElement(ink_1.Box, { borderStyle: "round", borderColor: T.colors.surface1, paddingLeft: 2, paddingRight: 2, paddingTop: 1, paddingBottom: 1, marginBottom: 1, justifyContent: "center" },
        react_1.default.createElement(ink_1.Box, null,
            react_1.default.createElement(ink_1.Text, { color: T.colors.yellow },
                T.icons.warning,
                " "),
            react_1.default.createElement(ink_1.Text, { color: T.colors.subtext0 }, "Cannot connect to Agent API at "),
            react_1.default.createElement(ink_1.Text, { color: T.colors.peach, bold: true }, (0, api_1.getApiUrl)()),
            react_1.default.createElement(ink_1.Text, { color: T.colors.overlay0 },
                " ",
                '\u2014',
                " showing empty state. "),
            react_1.default.createElement(ink_1.Text, { color: T.colors.overlay1 }, "[r] to retry")))) : null;
    // =============================================================================
    // Help Overlay
    // =============================================================================
    const helpOverlay = showHelp ? (react_1.default.createElement(ink_1.Box, { flexDirection: "column", borderStyle: "round", borderColor: T.colors.mauve, paddingLeft: 2, paddingRight: 2, paddingTop: 1, paddingBottom: 1, marginBottom: 1 },
        react_1.default.createElement(ink_1.Text, { color: T.colors.mauve, bold: true },
            '  ',
            T.icons.settings,
            " Keyboard Shortcuts"),
        react_1.default.createElement(ink_1.Box, { flexDirection: "column", marginTop: 1 },
            react_1.default.createElement(ink_1.Text, { color: T.colors.text },
                react_1.default.createElement(ink_1.Text, { color: T.colors.mauve, bold: true },
                    '  ',
                    "[1-6]"),
                " Switch views"),
            react_1.default.createElement(ink_1.Text, { color: T.colors.text },
                react_1.default.createElement(ink_1.Text, { color: T.colors.mauve, bold: true },
                    '  ',
                    "[h/l]"),
                " Previous/next view"),
            react_1.default.createElement(ink_1.Text, { color: T.colors.text },
                react_1.default.createElement(ink_1.Text, { color: T.colors.mauve, bold: true },
                    '  ',
                    "[\\u2191\\u2193 j/k]"),
                " Scroll content"),
            react_1.default.createElement(ink_1.Text, { color: T.colors.text },
                react_1.default.createElement(ink_1.Text, { color: T.colors.mauve, bold: true },
                    '  ',
                    "[g/End]"),
                " Scroll to top/bottom"),
            react_1.default.createElement(ink_1.Text, { color: T.colors.text },
                react_1.default.createElement(ink_1.Text, { color: T.colors.mauve, bold: true },
                    '  ',
                    "[r]"),
                " Refresh data now"),
            react_1.default.createElement(ink_1.Text, { color: T.colors.text },
                react_1.default.createElement(ink_1.Text, { color: T.colors.mauve, bold: true },
                    '  ',
                    "[+/-]"),
                " Adjust refresh interval (",
                refreshInterval,
                "s)"),
            react_1.default.createElement(ink_1.Text, { color: T.colors.text },
                react_1.default.createElement(ink_1.Text, { color: T.colors.mauve, bold: true },
                    '  ',
                    "[?]"),
                " Toggle this help"),
            react_1.default.createElement(ink_1.Text, { color: T.colors.text },
                react_1.default.createElement(ink_1.Text, { color: T.colors.red, bold: true },
                    '  ',
                    "[q/Esc]"),
                " Quit")),
        react_1.default.createElement(ink_1.Text, { color: T.colors.overlay0 },
            '  ',
            "Press [?] to close"))) : null;
    // =============================================================================
    // Version from status
    // =============================================================================
    const version = data.status?.version || '2.0.0';
    // =============================================================================
    // Main Layout
    // =============================================================================
    return (react_1.default.createElement(ink_1.Box, { flexDirection: "column" },
        react_1.default.createElement(components_1.HeaderBar, { connected: connected, portfolio: data.portfolio, refreshInterval: refreshInterval, uptime: uptime, version: version }),
        connectionBanner,
        react_1.default.createElement(ink_1.Box, { flexDirection: "column", flexGrow: 1 }, renderView()),
        helpOverlay,
        react_1.default.createElement(components_1.FooterBar, { activeView: activeView, refreshInterval: refreshInterval, loading: loading })));
}
// =============================================================================
// Bootstrap
// =============================================================================
// Set terminal title
process.title = 'PerpsTrader TUI';
if (process.stdout.isTTY) {
    process.stdout.write('\x1b]2;PerpsTrader TUI\x07');
}
// Check for TTY support (Ink requires raw mode on stdin)
if (!process.stdin.isTTY) {
    process.stdout.write(chalk_1.default.hex(T.colors.red)(`\n  ${T.icons.cross} Error: PerpsTrader TUI requires an interactive terminal (TTY).\n`));
    process.stdout.write(chalk_1.default.hex(T.colors.overlay0)(`  ${T.icons.dash} Run directly in a terminal, not piped.\n\n`));
    process.exit(1);
}
// Render the app
const { waitUntilExit } = (0, ink_1.render)(react_1.default.createElement(App, null));
exports.waitUntilExit = waitUntilExit;
// Handle uncaught errors gracefully
process.on('uncaughtException', (err) => {
    process.stderr.write(chalk_1.default.hex(T.colors.red)(`\n  ${T.icons.cross} Error: ${err.message}\n`));
    process.exit(1);
});
process.on('unhandledRejection', (reason) => {
    process.stderr.write(chalk_1.default.hex(T.colors.yellow)(`\n  ${T.icons.warning} Unhandled rejection: ${reason}\n`));
});
