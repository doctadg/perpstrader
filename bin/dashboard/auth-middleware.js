"use strict";
// =============================================================================
// Authentication & Security Middleware for Agent API
// =============================================================================
//
// Provides:
//   - Bearer token authentication (AGENT_API_KEY env var)
//   - Rate limiting via express-rate-limit
//   - Helmet for security headers
//
// Usage in dashboard-server.ts:
//   import { agentAuthMiddleware, rateLimiter, helmet } from './auth-middleware';
//   app.use('/api/agent', helmet, rateLimiter, agentAuthMiddleware, agentApiRouter);
// =============================================================================
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.helmet = exports.rateLimiter = void 0;
exports.agentAuthMiddleware = agentAuthMiddleware;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const helmet_1 = __importDefault(require("helmet"));
exports.helmet = helmet_1.default;
const logger_1 = __importDefault(require("../shared/logger"));
// ---------------------------------------------------------------------------
// API Key Authentication Middleware
// ---------------------------------------------------------------------------
const AGENT_API_KEY = process.env.AGENT_API_KEY || 'perpstrader-dev-key';
/**
 * Bearer token authentication middleware.
 * All requests to /api/agent/* must include:
 *   Authorization: Bearer <AGENT_API_KEY>
 */
function agentAuthMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        res.status(401).json({
            error: 'Missing Authorization header',
            message: 'Provide a Bearer token in the Authorization header',
            timestamp: new Date().toISOString(),
        });
        return;
    }
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
        res.status(401).json({
            error: 'Invalid Authorization header format',
            message: 'Expected: Bearer <token>',
            timestamp: new Date().toISOString(),
        });
        return;
    }
    const token = parts[1];
    if (token !== AGENT_API_KEY) {
        logger_1.default.warn('[Auth] Failed API key authentication attempt', {
            ip: req.ip,
            path: req.path,
        });
        res.status(403).json({
            error: 'Invalid API key',
            timestamp: new Date().toISOString(),
        });
        return;
    }
    next();
}
// ---------------------------------------------------------------------------
// Rate Limiter
// ---------------------------------------------------------------------------
/**
 * Rate limiter for API routes.
 * Default: 100 requests per 15 minutes per IP.
 */
exports.rateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    message: {
        error: 'Too many requests',
        message: 'Rate limit exceeded. Try again later.',
        timestamp: new Date().toISOString(),
    },
    handler: (_req, res, _next, _options) => {
        logger_1.default.warn('[RateLimit] Rate limit exceeded', {
            ip: _req.ip,
            path: _req.path,
        });
        res.status(429).json({
            error: 'Too many requests',
            message: 'Rate limit exceeded. Try again later.',
            timestamp: new Date().toISOString(),
        });
    },
});
//# sourceMappingURL=auth-middleware.js.map