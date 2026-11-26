import { type RequestHandler, Router } from 'express'
import type { GetCombatHistory } from '../app/use-cases/get-combat-history'
import type { GetMyCombat } from '../app/use-cases/get-my-combat'
import type { PlayCombatAction } from '../app/use-cases/play-combat-action'
import type { StartCombat } from '../app/use-cases/start-combat'
import { asyncHandler } from '../../../platform/http/async-handler'
import { success } from '../../../platform/http/http-response'
import { getAuth } from '../../../platform/http/request-auth'
import { validate } from '../../../platform/http/middlewares/validate'
import { presentCombat, presentCombatHistory } from './combat.presenter'
import { combatActionBody, combatParams, startCombatBody } from './combat.schemas'

export interface CombatUseCases {
    startCombat: StartCombat
    playCombatAction: PlayCombatAction
    getMyCombat: GetMyCombat
    getCombatHistory: GetCombatHistory
}

/** Routes protégées : lire, appeler, présenter. Aucune règle de combat ici. */
export function createCombatRoutes(deps: CombatUseCases & { requirePlayer: RequestHandler }): Router {
    const { requirePlayer, startCombat, playCombatAction, getMyCombat, getCombatHistory } = deps
    const router = Router()

    router.post(
        '/api/v1/combats',
        requirePlayer,
        validate({ body: startCombatBody }),
        asyncHandler(async (req, res) => {
            const body = startCombatBody.parse(req.body)
            const view = await startCombat.execute({ ...getAuth(req), ...body })
            res.status(201).json(success('Combat started successfully', presentCombat(view)))
        })
    )

    router.post(
        '/api/v1/combats/:combatId/actions',
        requirePlayer,
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
        requirePlayer,
        validate({ params: combatParams }),
        asyncHandler(async (req, res) => {
            const { combatId } = combatParams.parse(req.params)
            const view = await getMyCombat.execute({ ...getAuth(req), combatId })
            res.status(200).json(success('Combat retrieved successfully', presentCombat(view)))
        })
    )

    router.get(
        '/api/v1/combats/:combatId/history',
        requirePlayer,
        validate({ params: combatParams }),
        asyncHandler(async (req, res) => {
            const { combatId } = combatParams.parse(req.params)
            const history = await getCombatHistory.execute({ ...getAuth(req), combatId })
            res.status(200).json(success('Combat history retrieved successfully', presentCombatHistory(history)))
        })
    )

    return router
}
