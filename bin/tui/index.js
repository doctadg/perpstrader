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
const actions_1 = require("./actions");
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
    'Orders',
    'Backtest',
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
    const [selectedIndex, setSelectedIndex] = (0, react_1.useState)(0);
    const [uptime, setUptime] = (0, react_1.useState)(0);
    const [showHelp, setShowHelp] = (0, react_1.useState)(false);
    // Action state
    const [actionPrompt, setActionPrompt] = (0, react_1.useState)(null);
    const [actionResult, setActionResult] = (0, react_1.useState)(null);
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
            setData((prev) => ({
                ...prev,
                ...result.data,
            }));
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
    // Fetch additional data for specific views
    const refreshOrders = (0, react_1.useCallback)(async () => {
        try {
            const result = await (0, api_1.fetchOrders)();
            if (mountedRef.current && result) {
                setData((prev) => ({ ...prev, orders: result }));
            }
        }
        catch { /* ignore */ }
    }, []);
    const refreshBacktest = (0, react_1.useCallback)(async () => {
        try {
            const result = await (0, api_1.fetchBacktestHistory)();
            if (mountedRef.current && result) {
                setData((prev) => ({ ...prev, backtest: result }));
            }
        }
        catch { /* ignore */ }
    }, []);
    // Initial fetch + auto-refresh
    (0, react_1.useEffect)(() => {
        mountedRef.current = true;
        refresh();
        // Auto-refresh interval
        refreshTimerRef.current = setInterval(() => {
            refresh();
            // Also refresh view-specific data
            if (activeView === 6)
                refreshOrders(); // Orders view
            if (activeView === 7)
                refreshBacktest(); // Backtest view
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
    }, [refreshInterval, refresh, activeView]);
    // Fetch view-specific data when switching views
    (0, react_1.useEffect)(() => {
        if (activeView === 6)
            refreshOrders();
        if (activeView === 7)
            refreshBacktest();
    }, [activeView, refreshOrders, refreshBacktest]);
    // =============================================================================
    // Item count helpers for scrolling bounds
    // =============================================================================
    const getItemCount = (0, react_1.useCallback)(() => {
        switch (activeView) {
            case 1: // Positions
                return (data.positions?.positions || []).length;
            case 4: // Strategies
                return (data.strategies?.strategies || []).length;
            case 6: // Orders
                return (data.orders?.orders || []).length;
            case 7: // Backtest
                return (data.backtest?.runs || []).length;
            default:
                return 0;
        }
    }, [activeView, data]);
    // =============================================================================
    // Action handlers
    // =============================================================================
    const handleActionResult = (0, react_1.useCallback)((result) => {
        setActionPrompt(null);
        setActionResult(result);
        // Refresh data after action
        setTimeout(() => refresh(), 500);
    }, [refresh]);
    const { executeAction } = (0, actions_1.useActions)(handleActionResult);
    const dismissResult = (0, react_1.useCallback)(() => {
        setActionResult(null);
    }, []);
    const handleViewAction = (0, react_1.useCallback)((type, actionData) => {
        switch (type) {
            case 'close-position': {
                const positions = data.positions?.positions || [];
                const selected = positions[selectedIndex];
                if (!selected)
                    return;
                setActionPrompt({
                    type: 'close-position',
                    data: { positionId: selected.id || selected.coin || selected.symbol },
                    message: `Close position: ${selected.symbol || selected.coin}? (PnL will be realized)`,
                });
                break;
            }
            case 'cancel-order': {
                const orders = data.orders?.orders || [];
                const selected = orders[selectedIndex];
                if (!selected)
                    return;
                setActionPrompt({
                    type: 'cancel-order',
                    data: { orderId: selected.id || selected.orderId },
                    message: `Cancel order ${selected.id || selected.orderId} (${selected.symbol})?`,
                });
                break;
            }
            default:
                break;
        }
    }, [data, selectedIndex]);
    // =============================================================================
    // Keyboard Navigation
    // =============================================================================
    (0, ink_1.useInput)((input, key) => {
        // If confirmation dialog is shown, don't process other keys
        if (actionPrompt)
            return;
        // If action result toast is shown, any key dismisses
        if (actionResult)
            return;
        // View switching: 1-8
        if (input >= '1' && input <= '8') {
            setActiveView(parseInt(input) - 1);
            setScrollOffset(0);
            setSelectedIndex(0);
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
            if (activeView === 6)
                refreshOrders();
            if (activeView === 7)
                refreshBacktest();
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
        // Emergency Stop — 'e' key anywhere
        if (input === 'e' && !showHelp) {
            setActionPrompt({
                type: 'emergency-stop',
                message: 'EMERGENCY STOP — close all positions?',
            });
            return;
        }
        // Trigger Trading Cycle — 't' key
        if (input === 't' && !showHelp) {
            setActionPrompt({
                type: 'trigger-cycle',
                message: 'Trigger a new trading cycle?',
            });
            return;
        }
        // Close Position — 'c' key on Positions view
        if (input === 'c' && activeView === 1 && !showHelp) {
            handleViewAction('close-position', null);
            return;
        }
        // Cancel Order — 'x' key on Orders view
        if (input === 'x' && activeView === 6 && !showHelp) {
            handleViewAction('cancel-order', null);
            return;
        }
        // Scroll / Select — Up/Down or j/k
        if (key.upArrow || input === 'k') {
            setSelectedIndex((prev) => Math.max(0, prev - 1));
            // Auto-scroll: if selection goes above visible area, scroll up
            if (selectedIndex <= scrollOffset) {
                setScrollOffset((prev) => Math.max(0, prev - 1));
            }
            return;
        }
        if (key.downArrow || input === 'j') {
            const count = getItemCount();
            const newIdx = Math.min(count - 1, selectedIndex + 1);
            setSelectedIndex(newIdx);
            // Auto-scroll: if selection goes below visible area, scroll down
            const maxVisible = activeView === 1 ? 2 : activeView === 4 ? 2 : activeView === 7 ? 10 : 15;
            if (newIdx >= scrollOffset + maxVisible) {
                setScrollOffset((prev) => prev + 1);
            }
            return;
        }
        if (input === 'g') {
            setScrollOffset(0);
            setSelectedIndex(0);
            return;
        }
        // Page up/down
        if (key.pageUp) {
            const maxVisible = activeView === 1 ? 2 : activeView === 4 ? 2 : activeView === 7 ? 10 : 15;
            const jump = Math.max(1, maxVisible - 1);
            setScrollOffset((prev) => Math.max(0, prev - jump));
            setSelectedIndex((prev) => Math.max(0, prev - jump));
            return;
        }
        if (key.pageDown) {
            const count = getItemCount();
            const maxVisible = activeView === 1 ? 2 : activeView === 4 ? 2 : activeView === 7 ? 10 : 15;
            const jump = Math.max(1, maxVisible - 1);
            setScrollOffset((prev) => Math.min(Math.max(0, count - maxVisible), prev + jump));
            setSelectedIndex((prev) => Math.min(count - 1, prev + jump));
            return;
        }
        // Tab to cycle views
        if (input === 'h') {
            setActiveView((prev) => (prev - 1 + VIEW_NAMES.length) % VIEW_NAMES.length);
            setScrollOffset(0);
            setSelectedIndex(0);
            return;
        }
        if (input === 'l') {
            setActiveView((prev) => (prev + 1) % VIEW_NAMES.length);
            setScrollOffset(0);
            setSelectedIndex(0);
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
        const props = {
            data,
            loading,
            scrollOffset,
            selectedIndex,
            onAction: handleViewAction,
        };
        switch (activeView) {
            case 0:
                return react_1.default.createElement(views_1.DashboardView, { ...props });
            case 1:
                return react_1.default.createElement(views_1.PositionsView, { ...props });
            case 2:
                return react_1.default.createElement(views_1.NewsView, { ...props });
            case 3:
                return react_1.default.createElement(views_1.RiskView, { ...props });
            case 4:
                return react_1.default.createElement(views_1.StrategiesView, { ...props });
            case 5:
                return react_1.default.createElement(views_1.PredictionsView, { ...props });
            case 6:
                return react_1.default.createElement(views_1.OrdersView, { ...props });
            case 7:
                return react_1.default.createElement(views_1.BacktestView, { ...props });
            default:
                return react_1.default.createElement(views_1.DashboardView, { ...props });
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
                    "[1-8]"),
                " Switch views"),
            react_1.default.createElement(ink_1.Text, { color: T.colors.text },
                react_1.default.createElement(ink_1.Text, { color: T.colors.mauve, bold: true },
                    '  ',
                    "[h/l]"),
                " Previous/next view"),
            react_1.default.createElement(ink_1.Text, { color: T.colors.text },
                react_1.default.createElement(ink_1.Text, { color: T.colors.mauve, bold: true },
                    '  ',
                    '\u2191\u2193 j/k'),
                " Select / scroll"),
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
                react_1.default.createElement(ink_1.Text, { color: T.colors.peach, bold: true },
                    '  ',
                    "[e]"),
                " Emergency stop (double confirm)"),
            react_1.default.createElement(ink_1.Text, { color: T.colors.text },
                react_1.default.createElement(ink_1.Text, { color: T.colors.teal, bold: true },
                    '  ',
                    "[t]"),
                " Trigger trading cycle"),
            react_1.default.createElement(ink_1.Text, { color: T.colors.text },
                react_1.default.createElement(ink_1.Text, { color: T.colors.yellow, bold: true },
                    '  ',
                    "[c]"),
                " Close selected position"),
            react_1.default.createElement(ink_1.Text, { color: T.colors.text },
                react_1.default.createElement(ink_1.Text, { color: T.colors.yellow, bold: true },
                    '  ',
                    "[x]"),
                " Cancel selected order"),
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
        react_1.default.createElement(ink_1.Box, { flexDirection: "column", flexGrow: 1 },
            renderView(),
            actionPrompt && (react_1.default.createElement(actions_1.ConfirmDialog, { prompt: actionPrompt, requireDouble: actionPrompt.type === 'emergency-stop', onConfirm: () => executeAction(actionPrompt), onCancel: () => setActionPrompt(null) })),
            actionResult && (react_1.default.createElement(actions_1.ActionToast, { result: actionResult, onDismiss: dismissResult }))),
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
//# sourceMappingURL=index.js.map