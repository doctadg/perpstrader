"use strict";
// =============================================================================
// PerpsTrader TUI — Shared UI Components
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
exports.Panel = Panel;
exports.HeaderBar = HeaderBar;
exports.FooterBar = FooterBar;
exports.Spinner = Spinner;
exports.EmptyState = EmptyState;
exports.ProgressBar = ProgressBar;
exports.Label = Label;
exports.DataRow = DataRow;
exports.Separator = Separator;
exports.ViewWrapper = ViewWrapper;
const react_1 = __importDefault(require("react"));
const ink_1 = require("ink");
const T = __importStar(require("./theme"));
function Panel({ title, icon, width, flex, children, borderColor, dim, compact, }) {
    const borderCol = borderColor || T.colors.surface1;
    const titleColor = dim ? T.colors.overlay1 : T.colors.subtext1;
    const iconColor = dim ? T.colors.overlay0 : T.colors.mauve;
    return (react_1.default.createElement(ink_1.Box, { flexDirection: "column", width: width, flexGrow: flex, flexShrink: 0, borderStyle: "round", borderColor: borderCol, paddingLeft: 1, paddingRight: 1, paddingTop: 0, paddingBottom: 0, marginBottom: 1 },
        react_1.default.createElement(ink_1.Box, null,
            icon && react_1.default.createElement(ink_1.Text, { color: iconColor }, icon),
            icon && react_1.default.createElement(ink_1.Text, null, " "),
            react_1.default.createElement(ink_1.Text, { color: titleColor, bold: true }, title),
            react_1.default.createElement(ink_1.Text, { color: T.colors.surface2 },
                " ",
                '\u2500'.repeat(3))),
        react_1.default.createElement(ink_1.Box, { flexDirection: "column" }, children)));
}
function HeaderBar({ connected, portfolio, refreshInterval, uptime, version }) {
    const { stdout } = (0, ink_1.useStdout)();
    const w = stdout?.columns || 100;
    const portfolioValue = portfolio?.totalValue || 0;
    const unrealizedPnL = portfolio?.unrealizedPnL || 0;
    const pnlPct = portfolioValue > 0 ? (unrealizedPnL / portfolioValue) * 100 : 0;
    const positionCount = portfolio?.positionCount || 0;
    const statusText = connected ? 'LIVE' : 'OFFLINE';
    const statusColor = connected ? T.colors.green : T.colors.red;
    const uptimeStr = T.formatUptime(uptime);
    return (react_1.default.createElement(ink_1.Box, { flexDirection: "column" },
        react_1.default.createElement(ink_1.Text, { color: T.colors.surface1 }, '\u2500'.repeat(w)),
        react_1.default.createElement(ink_1.Box, null,
            react_1.default.createElement(ink_1.Text, null, " "),
            react_1.default.createElement(ink_1.Text, { color: T.colors.mauve, bold: true },
                T.icons.logo,
                " PerpsTrader"),
            version && react_1.default.createElement(ink_1.Text, { color: T.colors.overlay0 },
                " ",
                version),
            react_1.default.createElement(ink_1.Text, { color: T.colors.surface2 },
                " ",
                '\u2502'),
            react_1.default.createElement(ink_1.Text, { color: statusColor },
                " ",
                T.icons.dot,
                " ",
                statusText),
            react_1.default.createElement(ink_1.Text, { color: T.colors.surface2 },
                " ",
                '\u2502'),
            react_1.default.createElement(ink_1.Text, { color: T.colors.subtext0 },
                " ",
                T.icons.wallet,
                " ",
                T.formatUSD(portfolioValue)),
            react_1.default.createElement(ink_1.Text, { color: T.colors.surface2 },
                " ",
                '\u2502'),
            react_1.default.createElement(ink_1.Text, { color: T.pnlColor(unrealizedPnL) },
                " ",
                T.pnlIcon(unrealizedPnL),
                " ",
                T.formatUSD(unrealizedPnL)),
            react_1.default.createElement(ink_1.Text, { color: T.colors.overlay1 },
                " (",
                T.formatPct(pnlPct),
                ")"),
            react_1.default.createElement(ink_1.Text, { color: T.colors.surface2 },
                " ",
                '\u2502'),
            react_1.default.createElement(ink_1.Text, { color: T.colors.overlay0 },
                " ",
                T.icons.clock,
                " ",
                uptimeStr),
            react_1.default.createElement(ink_1.Text, { color: T.colors.surface2 },
                " ",
                '\u2502'),
            react_1.default.createElement(ink_1.Text, { color: T.colors.overlay0 },
                " ",
                positionCount,
                " pos"),
            react_1.default.createElement(ink_1.Text, { color: T.colors.surface2 },
                " ",
                '\u2502'),
            react_1.default.createElement(ink_1.Text, { color: T.colors.overlay0 },
                " ",
                refreshInterval,
                "s")),
        react_1.default.createElement(ink_1.Text, { color: T.colors.surface1 }, '\u2500'.repeat(w))));
}
function FooterBar({ activeView, refreshInterval, loading }) {
    const { stdout } = (0, ink_1.useStdout)();
    const w = stdout?.columns || 100;
    const views = [
        { key: '1', short: 'Dash' },
        { key: '2', short: 'Pos' },
        { key: '3', short: 'News' },
        { key: '4', short: 'Risk' },
        { key: '5', short: 'Strat' },
        { key: '6', short: 'Pred' },
        { key: '7', short: 'Ordr' },
        { key: '8', short: 'Btst' },
    ];
    return (react_1.default.createElement(ink_1.Box, { flexDirection: "column" },
        react_1.default.createElement(ink_1.Text, { color: T.colors.surface0 }, '\u2500'.repeat(w)),
        react_1.default.createElement(ink_1.Box, null,
            react_1.default.createElement(ink_1.Text, null, " "),
            react_1.default.createElement(ink_1.Text, { color: T.colors.overlay0 },
                T.icons.clock,
                " ",
                loading ? 'refreshing...' : `every ${refreshInterval}s`),
            react_1.default.createElement(ink_1.Text, { color: T.colors.surface2 },
                " ",
                '\u2502',
                " "),
            views.map((v, i) => (react_1.default.createElement(react_1.default.Fragment, { key: v.key },
                react_1.default.createElement(ink_1.Text, { color: i === activeView ? T.colors.mauve : T.colors.overlay0 }, i === activeView ? `[${v.key}] ${v.short}` : ` ${v.key}  ${v.short}`),
                react_1.default.createElement(ink_1.Text, null, " ")))),
            react_1.default.createElement(ink_1.Text, { color: T.colors.surface2 },
                " ",
                '\u2502',
                " "),
            react_1.default.createElement(ink_1.Text, { color: T.colors.overlay0 }, "[r]efresh"),
            react_1.default.createElement(ink_1.Text, { color: T.colors.surface2 },
                " ",
                '\u2502',
                " "),
            react_1.default.createElement(ink_1.Text, { color: T.colors.overlay0 }, "[+/-]speed"),
            react_1.default.createElement(ink_1.Text, { color: T.colors.surface2 },
                " ",
                '\u2502',
                " "),
            react_1.default.createElement(ink_1.Text, { color: T.colors.red }, "[q]uit"))));
}
// =============================================================================
// Spinner
// =============================================================================
function Spinner({ text, color }) {
    const [frame, setFrame] = react_1.default.useState(0);
    const frames = ['\u2807', '\u280b', '\u2839', '\u2838', '\u283c', '\u2834', '\u2826', '\u2827', '\u2807', '\u280f'];
    const c = color || T.colors.mauve;
    react_1.default.useEffect(() => {
        const id = setInterval(() => setFrame((f) => (f + 1) % frames.length), 80);
        return () => clearInterval(id);
    }, []);
    return react_1.default.createElement(ink_1.Text, { color: c },
        frames[frame],
        " ",
        text || 'Loading');
}
// =============================================================================
// Empty State
// =============================================================================
function EmptyState({ message, icon }) {
    return (react_1.default.createElement(ink_1.Text, { color: T.colors.overlay0 },
        '  ',
        icon || T.icons.bullet,
        " ",
        message));
}
// =============================================================================
// Progress Bar
// =============================================================================
function ProgressBar({ percent, width = 20, color, }) {
    const bar = T.progressBar(Math.min(100, Math.max(0, percent)), width);
    const pctColor = color ||
        (percent > 80 ? T.colors.red : percent > 60 ? T.colors.yellow : percent > 30 ? T.colors.teal : T.colors.green);
    return (react_1.default.createElement(ink_1.Text, null,
        react_1.default.createElement(ink_1.Text, { color: pctColor }, bar),
        react_1.default.createElement(ink_1.Text, { color: T.colors.overlay1 },
            " ",
            percent.toFixed(1),
            "%")));
}
// =============================================================================
// Section Label
// =============================================================================
function Label({ children, color }) {
    return react_1.default.createElement(ink_1.Text, { color: color || T.colors.overlay0 }, children);
}
// =============================================================================
// Data Row — key-value pair
// =============================================================================
function DataRow({ label, value, valueColor, indent = 1, }) {
    const prefix = '  '.repeat(indent);
    return (react_1.default.createElement(ink_1.Box, null,
        react_1.default.createElement(ink_1.Text, { color: T.colors.overlay0 },
            prefix,
            T.box.lj,
            " ",
            label,
            ":",
            ' '),
        react_1.default.createElement(ink_1.Text, { color: valueColor || T.colors.text }, value)));
}
// =============================================================================
// Separator
// =============================================================================
function Separator({ width }) {
    const { stdout } = (0, ink_1.useStdout)();
    const w = width || stdout?.columns || 80;
    return react_1.default.createElement(ink_1.Text, { color: T.colors.surface0 }, '\u2500'.repeat(w));
}
function ViewWrapper({ title, icon, loading, children, }) {
    if (loading) {
        return (react_1.default.createElement(ink_1.Box, { flexDirection: "column", alignItems: "center", justifyContent: "center", flexGrow: 1 },
            react_1.default.createElement(Spinner, { text: `Loading ${title.toLowerCase()}...` })));
    }
    return react_1.default.createElement(ink_1.Box, { flexDirection: "column" }, children);
}
//# sourceMappingURL=components.js.map