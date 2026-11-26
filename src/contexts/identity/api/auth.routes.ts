import { type RequestHandler, Router } from 'express'
import { validate } from '../../../platform/http/middlewares/validate'
import { type AuthUseCases, createAuthController } from './auth.controller'
import { loginBody, refreshBody, registerBody } from './auth.schemas'

/**
 * Chemins complets (le motif de route est journalisé tel quel). register, login et refresh sont publics, chacun
 * avec sa propre limite par IP (L6 D3).
 */
export function createAuthRoutes(
    deps: AuthUseCases & {
        requireAuth: RequestHandler
        createAuthRateLimiter: () => RequestHandler
    }
): Router {
    const controller = createAuthController(deps)
    const router = Router()

    router.post(
        '/api/v1/auth/register',
        deps.createAuthRateLimiter(),
        validate({ body: registerBody }),
        controller.register
    )
    router.post('/api/v1/auth/login', deps.createAuthRateLimiter(), validate({ body: loginBody }), controller.login)
    router.post('/api/v1/auth/refresh', deps.createAuthRateLimiter(), validate({ body: refreshBody }), controller.refresh)
    router.post('/api/v1/auth/logout', deps.requireAuth, validate({}), controller.logout)
    router.post('/api/v1/auth/logout-all', deps.requireAuth, validate({}), controller.logoutAll)
    router.get('/api/v1/auth/me', deps.requireAuth, validate({}), controller.me)

    return router
}
