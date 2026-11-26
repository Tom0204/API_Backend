import cors from 'cors'
import express, { type Express } from 'express'
import helmet from 'helmet'
import type { Logger } from 'pino'
import type { ListClasses } from '../../contexts/characters/app/use-cases/list-classes'
import type { CheckHealth } from '../health/check-health'
import type { Authenticate } from '../../contexts/identity/app/use-cases/authenticate'
import type { GetCurrentAccount } from '../../contexts/identity/app/use-cases/get-current-account'
import type { Login } from '../../contexts/identity/app/use-cases/login'
import type { RegisterAccount } from '../../contexts/identity/app/use-cases/register-account'
import type { GetMyInventory } from '../../contexts/inventory/app/use-cases/get-my-inventory'
import type { ListZoneMonsters } from '../../contexts/world/app/use-cases/list-zone-monsters'
import type { CharacterUseCases } from '../../contexts/characters/api/character.controller'
import { createCharacterRoutes } from '../../contexts/characters/api/character.routes'
import { createClassRoutes } from '../../contexts/characters/api/class.routes'
import { type CombatUseCases, createCombatRoutes } from '../../contexts/combat/api/combat.routes'
import { createHealthRoutes } from '../health/health.routes'
import { createAuthRoutes } from '../../contexts/identity/api/auth.routes'
import { createInventoryRoutes } from '../../contexts/inventory/api/inventory.routes'
import { requireJsonContentType } from './middlewares/content-type'
import { errorHandler } from './middlewares/error-handler'
import { notFound } from './middlewares/not-found'
import { createRateLimiter, DEFAULT_RATE_LIMITS, type RateLimitPolicy } from './middlewares/rate-limit'
import { createRequestLogger } from './middlewares/request-logger'
import { createRequireAuth } from '../../contexts/identity/api/require-auth'
import { createWorldRoutes } from '../../contexts/world/api/world.routes'

/** Un cas d'usage par route ; construits par `main.ts`, ou sur `tests/fakes/` dans les tests HTTP. */
export interface UseCases extends CharacterUseCases, CombatUseCases {
    checkHealth: CheckHealth
    registerAccount: RegisterAccount
    login: Login
    authenticate: Authenticate
    getCurrentAccount: GetCurrentAccount
    listClasses: ListClasses
    listZoneMonsters: ListZoneMonsters
    getMyInventory: GetMyInventory
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

    const requireAuth = createRequireAuth(useCases.authenticate)
    app.use(
        createAuthRoutes({
            ...useCases,
            requireAuth,
            createAuthRateLimiter: () => createRateLimiter(rateLimits.auth)
        })
    )
    app.use(createClassRoutes(useCases))
    app.use(createCharacterRoutes({ ...useCases, requireAuth }))
    app.use(createWorldRoutes({ ...useCases, requireAuth }))
    app.use(createCombatRoutes({ ...useCases, requireAuth }))
    app.use(createInventoryRoutes({ ...useCases, requireAuth }))

    app.use(notFound)
    app.use(errorHandler)
    return app
}
