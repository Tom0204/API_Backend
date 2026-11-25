import cors from 'cors'
import express, { type Express } from 'express'
import helmet from 'helmet'
import type { Logger } from 'pino'
import type { CheckHealth } from '../../application/health/check-health'
import type { Authenticate } from '../../application/identity/authenticate'
import type { GetCurrentAccount } from '../../application/identity/get-current-account'
import type { Login } from '../../application/identity/login'
import type { RegisterAccount } from '../../application/identity/register-account'
import { createHealthRoutes } from './health/health.routes'
import { createAuthRoutes } from './identity/auth.routes'
import { requireJsonContentType } from './middlewares/content-type'
import { errorHandler } from './middlewares/error-handler'
import { notFound } from './middlewares/not-found'
import { createRateLimiter, DEFAULT_RATE_LIMITS, type RateLimitPolicy } from './middlewares/rate-limit'
import { createRequestLogger } from './middlewares/request-logger'
import { createRequireAuth } from './middlewares/require-auth'

/** Un cas d'usage par route ; construits par `main.ts`, ou sur `tests/fakes/` dans les tests HTTP. */
export interface UseCases {
    checkHealth: CheckHealth
    registerAccount: RegisterAccount
    login: Login
    authenticate: Authenticate
    getCurrentAccount: GetCurrentAccount
}

export interface AppOptions {
    logger: Logger
    /** Origines CORS autorisées ; liste vide → aucune origine externe. */
    corsOrigins: string[]
    /** Remplaçables dans les tests pour atteindre la limite rapidement. */
    rateLimits?: { api: RateLimitPolicy; auth: RateLimitPolicy }
}

const JSON_BODY_LIMIT = '10kb'

export function createApp(useCases: UseCases, options: AppOptions): Express {
    const rateLimits = options.rateLimits ?? DEFAULT_RATE_LIMITS
    const app = express()
    app.disable('x-powered-by')

    app.use(createRequestLogger(options.logger))
    app.use(helmet())
    app.use(cors({ origin: options.corsOrigins.length > 0 ? options.corsOrigins : false }))

    // /health : avant la limitation et la lecture du corps (conventions.md §1).
    app.use(createHealthRoutes(useCases))

    app.use('/api/v1', createRateLimiter(rateLimits.api))
    app.use(requireJsonContentType)
    app.use(express.json({ limit: JSON_BODY_LIMIT }))

    app.use(
        createAuthRoutes({
            ...useCases,
            requireAuth: createRequireAuth(useCases.authenticate),
            createAuthRateLimiter: () => createRateLimiter(rateLimits.auth)
        })
    )

    app.use(notFound)
    app.use(errorHandler)
    return app
}
