import { type RequestHandler, Router } from 'express'
import { validate } from '../../../platform/http/middlewares/validate'
import { type CharacterUseCases, createCharacterController } from './character.controller'
import { characterParams, createCharacterBody } from './character.schemas'

/** Routes protégées : `requireAuth` avant la validation. Aucune route ne modifie le niveau ou l'XP. */
export function createCharacterRoutes(deps: CharacterUseCases & { requireAuth: RequestHandler }): Router {
    const controller = createCharacterController(deps)
    const { requireAuth } = deps
    const router = Router()

    router.post('/api/v1/characters', requireAuth, validate({ body: createCharacterBody }), controller.create)
    router.get('/api/v1/characters', requireAuth, validate({}), controller.list)
    router.get('/api/v1/characters/:characterId', requireAuth, validate({ params: characterParams }), controller.get)
    router.get(
        '/api/v1/characters/:characterId/stats',
        requireAuth,
        validate({ params: characterParams }),
        controller.stats
    )

    return router
}
