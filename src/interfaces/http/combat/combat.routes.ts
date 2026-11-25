import { type RequestHandler, Router } from 'express'
import type { GetMyCombat } from '../../../application/combat/get-my-combat'
import type { PlayCombatAction } from '../../../application/combat/play-combat-action'
import type { StartCombat } from '../../../application/combat/start-combat'
import { asyncHandler } from '../async-handler'
import { success } from '../http-response'
import { getAuth } from '../middlewares/require-auth'
import { validate } from '../middlewares/validate'
import { presentCombat } from './combat.presenter'
import { combatActionBody, combatParams, startCombatBody } from './combat.schemas'

export interface CombatUseCases {
    startCombat: StartCombat
    playCombatAction: PlayCombatAction
    getMyCombat: GetMyCombat
}

/** Routes protégées : lire, appeler, présenter. Aucune règle de combat ici. */
export function createCombatRoutes(deps: CombatUseCases & { requireAuth: RequestHandler }): Router {
    const { requireAuth, startCombat, playCombatAction, getMyCombat } = deps
    const router = Router()

    router.post(
        '/api/v1/combats',
        requireAuth,
        validate({ body: startCombatBody }),
        asyncHandler(async (req, res) => {
            const body = startCombatBody.parse(req.body)
            const view = await startCombat.execute({ ...getAuth(req), ...body })
            res.status(201).json(success('Combat started successfully', presentCombat(view)))
        })
    )

    router.post(
        '/api/v1/combats/:combatId/actions',
        requireAuth,
        validate({ params: combatParams, body: combatActionBody }),
        asyncHandler(async (req, res) => {
            const { combatId } = combatParams.parse(req.params)
            const { type } = combatActionBody.parse(req.body)
            const view = await playCombatAction.execute({ ...getAuth(req), combatId, type })
            res.status(200).json(success('Action resolved successfully', presentCombat(view)))
        })
    )

    router.get(
        '/api/v1/combats/:combatId',
        requireAuth,
        validate({ params: combatParams }),
        asyncHandler(async (req, res) => {
            const { combatId } = combatParams.parse(req.params)
            const view = await getMyCombat.execute({ ...getAuth(req), combatId })
            res.status(200).json(success('Combat retrieved successfully', presentCombat(view)))
        })
    )

    return router
}
