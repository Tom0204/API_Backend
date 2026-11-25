import type { RequestHandler } from 'express'
import { rateLimit } from 'express-rate-limit'
import { failure } from '../http-response'

export interface RateLimitPolicy {
    limit: number
    windowMs: number
}

/** conventions.md §7 : 300 requêtes par minute sur `/api/v1`, 10 par 15 minutes sur register et login. */
export const DEFAULT_RATE_LIMITS = {
    api: { limit: 300, windowMs: 60 * 1000 },
    auth: { limit: 10, windowMs: 15 * 60 * 1000 }
} as const satisfies Record<string, RateLimitPolicy>

/** Limiteur par IP, en mémoire ; au-delà : 429 `RATE_LIMITED` avec `Retry-After`. */
export function createRateLimiter(policy: RateLimitPolicy): RequestHandler {
    return rateLimit({
        windowMs: policy.windowMs,
        limit: policy.limit,
        standardHeaders: 'draft-8',
        legacyHeaders: false,
        handler: (_req, res) => {
            res.status(429).json(failure('Too many requests', 'RATE_LIMITED'))
        }
    })
}
