import { type RequestHandler, Router } from 'express'
import { asyncHandler } from '../../../platform/http/async-handler'
import { success } from '../../../platform/http/http-response'
import { validate } from '../../../platform/http/middlewares/validate'
import { getAuth } from '../../../platform/http/request-auth'
import { z } from 'zod'
import type { GetMyInventory, InventoryItemOutput } from '../app/use-cases/get-my-inventory'

const characterParams = z.strictObject({ characterId: z.uuid('Must be a valid UUID') })

/** Liste blanche (L4 D3) : piles triées par nom d'objet ; `[]` si l'inventaire est vide. */
export function presentInventory(items: InventoryItemOutput[]) {
    return items.map(({ itemId, code, name, quantity }) => ({ itemId, code, name, quantity }))
}

/** `GET /api/v1/characters/:characterId/inventory` : protégée, lecture seule. */
export function createInventoryRoutes({
    getMyInventory,
    requireAuth
}: {
    getMyInventory: GetMyInventory
    requireAuth: RequestHandler
}): Router {
    const router = Router()
    router.get(
        '/api/v1/characters/:characterId/inventory',
        requireAuth,
        validate({ params: characterParams }),
        asyncHandler(async (req, res) => {
            const { characterId } = characterParams.parse(req.params) // déjà validé : typage sans transtypage
            const items = await getMyInventory.execute({ ...getAuth(req), characterId })
            res.status(200).json(success('Inventory retrieved successfully', presentInventory(items)))
        })
    )
    return router
}
