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

import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import logger from '../shared/logger';

// ---------------------------------------------------------------------------
// API Key Authentication Middleware
// ---------------------------------------------------------------------------

const AGENT_API_KEY = process.env.AGENT_API_KEY || 'perpstrader-dev-key';

/**
 * Bearer token authentication middleware.
 * All requests to /api/agent/* must include:
 *   Authorization: Bearer <AGENT_API_KEY>
 */
export function agentAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
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
    logger.warn('[Auth] Failed API key authentication attempt', {
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
export const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,    // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false,     // Disable the `X-RateLimit-*` headers
  message: {
    error: 'Too many requests',
    message: 'Rate limit exceeded. Try again later.',
    timestamp: new Date().toISOString(),
  },
  handler: (_req: Request, res: Response, _next: NextFunction, _options: any) => {
    logger.warn('[RateLimit] Rate limit exceeded', {
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

// ---------------------------------------------------------------------------
// Re-export helmet for convenience
// ---------------------------------------------------------------------------

export { helmet };
