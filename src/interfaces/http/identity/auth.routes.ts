import { type RequestHandler, Router } from 'express'
import { validate } from '../middlewares/validate'
import { type AuthUseCases, createAuthController } from './auth.controller'
import { loginBody, registerBody } from './auth.schemas'

/** Chemins complets (le motif de route est journalisé tel quel). register et login sont publics. */
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
    router.get('/api/v1/auth/me', deps.requireAuth, validate({}), controller.me)

    return router
}
