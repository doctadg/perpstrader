"use strict";
// Trading Mode API Routes
// Express Router mounted at /api/mode
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const logger_1 = __importDefault(require("../shared/logger"));
const controller_1 = require("./controller");
const router = express_1.default.Router();
const VALID_SUBSYSTEMS = ['perps', 'predictions', 'pumpfun'];
// GET /api/mode/status
router.get('/status', (_req, res) => {
    try {
        logger_1.default.info('[ModeAPI] GET /status');
        const controller = controller_1.TradingModeController.getInstance();
        const status = controller.getStatus();
        res.json(status);
    }
    catch (error) {
        logger_1.default.error('[ModeAPI] Error in GET /status:', error);
        res.status(500).json({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
});
// PUT /api/mode/set
router.put('/set', (req, res) => {
    try {
        const body = req.body;
        const { subsystem, mode, confirmationToken, reason, source } = body;
        logger_1.default.info('[ModeAPI] PUT /set', { subsystem: subsystem || 'all', mode, source: source || 'api' });
        if (!mode || !['paper', 'testnet', 'live'].includes(mode)) {
            res.status(400).json({ success: false, error: 'Invalid mode. Must be paper, testnet, or live' });
            return;
        }
        if (subsystem && subsystem !== 'all' && !VALID_SUBSYSTEMS.includes(subsystem)) {
            res.status(400).json({
                success: false,
                error: `Invalid subsystem. Must be one of: ${VALID_SUBSYSTEMS.join(', ')}, all`,
            });
            return;
        }
        const controller = controller_1.TradingModeController.getInstance();
        const apiSource = (source || 'api');
        const targetSubsystem = subsystem || 'all';
        // If confirmation token provided, confirm directly
        if (confirmationToken && mode === 'live') {
            const result = controller.confirmModeChange(confirmationToken);
            if (!result.success) {
                res.status(400).json({ success: false, state: result.state, error: result.error });
                return;
            }
            res.json({ success: true, state: result.state });
            return;
        }
        const pending = controller.setMode(targetSubsystem === 'all' ? 'all' : targetSubsystem, mode, apiSource, reason);
        if (pending) {
            res.json({
                success: true,
                state: controller.getStatus().state,
                pendingConfirmation: pending,
            });
            return;
        }
        res.json({ success: true, state: controller.getStatus().state });
    }
    catch (error) {
        logger_1.default.error('[ModeAPI] Error in PUT /set:', error);
        res.status(500).json({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
});
// POST /api/mode/confirm/:token
router.post('/confirm/:token', (req, res) => {
    try {
        const { token } = req.params;
        logger_1.default.info('[ModeAPI] POST /confirm', { token: token.slice(0, 8) + '...' });
        const controller = controller_1.TradingModeController.getInstance();
        const result = controller.confirmModeChange(token);
        if (!result.success) {
            res.status(400).json({ success: false, state: result.state, error: result.error });
            return;
        }
        res.json({ success: true, state: result.state });
    }
    catch (error) {
        logger_1.default.error('[ModeAPI] Error in POST /confirm:', error);
        res.status(500).json({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
});
// GET /api/mode/history
router.get('/history', (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        logger_1.default.info('[ModeAPI] GET /history', { limit });
        const controller = controller_1.TradingModeController.getInstance();
        const history = controller.getHistory(limit);
        res.json(history);
    }
    catch (error) {
        logger_1.default.error('[ModeAPI] Error in GET /history:', error);
        res.status(500).json({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
});
// GET /api/mode/env-overrides
router.get('/env-overrides', (_req, res) => {
    try {
        logger_1.default.info('[ModeAPI] GET /env-overrides');
        const controller = controller_1.TradingModeController.getInstance();
        const overrides = controller.exportEnvOverrides();
        res.json(overrides);
    }
    catch (error) {
        logger_1.default.error('[ModeAPI] Error in GET /env-overrides:', error);
        res.status(500).json({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
});
// POST /api/mode/enable/:subsystem
router.post('/enable/:subsystem', (req, res) => {
    try {
        const { subsystem } = req.params;
        logger_1.default.info('[ModeAPI] POST /enable', { subsystem });
        if (!VALID_SUBSYSTEMS.includes(subsystem)) {
            res.status(400).json({ success: false, error: `Invalid subsystem: ${subsystem}` });
            return;
        }
        const controller = controller_1.TradingModeController.getInstance();
        const state = controller.enableSubsystem(subsystem);
        res.json({ success: true, state });
    }
    catch (error) {
        logger_1.default.error('[ModeAPI] Error in POST /enable:', error);
        res.status(500).json({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
});
// POST /api/mode/disable/:subsystem
router.post('/disable/:subsystem', (req, res) => {
    try {
        const { subsystem } = req.params;
        logger_1.default.info('[ModeAPI] POST /disable', { subsystem });
        if (!VALID_SUBSYSTEMS.includes(subsystem)) {
            res.status(400).json({ success: false, error: `Invalid subsystem: ${subsystem}` });
            return;
        }
        const controller = controller_1.TradingModeController.getInstance();
        const state = controller.disableSubsystem(subsystem);
        res.json({ success: true, state });
    }
    catch (error) {
        logger_1.default.error('[ModeAPI] Error in POST /disable:', error);
        res.status(500).json({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
});
exports.default = router;
//# sourceMappingURL=api-routes.js.map