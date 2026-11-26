import { Router } from 'express'
import type { CheckHealth } from './check-health'
import { validate } from '../http/middlewares/validate'
import { createHealthController } from './health.controller'

/** `GET /health` : public, hors préfixe `/api/v1`, non limité (conventions.md §1). */
export function createHealthRoutes(deps: { checkHealth: CheckHealth }): Router {
    const controller = createHealthController(deps)
    const router = Router()
    router.get('/health', validate({}), controller.get)
    return router
}
