import { Router } from 'express'
import type { ListClasses } from '../app/use-cases/list-classes'
import { asyncHandler } from '../../../platform/http/async-handler'
import { success } from '../../../platform/http/http-response'
import { validate } from '../../../platform/http/middlewares/validate'
import { presentCharacterClass } from './class.presenter'

/** `GET /api/v1/classes` : public, lecture seule (aucune route d'écriture). */
export function createClassRoutes({ listClasses }: { listClasses: ListClasses }): Router {
    const router = Router()
    router.get(
        '/api/v1/classes',
        validate({}),
        asyncHandler(async (_req, res) => {
            const classes = await listClasses.execute()
            res.status(200).json(success('Classes retrieved successfully', classes.map(presentCharacterClass)))
        })
    )
    return router
}
