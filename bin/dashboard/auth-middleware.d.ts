import { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
/**
 * Bearer token authentication middleware.
 * All requests to /api/agent/* must include:
 *   Authorization: Bearer <AGENT_API_KEY>
 */
export declare function agentAuthMiddleware(req: Request, res: Response, next: NextFunction): void;
/**
 * Rate limiter for API routes.
 * Default: 100 requests per 15 minutes per IP.
 */
export declare const rateLimiter: import("express-rate-limit").RateLimitRequestHandler;
export { helmet };
//# sourceMappingURL=auth-middleware.d.ts.map