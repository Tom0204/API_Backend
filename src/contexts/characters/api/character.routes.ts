import { type RequestHandler, Router } from 'express'
import { validate } from '../../../platform/http/middlewares/validate'
import { type CharacterUseCases, createCharacterController } from './character.controller'
import { characterParams, createCharacterBody } from './character.schemas'

/**
 * Routes réservées aux joueurs (`requirePlayer` : authentification et permission PLAY), avant la validation.
 * Aucune route ne modifie le niveau ou l'XP.
 */
export function createCharacterRoutes(deps: CharacterUseCases & { requirePlayer: RequestHandler }): Router {
    const controller = createCharacterController(deps)
    const { requirePlayer } = deps
    const router = Router()

    router.post('/api/v1/characters', requirePlayer, validate({ body: createCharacterBody }), controller.create)
    router.get('/api/v1/characters', requirePlayer, validate({}), controller.list)
    router.get('/api/v1/characters/:characterId', requirePlayer, validate({ params: characterParams }), controller.get)
    router.get(
        '/api/v1/characters/:characterId/stats',
        requirePlayer,
        validate({ params: characterParams }),
        controller.stats
    )

    return router
}
