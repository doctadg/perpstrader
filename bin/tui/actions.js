"use strict";
// =============================================================================
// PerpsTrader TUI — Interactive Action Handlers
// =============================================================================
//
// Provides confirmation prompts and action execution for:
//   - Close Position (c key on Positions view)
//   - Cancel Order (x key on Orders view)
//   - Emergency Stop (e key anywhere)
//   - Trigger Trading Cycle (t key anywhere)
//
// These are React components that render inline confirmation dialogs.
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfirmDialog = ConfirmDialog;
exports.ActionToast = ActionToast;
exports.useActions = useActions;
const react_1 = __importStar(require("react"));
const ink_1 = require("ink");
const T = __importStar(require("./theme"));
const api_1 = require("./api");
function ConfirmDialog({ prompt, onConfirm, onCancel, requireDouble }) {
    const [phase, setPhase] = (0, react_1.useState)(requireDouble ? 'first' : 'typing');
    const [typed, setTyped] = (0, react_1.useState)('');
    const requiredWord = 'CONFIRM';
    (0, ink_1.useInput)((input, key) => {
        if (key.escape || input === 'q') {
            onCancel();
            return;
        }
        if (phase === 'first') {
            // First press: any key to continue
            if (key.return || input === 'y' || input === 'Y') {
                setPhase('typing');
                setTyped('');
            }
            return;
        }
        if (phase === 'typing') {
            if (key.return) {
                // Check typed text
                if (requireDouble && typed.toUpperCase() !== requiredWord) {
                    onCancel();
                    return;
                }
                setPhase('executing');
                onConfirm();
                return;
            }
            if (key.backspace || key.delete) {
                setTyped((prev) => prev.slice(0, -1));
                return;
            }
            if (input && input.length === 1) {
                setTyped((prev) => (prev + input).slice(0, 10));
            }
        }
    });
    if (phase === 'executing') {
        return (react_1.default.createElement(ink_1.Box, { flexDirection: "column", borderStyle: "round", borderColor: T.colors.peach, paddingLeft: 2, paddingRight: 2, paddingTop: 1, paddingBottom: 1, marginTop: 1 },
            react_1.default.createElement(ink_1.Text, { color: T.colors.peach },
                '  ',
                T.icons.warning,
                " Executing...")));
    }
    if (requireDouble && phase === 'first') {
        return (react_1.default.createElement(ink_1.Box, { flexDirection: "column", borderStyle: "round", borderColor: T.colors.red, paddingLeft: 2, paddingRight: 2, paddingTop: 1, paddingBottom: 1, marginTop: 1 },
            react_1.default.createElement(ink_1.Box, null,
                react_1.default.createElement(ink_1.Text, { color: T.colors.red, bold: true },
                    T.icons.warning,
                    " EMERGENCY STOP")),
            react_1.default.createElement(ink_1.Text, { color: T.colors.text },
                '  ',
                "This will close ALL positions and cancel ALL orders!"),
            react_1.default.createElement(ink_1.Text, { color: T.colors.overlay0 },
                '  ',
                "Press [Enter] or [y] to continue, [Esc] to cancel")));
    }
    if (requireDouble && phase === 'typing') {
        const match = typed.toUpperCase() === requiredWord;
        return (react_1.default.createElement(ink_1.Box, { flexDirection: "column", borderStyle: "round", borderColor: T.colors.red, paddingLeft: 2, paddingRight: 2, paddingTop: 1, paddingBottom: 1, marginTop: 1 },
            react_1.default.createElement(ink_1.Box, null,
                react_1.default.createElement(ink_1.Text, { color: T.colors.red, bold: true },
                    T.icons.warning,
                    " FINAL CONFIRMATION")),
            react_1.default.createElement(ink_1.Text, { color: T.colors.overlay0 },
                '  ',
                "Type ",
                react_1.default.createElement(ink_1.Text, { color: T.colors.red, bold: true }, requiredWord),
                " and press Enter:"),
            react_1.default.createElement(ink_1.Box, null,
                react_1.default.createElement(ink_1.Text, { color: match ? T.colors.green : T.colors.text },
                    '  ',
                    "> ",
                    typed,
                    react_1.default.createElement(ink_1.Text, { color: T.colors.overlay0 }, "_"))),
            react_1.default.createElement(ink_1.Text, { color: T.colors.overlay1 },
                '  ',
                "Press [Esc] to cancel")));
    }
    // Normal confirmation (no double-confirm)
    return (react_1.default.createElement(ink_1.Box, { flexDirection: "column", borderStyle: "round", borderColor: T.colors.yellow, paddingLeft: 2, paddingRight: 2, paddingTop: 1, paddingBottom: 1, marginTop: 1 },
        react_1.default.createElement(ink_1.Text, { color: T.colors.yellow, bold: true }, prompt.message),
        react_1.default.createElement(ink_1.Text, { color: T.colors.overlay0 },
            '  ',
            "Press [Enter] or [y] to confirm, [Esc] to cancel")));
}
function ActionToast({ result, onDismiss }) {
    const [visible, setVisible] = (0, react_1.useState)(true);
    (0, react_1.useEffect)(() => {
        const timer = setTimeout(() => {
            setVisible(false);
            onDismiss();
        }, 4000);
        return () => clearTimeout(timer);
    }, [onDismiss]);
    (0, ink_1.useInput)((_input, key) => {
        if (key.return || _input === ' ') {
            setVisible(false);
            onDismiss();
        }
    });
    if (!visible)
        return null;
    const successColor = result.success ? T.colors.green : T.colors.red;
    const icon = result.success ? T.icons.check : T.icons.cross;
    return (react_1.default.createElement(ink_1.Box, { flexDirection: "column", borderStyle: "round", borderColor: successColor, paddingLeft: 2, paddingRight: 2, paddingTop: 1, paddingBottom: 1, marginTop: 1 },
        react_1.default.createElement(ink_1.Box, null,
            react_1.default.createElement(ink_1.Text, { color: successColor, bold: true },
                icon,
                " ",
                result.message)),
        react_1.default.createElement(ink_1.Text, { color: T.colors.overlay0 },
            '  ',
            "Press any key to dismiss")));
}
// =============================================================================
// Action Executor Hook
// =============================================================================
function useActions(onResult) {
    const executeAction = react_1.default.useCallback(async (prompt) => {
        let result;
        switch (prompt.type) {
            case 'close-position': {
                const res = await (0, api_1.closePosition)(prompt.data?.positionId || '');
                result = {
                    type: 'close-position',
                    success: res?.success === true,
                    message: res?.success
                        ? `Position closed: ${res.symbol || prompt.data?.positionId}`
                        : `Failed to close position: ${res?.error || 'Unknown error'}`,
                    timestamp: new Date(),
                };
                break;
            }
            case 'cancel-order': {
                const res = await (0, api_1.cancelOrder)(prompt.data?.orderId || '');
                result = {
                    type: 'cancel-order',
                    success: res?.success === true,
                    message: res?.success
                        ? `Order cancelled: ${prompt.data?.orderId}`
                        : `Failed to cancel order: ${res?.message || res?.error || 'Unknown error'}`,
                    timestamp: new Date(),
                };
                break;
            }
            case 'emergency-stop': {
                const res = await (0, api_1.emergencyStop)();
                result = {
                    type: 'emergency-stop',
                    success: res?.success === true,
                    message: res?.success
                        ? `EMERGENCY STOP: ${res.positionsClosed || 0} positions closed, ${res.ordersCancelled || 0} orders cancelled`
                        : `Emergency stop failed: ${res?.error || 'Unknown error'}`,
                    timestamp: new Date(),
                };
                break;
            }
            case 'trigger-cycle': {
                const res = await (0, api_1.triggerCycle)(prompt.data?.symbol);
                result = {
                    type: 'trigger-cycle',
                    success: res?.success === true,
                    message: res?.success
                        ? `Trading cycle triggered: ${res.cycleId || 'success'}`
                        : `Failed to trigger cycle: ${res?.error || 'Unknown error'}`,
                    timestamp: new Date(),
                };
                break;
            }
            default:
                return;
        }
        onResult(result);
    }, [onResult]);
    return { executeAction };
}
//# sourceMappingURL=actions.js.map